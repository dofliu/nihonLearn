// 詞彙覆蓋率程式檢核（啟發式，零依賴，可獨立測試）
// 驗證生成句是否守住「i+1」——除已學詞與功能詞外，未覆蓋成分不宜過多。
// 非形態素分析，採貪婪最長匹配；用於審核參考，非硬性判定。

function kataToHiraLocal(s: string): string {
  return s.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

// 功能詞白名單（助詞、常見語尾、指示連接）——不算「新詞」
const FUNCTION_WORDS = [
  'は', 'を', 'に', 'が', 'で', 'へ', 'と', 'の', 'も', 'や', 'か', 'ね', 'よ', 'わ', 'な',
  'から', 'まで', 'より', 'ので', 'けど', 'でも', 'そして', 'それから',
  'です', 'ます', 'でした', 'ました', 'ません', 'ましょう', 'ください',
  'ている', 'ています', 'てください', 'だ', 'た', 'て', 'ない', 'なる', 'する',
  'こと', 'もの', 'という', 'ここ', 'そこ', 'あそこ',
]

export interface Coverage {
  coveragePct: number
  newSpans: string[]
  flagged: boolean
}

export function analyzeCoverage(read: string, knownReads: string[]): Coverage {
  const norm = kataToHiraLocal(read).replace(/[。、！？!?.,「」\s]/g, '')
  if (!norm) return { coveragePct: 100, newSpans: [], flagged: false }

  const known = new Set<string>([...knownReads.map(kataToHiraLocal), ...FUNCTION_WORDS])
  let maxLen = 1
  for (const w of known) if (w.length > maxLen) maxLen = w.length

  let i = 0
  let covered = 0
  const spans: string[] = []
  let cur = ''
  while (i < norm.length) {
    let matched = false
    for (let L = Math.min(maxLen, norm.length - i); L >= 1; L--) {
      if (known.has(norm.slice(i, i + L))) {
        if (cur) {
          spans.push(cur)
          cur = ''
        }
        covered += L
        i += L
        matched = true
        break
      }
    }
    if (!matched) {
      cur += norm[i]
      i += 1
    }
  }
  if (cur) spans.push(cur)

  const coveragePct = Math.round((covered / norm.length) * 100)
  const flagged = spans.length > 1 || coveragePct < 70
  return { coveragePct, newSpans: spans, flagged }
}
