/**
 * 單字帳的查詢／篩選／分組邏輯（純函式，無 Dexie / window，供 Node 測試直接 import）。
 *
 * 背景：読む頁的「單字帳」原本把全部 VOCAB 一次攤平列出（300 多列），手機上是一面
 * 滾不完的牆，也沒辦法「查一個詞」。這裡把查詢與分組抽成純函式，UI 只負責呈現。
 *
 * 正確性風險：零——完全不新增任何日文內容，只是把已驗證的 `data/vocab.ts` 重新組織。
 * 刻意**不做羅馬字搜尋**：詞彙層級沒有已驗證的羅馬字資料，靠假名逐字推導會在拗音／促音／
 * 長音上出錯，等於自行杜撰讀音——寧可只支援「假名／漢字／中文」三種使用者自己看得懂的輸入。
 */
import { VOCAB, type Vocab } from '../data/vocab.ts'

/** 單字狀態篩選 */
export type VocabStatus = 'all' | 'learned' | 'new'

/** 單字在列表上的標記（優先序：定著 > 已學 > 待假名解鎖 > 無） */
export type VocabMark = 'master' | 'learn' | 'locked' | 'none'

const KATAKANA_START = 0x30a1 // ァ
const KATAKANA_END = 0x30f6 // ヶ
const KANA_OFFSET = 0x60 // 片假名 → 平假名

/**
 * 片假名轉平假名（純機械的 Unicode 位移，不涉及任何讀音判斷）。
 * 讓使用者打「こーひー」也找得到「コーヒー」。長音符 ー、標點與其他字元原樣保留。
 */
export function toHiragana(s: string): string {
  let out = ''
  for (const ch of s) {
    const code = ch.codePointAt(0)!
    out +=
      code >= KATAKANA_START && code <= KATAKANA_END
        ? String.fromCodePoint(code - KANA_OFFSET)
        : ch
  }
  return out
}

/** 查詢字串正規化：去頭尾、內部空白（含全形）一律移除、英文小寫、片假名轉平假名。 */
export function normalizeQuery(q: string): string {
  return toHiragana(q.replace(/[\s　]+/g, '')).toLowerCase()
}

/** 這個詞是否符合查詢（比對假名、漢字正寫、中文釋義；空查詢一律符合）。 */
export function matchVocab(w: Vocab, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true
  const fields = [w.jp, w.kanji ?? '', w.zh]
  return fields.some((f) => normalizeQuery(f).includes(normalizedQuery))
}

/** 詞庫出現過的分類，維持 `data/vocab.ts` 的原始順序。 */
export const VOCAB_CATS: string[] = (() => {
  const seen: string[] = []
  for (const w of VOCAB) if (!seen.includes(w.cat)) seen.push(w.cat)
  return seen
})()

export interface VocabQuery {
  q?: string
  /** null／省略＝不限分類 */
  cat?: string | null
  status?: VocabStatus
}

/**
 * 依查詢字串、分類與學習狀態篩選（`learned` ＝已建立 FSRS 卡的詞，key 為 `Vocab.jp`）。
 * 保持傳入陣列的原始順序。
 */
export function filterVocab(
  words: Vocab[],
  query: VocabQuery,
  learned: Set<string>,
): Vocab[] {
  const nq = normalizeQuery(query.q ?? '')
  const status = query.status ?? 'all'
  return words.filter((w) => {
    if (query.cat && w.cat !== query.cat) return false
    if (status === 'learned' && !learned.has(w.jp)) return false
    if (status === 'new' && learned.has(w.jp)) return false
    return matchVocab(w, nq)
  })
}

/** 依分類分組（只產出非空的組，順序沿用傳入陣列中各分類首次出現的先後）。 */
export function groupByCat(words: Vocab[]): { cat: string; words: Vocab[] }[] {
  const out: { cat: string; words: Vocab[] }[] = []
  const byCat = new Map<string, Vocab[]>()
  for (const w of words) {
    let bucket = byCat.get(w.cat)
    if (!bucket) {
      bucket = []
      byCat.set(w.cat, bucket)
      out.push({ cat: w.cat, words: bucket })
    }
    bucket.push(w)
  }
  return out
}

/** 每個分類的「共 n 詞／已學 m」摘要（分類收合時顯示在標題上）。 */
export function catSummaries(
  words: Vocab[],
  learned: Set<string>,
): { cat: string; total: number; learned: number }[] {
  return groupByCat(words).map((g) => ({
    cat: g.cat,
    total: g.words.length,
    learned: g.words.filter((w) => learned.has(w.jp)).length,
  }))
}

/** 整份清單的統計（列在卡片說明上）。 */
export function bookStats(
  words: Vocab[],
  learned: Set<string>,
  mastered: Set<string>,
): { total: number; learned: number; mastered: number } {
  return {
    total: words.length,
    learned: words.filter((w) => learned.has(w.jp)).length,
    mastered: words.filter((w) => mastered.has(w.jp)).length,
  }
}

/**
 * 單字列上的標記。`locked` ＝這個詞的假名還沒學完（`lib/vocabGate.ts` 的解鎖判定），
 * 也就是它還不會出現在詞彙修行裡——讓「待假名解鎖 N 詞」這個數字看得到是哪些詞。
 */
export function vocabMark(
  w: Vocab,
  sets: { learned: Set<string>; mastered: Set<string>; locked: Set<string> },
): VocabMark {
  if (sets.mastered.has(w.jp)) return 'master'
  if (sets.learned.has(w.jp)) return 'learn'
  if (sets.locked.has(w.jp)) return 'locked'
  return 'none'
}

/** 標記對應的符號與說明（UI 與圖例共用同一份，避免兩邊寫不一樣）。 */
export const MARK_LABEL: Record<Exclude<VocabMark, 'none'>, { sign: string; text: string }> = {
  master: { sign: '◎', text: '已定著' },
  learn: { sign: '●', text: '學習中' },
  locked: { sign: '🔒', text: '待假名解鎖' },
}
