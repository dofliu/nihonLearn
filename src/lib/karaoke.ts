/**
 * 朗讀逐字上色（卡拉OK）的對齊邏輯——純函式，供 Node 測試。
 *
 * TTS 邊界事件（Web Speech boundary / 原生 onRangeStart）回報的字元位置，
 * 是指「實際唸出的字串」的索引，也就是 tts.ts `clean()` 後的字串（去標籤、去空白）。
 * 這裡把顯示字串的每個字元對應到那個 cleaned 索引，讓 UI 能標出正在唸的字。
 *
 * 前提：顯示字串＝要朗讀的假名字串（呼叫端負責，見 SpeakView 等）。含 ruby 的
 * 漢字顯示與純假名讀音不對齊，不套用逐字上色。
 */

export interface KaraokeChar {
  ch: string
  ci: number // 在 cleaned 字串中的索引；空白/被剝除者為 -1
}

/** 顯示字串 → 逐字對應（去標籤；空白保留於顯示但 ci=-1，與 clean() 的計數一致）。 */
export function karaokeChars(display: string): KaraokeChar[] {
  const noTags = (display || '').replace(/<[^>]+>/g, '')
  const out: KaraokeChar[] = []
  let ci = 0
  for (const ch of noTags) {
    if (/\s/.test(ch)) {
      out.push({ ch, ci: -1 })
    } else {
      out.push({ ch, ci })
      ci++
    }
  }
  return out
}

/**
 * 給邊界範圍 [start, end)，回傳要高亮的「顯示字元索引」集合。
 * end<=start（長度未知）時，高亮包含 start 的整個「詞」（相鄰非空白字元）。
 */
export function activeCharIndices(
  chars: KaraokeChar[],
  start: number,
  end: number,
): Set<number> {
  const set = new Set<number>()
  if (end > start) {
    for (let i = 0; i < chars.length; i++) {
      if (chars[i].ci >= start && chars[i].ci < end) set.add(i)
    }
    return set
  }
  const anchor = chars.findIndex((c) => c.ci === start)
  if (anchor === -1) return set
  let l = anchor
  let r = anchor
  while (l - 1 >= 0 && chars[l - 1].ci !== -1) l--
  while (r + 1 < chars.length && chars[r + 1].ci !== -1) r++
  for (let i = l; i <= r; i++) if (chars[i].ci !== -1) set.add(i)
  return set
}
