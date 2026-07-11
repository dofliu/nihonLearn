import { useState, useEffect, useRef } from 'react'
import { chatGemini, hasLLM, type ChatMsg } from '../lib/llm'
import { personalKnownWords } from '../lib/content'
import { speak } from '../audio/tts'
import { toast } from '../components/ui'

const SUGGESTIONS = [
  '「食べる」怎麼用？給我例句',
  '用我學過的詞造 3 個短句',
  'は 和 が 有什麼差別？',
  '「これ・それ・あれ」怎麼分？',
]

/** grounding：把已學詞彙塞進 system prompt，並要求標明僅供參考、不杜撰重音。 */
function buildSystem(known: string[]): string {
  const list = known.slice(0, 120).join('、')
  return (
    '你是「日本語の道」App 內的日語學習助教，對象是中文母語、剛學完五十音的成人。' +
    '規則：(1) 用繁體中文解說，語氣親切簡潔；(2) 舉日語例句時，盡量只用學習者「已學過的詞」，' +
    '需要用到新詞時標註假名讀音與中文；(3) 例句用平假名為主、簡短；' +
    '(4) 不確定或有地區/世代差異的內容（尤其重音/アクセント）要老實說明，不要杜撰；' +
    '(5) 你只是輔助，最後務必以一句「※ 以上為 AI 說明，僅供參考，正確用法請以教材為準」結尾。' +
    `\n學習者已學過的詞彙：${list || '（尚無，請用最基礎的詞）'}`
  )
}

export function TutorView({ onDone }: { onDone: () => void }) {
  const [ready, setReady] = useState(hasLLM())
  const [known, setKnown] = useState<string[]>([])
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setReady(hasLLM())
    void (async () => setKnown(await personalKnownWords()))()
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight)
  }, [msgs, loading])

  async function send(text: string) {
    const q = text.trim()
    if (!q || loading) return
    setInput('')
    const history: ChatMsg[] = [...msgs, { role: 'user', text: q }]
    setMsgs(history)
    setLoading(true)
    try {
      const answer = await chatGemini(buildSystem(known), history)
      setMsgs([...history, { role: 'model', text: answer }])
    } catch (e) {
      const err = (e as Error).message
      toast(
        err.startsWith('gemini-http-4')
          ? 'Gemini 金鑰無效或額度用盡 — 請到設定確認'
          : err === 'no-key'
            ? '請先到設定填入 Gemini 金鑰'
            : 'AI 助教連線失敗，請稍後再試',
      )
      setMsgs(msgs) // 回退，讓使用者可重試
    } finally {
      setLoading(false)
    }
  }

  if (!ready) {
    return (
      <div className="card">
        <div className="eyebrow">AI 助教</div>
        <p className="sub">
          AI 助教用 Gemini 回答日語問題，並盡量用你學過的詞舉例。
          請先到<b>設定</b>（點頁首標題）的「AI 生成（Gemini）」填入金鑰。
        </p>
        <div className="row center">
          <button className="btn ghost" onClick={onDone}>
            返回
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="card">
        <div className="eyebrow">AI 助教 ─ 先生に聞く</div>
        <div className="hint" style={{ marginTop: 0 }}>
          ⚠️ AI 的回答僅供參考、可能有誤；正確用法請以教材為準。重音等差異 AI 不保證正確。
          助教只回答問題，<b>不會改動你的學習資料</b>。
        </div>

        <div
          ref={listRef}
          style={{ maxHeight: '48vh', overflowY: 'auto', margin: '10px 0' }}
        >
          {msgs.length === 0 && (
            <p className="sub">問我日語文法、用法，或請我用你學過的詞造句。</p>
          )}
          {msgs.map((m, i) => (
            <div
              key={i}
              className="card"
              style={{
                margin: '6px 0',
                background: m.role === 'user' ? 'var(--washi2)' : 'var(--washi)',
              }}
            >
              <div className="sub" style={{ marginBottom: 2 }}>
                {m.role === 'user' ? '你' : '助教'}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.7 }}>
                {m.text}
              </div>
              {m.role === 'model' && (
                <button
                  className="btn small ghost"
                  style={{ marginTop: 6 }}
                  onClick={() => speak(m.text.slice(0, 120), 0.85)}
                >
                  🔊 唸日文
                </button>
              )}
            </div>
          ))}
          {loading && <p className="sub">助教思考中…</p>}
        </div>

        {msgs.length === 0 && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="btn small ghost" onClick={() => void send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="row" style={{ marginTop: 10, gap: 6 }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send(input)
            }}
            placeholder="輸入問題…"
            style={{
              flex: 1,
              fontSize: 14,
              borderRadius: 8,
              border: '1px solid var(--washi2)',
              padding: '8px 10px',
            }}
          />
          <button className="btn small" onClick={() => void send(input)} disabled={loading}>
            送出
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row center">
          <button className="btn ghost" onClick={onDone}>
            返回
          </button>
        </div>
      </div>
    </>
  )
}
