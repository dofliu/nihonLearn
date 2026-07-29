import { useEffect, useRef, useState } from 'react'
import { KANJI_STROKES, KANJI_STROKE_VIEWBOX } from '../data/kanjiStrokes'

const STROKE_MS = 480 // 單畫描繪動畫時長
const GAP_MS = 220 // 兩畫之間停頓

/**
 * 漢字筆順動畫：依 KanjiVG 資料逐畫描繪（stroke-dashoffset 動畫）。
 * 換字或按「重播」都會從頭播一次；無該字資料時回傳 null（呼叫端自行判斷是否顯示按鈕）。
 */
export function StrokeOrder({ ch, size = 132 }: { ch: string; size?: number }) {
  const paths = KANJI_STROKES[ch]
  const pathRefs = useRef<(SVGPathElement | null)[]>([])
  const [playToken, setPlayToken] = useState(0)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!paths) return
    let cancelled = false
    const timers: number[] = []
    const lengths = pathRefs.current.map((el) => el?.getTotalLength() ?? 0)
    pathRefs.current.forEach((el, i) => {
      if (!el) return
      el.style.transition = 'none'
      el.style.strokeDasharray = `${lengths[i]}`
      el.style.strokeDashoffset = `${lengths[i]}`
    })
    setPlaying(true)
    paths.forEach((_, i) => {
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          const el = pathRefs.current[i]
          if (!el) return
          el.style.transition = `stroke-dashoffset ${STROKE_MS}ms ease-in-out`
          el.style.strokeDashoffset = '0'
        }, i * (STROKE_MS + GAP_MS)),
      )
    })
    timers.push(
      window.setTimeout(
        () => {
          if (!cancelled) setPlaying(false)
        },
        paths.length * (STROKE_MS + GAP_MS) + STROKE_MS,
      ),
    )
    return () => {
      cancelled = true
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [ch, playToken, paths])

  if (!paths) return null

  return (
    <div className="strokeOrder">
      <svg
        viewBox={`0 0 ${KANJI_STROKE_VIEWBOX} ${KANJI_STROKE_VIEWBOX}`}
        width={size}
        height={size}
        className="strokeOrderSvg"
      >
        {paths.map((d, i) => (
          <path
            key={i}
            ref={(el) => {
              pathRefs.current[i] = el
            }}
            d={d}
          />
        ))}
      </svg>
      <button className="btn small ghost" disabled={playing} onClick={() => setPlayToken((t) => t + 1)}>
        {playing ? '播放中…' : '▶ 重播筆順'}
      </button>
    </div>
  )
}
