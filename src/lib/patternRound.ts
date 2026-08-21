/**
 * 文型ドリル「回想テスト」的一輪制（純函式，無 Dexie / window / React，供 Node 測試直接 import）。
 *
 * 原本回想テスト是**無止盡的循環**：`idx` 一直 +1 繞回去，沒有一輪的概念、沒有結束、沒有結算，
 * 自評「🔁 再一次」的那幾句只是排到隊尾（詞池大時繞完一圈前不會重逢、詞池小時又一直重複）。
 * 對「每天只練 10 分鐘」的使用者來說，這代表**不知道什麼時候算練完**，也**沒辦法針對沒說順的再練**。
 *
 * 本模組把它收成「一輪固定題數 → 結算 → 只練沒說對的」：
 *   buildRound()   從候選例句隨機不重複挑一輪（題數不足就取全部）
 *   roundSummary() 一輪自評結果的統計
 *   missedItems()  自評「再一次」的題目（維持該輪出現順序），供下一輪只練這些
 *   roundNote()    結算的一句話中文提示
 *
 * ⚠ 這裡的百分比是**使用者自評**的結果（自己說對了沒），不是系統評分——
 * 故刻意**不套用 `lib/scoreReveal.ts` 的 ◎／○／△ 等第徽章**（那代表發音／字形的相似度評分等第，
 * 兩者語意不同，同一個徽章不該在不同語境代表不同意思）。
 */
import type { DrillItem } from './patternDrill.ts'

/** 一輪的題數上限（候選例句不足時取全部）。10 分鐘的練習節奏，一輪約 1～2 分鐘。 */
export const ROUND_SIZE = 8

/**
 * 從候選例句挑出一輪的題目：**隨機、不重複**，最多 `size` 題。
 * 隨機來源以參數注入（預設 Math.random），測試可傳入 seeded RNG 求 determinism
 *（與 `lib/quiz.ts` 同慣例）。不修改傳入陣列。
 */
export function buildRound(
  items: readonly DrillItem[],
  size = ROUND_SIZE,
  rng: () => number = Math.random,
): DrillItem[] {
  const pool = [...items]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)))
    const t = pool[i]
    pool[i] = pool[j]
    pool[j] = t
  }
  const n = Math.min(Math.max(0, Math.floor(size)), pool.length)
  return pool.slice(0, n)
}

export interface RoundSummary {
  /** 這一輪的題數 */
  total: number
  /** 已自評的題數（marks 可能短於 round＝還沒答完） */
  answered: number
  /** 自評「說對了」的題數 */
  ok: number
  /** 自評「再一次」的題數 */
  missed: number
  /** 說對比例（0–100 整數；未答完時以 total 為分母，尚未作答者不計入） */
  pct: number
  /** 是否已答完整輪 */
  done: boolean
}

/** 一輪的自評結果統計。`marks[i]` 對應 `round[i]`：true＝說對了、false＝再一次。 */
export function roundSummary(round: readonly DrillItem[], marks: readonly boolean[]): RoundSummary {
  const total = round.length
  const answered = Math.min(marks.length, total)
  let ok = 0
  for (let i = 0; i < answered; i++) if (marks[i]) ok++
  const missed = answered - ok
  return {
    total,
    answered,
    ok,
    missed,
    pct: total > 0 ? Math.round((ok / total) * 100) : 0,
    done: total > 0 && answered >= total,
  }
}

/** 自評「再一次」的題目（維持該輪出現順序），供「只練沒說對的」再開一輪。 */
export function missedItems(
  round: readonly DrillItem[],
  marks: readonly boolean[],
): DrillItem[] {
  return round.filter((_, i) => marks[i] === false)
}

/**
 * 結算的一句話中文提示。刻意不評「幾分」——這是自評，講的是「接下來做什麼」。
 */
export function roundNote(s: RoundSummary): string {
  if (s.total === 0) return '這個句型暫時沒有可以練的單字。'
  if (s.missed === 0) return '整輪都說對了——換個句型再來一輪吧。'
  if (s.ok === 0) return '這個句型還不熟——用下面的鈕只練這幾句，多說幾次就順了。'
  return `有 ${s.missed} 句還沒說順——用下面的鈕只練那幾句。`
}
