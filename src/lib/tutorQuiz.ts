/**
 * AI 助教「考我」模式的純邏輯（無 Dexie / window / Capacitor 依賴，供 Node 測試 import）。
 *
 * 責任分工（延續專案紅線，與 v3.10「LLM 只生中文」同一套精神）：
 *  - **題目與參考答案全部來自已驗證資料**——`data/sentences` 的例句（壱・弐級）與
 *    `data/patterns` × 已學 VOCAB 組出的句型例句（`lib/patternDrill`）。日文一律不由 LLM 生成。
 *  - LLM 只負責「用**中文**講評你自己寫的那句日文」，是使用者能自審的語言；產物僅供參考、
 *    **不寫入學習庫、不進 SRS**（比照 AI 助教 v3.6 的定位，故不走 needs_review 審核佇列）。
 *  - **無金鑰也能練**：出題 → 自己想 → 看參考答案自評（降級不中斷），只是少了 AI 講評。
 *
 * 這與被動選擇題的差別在於「主動產出」：先自己組句，再看標準答案／聽講評。
 */
import { SENTS } from '../data/sentences.ts'
import { PATTERNS } from '../data/patterns.ts'
import { itemsFor } from './patternDrill.ts'

export interface TutorPrompt {
  /** 穩定 id（sent:s3 ／ pat:pt1:みず），用來避免「換一題」抽到同一題 */
  id: string
  /** 中文情境題目（使用者要用日文說出來的意思） */
  zh: string
  /** 參考答案（已驗證日文，假名為主） */
  answer: string
  /** 漢字正寫（可選，供漢字モード顯示；無則為 undefined） */
  alt?: string
  /** 來源標籤（生存句／日常句／句型名），顯示在題目卡上 */
  tag: string
  source: 'sentence' | 'pattern'
}

/** 每個句型最多取幾個填空詞，避免句型題淹沒例句題。 */
const PER_PATTERN = 3

/** 例句題：壱（生存句）與弐（日常句）——参（物語句）偏文學，不適合初學者造句。 */
export function sentencePrompts(): TutorPrompt[] {
  return SENTS.filter((s) => s.lv === 1 || s.lv === 2).map((s) => ({
    id: `sent:${s.id}`,
    zh: s.zh,
    answer: s.jp,
    alt: s.alt,
    tag: s.lv === 1 ? '生存句' : '日常句',
    source: 'sentence' as const,
  }))
}

/** 句型題：句型模板 × 已學過的詞（學過的太少時 `patternDrill` 會補基礎詞）。 */
export function patternPrompts(learned: Set<string>): TutorPrompt[] {
  const out: TutorPrompt[] = []
  for (const p of PATTERNS) {
    for (const it of itemsFor(p, learned).slice(0, PER_PATTERN)) {
      out.push({
        id: `pat:${p.id}:${it.word.jp}`,
        zh: it.zh,
        answer: it.jp,
        alt: it.alt ?? undefined,
        tag: p.label,
        source: 'pattern',
      })
    }
  }
  return out
}

/** 全部可出的題目（例句 ＋ 句型）。順序固定，隨機交給 `pickPrompt`。 */
export function tutorPrompts(learned: Set<string>): TutorPrompt[] {
  return [...sentencePrompts(), ...patternPrompts(learned)]
}

/** 隨機抽一題，盡量不重複上一題（題庫只剩一題時才會重複）。 */
export function pickPrompt(
  pool: TutorPrompt[],
  exceptId?: string | null,
  rng: () => number = Math.random,
): TutorPrompt | null {
  if (pool.length === 0) return null
  const avail = pool.filter((p) => p.id !== exceptId)
  const list = avail.length > 0 ? avail : pool
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]
}

/**
 * 講評用 system prompt。要求：只用中文、開頭一個評價記號（供 `parseCritique` 解析）、
 * 不杜撰重音、允許學習者用參考答案以外的正確說法。
 */
export function buildQuizSystem(known: string[]): string {
  const list = known.slice(0, 120).join('、')
  return (
    '你是「日本語の道」App 內的日語學習助教，正在看一位中文母語、剛學完五十音的成人所寫的「造句作答」。' +
    '規則：' +
    '(1) 全部用繁體中文講評，簡短（最多 3 行）、以鼓勵為主；' +
    '(2) 回覆的**第一個字元必須是評價記號**：完全表達到題意用「✅」、意思大致到但用詞或助詞可以更好用「△」、' +
    '沒表達到題意或看不懂用「❌」；' +
    '(3) 記號之後說明哪裡好、哪裡可以調整；需要示範日文時只給一句、以平假名為主並附中文；' +
    '(4) 教材參考答案只是其中一種說法，學習者用別的說法只要正確也算對，不要硬要他照抄；' +
    '(5) 不要杜撰重音（アクセント）或艱深敬語，沒把握就不要提；' +
    '(6) 不要輸出 markdown 標題或清單符號。' +
    `\n學習者已學過的詞彙：${list || '（尚無，請用最基礎的詞）'}`
  )
}

/** 講評用 user 訊息（題目、教材參考答案、學習者作答）。 */
export function buildQuizUser(p: TutorPrompt, myAnswer: string): string {
  return (
    `題目（要用日文說出來的意思）：${p.zh}\n` +
    `教材參考答案：${p.answer}\n` +
    `學習者的作答：${myAnswer.trim()}\n` +
    '請依規則講評。'
  )
}

export type Verdict = 'ok' | 'soso' | 'ng' | 'unknown'

/** 記號 → 評價；'⚠️'（含變體選擇符）需排在 '⚠' 之前。 */
const MARKERS: [string, Verdict][] = [
  ['✅', 'ok'],
  ['⭕', 'ok'],
  ['○', 'ok'],
  ['△', 'soso'],
  ['⚠️', 'soso'],
  ['⚠', 'soso'],
  ['❌', 'ng'],
  ['✗', 'ng'],
  ['×', 'ng'],
]

export const VERDICT_LABEL: Record<Verdict, string> = {
  ok: '✅ 表達到了',
  soso: '△ 可以更好',
  ng: '❌ 意思沒傳達到',
  unknown: '',
}

/**
 * 純解析講評：取出開頭的評價記號（沒有就是 unknown，正文照樣顯示）。
 * 刻意寬鬆——AI 沒照格式時只是少了徽章，不影響使用者讀到講評內容。
 */
export function parseCritique(text: string): { verdict: Verdict; body: string } {
  const t = (text || '').trim()
  for (const [m, v] of MARKERS) {
    if (t.startsWith(m)) return { verdict: v, body: t.slice(m.length).replace(/^[\s:：、,，]+/, '') }
  }
  return { verdict: 'unknown', body: t }
}
