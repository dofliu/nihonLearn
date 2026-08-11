import { useEffect, useState } from 'react'
import { chatGeminiJSON, chatGemini, hasLLM } from '../lib/llm'
import { personalKnownWords } from '../lib/content'
import { logActivity } from '../db/repo'
import {
  buildAskSystem,
  parseFollowUpQuestion,
  buildReplySystem,
  buildReplyUser,
  followUpHistory,
  MAX_FOLLOWUPS,
  type FollowUpQuestion,
  type FollowUpKind,
  type FollowUpTopic,
} from '../lib/followUp'
import { parseCritique, VERDICT_LABEL, type Verdict } from '../lib/tutorQuiz'
import { mergeSpoken } from '../lib/voiceInput'
import { speak } from '../audio/tts'
import { useApp } from '../state/store'
import { VoiceInput } from './VoiceInput'
import { toast } from './ui'

/** 兩種題材的文案差異（其餘畫面完全共用）。 */
const COPY: Record<
  FollowUpKind,
  { intro: string; verified: string; noKey: string; done: string }
> = {
  sentence: {
    intro: '跟讀完這句之後，讓 AI 順著情境追問你一句——這次沒有稿子，自己組句回答看看（AI 會接著你的回答繼續問）。',
    verified: '教材例句（上方那句）才是已驗證的說法。',
    noKey: '跟讀完這句，AI 會順著情境',
    done: '這句追問夠了——換下一句再來吧。',
  },
  dialogue: {
    intro:
      '這段対話練完了——讓 AI 扮演同一個對象、在同一個場景再問你一句，這次沒有稿子（AI 會接著你的回答繼續問）。',
    verified: '上方的對話腳本才是已驗證的說法。',
    noKey: '走完一段対話，AI 會扮演對方',
    done: '這段對話追問夠了——換個場景再來吧。',
  },
}

/** 畫面上的一輪追問：AI 的問句、你的回答、AI 的中文講評。 */
interface Round {
  q: FollowUpQuestion
  answer: string
  critique: { verdict: Verdict; body: string } | null
}

/**
 * 練完教材素材後的「即時追問」：AI 針對剛練過的**已驗證素材**（跟讀例句／情境對話腳本）
 * 追問一句，你臨場自己組句回答，再拿到一段中文講評。v3.39 起**接續多輪**——AI 看得到
 * 前面問過什麼、你怎麼回，會順著你的回答繼續問下去（同一個情境最多 `MAX_FOLLOWUPS` 輪，
 * 畫面保留整串問答）。屬**選配加練**——不計入「口」任務、不影響蓋章、不寫入學習庫。
 * 無 Gemini 金鑰時只顯示一行說明（跟讀／会話引導完全不受影響）。
 */
export function FollowUp({ topic }: { topic: FollowUpTopic }) {
  const copy = COPY[topic.kind]
  const rate = useApp((s) => s.rate)
  const [known, setKnown] = useState<string[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void (async () => setKnown(await personalKnownWords()))()
  }, [])

  // 換題材（下一句例句／另一段對話）→ 這塊重來（追問是針對「當下這個情境」的）
  useEffect(() => {
    setRounds([])
    setInput('')
  }, [topic.id])

  if (!hasLLM()) {
    return (
      <div className="card">
        <div className="eyebrow">追問 ─ AI に聞かれる</div>
        <p className="sub">
          到<b>設定</b>（點頁首標題）填入 Gemini 金鑰後，{copy.noKey}
          <b>追問你一句</b>，讓你臨場自己組句回答。這裡不填金鑰也不影響原本的練習。
        </p>
      </div>
    )
  }

  async function ask() {
    if (loading || rounds.length >= MAX_FOLLOWUPS) return
    setLoading(true)
    setInput('')
    try {
      // 帶上前面幾輪的問答，AI 才能接著你的回答繼續問（第一輪＝只有題材本身，行為同以往）
      const raw = await chatGeminiJSON(
        buildAskSystem(known, topic.kind),
        followUpHistory(
          topic.askUser,
          rounds.map((r) => ({ q: r.q, answer: r.answer })),
        ),
      )
      const parsed = parseFollowUpQuestion(raw)
      if (!parsed) {
        toast('AI 回覆格式怪怪的，請再按一次')
        return
      }
      setRounds((rs) => [...rs, { q: parsed, answer: '', critique: null }])
    } catch (e) {
      toast(errMsg(e, '追問連線失敗，請稍後再試'))
    } finally {
      setLoading(false)
    }
  }

  async function reply() {
    const my = input.trim()
    const idx = rounds.length - 1
    const cur = rounds[idx]
    if (!my || !cur || cur.answer || loading) return
    setLoading(true)
    // 回答先進畫面（講評連線失敗也留著——你確實已經自己組句回答過了）
    setRounds((rs) => rs.map((r, i) => (i === idx ? { ...r, answer: my } : r)))
    setInput('')
    // 臨場組句回答＝一次練習，記入学習記録（選配加練，不計「口」任務、不卡蓋章）
    void logActivity('followup')
    try {
      const text = await chatGemini(buildReplySystem(known), [
        { role: 'user', text: buildReplyUser(cur.q, my) },
      ])
      const c = parseCritique(text)
      setRounds((rs) => rs.map((r, i) => (i === idx ? { ...r, critique: c } : r)))
    } catch (e) {
      toast(errMsg(e, '講評連線失敗，可先自己想想怎麼說'))
    } finally {
      setLoading(false)
    }
  }

  const count = rounds.length
  const cur = rounds[count - 1]
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
        {copy.intro}（選配加練，不影響今日任務）
      </p>

      {count === 0 ? (
        <div className="row center" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => void ask()} disabled={loading}>
            🤖 追問一句
          </button>
        </div>
      ) : (
        <>
          {/* 整串問答留在畫面上——AI 也看得到，會接著你的回答繼續問 */}
          {rounds.map((r, i) => (
            <div className="followUpRound" key={i}>
              <div className="sent followUpQ">{r.q.jp}</div>
              {r.q.zh && <div className="sentZh">{r.q.zh}</div>}
              <div className="row center" style={{ margin: '6px 0 2px' }}>
                <button className="btn small ghost" onClick={() => void speak(r.q.jp, rate)}>
                  🔊 聽一次
                </button>
              </div>
              {r.answer && <div className="followUpMine">あなた：{r.answer}</div>}
              {r.critique && (
                <div className="card" style={{ marginTop: 10, background: 'var(--washi)' }}>
                  <div className="sub" style={{ marginBottom: 2 }}>
                    講評
                    {VERDICT_LABEL[r.critique.verdict] && (
                      <b style={{ marginLeft: 6 }}>{VERDICT_LABEL[r.critique.verdict]}</b>
                    )}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.7 }}>
                    {r.critique.body}
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="hint" style={{ marginTop: 6 }}>
            ⚠️ 追問句與講評由 AI 生成、<b>僅供參考</b>，不會寫入你的學習資料；{copy.verified}
          </div>

          {cur && !cur.answer && (
            <>
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
                onText={(txt) => setInput((c) => mergeSpoken(c, txt))}
              />
            </>
          )}

          {loading && <p className="sub center">AI 思考中…</p>}

          <div className="row center" style={{ marginTop: 10 }}>
            {done ? (
              <p className="sub">{copy.done}</p>
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
