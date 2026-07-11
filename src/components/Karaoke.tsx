import { useMemo } from 'react'
import { karaokeChars, activeCharIndices } from '../lib/karaoke'

/**
 * 朗讀逐字上色：把（假名）文字逐字渲染，正在唸的字加 `.kw.on`。
 * range 為 TTS 邊界事件回報的 [start, end)（cleaned 索引）；null＝無高亮。
 * 前提：text 就是實際朗讀的字串（純假名）；含 ruby 的漢字顯示請勿用此元件。
 */
export function Karaoke({
  text,
  range,
  className,
}: {
  text: string
  range: [number, number] | null
  className?: string
}) {
  const chars = useMemo(() => karaokeChars(text), [text])
  const active = useMemo(
    () => (range ? activeCharIndices(chars, range[0], range[1]) : new Set<number>()),
    [chars, range],
  )
  return (
    <span className={className}>
      {chars.map((c, i) =>
        c.ci === -1 ? (
          <span key={i}>{c.ch}</span>
        ) : (
          <span key={i} className={active.has(i) ? 'kw on' : 'kw'}>
            {c.ch}
          </span>
        ),
      )}
    </span>
  )
}
