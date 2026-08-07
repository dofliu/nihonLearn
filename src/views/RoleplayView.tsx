import { useState, useEffect, useRef } from 'react'
import {
  ROLEPLAY_SCENES,
  buildRoleplaySystem,
  roleplayHistory,
  entryFromTurn,
  myTurnCount,
  isRoleplayOver,
  MAX_TURNS,
  type RoleplayScene,
  type RoleplayEntry,
} from '../lib/roleplay'
import { chatGeminiJSON, hasLLM } from '../lib/llm'
import { parseRoleplayTurn } from '../lib/llmParse'
import { personalKnownWords } from '../lib/content'
import { mergeSpoken } from '../lib/voiceInput'
import { speak } from '../audio/tts'
import { useApp } from '../state/store'
import { toast } from '../components/ui'
import { VoiceInput } from '../components/VoiceInput'

/**
 * 自由対話（AI 角色扮演，文字輸入版）。
 *
 * 與固定腳本会話（`DialogueView`）的差別：場景一樣（沿用已驗證的 `data/dialogues.ts`
 * 對象／情境／開場白），但對方的後續台詞由 Gemini 依你打的字即時生成，每回合附一行
 * 中文小提示。**AI 生成內容僅供參考、不寫入學習庫、不進 SRS、不計入每日蓋章**。
 * 無 Gemini 金鑰 → 提示去設定，固定腳本会話照常可用（降級不中斷）。
 */
export function RoleplayView({ onBack }: { onBack: () => void }) {
  const [sc, setSc] = useState<RoleplayScene | null>(null)

  if (!hasLLM()) {
    return (
      <div className="card">
        <div className="eyebrow">自由対話（AI 角色扮演）</div>
        <p className="sub">
          自由対話用 Gemini 扮演對方，依你打的日文即時回話。
          請先到<b>設定</b>（點頁首標題）的「AI 生成（Gemini）」填入金鑰。
          沒有金鑰也沒關係——下面的<b>固定腳本会話</b>照常可以練。
        </p>
        <div className="row center">
          <button className="btn ghost" onClick={onBack}>
            返回
          </button>
        </div>
      </div>
    )
  }

  if (sc) return <RoleplayChat sc={sc} onBack={() => setSc(null)} />

  return (
    <>
      <div className="card">
        <div className="row between">
          <div className="eyebrow">自由対話 ─ AI 角色扮演</div>
          <button className="btn small ghost" onClick={onBack}>
            返回
          </button>
        </div>
        <h2>自己想句子，跟對方聊聊看</h2>
        <p className="sub">
          場景跟固定腳本一樣，但這次<b>沒有稿子</b>——你自己說（或打）日文，對方會依你的話回應，
          每回合再給你一行中文小提示。支援語音輸入的環境可以直接<b>用說的</b>，
          聽到的字會先填進輸入框讓你確認。
        </p>
        <div className="hint" style={{ marginTop: 8 }}>
          ⚠️ 對方的台詞由 AI 即時生成，<b>僅供參考、可能有誤</b>；不會寫入你的學習資料，
          也不計入每日修行（純加練）。
        </div>
      </div>
      {ROLEPLAY_SCENES.map((s) => (
        <div className="card" key={s.id}>
          <div className="row between">
            <div>
              <span className="chip">{s.partnerTag}</span>
              <div className="sent" style={{ fontSize: 19, marginTop: 6 }}>
                {s.title}
              </div>
              <div className="sub" style={{ marginTop: 2 }}>
                {s.scene}
              </div>
            </div>
            <button className="btn small" onClick={() => setSc(s)}>
              話す ▶
            </button>
          </div>
        </div>
      ))}
    </>
  )
}

function RoleplayChat({ sc, onBack }: { sc: RoleplayScene; onBack: () => void }) {
  const rate = useApp((s) => s.rate)
  const [known, setKnown] = useState<string[]>([])
  const [entries, setEntries] = useState<RoleplayEntry[]>([
    { who: 'partner', jp: sc.opening, zh: sc.openingZh },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void (async () => setKnown(await personalKnownWords()))()
  }, [])

  // 開場白（已驗證台詞）自動朗讀
  useEffect(() => {
    const t = window.setTimeout(() => speak(sc.opening, rate), 400)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sc.id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [entries, loading])

  const over = isRoleplayOver(entries)

  async function send() {
    const text = input.trim()
    if (!text || loading || over) return
    setInput('')
    const next: RoleplayEntry[] = [...entries, { who: 'me', jp: text }]
    setEntries(next)
    setLoading(true)
    try {
      const raw = await chatGeminiJSON(buildRoleplaySystem(sc, known), roleplayHistory(next))
      const turn = parseRoleplayTurn(raw)
      if (!turn) throw new Error('gemini-bad-json')
      setEntries([...next, entryFromTurn(turn)])
      speak(turn.jp, rate)
    } catch (e) {
      const err = (e as Error).message
      toast(
        err.startsWith('gemini-http-4')
          ? 'Gemini 金鑰無效或額度用盡 — 請到設定確認'
          : err === 'gemini-bad-json'
            ? 'AI 回應格式怪怪的，再說一次看看'
            : '自由対話連線失敗，請稍後再試',
      )
      setEntries(entries) // 回退，讓使用者可重試
      setInput(text)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="row between">
        <div className="eyebrow">
          自由対話 ─ {sc.title}　{Math.min(myTurnCount(entries), MAX_TURNS)} / {MAX_TURNS} 回合
        </div>
        <button className="btn small ghost" onClick={onBack}>
          返回
        </button>
      </div>
      <p className="sub" style={{ marginTop: 2 }}>
        對方：{sc.partner}。{sc.scene}
      </p>
      <div className="hint" style={{ marginTop: 6 }}>
        ⚠️ AI 生成、僅供參考；不寫入學習資料、不計入蓋章。
      </div>

      <div className="dlgBox">
        {entries.map((e, i) => (
          <div key={i} className={`dlgRow ${e.who === 'me' ? 'me' : ''}`}>
            <div className={`dlgBubble ${e.who === 'me' ? 'me' : ''}`}>
              <div className="dlgWho">{e.who === 'me' ? 'あなた' : sc.partner}</div>
              <div className="dlgJp" onClick={() => speak(e.jp, rate)}>
                {e.jp} <span style={{ opacity: 0.55, fontSize: 13 }}>🔊</span>
              </div>
              {e.who === 'partner' && e.zh && <div className="dlgZh">{e.zh}</div>}
              {e.who === 'partner' && e.hint && <div className="dlgHint">💡 {e.hint}</div>}
            </div>
          </div>
        ))}
        {loading && <p className="sub">相手が かんがえています…</p>}
        <div ref={endRef} />
      </div>

      {over ? (
        <>
          <p className="sub center" style={{ marginTop: 12 }}>
            這一輪聊完了（{MAX_TURNS} 回合）。おつかれさま！
          </p>
          <div className="row center" style={{ marginTop: 6 }}>
            <button
              className="btn ghost"
              onClick={() =>
                setEntries([{ who: 'partner', jp: sc.opening, zh: sc.openingZh }])
              }
            >
              もう一度
            </button>
            <button className="btn" onClick={onBack}>
              換一個場景
            </button>
          </div>
        </>
      ) : (
        <div className="row" style={{ marginTop: 12, gap: 6 }}>
          <input
            type="text"
            value={input}
            onChange={(ev) => setInput(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') void send()
            }}
            placeholder="用日文回一句…"
            style={{
              flex: 1,
              fontSize: 15,
              borderRadius: 8,
              border: '1px solid var(--washi2)',
              padding: '8px 10px',
            }}
          />
          <button className="btn small" onClick={() => void send()} disabled={loading}>
            送る
          </button>
        </div>
      )}

      {/* 用說的：辨識結果併進上面的輸入框，使用者確認／修改後才送出 */}
      {!over && (
        <VoiceInput
          disabled={loading}
          onText={(txt) => setInput((cur) => mergeSpoken(cur, txt))}
        />
      )}
    </div>
  )
}
