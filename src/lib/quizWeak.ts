/**
 * N5 模擬測驗 — 弱點追蹤（純函式，無 Dexie／瀏覽器依賴，供 Node 測試）。
 *
 * 背景：v3.4 起每次測驗把答錯的詞存進 `quizResults.weakRefs`，測驗首頁列出
 * 「最常答錯」——但那份清單是個**死路**：
 *   (一) 看得到、練不到：`generateQuiz` 從全部已學詞均勻取樣，答錯過的詞不會多出；
 *   (二) 只累加、永遠不退：三個月前錯過一次的詞，之後每次都答對，仍舊掛在「最常答錯」上。
 * 本檔補上「答對會退」的判定，`lib/quiz.ts` 則補上「弱點優先／只考弱點」的出題選項。
 *
 * 判定所需的「這次考過哪些詞」由 v3.49 起隨每筆紀錄存進 `askedRefs`；
 * **舊紀錄沒有這個欄位**，故答對無從得知 → streak 不增加 → 一律維持在弱點清單上
 * （寧可多留、不誤判為已克服）。
 */

/** 一次測驗的結果（只取弱點判定需要的欄位；對應 `db/schema.ts QuizResult`）。 */
export interface QuizRecord {
  ts: number
  weakRefs: string[] // 該次答錯的 refId（＝vocab.jp）
  askedRefs?: string[] // 該次出過題的 refId；v3.49 之前的紀錄沒有
}

/** 最後一次答錯之後，連續答對幾次算「已克服」（此後不再列入弱點）。 */
export const CLEAR_STREAK = 2

export interface WeakEntry {
  refId: string
  wrong: number // 累計答錯次數
  streak: number // 最後一次答錯之後連續答對幾次
  lastWrongTs: number
  cleared: boolean // streak >= CLEAR_STREAK
}

/**
 * 逐筆（依時間先後）累計每個曾經答錯的詞：答錯 → 次數 +1、連對歸零；
 * 之後每次「有考到且沒答錯」→ 連對 +1。回傳排序後的弱點清單
 * （未克服在前；再依答錯次數多到少、最近答錯的在前；最後以 refId 定序求 determinism）。
 */
export function weakStats(records: QuizRecord[]): WeakEntry[] {
  const byRef = new Map<string, WeakEntry>()
  const ordered = records.slice().sort((a, b) => a.ts - b.ts)
  for (const r of ordered) {
    const wrong = new Set(r.weakRefs)
    for (const ref of wrong) {
      const cur = byRef.get(ref)
      if (cur) {
        cur.wrong++
        cur.streak = 0
        cur.lastWrongTs = Math.max(cur.lastWrongTs, r.ts)
      } else {
        byRef.set(ref, { refId: ref, wrong: 1, streak: 0, lastWrongTs: r.ts, cleared: false })
      }
    }
    for (const ref of new Set(r.askedRefs ?? [])) {
      if (wrong.has(ref)) continue // 這次答錯了，已在上面處理
      const cur = byRef.get(ref)
      if (cur) cur.streak++ // 只追蹤「曾經答錯過」的詞；沒錯過的不需要進清單
    }
  }
  const out = [...byRef.values()]
  for (const e of out) e.cleared = e.streak >= CLEAR_STREAK
  return out.sort(
    (a, b) =>
      Number(a.cleared) - Number(b.cleared) ||
      b.wrong - a.wrong ||
      b.lastWrongTs - a.lastWrongTs ||
      (a.refId < b.refId ? -1 : a.refId > b.refId ? 1 : 0),
  )
}

/** 仍未克服的弱點 refId（排序同 `weakStats`）——出題優先序與「只考弱點」都用這個。 */
export function weakRefIds(records: QuizRecord[]): string[] {
  return weakStats(records)
    .filter((e) => !e.cleared)
    .map((e) => e.refId)
}

/** 已克服（答錯之後又連續答對 `CLEAR_STREAK` 次）的 refId。 */
export function clearedRefIds(records: QuizRecord[]): string[] {
  return weakStats(records)
    .filter((e) => e.cleared)
    .map((e) => e.refId)
}

/** 首頁統計用：還在追的弱點數與已克服數。 */
export function weakSummary(records: QuizRecord[]): { weak: number; cleared: number } {
  const all = weakStats(records)
  const cleared = all.filter((e) => e.cleared).length
  return { weak: all.length - cleared, cleared }
}
