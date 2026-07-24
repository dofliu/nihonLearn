/**
 * 文型ドリル組合器（純函式，無 Dexie / window，供 Node 測試直接 import）。
 *
 * 把「固定句型模板」（data/patterns）× 「已學過的詞」（VOCAB 中 FSRS 學過者）組成完整例句。
 * 「用學過的單字 + 句型，每天重複、換不同單字」——正是本模組的職責。
 *   jp  ＝ pre + word.jp   + post   （純假名，供 TTS / 逐字上色 / 顯示）
 *   alt ＝ pre + word.kanji + post   （漢字正寫，供漢字モード ruby；詞無漢字時為 null）
 *   zh  ＝ zhPre + word.zh + zhPost  （中文對照）
 *
 * 正確性：句型與詞皆來自已驗證來源、pre/post 純假名，故 alt 必能被 furigana 對齊還原
 * （tests/integration.ts 對全 PATTERNS×VOCAB 保證）。不經 LLM。
 */
import { PATTERNS, type Pattern } from '../data/patterns.ts'
import { VOCAB, type Vocab } from '../data/vocab.ts'

export interface DrillItem {
  patternId: string
  pattern: Pattern
  word: Vocab
  jp: string // 純假名完整句（さかなを ください）
  alt: string | null // 漢字完整句（魚を ください）；詞無漢字→null
  zh: string // 中文對照（請給我魚）
  /** 這個詞是否為「使用者尚未 FSRS 學過、系統補上的基礎詞」（初學者 fallback） */
  fallback: boolean
}

/** 某句型的分類詞池（未過濾學習進度）。 */
export function poolFor(p: Pattern): Vocab[] {
  return VOCAB.filter((v) => p.cats.includes(v.cat))
}

/**
 * 某句型可用的填空詞：優先「已學過的詞」（learned ＝ 已 FSRS 學過的 vocab.jp 集合）。
 * 學過的太少（< min）時補上該分類的基礎詞，讓初學者也有得練、畫面不空
 *（與 content.ts personalKnownWords 同精神）。回傳保持 VOCAB 原順序、去重。
 */
export function candidatesFor(p: Pattern, learned: Set<string>, min = 4): Vocab[] {
  const pool = poolFor(p)
  const known = pool.filter((v) => learned.has(v.jp))
  if (known.length >= min) return known
  const out = [...known]
  for (const v of pool) {
    if (out.length >= min) break
    if (!out.includes(v)) out.push(v)
  }
  return out
}

/** 組出一個完整例句（pattern × word）。 */
export function buildItem(p: Pattern, w: Vocab, learned?: Set<string>): DrillItem {
  const jp = `${p.pre}${w.jp}${p.post}`
  const alt = w.kanji ? `${p.pre}${w.kanji}${p.post}` : null
  const zh = `${p.zhPre}${w.zh}${p.zhPost}`
  return {
    patternId: p.id,
    pattern: p,
    word: w,
    jp,
    alt,
    zh,
    fallback: learned ? !learned.has(w.jp) : false,
  }
}

/** 這個句型的全部例句（照詞池順序），供一頁式練習輪替。 */
export function itemsFor(p: Pattern, learned: Set<string>): DrillItem[] {
  return candidatesFor(p, learned).map((w) => buildItem(p, w, learned))
}

/** 依日序輪替出「今日の文型」（每天換一個句型，穩定不隨機）。 */
export function dailyPattern(dayIndex: number): Pattern {
  const i = ((dayIndex % PATTERNS.length) + PATTERNS.length) % PATTERNS.length
  return PATTERNS[i]
}
