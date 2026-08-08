/**
 * 五十音圖（gojūon chart）的表格結構——純函式，無 Dexie／瀏覽器依賴，供 Node 測試。
 *
 * **正確性策略**：這裡不新增任何手打的假名或羅馬字。
 *  - 清音／濁音格：全部由已驗證的 `data/kana.ts` 依索引取出（`KANA` 前半為平假名、
 *    後半為片假名，同索引＝同一個音，測試對全表驗證這個配對）。
 *  - 拗音格：由「該行 い段的假名 ＋ 小寫 ゃ／ゅ／ょ」與「基底羅馬字去掉字尾 i 的詞幹」
 *    **依規則推導**（きki→kya、しshi→sha、ちchi→cha、じji→ja…），不是逐條手打，
 *    所以不會有「憑印象打錯讀音」的風險，規則本身也由測試釘住。
 *
 * 拗音刻意不放進 SRS 卡組（`data/kana.ts` 的 `KANA` 維持 142 枚不動）——這張圖是
 * **查閱用的參考表**，不改動每日修行的範圍。
 */
// 帶副檔名：本檔會被 Node 直跑的 `tests/integration.ts` import（見 CLAUDE.md 已知陷阱）
import { KANA } from '../data/kana.ts'

export type KanaSet = 'seion' | 'dakuon' | 'yoon'
export type ChartScript = 'hiragana' | 'katakana'

export interface ChartCell {
  /** 對應 `data/kana.ts` 的 id（拗音沒有卡片，為 null） */
  id: string | null
  h: string
  k: string
  ro: string
}

export interface ChartRow {
  /** 列標（子音），母音行為 '_'、ん 行為 'n' */
  key: string
  cells: (ChartCell | null)[]
}

/** 平假名與片假名在 `KANA` 中的數量相同，同索引＝同一個音。 */
export const HALF = KANA.length / 2

/** 五十音圖的欄標（拗音只有三欄）。 */
export function columnsFor(set: KanaSet): string[] {
  return set === 'yoon' ? ['YA', 'YU', 'YO'] : ['A', 'I', 'U', 'E', 'O']
}

/** 由索引取出一格（平假名索引；片假名為同索引 + HALF）。 */
function cellAt(i: number): ChartCell {
  const h = KANA[i]
  const k = KANA[i + HALF]
  return { id: h.id, h: h.ch, k: k.ch, ro: h.ro }
}

/** 依索引起點取連續 n 格；`gaps` 中的欄位補 null（や行／わ行有空格）。 */
function rowFrom(key: string, start: number, slots: (number | null)[]): ChartRow {
  return { key, cells: slots.map((off) => (off == null ? null : cellAt(start + off))) }
}

const FIVE: (number | null)[] = [0, 1, 2, 3, 4]

/** 清音 46 音（含 や行／わ行的空格與單獨的 ん）。 */
function seionRows(): ChartRow[] {
  return [
    rowFrom('_', 0, FIVE),
    rowFrom('K', 5, FIVE),
    rowFrom('S', 10, FIVE),
    rowFrom('T', 15, FIVE),
    rowFrom('N', 20, FIVE),
    rowFrom('H', 25, FIVE),
    rowFrom('M', 30, FIVE),
    rowFrom('Y', 35, [0, null, 1, null, 2]),
    rowFrom('R', 38, FIVE),
    rowFrom('W', 43, [0, null, null, null, 1]),
    rowFrom('n', 45, [0, null, null, null, null]),
  ]
}

/** 濁音／半濁音 25 音。 */
function dakuonRows(): ChartRow[] {
  return [
    rowFrom('G', 46, FIVE),
    rowFrom('Z', 51, FIVE),
    rowFrom('D', 56, FIVE),
    rowFrom('B', 61, FIVE),
    rowFrom('P', 66, FIVE),
  ]
}

/** 拗音的小寫假名（や／ゆ／よ）。 */
const SMALL: { h: string; k: string; v: string }[] = [
  { h: 'ゃ', k: 'ャ', v: 'a' },
  { h: 'ゅ', k: 'ュ', v: 'u' },
  { h: 'ょ', k: 'ョ', v: 'o' },
]

/** 詞幹本身已含顎化音、直接接母音的三個（sha／cha／ja，不寫成 shya／chya／jya）。 */
const BARE_STEMS = ['sh', 'ch', 'j']

/**
 * 由基底羅馬字（い段，如 ki／shi／chi／ji）推導拗音羅馬字。
 * 詞幹＝去掉字尾的 i；詞幹是 sh／ch／j 時直接接母音（sha／cha／ja），
 * 其餘接 y＋母音（kya／nya／hya…——注意 hi 的詞幹是 h，要接 y 成 hya）。
 */
export function yoonRomaji(baseRo: string, vowel: string): string {
  const stem = baseRo.slice(0, -1)
  return stem + (BARE_STEMS.includes(stem) ? '' : 'y') + vowel
}

/** 拗音列的列標（＝該列羅馬字的子音部分，如 KY／SH／CH／J）。 */
export function yoonRowKey(baseRo: string): string {
  return yoonRomaji(baseRo, '').toUpperCase()
}

/** 組拗音的各列所依據的「い段」假名索引（ぢ 慣例不入圖，故不含）。 */
const YOON_BASE = [6, 11, 16, 21, 26, 31, 39, 47, 52, 62, 67]

/** 拗音 33 音（11 列 × や／ゆ／よ），全部由基底假名＋小假名推導。 */
function yoonRows(): ChartRow[] {
  return YOON_BASE.map((i) => {
    const base = cellAt(i)
    return {
      key: yoonRowKey(base.ro),
      cells: SMALL.map((s) => ({
        id: null,
        h: base.h + s.h,
        k: base.k + s.k,
        ro: yoonRomaji(base.ro, s.v),
      })),
    }
  })
}

/** 指定音組的表格列。 */
export function chartRows(set: KanaSet): ChartRow[] {
  return set === 'seion' ? seionRows() : set === 'dakuon' ? dakuonRows() : yoonRows()
}

/** 一格在指定書寫系統下要顯示／朗讀的字。 */
export function charOf(cell: ChartCell, script: ChartScript): string {
  return script === 'hiragana' ? cell.h : cell.k
}

/** 依表格順序攤平成可朗讀的字串陣列（「播放全部」用）。 */
export function charsInOrder(set: KanaSet, script: ChartScript): string[] {
  const out: string[] = []
  for (const row of chartRows(set)) {
    for (const c of row.cells) if (c) out.push(charOf(c, script))
  }
  return out
}

/** 表格內所有格（含 id，供標記已學／定著）。 */
export function cellsOf(set: KanaSet): ChartCell[] {
  return chartRows(set).flatMap((r) => r.cells.filter((c): c is ChartCell => c != null))
}
