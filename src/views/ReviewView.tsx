import { useState } from 'react'
import {
  generate,
  adoptSentence,
  analyzeCoverage,
  type Candidate,
  type Theme,
} from '../lib/content'
import { VOCAB } from '../data/vocab'
import { speak } from '../audio/tts'
import { toast } from '../components/ui'

const KNOWN_READS = VOCAB.map((v) => v.jp)

const THEMES: { key: Theme; label: string }[] = [
  { key: 'daily', label: '日常' },
  { key: 'ninja', label: '忍者' },
  { key: 'quest', label: '旅途' },
]

export function ReviewView({ onDone }: { onDone: () => void }) {
  const [theme, setTheme] = useState<Theme>('daily')
  const [loading, setLoading] = useState(false)
  const [cands, setCands] = useState<Candidate[]>([])
  const [demo, setDemo] = useState(false)
  const [handled, setHandled] = useState<Set<number>>(new Set())
  const [adopted, setAdopted] = useState(0)

  async function run() {
    setLoading(true)
    setCands([])
    setHandled(new Set())
    setAdopted(0)
    try {
      const res = await generate(theme, 5)
      setCands(res.candidates)
      setDemo(res.demo)
      if (res.candidates.length === 0) toast('沒有產生候選句')
    } catch (e) {
      const err = (e as Error).message
      toast(
        err.startsWith('content-http')
          ? 'sidecar 未在線或未設定 — 請先啟動 sidecar'
          : '生成失敗：' + err,
      )
    } finally {
      setLoading(false)
    }
  }

  async function adopt(i: number, c: Candidate) {
    await adoptSentence(c, theme)
    setHandled((s) => new Set(s).add(i))
    setAdopted((n) => n + 1)
    toast('已採用，加入「話す」跟讀庫')
  }
  function reject(i: number) {
    setHandled((s) => new Set(s).add(i))
  }

  return (
    <>
      <div className="card">
        <div className="eyebrow">生成 ─ 練習句審核佇列</div>
        <p className="sub">
          由 AI 依你的已學詞彙生成候選（每句最多 1 個新詞）。
          <b>採用後才會進入學習庫</b>——AI 不直接寫入，你是最後把關。
        </p>
        <div className="lvTabs" style={{ marginTop: 10 }}>
          {THEMES.map((t) => (
            <button
              key={t.key}
              className={theme === t.key ? 'on' : ''}
              onClick={() => setTheme(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button className="btn" onClick={() => void run()} disabled={loading}>
          {loading ? '生成中…' : '✨ 生成 5 句候選'}
        </button>
        {demo && (
          <div className="hint">
            目前是示範候選（sidecar 未設 ANTHROPIC_API_KEY）。設定後改由 LLM 依主題生成。
          </div>
        )}
      </div>

      {cands.map((c, i) => {
        const done = handled.has(i)
        if (done) return null
        const cov = analyzeCoverage(c.read || c.jp, KNOWN_READS)
        return (
          <div className="card" key={i}>
            <div className="sent" style={{ fontSize: 20 }}>
              {c.jp}
            </div>
            <div className="sentZh">{c.zh}</div>
            {c.new_words && c.new_words.length > 0 && (
              <div className="statChips">
                {c.new_words.map((w, k) => (
                  <span className="chip" key={k}>
                    新詞 <b>{w.jp}</b> {w.zh}
                  </span>
                ))}
              </div>
            )}
            <div className="statChips">
              <span
                className="chip"
                style={{
                  background: cov.flagged ? 'rgba(199,65,47,.1)' : 'rgba(78,141,110,.12)',
                }}
              >
                詞彙覆蓋{' '}
                <b style={{ color: cov.flagged ? 'var(--shu)' : 'var(--take)' }}>
                  {cov.coveragePct}%
                </b>
              </span>
              {cov.flagged && cov.newSpans.length > 0 && (
                <span className="chip" style={{ background: 'rgba(199,65,47,.1)' }}>
                  ⚠ 未覆蓋 <b>{cov.newSpans.join('・')}</b>
                </span>
              )}
            </div>
            {cov.flagged && (
              <div className="hint">
                此句超出「每句最多 1 新詞」的估計範圍，建議退回或確認後再採用。
              </div>
            )}
            <div className="spacer" />
            <div className="row between">
              <button className="btn small ghost" onClick={() => speak(c.read || c.jp, 0.85)}>
                🔊 試聽
              </button>
              <div className="row">
                <button className="btn small ghost" onClick={() => reject(i)}>
                  退回
                </button>
                <button className="btn small" onClick={() => void adopt(i, c)}>
                  採用 ✓
                </button>
              </div>
            </div>
          </div>
        )
      })}

      <div className="card">
        <p className="sub" style={{ textAlign: 'center' }}>
          本次已採用 <b>{adopted}</b> 句
        </p>
        <div className="row center">
          <button className="btn ghost" onClick={onDone}>
            返回
          </button>
        </div>
      </div>
    </>
  )
}
