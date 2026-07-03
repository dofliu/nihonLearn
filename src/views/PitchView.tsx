import { useState, useCallback } from 'react'
import { PITCH, type PitchWord } from '../data/pitch'
import { splitMora, pitchPattern, accentTypeName } from '../lib/pitch'
import { speak } from '../audio/tts'
import { toast } from '../components/ui'

// ---------- 高低線視覺化 ----------
function PitchLine({ kana, accent }: { kana: string; accent: number }) {
  const moras = splitMora(kana)
  const highs = pitchPattern(moras.length, accent)
  const n = moras.length
  const W = Math.max(110, n * 42)
  const H = 64
  const hy = 16
  const ly = 40
  const x = (i: number) => (n <= 1 ? W / 2 : 18 + (i * (W - 36)) / (n - 1))
  const pts = highs.map((h, i) => ({ x: x(i), y: h ? hy : ly }))
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-label={`${kana} 高低型`}>
      <path d={path} fill="none" stroke="var(--ai)" strokeWidth={2} />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill={highs[i] ? 'var(--shu)' : 'var(--nezu)'} />
      ))}
      {moras.map((m, i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 6}
          fontSize={14}
          fontFamily="var(--disp)"
          fill="var(--sumi)"
          textAnchor="middle"
        >
          {m}
        </text>
      ))}
    </svg>
  )
}

function WordCard({ w }: { w: PitchWord }) {
  const n = splitMora(w.jp).length
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 2px',
        borderBottom: '1px solid var(--washi2)',
        cursor: 'pointer',
      }}
      onClick={() => speak(w.jp, 0.8)}
    >
      <PitchLine kana={w.jp} accent={w.accent} />
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ai)' }}>
          {accentTypeName(w.accent, n)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--nezu)' }}>
          {w.zh} 🔊
        </div>
      </div>
    </div>
  )
}

const TYPE_OPTS = ['平板型', '頭高型', '中高型', '尾高型']

export function PitchView() {
  const [quiz, setQuiz] = useState<{ w: PitchWord; n: number } | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [round, setRound] = useState(0)

  const next = useCallback(() => {
    const w = PITCH[Math.floor(Math.random() * PITCH.length)]
    const n = splitMora(w.jp).length
    setQuiz({ w, n })
    setPicked(null)
    setRound((r) => r + 1)
    window.setTimeout(() => speak(w.jp, 0.8), 300)
  }, [])

  function answer(opt: string) {
    if (!quiz || picked) return
    setPicked(opt)
    const correct = accentTypeName(quiz.w.accent, quiz.n)
    toast(opt === correct ? '正解！' : `是「${correct}」`)
    window.setTimeout(next, 1400)
  }

  // 最小對立組分組
  const pairs = PITCH.filter((w) => w.pairKey)
  const singles = PITCH.filter((w) => !w.pairKey)

  return (
    <>
      <div className="card">
        <div className="eyebrow">耳の修行 ─ 高低アクセント</div>
        <h2>重音道場</h2>
        <p className="sub">
          日語靠<b>高低</b>（不是輕重）區分詞義。紅點為高、灰點為低。中文母語者常忽略這條線，
          卻是聽起來「像日本人」的關鍵。點任一詞可聽發音。
        </p>
        <div className="hint">
          採東京式標準，僅供辨識訓練。實際重音有地區與世代差異，各地字典標法可能不同。
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">最小對立組（同拍・不同型）</div>
        {pairs.map((w, i) => (
          <WordCard key={w.jp + i} w={w} />
        ))}
        <p className="sub" style={{ marginTop: 8 }}>
          「あめ」高低顛倒就從「雨」變「飴」；「はし」則是箸與橋之別。
        </p>
      </div>

      <div className="card">
        <div className="eyebrow">各型範例</div>
        {singles.map((w, i) => (
          <WordCard key={w.jp + i} w={w} />
        ))}
      </div>

      <div className="card">
        <div className="eyebrow">聽型測驗</div>
        <p className="sub">聽發音，判斷屬於哪一種高低型。</p>
        <div className="spacer" />
        {!quiz ? (
          <button className="btn" onClick={next}>
            開始測驗
          </button>
        ) : (
          <>
            <div className="row center" style={{ margin: '4px 0 12px' }}>
              <button className="btn red" onClick={() => speak(quiz.w.jp, 0.8)}>
                🔊 再聽一次
              </button>
            </div>
            {picked && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                <PitchLine kana={quiz.w.jp} accent={quiz.w.accent} />
              </div>
            )}
            <div className="gradeRow">
              {TYPE_OPTS.map((opt) => {
                const correct = accentTypeName(quiz.w.accent, quiz.n)
                let bg = 'var(--ai)'
                if (picked) {
                  if (opt === correct) bg = 'var(--take)'
                  else if (opt === picked) bg = 'var(--shu)'
                  else bg = 'var(--nezu)'
                }
                return (
                  <button
                    key={opt}
                    style={{ background: bg }}
                    onClick={() => answer(opt)}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
            <p className="sub center" style={{ marginTop: 8 }}>
              第 {round} 題
            </p>
          </>
        )}
      </div>
    </>
  )
}
