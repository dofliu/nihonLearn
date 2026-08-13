import { useState, useEffect, useRef } from 'react'
import {
  ROLEPLAY_SCENES,
  CUSTOM_SCENE_SAMPLES,
  MAX_CUSTOM_PARTNER,
  MAX_CUSTOM_SCENE,
  buildCustomScene,
  buildRoleplaySystem,
  openingEntries,
  roleplayHistory,
  entryFromTurn,
  myTurnCount,
  isRoleplayOver,
  MAX_TURNS,
  type RoleplayScene,
  type RoleplayEntry,
} from '../lib/roleplay'
import {
  loadRecentScenes,
  rememberScene,
  forgetScene,
  sceneKey,
  MAX_RECENT_SCENES,
  type RecentScene,
} from '../lib/recentScenes'
import { chatGeminiJSON, hasLLM } from '../lib/llm'
import { parseRoleplayTurn } from '../lib/llmParse'
import { personalKnownWords } from '../lib/content'
import { logActivity } from '../db/repo'
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
          場景可以沿用固定腳本，也可以<b>自己描述一個</b>，但這次<b>沒有稿子</b>——
          你自己說（或打）日文，對方會依你的話回應，每回合再給你一行中文小提示。
          支援語音輸入的環境可以直接<b>用說的</b>，聽到的字會先填進輸入框讓你確認。
        </p>
        <div className="hint" style={{ marginTop: 8 }}>
          ⚠️ 對方的台詞由 AI 即時生成，<b>僅供參考、可能有誤</b>；不會寫入你的學習資料，
          也不計入每日修行（純加練）。
        </div>
      </div>
      <CustomSceneForm onStart={setSc} />
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

const inputStyle = {
  flex: 1,
  fontSize: 15,
  borderRadius: 8,
  border: '1px solid var(--washi2)',
  padding: '8px 10px',
} as const

/**
 * 自訂場景：使用者自己用**中文**填「對方是誰」與「情境」。
 * 這種場景沒有已驗證的開場白，所以刻意由使用者先開口（不讓 AI 生一句假的教科書開場白）。
 *
 * v3.41 起用過的自訂場景會記在**裝置本機 localStorage**（`lib/recentScenes.ts`，
 * 最多 5 筆），下次點一下就能再聊或帶回欄位修改——不進 Dexie 學習資料庫。
 */
function CustomSceneForm({ onStart }: { onStart: (sc: RoleplayScene) => void }) {
  const [open, setOpen] = useState(false)
  const [partner, setPartner] = useState('')
  const [scene, setScene] = useState('')
  const [recent, setRecent] = useState<RecentScene[]>(() => loadRecentScenes())

  function start() {
    const sc = buildCustomScene(partner, scene)
    if (!sc) {
      toast('請填「對方是誰」和「情境」兩欄')
      return
    }
    // 記住（已正規化的欄位），下次點一下就能再聊
    setRecent(rememberScene({ partner: sc.partner, scene: sc.scene }))
    onStart(sc)
  }

  /** 最近用過的一筆 → 直接開聊（欄位當時已檢核過，理論上必成立）。 */
  function startRecent(r: RecentScene) {
    const sc = buildCustomScene(r.partner, r.scene)
    if (!sc) {
      setRecent(forgetScene(r))
      return
    }
    setRecent(rememberScene({ partner: sc.partner, scene: sc.scene }))
    onStart(sc)
  }

  return (
    <div className="card">
      <div className="row between">
        <div>
          <span className="chip">自訂</span>
          <div className="sent" style={{ fontSize: 19, marginTop: 6 }}>
            ✏️ 自訂場景
          </div>
          <div className="sub" style={{ marginTop: 2 }}>
            上面沒有你想練的情境？自己用中文描述一個。
          </div>
        </div>
        <button className="btn small ghost" onClick={() => setOpen((v) => !v)}>
          {open ? '收起' : '設定 ▾'}
        </button>
      </div>

      {recent.length > 0 && (
        <div className="recentScenes">
          <div className="sub" style={{ marginTop: 10 }}>
            最近用過（存在這台裝置，最多 {MAX_RECENT_SCENES} 個）：
          </div>
          {recent.map((r) => (
            <div className="row between recentScene" key={sceneKey(r)}>
              <div style={{ minWidth: 0 }}>
                <div className="sent" style={{ fontSize: 16 }}>
                  {r.partner}
                </div>
                <div className="sub" style={{ marginTop: 2 }}>
                  {r.scene}
                </div>
              </div>
              <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                <button
                  className="btn small ghost"
                  aria-label={`修改 ${r.partner}`}
                  title="帶入欄位修改"
                  onClick={() => {
                    setPartner(r.partner)
                    setScene(r.scene)
                    setOpen(true)
                  }}
                >
                  ✎
                </button>
                <button
                  className="btn small ghost"
                  aria-label={`刪除 ${r.partner}`}
                  title="刪除這筆記錄"
                  onClick={() => setRecent(forgetScene(r))}
                >
                  ✕
                </button>
                <button className="btn small" onClick={() => startRecent(r)}>
                  再聊一次 ▶
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <>
          <div className="hint" style={{ marginTop: 10 }}>
            ⚠️ 自訂場景<b>沒有教科書開場白</b>——由<b>你先開口</b>，對方的日文<b>全部</b>由 AI
            即時生成，僅供參考、可能有誤。
          </div>

          <div className="row" style={{ marginTop: 10, gap: 6 }}>
            <input
              type="text"
              value={partner}
              maxLength={MAX_CUSTOM_PARTNER}
              onChange={(ev) => setPartner(ev.target.value)}
              placeholder="對方是誰（例：拉麵店店員）"
              style={inputStyle}
            />
          </div>
          <div className="row" style={{ marginTop: 6, gap: 6 }}>
            <input
              type="text"
              value={scene}
              maxLength={MAX_CUSTOM_SCENE}
              onChange={(ev) => setScene(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') start()
              }}
              placeholder="情境（例：你進拉麵店，點一碗拉麵。）"
              style={inputStyle}
            />
          </div>

          <div className="sub" style={{ marginTop: 8 }}>
            參考範例（點一下帶入，可再改）：
          </div>
          <div className="row" style={{ marginTop: 4, gap: 6, flexWrap: 'wrap' }}>
            {CUSTOM_SCENE_SAMPLES.map((s) => (
              <button
                key={s.partner}
                className="btn small ghost"
                onClick={() => {
                  setPartner(s.partner)
                  setScene(s.scene)
                }}
              >
                {s.partner}
              </button>
            ))}
          </div>

          <div className="row center" style={{ marginTop: 10 }}>
            <button className="btn" onClick={start}>
              この場面で 話す ▶
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function RoleplayChat({ sc, onBack }: { sc: RoleplayScene; onBack: () => void }) {
  const rate = useApp((s) => s.rate)
  const [known, setKnown] = useState<string[]>([])
  const [entries, setEntries] = useState<RoleplayEntry[]>(() => openingEntries(sc))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void (async () => setKnown(await personalKnownWords()))()
  }, [])

  // 開場白（已驗證台詞）自動朗讀；自訂場景沒有開場白，跳過
  useEffect(() => {
    if (!sc.opening) return
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
      // AI 的台詞不入庫，但「你自己組了一句話」這件練習記入学習記録（選配加練）
      void logActivity('roleplay')
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
        ⚠️ {sc.custom ? '這是你自訂的場景，對方的日文全部由 AI 生成、' : 'AI 生成、'}
        僅供參考；不寫入學習資料、不計入蓋章。
      </div>

      <div className="dlgBox">
        {entries.length === 0 && (
          <p className="sub">この場面で、あなたから はなしかけてください。（由你先開口）</p>
        )}
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
            <button className="btn ghost" onClick={() => setEntries(openingEntries(sc))}>
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
            style={inputStyle}
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
