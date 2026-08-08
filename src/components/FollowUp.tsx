import { useEffect, useState } from 'react'
import { chatGeminiJSON, chatGemini, hasLLM } from '../lib/llm'
import { personalKnownWords } from '../lib/content'
import {
  buildAskSystem,
  buildAskUser,
  parseFollowUpQuestion,
  buildReplySystem,
  buildReplyUser,
  MAX_FOLLOWUPS,
  type FollowUpQuestion,
} from '../lib/followUp'
import { parseCritique, VERDICT_LABEL, type Verdict } from '../lib/tutorQuiz'
import { mergeSpoken } from '../lib/voiceInput'
import { speak } from '../audio/tts'
import { useApp } from '../state/store'
import { VoiceInput } from './VoiceInput'
import { toast } from './ui'

/**
 * 跟讀後的「即時追問」：AI 針對剛跟讀的**已驗證例句**追問一句，你臨場自己組句回答，
 * 再拿到一段中文講評。屬**選配加練**——不計入「口」任務、不影響蓋章、不寫入學習庫。
 * 無 Gemini 金鑰時只顯示一行說明（跟讀與評分完全不受影響）。
 */
export function FollowUp({ sent }: { sent: { id: string; jp: string; zh: string } }) {
  const rate = useApp((s) => s.rate)
  const [known, setKnown] = useState<string[]>([])
  const [q, setQ] = useState<FollowUpQuestion | null>(null)
  const [input, setInput] = useState('')
  const [critique, setCritique] = useState<{ verdict: Verdict; body: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [count, setCount] = useState(0)

  useEffect(() => {
    void (async () => setKnown(await personalKnownWords()))()
  }, [])

  // 換句子 → 這塊重來（追問是針對「當下這句」的情境）
  useEffect(() => {
    setQ(null)
    setInput('')
    setCritique(null)
    setCount(0)
  }, [sent.id])

  if (!hasLLM()) {
    return (
      <div className="card">
        <div className="eyebrow">追問 ─ AI に聞かれる</div>
        <p className="sub">
          到<b>設定</b>（點頁首標題）填入 Gemini 金鑰後，跟讀完這句，AI 會順著情境
          <b>追問你一句</b>，讓你臨場自己組句回答。跟讀與評分不需要金鑰，照常可用。
        </p>
      </div>
    )
  }

  async function ask() {
    if (loading || count >= MAX_FOLLOWUPS) return
    setLoading(true)
    setInput('')
    setCritique(null)
    try {
      const raw = await chatGeminiJSON(buildAskSystem(known), [
        { role: 'user', text: buildAskUser(sent) },
      ])
      const parsed = parseFollowUpQuestion(raw)
      if (!parsed) {
        toast('AI 回覆格式怪怪的，請再按一次')
        return
      }
      setQ(parsed)
      setCount((n) => n + 1)
    } catch (e) {
      toast(errMsg(e, '追問連線失敗，請稍後再試'))
    } finally {
      setLoading(false)
    }
  }

  async function reply() {
    const my = input.trim()
    if (!my || !q || loading) return
    setLoading(true)
    try {
      const text = await chatGemini(buildReplySystem(known), [
        { role: 'user', text: buildReplyUser(q, my) },
      ])
      setCritique(parseCritique(text))
    } catch (e) {
      toast(errMsg(e, '講評連線失敗，可先自己想想怎麼說'))
    } finally {
      setLoading(false)
    }
  }

  const done = count >= MAX_FOLLOWUPS

  return (
    <div className="card">
      <div className="row between">
        <div className="eyebrow">追問 ─ AI に聞かれる</div>
        {count > 0 && (
          <span className="chip">
            {count} / {MAX_FOLLOWUPS}
          </span>
        )}
      </div>
      <p className="sub" style={{ marginTop: 2 }}>
        跟讀完這句之後，讓 AI 順著情境追問你一句——這次<b>沒有稿子</b>，自己組句回答看看。
        （選配加練，不影響今日任務）
      </p>

      {!q ? (
        <div className="row center" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => void ask()} disabled={loading}>
            🤖 追問一句
          </button>
        </div>
      ) : (
        <>
          <div className="sent followUpQ" style={{ marginTop: 10 }}>
            {q.jp}
          </div>
          {q.zh && <div className="sentZh">{q.zh}</div>}
          <div className="row center" style={{ margin: '6px 0 2px' }}>
            <button className="btn small ghost" onClick={() => void speak(q.jp, rate)}>
              🔊 聽一次
            </button>
          </div>
          <div className="hint" style={{ marginTop: 6 }}>
            ⚠️ 追問句與講評由 AI 生成、<b>僅供參考</b>，不會寫入你的學習資料；
            教材例句（上方那句）才是已驗證的說法。
          </div>

          <div className="row" style={{ marginTop: 10, gap: 6 }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void reply()
              }}
              placeholder="用日文回答…"
              style={{
                flex: 1,
                fontSize: 15,
                borderRadius: 8,
                border: '1px solid var(--washi2)',
                padding: '8px 10px',
              }}
            />
            <button className="btn small" onClick={() => void reply()} disabled={loading}>
              送出回答
            </button>
          </div>
          {/* 用說的：辨識結果併進輸入框，使用者確認／修改後才送出（ASR 會聽錯） */}
          <VoiceInput
            disabled={loading}
            hint="說出來也可以——辨識結果會先填進輸入框"
            onText={(txt) => setInput((cur) => mergeSpoken(cur, txt))}
          />

          {loading && <p className="sub center">AI 思考中…</p>}
          {critique && (
            <div className="card" style={{ marginTop: 10, background: 'var(--washi)' }}>
              <div className="sub" style={{ marginBottom: 2 }}>
                講評
                {VERDICT_LABEL[critique.verdict] && (
                  <b style={{ marginLeft: 6 }}>{VERDICT_LABEL[critique.verdict]}</b>
                )}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.7 }}>
                {critique.body}
              </div>
            </div>
          )}

          <div className="row center" style={{ marginTop: 10 }}>
            {done ? (
              <p className="sub">這句追問夠了——換下一句再來吧。</p>
            ) : (
              <button className="btn small ghost" onClick={() => void ask()} disabled={loading}>
                再追問一句 →
              </button>
            )}
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
