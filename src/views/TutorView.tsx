import { useState, useEffect, useRef, useCallback } from 'react'
import { chatGemini, hasLLM, type ChatMsg } from '../lib/llm'
import { personalKnownWords } from '../lib/content'
import {
  tutorPrompts,
  pickPrompt,
  buildQuizSystem,
  buildQuizUser,
  parseCritique,
  VERDICT_LABEL,
  type TutorPrompt,
  type Verdict,
} from '../lib/tutorQuiz'
import { db } from '../db/schema'
import { hasKanji } from '../lib/furigana'
import { RubyText } from '../components/Ruby'
import { speak } from '../audio/tts'
import { useApp } from '../state/store'
import { toast } from '../components/ui'

const SUGGESTIONS = [
  '「食べる」怎麼用？給我例句',
  '用我學過的詞造 3 個短句',
  'は 和 が 有什麼差別？',
  '「これ・それ・あれ」怎麼分？',
]

type Mode = 'chat' | 'quiz'

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

/**
 * AI 助教。兩種模式：
 *  - 💬 問問題（`TutorChat`）：自由聊天問文法／用法，需 Gemini 金鑰。
 *  - 🎯 考我（`TutorQuiz`）：助教給中文情境題，你自己用日文作答——題目與參考答案
 *    全部取自已驗證資料，AI 只用中文講評（無金鑰時退回「看參考答案自評」，照樣能練）。
 * 兩者都**不會寫入學習資料庫、不進 SRS、不計入每日蓋章**。
 */
export function TutorView({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>('chat')
  const [known, setKnown] = useState<string[]>([])

  useEffect(() => {
    void (async () => setKnown(await personalKnownWords()))()
  }, [])

  return (
    <>
      <div className="card">
        <div className="lvTabs" style={{ marginBottom: 0 }}>
          <button className={mode === 'chat' ? 'on' : ''} onClick={() => setMode('chat')}>
            💬 問問題
          </button>
          <button className={mode === 'quiz' ? 'on' : ''} onClick={() => setMode('quiz')}>
            🎯 考我
          </button>
        </div>
      </div>

      {mode === 'chat' ? <TutorChat known={known} /> : <TutorQuiz known={known} />}

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

// ───────────────────────── 💬 問問題（自由聊天） ─────────────────────────

function TutorChat({ known }: { known: string[] }) {
  const [ready] = useState(hasLLM())
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

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
      toast(errMsg(e, 'AI 助教連線失敗，請稍後再試'))
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
          沒有金鑰也可以練上面的<b>🎯 考我</b>（自己作答、看參考答案自評）。
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="eyebrow">AI 助教 ─ 先生に聞く</div>
      <div className="hint" style={{ marginTop: 0 }}>
        ⚠️ AI 的回答僅供參考、可能有誤；正確用法請以教材為準。重音等差異 AI 不保證正確。
        助教只回答問題，<b>不會改動你的學習資料</b>。
      </div>

      <div ref={listRef} style={{ maxHeight: '48vh', overflowY: 'auto', margin: '10px 0' }}>
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
  )
}

// ───────────────────────── 🎯 考我（主動造句） ─────────────────────────

/**
 * 助教出中文情境題 → 你自己用日文作答 → 揭曉已驗證的參考答案（＋有金鑰時附 AI 中文講評）。
 * 題目與參考答案來自 `lib/tutorQuiz`（已驗證例句／句型 × 已學詞），日文不經 LLM。
 */
function TutorQuiz({ known }: { known: string[] }) {
  const rate = useApp((s) => s.rate)
  const showKanji = useApp((s) => s.showKanji)
  const [pool, setPool] = useState<TutorPrompt[]>([])
  const [q, setQ] = useState<TutorPrompt | null>(null)
  const [input, setInput] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [critique, setCritique] = useState<{ verdict: Verdict; body: string } | null>(null)

  useEffect(() => {
    void (async () => {
      const cards = await db.cards.where('type').equals('vocab').toArray()
      const list = tutorPrompts(new Set(cards.map((c) => c.refId)))
      setPool(list)
      setQ((cur) => cur ?? pickPrompt(list))
    })()
  }, [])

  const next = useCallback(() => {
    setQ((cur) => pickPrompt(pool, cur?.id) ?? cur)
    setInput('')
    setRevealed(false)
    setCritique(null)
  }, [pool])

  async function submit() {
    const my = input.trim()
    if (!my || !q || loading) return
    setRevealed(true)
    if (!hasLLM()) return // 無金鑰：只揭曉參考答案，自己比對（降級不中斷）
    setLoading(true)
    try {
      const text = await chatGemini(buildQuizSystem(known), [
        { role: 'user', text: buildQuizUser(q, my) },
      ])
      setCritique(parseCritique(text))
    } catch (e) {
      toast(errMsg(e, '助教講評連線失敗，可先自己對照參考答案'))
    } finally {
      setLoading(false)
    }
  }

  if (!q) {
    return (
      <div className="card">
        <p className="sub">準備題目中…</p>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="row between">
        <div className="eyebrow">考我 ─ 自分で つくる</div>
        <span className="chip">{q.tag}</span>
      </div>
      <p className="sub" style={{ marginTop: 2 }}>
        看中文，自己用日文說（或打）出來，再對照參考答案。
      </p>

      <div
        className="sent tutorQ"
        style={{ fontSize: 22, textAlign: 'center', margin: '14px 0' }}
      >
        {q.zh}
      </div>

      {revealed ? (
        <>
          <div className="sub">你的作答</div>
          <div className="sent" style={{ fontSize: 19, marginBottom: 10 }}>
            {input || '（未作答）'}
          </div>

          <div className="sub">教材參考答案（已驗證）</div>
          {showKanji && q.alt && hasKanji(q.alt) ? (
            <RubyText display={q.alt} reading={q.answer} className="sent" />
          ) : (
            <div className="sent">{q.answer}</div>
          )}
          <div className="row center" style={{ margin: '8px 0 4px' }}>
            <button className="btn small ghost" onClick={() => void speak(q.answer, rate)}>
              🔊 唸一次
            </button>
          </div>

          {loading && <p className="sub center">助教講評中…</p>}
          {critique && (
            <div className="card" style={{ marginTop: 10, background: 'var(--washi)' }}>
              <div className="sub" style={{ marginBottom: 2 }}>
                助教講評
                {VERDICT_LABEL[critique.verdict] && (
                  <b style={{ marginLeft: 6 }}>{VERDICT_LABEL[critique.verdict]}</b>
                )}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.7 }}>
                {critique.body}
              </div>
              <div className="hint" style={{ marginTop: 6 }}>
                ⚠️ 講評由 AI 生成、僅供參考；參考答案才是教材已驗證的說法。
              </div>
            </div>
          )}
          {!hasLLM() && (
            <p className="sub center" style={{ marginTop: 8 }}>
              設定 Gemini 金鑰後，助教還會用中文講評你的句子。
            </p>
          )}

          <div className="row center" style={{ marginTop: 12 }}>
            <button className="btn" onClick={next}>
              換一題 →
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="row" style={{ gap: 6 }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
              }}
              placeholder="用日文寫一句…"
              style={{
                flex: 1,
                fontSize: 15,
                borderRadius: 8,
                border: '1px solid var(--washi2)',
                padding: '8px 10px',
              }}
            />
            <button className="btn small" onClick={() => void submit()} disabled={loading}>
              送出作答
            </button>
          </div>
          <div className="row center" style={{ marginTop: 10 }}>
            <button className="btn small ghost" onClick={() => setRevealed(true)}>
              看參考答案
            </button>
            <button className="btn small ghost" onClick={next}>
              換一題 →
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function errMsg(e: unknown, fallback: string): string {
  const err = (e as Error).message
  return err.startsWith('gemini-http-4')
    ? 'Gemini 金鑰無效或額度用盡 — 請到設定確認'
    : err === 'no-key'
      ? '請先到設定填入 Gemini 金鑰'
      : fallback
}
