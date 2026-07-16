/**
 * 漢字↔假名 注音（furigana）純函式對齊器（無依賴，供 Node 測試）。
 *
 * 資料庫裡每個句/詞都有已驗證的兩欄：display（漢字正寫，如 sentences.alt / vocab.kanji）
 * 與 reading（純假名讀音，如 sentences.jp / vocab.jp）。本函式把兩者對齊成
 * 「漢字段落＋其對應假名」的分段，供 UI 渲染 <ruby>——注音不經 LLM、不用人工標，
 * 正確性由「重組必須完全還原原字串」的測試保證（tests/integration.ts）。
 *
 * 作法：display 的假名當錨點（regex 字面值）、漢字連段當 (.+?) 捕捉組，
 * 對 reading 做整串錨定比對；regex 回溯會自動解決錨點假名同時出現在讀音內的情況。
 * 空白與標點（兩欄常有出入，如 jp 有「。！」而 alt 沒有）在比對時一律忽略、顯示仍保留。
 */

export interface RubySeg {
  text: string // display 的一段（漢字段或假名/標點段）
  ruby?: string // 漢字段對應的假名讀音；非漢字段無此欄
}

// CJK 統一表意文字 + 々（重複記號）
const KANJI_CHAR = /[々一-鿿]/

// 比對時忽略的字元：空白與常見標點（顯示保留、不參與錨定）
export const ALIGN_IGNORED = /[\s、。，．！？!?・「」『』（）()～…]/g

export function hasKanji(s: string): boolean {
  return KANJI_CHAR.test(s)
}

/** 比對用正規化：去空白與標點。測試重組時兩側都套用同一規則。 */
export function stripIgnored(s: string): string {
  return (s || '').replace(ALIGN_IGNORED, '')
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 對齊 display（可含漢字）與 reading（純假名讀音）。
 * 成功 → 分段陣列（漢字段帶 ruby；標點/空白留在 text 原樣顯示）；
 * display 無漢字或對不上 → null（呼叫端 fallback 原樣顯示）。
 */
export function alignFurigana(display: string, reading: string): RubySeg[] | null {
  const disp = display || ''
  const read = stripIgnored(reading)
  if (!disp || !read || !hasKanji(disp)) return null

  // 切成 漢字連段 / 非漢字連段（非漢字段含標點，錨定時只用其可比對部分）
  const runs: { text: string; kanji: boolean }[] = []
  for (const ch of disp) {
    const k = KANJI_CHAR.test(ch)
    const last = runs[runs.length - 1]
    if (last && last.kanji === k) last.text += ch
    else runs.push({ text: ch, kanji: k })
  }

  const pattern = runs
    .map((r) => (r.kanji ? '(.+?)' : escapeRegExp(stripIgnored(r.text))))
    .join('')
  let m: RegExpMatchArray | null
  try {
    m = read.match(new RegExp(`^${pattern}$`))
  } catch {
    return null
  }
  if (!m) return null

  const segs: RubySeg[] = []
  let g = 1
  for (const r of runs) {
    if (r.kanji) {
      const ruby = m[g++]
      if (!ruby) return null
      segs.push({ text: r.text, ruby })
    } else {
      segs.push({ text: r.text })
    }
  }
  return segs
}
