import { useEffect, useState } from 'react'
import {
  generate,
  enqueueCandidates,
  listQueue,
  removeFromQueue,
  adoptFromQueue,
  analyzeCoverage,
  type Theme,
} from '../lib/content'
import type { GenCandidate } from '../db/schema'
import { VOCAB } from '../data/vocab'
import { speak } from '../audio/tts'
import { toast } from '../components/ui'

const KNOWN_READS = VOCAB.map((v) => v.jp)

const THEMES: { key: Theme; label: string }[] = [
  { key: 'daily', label: '日常' },
  { key: 'ninja', label: '忍者' },
  { key: 'quest', label: '旅途' },
]

const THEME_LABEL: Record<string, string> = {
  daily: '日常',
  ninja: '忍者',
  quest: '旅途',
}

export function ReviewView({ onDone }: { onDone: () => void }) {
  const [theme, setTheme] = useState<Theme>('daily')
  const [loading, setLoading] = useState(false)
  const [queue, setQueue] = useState<GenCandidate[]>([])
  const [demo, setDemo] = useState(false)
  const [adopted, setAdopted] = useState(0)

  async function reload() {
    setQueue(await listQueue())
  }
  useEffect(() => {
    void reload()
  }, [])

  async function run() {
    setLoading(true)
    try {
      const res = await generate(theme, 5)
      setDemo(res.demo)
      if (res.candidates.length === 0) {
        toast('沒有產生候選句')
      } else {
        // 候選先進持久化佇列——退回前不消失，可稍後再審
        await enqueueCandidates(theme, res.candidates)
        await reload()
      }
    } catch (e) {
      const err = (e as Error).message
      let msg = '生成失敗：' + err
      if (err.startsWith('gemini-http-4')) msg = 'Gemini 金鑰無效或額度用盡 — 請到設定確認'
      else if (err.startsWith('gemini-http') || err === 'gemini-empty') msg = 'Gemini 連線失敗，請稍後再試'
      else if (err === 'gemini-bad-json') msg = 'Gemini 回應格式異常，請再試一次'
      toast(msg)
    } finally {
      setLoading(false)
    }
  }

  async function adopt(item: GenCandidate) {
    await adoptFromQueue(item)
    setAdopted((n) => n + 1)
    toast('已採用，加入「話す」跟讀庫')
    await reload()
  }
  async function reject(item: GenCandidate) {
    if (item.id != null) await removeFromQueue(item.id)
    await reload()
  }

  return (
    <>
      <div className="card">
        <div className="eyebrow">生成 ─ 練習句審核佇列</div>
        <p className="sub">
          由 AI 依你的已學詞彙生成候選（每句最多 1 個新詞）。
          <b>採用後才會進入學習庫</b>——AI 不直接寫入，你是最後把關。
          候選會保留在佇列裡，可稍後再審。
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
            目前是離線示範候選（未設定 Gemini 金鑰）。到設定填入金鑰後，改由 Gemini 依主題即時生成。
          </div>
        )}
      </div>

      {queue.map((c) => {
        const cov = analyzeCoverage(c.read || c.jp, KNOWN_READS)
        return (
          <div className="card" key={c.id}>
            <div className="sent" style={{ fontSize: 20 }}>
              {c.jp}
            </div>
            <div className="sentZh">{c.zh}</div>
            <div className="statChips">
              <span className="chip">主題 {THEME_LABEL[c.theme] || c.theme}</span>
              {c.newWords.map((w, k) => (
                <span className="chip" key={k}>
                  新詞 <b>{w.jp}</b> {w.zh}
                </span>
              ))}
            </div>
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
                <button className="btn small ghost" onClick={() => void reject(c)}>
                  退回
                </button>
                <button className="btn small" onClick={() => void adopt(c)}>
                  採用 ✓
                </button>
              </div>
            </div>
          </div>
        )
      })}

      <div className="card">
        <p className="sub" style={{ textAlign: 'center' }}>
          佇列中 <b>{queue.length}</b> 句待審・本次已採用 <b>{adopted}</b> 句
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
