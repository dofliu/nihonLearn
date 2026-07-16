import { useState, useEffect, useRef } from 'react'
import { DIALOGUES, PARTNER_TAGS, type Dialogue, type PartnerTag } from '../data/dialogues'
import { speak } from '../audio/tts'
import { useApp } from '../state/store'
import { toast } from '../components/ui'

/**
 * 情境對話引導（会話）：選場景 → 逐句進行。
 * 對方（role a）的台詞自動朗讀；輪到你（role b）時看句子唸出來（可先聽手本），
 * 按「唸完了」進下一句並計入每日「口」任務。素材全為已驗證的固定基本句。
 */
export function DialogueView() {
  const [dlg, setDlg] = useState<Dialogue | null>(null)
  if (dlg) return <DialoguePlay dlg={dlg} onBack={() => setDlg(null)} />
  return (
    <>
      <div className="card">
        <div className="eyebrow">口の修行 ─ 会話（情境對話引導）</div>
        <h2>跟不同的人說說看</h2>
        <p className="sub">
          選一個場景，跟<b>店員・家人・情人・同學・朋友・廠商</b>來一段對話。
          對方的話會自動唸給你聽；輪到你時，照著句子說出來（可先聽手本）。
        </p>
      </div>
      {PARTNER_TAGS.map((tag) => {
        const list = DIALOGUES.filter((d) => d.partnerTag === tag)
        if (list.length === 0) return null
        return list.map((d) => (
          <div className="card" key={d.id}>
            <div className="row between">
              <div>
                <span className="chip">{tag}</span>
                <div className="sent" style={{ fontSize: 19, marginTop: 6 }}>
                  {d.title}
                </div>
                <div className="sub" style={{ marginTop: 2 }}>
                  {d.scene}（{d.lines.length} 句）
                </div>
              </div>
              <button className="btn small" onClick={() => setDlg(d)}>
                開始 ▶
              </button>
            </div>
          </div>
        ))
      })}
    </>
  )
}

function DialoguePlay({ dlg, onBack }: { dlg: Dialogue; onBack: () => void }) {
  const bump = useApp((s) => s.bump)
  const rate = useApp((s) => s.rate)
  const [step, setStep] = useState(0) // 已進行到第幾句（0-based，當前句）
  const [done, setDone] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const cur = dlg.lines[step]

  // 對方的台詞：進到該句時自動朗讀
  useEffect(() => {
    if (!done && cur && cur.role === 'a') {
      const t = window.setTimeout(() => speak(cur.jp, rate), 400)
      return () => window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, done])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [step, done])

  async function next() {
    if (!cur) return
    if (cur.role === 'b') await bump('speak', 1)
    if (step + 1 >= dlg.lines.length) {
      setDone(true)
      toast('会話練習 完成！お見事！')
      return
    }
    setStep(step + 1)
  }

  return (
    <div className="card">
      <div className="row between">
        <div className="eyebrow">
          会話 ─ {dlg.title}　{Math.min(step + 1, dlg.lines.length)} / {dlg.lines.length}
        </div>
        <button className="btn small ghost" onClick={onBack}>
          返回
        </button>
      </div>
      <p className="sub" style={{ marginTop: 2 }}>
        對方：{dlg.partner}。{dlg.scene}
      </p>

      <div className="dlgBox">
        {dlg.lines.slice(0, done ? dlg.lines.length : step + 1).map((l, i) => (
          <div key={i} className={`dlgRow ${l.role === 'b' ? 'me' : ''}`}>
            <div className={`dlgBubble ${l.role === 'b' ? 'me' : ''} ${!done && i === step ? 'now' : ''}`}>
              <div className="dlgWho">{l.role === 'a' ? dlg.partner : 'あなた'}</div>
              <div className="dlgJp" onClick={() => speak(l.jp, rate)}>
                {l.jp} <span style={{ opacity: 0.55, fontSize: 13 }}>🔊</span>
              </div>
              <div className="dlgZh">{l.zh}</div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {done ? (
        <div className="row center" style={{ marginTop: 12 }}>
          <button
            className="btn ghost"
            onClick={() => {
              setStep(0)
              setDone(false)
            }}
          >
            再來一次
          </button>
          <button className="btn" onClick={onBack}>
            換一個場景
          </button>
        </div>
      ) : cur.role === 'a' ? (
        <div className="row center" style={{ marginTop: 12 }}>
          <button className="btn small ghost" onClick={() => speak(cur.jp, rate)}>
            🔊 再聽一次
          </button>
          <button className="btn" onClick={() => void next()}>
            つぎへ ▶
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <p className="sub center" style={{ marginBottom: 8 }}>
            換你說——照著上面的句子唸出來（點句子可聽手本）。
          </p>
          <div className="row center">
            <button className="btn small ghost" onClick={() => speak(cur.jp, 0.8)}>
              🔊 聽手本（慢速）
            </button>
            <button className="btn" onClick={() => void next()}>
              唸完了，下一句 ▶
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
