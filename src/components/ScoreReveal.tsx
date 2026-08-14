import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  RING_CIRCUMFERENCE,
  RING_RADIUS,
  clampScore,
  countUpValue,
  ringDashOffset,
  type ScoreBand,
} from '../lib/scoreReveal'

/** 數字滾動與環圈填滿的時長（ms）。 */
const DURATION = 700

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * 分數揭曉：環形進度＋數字滾動＋等第徽章（書寫字形評分／跟讀發音評分共用）。
 *
 * 純呈現層——分數與等第由呼叫端算好傳進來（`lib/scoreReveal.ts scoreBand`），
 * 這裡只負責把它「揭曉」出來。`prefers-reduced-motion: reduce` 時直接顯示最終值
 * （全域 CSS 也已停用 transition），不會讓使用者等動畫。
 */
export function ScoreReveal({
  score,
  band,
  unit = '/ 100',
  ariaPrefix = '分數',
  caption,
}: {
  score: number
  band: ScoreBand
  /** 數字後面的單位（書寫「/ 100」、跟讀「点」）。 */
  unit?: string
  /** 螢幕閱讀器唸出的前綴。 */
  ariaPrefix?: string
  /** 分數下方的說明（各處自己的細節文字）。 */
  caption?: ReactNode
}) {
  const target = clampScore(score)
  const [shown, setShown] = useState(target)
  const [filled, setFilled] = useState(true)
  const rafRef = useRef(0)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(target)
      setFilled(true)
      return
    }
    setShown(0)
    setFilled(false)
    const start = performance.now()
    const tick = (now: number) => {
      const elapsed = now - start
      setShown(countUpValue(target, elapsed, DURATION))
      if (elapsed < DURATION) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    // 下一格才把環圈拉到目標值，讓 CSS transition 從 0 開始跑
    const t = window.setTimeout(() => setFilled(true), 30)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.clearTimeout(t)
    }
  }, [target])

  return (
    <div className="scoreReveal">
      <div
        className="scoreRingWrap"
        role="img"
        aria-label={`${ariaPrefix} ${target} 分・${band.label}`}
      >
        <svg className="scoreRing" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
          <circle className="scoreRingTrack" cx="60" cy="60" r={RING_RADIUS} />
          <circle
            className="scoreRingFill"
            cx="60"
            cy="60"
            r={RING_RADIUS}
            style={{
              stroke: band.color,
              strokeDasharray: RING_CIRCUMFERENCE,
              strokeDashoffset: filled ? ringDashOffset(target) : RING_CIRCUMFERENCE,
            }}
          />
        </svg>
        <div className="scoreBig" style={{ color: band.color }}>
          <span className="scoreMark">{band.mark}</span>
          <span className="scoreNum">{shown}</span>
          <span className="scoreUnit">{unit}</span>
        </div>
      </div>
      <div className={'scoreBadge ' + band.key} style={{ color: band.color, borderColor: band.color }}>
        {band.mark} {band.label}
        {band.hint && <span className="scoreBadgeHint">{band.hint}</span>}
      </div>
      {caption}
    </div>
  )
}
