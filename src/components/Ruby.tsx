import { useMemo, type CSSProperties } from 'react'
import { alignFurigana } from '../lib/furigana'

/**
 * 漢字＋假名注音顯示：display（漢字正寫）用 reading（已驗證假名）自動對齊出 <ruby>。
 * 對不上（或無漢字）→ fallback 顯示 display 原樣。純 React 元素，無 innerHTML。
 */
export function RubyText({
  display,
  reading,
  className,
  style,
  onClick,
}: {
  display: string
  reading: string
  className?: string
  style?: CSSProperties
  onClick?: () => void
}) {
  const segs = useMemo(() => alignFurigana(display, reading), [display, reading])
  return (
    <span className={className} style={style} onClick={onClick}>
      {segs
        ? segs.map((s, i) =>
            s.ruby != null ? (
              <ruby key={i}>
                {s.text}
                <rt>{s.ruby}</rt>
              </ruby>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )
        : display}
    </span>
  )
}
