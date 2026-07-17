import { useEffect, useState } from 'react'
import { allAttempts, perSentenceBest, listActivity, allStampDates } from '../db/repo'
import type { Attempt, ActivityRow } from '../db/schema'
import { SENTS } from '../data/sentences'
import { speak } from '../audio/tts'
import { lastNDays, computeStreak } from '../lib/date'
import {
  calendarCells,
  totalsByFeature,
  activeDayCount,
  FEATURE_LABEL,
  CORE_FEATURES,
  EXTRA_FEATURES,
} from '../lib/activity'

const SENT_BY_ID = Object.fromEntries(SENTS.map((s) => [s.id, s]))

function scoreColor(v: number) {
  return v >= 80 ? 'var(--take)' : v >= 55 ? 'var(--yama)' : 'var(--shu)'
}

/** n 點移動平均 */
function movingAvg(vals: number[], win: number): (number | null)[] {
  return vals.map((_, i) => {
    if (i < win - 1) return null
    let s = 0
    for (let j = i - win + 1; j <= i; j++) s += vals[j]
    return s / win
  })
}

export function ProgressView({ onDone }: { onDone: () => void }) {
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [perSent, setPerSent] = useState<
    { id: string; best: number; count: number }[]
  >([])
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [streak, setStreak] = useState(0)

  useEffect(() => {
    void (async () => {
      setAttempts(await allAttempts())
      const map = await perSentenceBest()
      setPerSent(
        [...map.entries()]
          .map(([id, v]) => ({ id, best: v.best, count: v.count }))
          .sort((a, b) => b.best - a.best),
      )
      setActivity(await listActivity())
      setStreak(computeStreak(await allStampDates()))
    })()
  }, [])

  // 學習記録：近 70 天日曆（10 週×7）＋各項目累計
  const days = lastNDays(70)
  const cells = calendarCells(activity, days)
  const featTotals = totalsByFeature(activity)
  const practiced = activeDayCount(activity)
  const totalActs = Object.values(featTotals).reduce((s, v) => s + v, 0)
  const orderedFeatures = [...CORE_FEATURES, ...EXTRA_FEATURES].filter((f) => featTotals[f] > 0)
  const maxFeat = Math.max(1, ...orderedFeatures.map((f) => featTotals[f]))

  const asr = attempts.filter((a) => a.source === 'asr')
  const scores = attempts.map((a) => a.score)
  const avg =
    scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0
  const best = scores.length > 0 ? Math.max(...scores) : 0
  // 近 7 日趨勢：前半 vs 後半均分
  let trend = 0
  if (scores.length >= 4) {
    const half = Math.floor(scores.length / 2)
    const early = scores.slice(0, half)
    const late = scores.slice(half)
    const em = early.reduce((s, v) => s + v, 0) / early.length
    const lm = late.reduce((s, v) => s + v, 0) / late.length
    trend = Math.round(lm - em)
  }

  return (
    <>
      <div className="card">
        <div className="eyebrow">学習記録 ─ 練習日曆</div>
        <div className="statChips" style={{ marginBottom: 10 }}>
          <span className="chip">連続 <b>{streak}</b> 日</span>
          <span className="chip">近 70 日練習 <b>{practiced}</b> 天</span>
          <span className="chip">累計動作 <b>{totalActs}</b></span>
        </div>
        <div className="heatGrid">
          {cells.map((c) => (
            <div key={c.day} className={`heatCell lv${c.level}`} title={`${c.day}：${c.count}`} />
          ))}
        </div>
        <p className="sub" style={{ marginTop: 6 }}>
          每格一天，顏色越深當天練得越多（含選配的書寫／測驗／重音）。
        </p>
      </div>

      {orderedFeatures.length > 0 && (
        <div className="card">
          <div className="eyebrow">各項目累計次數</div>
          {orderedFeatures.map((f) => (
            <div key={f} className="featRow">
              <span className="featName">{FEATURE_LABEL[f] || f}</span>
              <span className="featBar">
                <span
                  className="featFill"
                  style={{ width: `${Math.round((featTotals[f] / maxFeat) * 100)}%` }}
                />
              </span>
              <span className="featNum">{featTotals[f]}</span>
            </div>
          ))}
          <p className="sub" style={{ marginTop: 6 }}>
            前五項為每日修行核心（計入蓋章）；書寫／測驗／重音為選配額外練習。
          </p>
        </div>
      )}

      <div className="card">
        <div className="eyebrow">口の記録 ─ 發音成長曲線</div>
        {attempts.length === 0 ? (
          <p className="sub">
            還沒有練習紀錄。到「話す」分頁跟讀並錄音評分後，這裡會畫出你的成長曲線。
          </p>
        ) : (
          <>
            <div className="statChips">
              <span className="chip">
                總練習 <b>{attempts.length}</b> 次
              </span>
              <span className="chip">
                平均 <b>{avg}</b> 分
              </span>
              <span className="chip">
                最佳 <b>{best}</b> 分
              </span>
              {scores.length >= 4 && (
                <span className="chip">
                  趨勢{' '}
                  <b style={{ color: trend >= 0 ? 'var(--take)' : 'var(--shu)' }}>
                    {trend >= 0 ? '▲ +' : '▼ '}
                    {trend}
                  </b>
                </span>
              )}
            </div>
            {asr.length < attempts.length && (
              <div className="hint">
                含自評分數（未接語音辨識時的估計）。接上 sidecar 的 faster-whisper 後，
                分數會改由音素比對計算，更貼近真實發音。
              </div>
            )}
          </>
        )}
      </div>

      {attempts.length > 0 && (
        <div className="card">
          <div className="eyebrow">分數推移</div>
          <LineChart attempts={attempts} />
          <p className="sub" style={{ marginTop: 8 }}>
            每個點是一次跟讀評分；虛線為 5 次移動平均，看整體趨勢而非單次起伏。
          </p>
        </div>
      )}

      {perSent.length > 0 && (
        <div className="card">
          <div className="eyebrow">每句最佳分（點擊朗讀）</div>
          <div style={{ marginTop: 4 }}>
            {perSent.map((s) => {
              const sent = SENT_BY_ID[s.id]
              if (!sent) return null
              return (
                <div
                  key={s.id}
                  style={{
                    padding: '9px 2px',
                    borderBottom: '1px solid var(--washi2)',
                    cursor: 'pointer',
                  }}
                  onClick={() => speak(sent.alt || sent.jp, 0.85)}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontFamily: 'var(--disp)', fontSize: 15 }}>
                      {sent.jp}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(s.best) }}>
                      {s.best} 分 · {s.count}回
                    </span>
                  </div>
                  <div className="bar">
                    <i
                      style={{
                        width: s.best + '%',
                        background: scoreColor(s.best),
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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

// ---------- 純 SVG 折線圖 ----------
function LineChart({ attempts }: { attempts: Attempt[] }) {
  const W = 320
  const H = 160
  const pad = { l: 26, r: 8, t: 10, b: 18 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const n = attempts.length
  const scores = attempts.map((a) => a.score)

  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw)
  const y = (v: number) => pad.t + (1 - v / 100) * ih

  const avgLine = movingAvg(scores, 5)

  const pointsPath = scores
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ')
  const avgPath = avgLine
    .map((v, i) =>
      v == null ? '' : `${i === 0 || avgLine[i - 1] == null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`,
    )
    .join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="發音分數推移圖">
      {/* 網格線 0 / 55 / 80 / 100 */}
      {[0, 55, 80, 100].map((g) => (
        <g key={g}>
          <line
            x1={pad.l}
            x2={W - pad.r}
            y1={y(g)}
            y2={y(g)}
            stroke="var(--washi2)"
            strokeWidth={g === 0 ? 1.5 : 1}
            strokeDasharray={g === 55 || g === 80 ? '3 3' : undefined}
          />
          <text x={2} y={y(g) + 3} fontSize={9} fill="var(--nezu)">
            {g}
          </text>
        </g>
      ))}
      {/* 移動平均 */}
      {avgPath && (
        <path
          d={avgPath}
          fill="none"
          stroke="var(--ai)"
          strokeWidth={2}
          strokeDasharray="4 3"
          opacity={0.8}
        />
      )}
      {/* 分數折線 */}
      <path d={pointsPath} fill="none" stroke="var(--nezu)" strokeWidth={1} opacity={0.5} />
      {/* 點 */}
      {scores.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={2.6} fill={scoreColor(v)} />
      ))}
    </svg>
  )
}
