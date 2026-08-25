/**
 * 每日五修行的「動線」純函式：某一項剛達標時，算出接下來該去哪一項。
 *
 * 背景：核心五項散在四個分頁（かな／聴く／話す／読む），過去每完成一項都得自己回
 * 「今日」頁看還剩什麼、再點一次「前往」——十分鐘的習慣，光是換頁就要來回四趟。
 * 這裡只負責「算出下一項與提示文字」，導頁與呈現交給 `state/store` 與 `components/ui`。
 *
 * 無 Dexie／window／React 相依，可被 Node 測試（tests/integration.ts）。
 */

/** 任務定義（結構取自 `db/repo.ts` 的 TASKS，這裡只依賴欄位不依賴該檔） */
export interface FlowTask {
  id: string
  name: string
  target: number
  tab: string
}

/** 今日各任務的完成次數（未出現的視為 0） */
export type TaskCounts = Record<string, number>

export interface NextUp {
  /** 剛完成的那一項 */
  doneId: string
  doneName: string
  /** 接下來建議去的那一項 */
  nextId: string
  nextName: string
  nextTab: string
  /** 含 next 在內、今天還沒達標的項數 */
  remaining: number
  /** 一句話中文提示 */
  note: string
}

/** 任務名稱去掉括號說明：`字の修行（五十音 SRS）` → `字の修行` */
export function shortTaskName(name: string): string {
  const cut = name.search(/[（(]/)
  const short = (cut >= 0 ? name.slice(0, cut) : name).trim()
  return short || name.trim()
}

function countOf(counts: TaskCounts, id: string): number {
  const n = counts[id]
  return typeof n === 'number' && n > 0 ? n : 0
}

/** 某任務今天是否已達標 */
export function isTaskDone(task: FlowTask, counts: TaskCounts): boolean {
  return countOf(counts, task.id) >= task.target
}

/** 今天還沒達標的任務（維持傳入順序） */
export function remainingTasks(tasks: readonly FlowTask[], counts: TaskCounts): FlowTask[] {
  return tasks.filter((t) => !isTaskDone(t, counts))
}

/** 這一次計數是否讓某項任務從「未達標」跨到「達標」；沒有則回 null */
export function justCompleted(
  tasks: readonly FlowTask[],
  before: TaskCounts,
  after: TaskCounts,
): FlowTask | null {
  for (const t of tasks) {
    if (countOf(before, t.id) < t.target && countOf(after, t.id) >= t.target) return t
  }
  return null
}

/**
 * 下一個還沒達標的任務：從 `fromId` 的下一項開始繞一圈（讓動線照著五修行的順序走），
 * `fromId` 不在清單或未給時從頭找。全部達標時回 null。
 */
export function nextUnfinished(
  tasks: readonly FlowTask[],
  counts: TaskCounts,
  fromId?: string,
): FlowTask | null {
  const n = tasks.length
  if (n === 0) return null
  const at = fromId ? tasks.findIndex((t) => t.id === fromId) : -1
  const start = at >= 0 ? at + 1 : 0
  for (let i = 0; i < n; i++) {
    const t = tasks[(start + i) % n]
    if (!isTaskDone(t, counts)) return t
  }
  return null
}

/** 還剩 n 項時的一句話提示（n 必 ≥ 1——全達標時不會顯示這條動線提示） */
export function nextUpNote(remaining: number): string {
  if (remaining <= 1) return '最後一項了 ── 完成就蓋今日的印 ✨'
  return `還差 ${remaining} 項就蓋今日的印`
}

/**
 * 動線提示：這次計數若剛好讓某項達標、且今天還有沒做完的項目，回傳「下一項是什麼」。
 * 沒有剛完成的項目，或五項已全部達標（那時走的是蓋章大印）時回 null。
 */
export function buildNextUp(
  tasks: readonly FlowTask[],
  before: TaskCounts,
  after: TaskCounts,
): NextUp | null {
  const done = justCompleted(tasks, before, after)
  if (!done) return null
  const next = nextUnfinished(tasks, after, done.id)
  if (!next) return null
  const remaining = remainingTasks(tasks, after).length
  return {
    doneId: done.id,
    doneName: shortTaskName(done.name),
    nextId: next.id,
    nextName: shortTaskName(next.name),
    nextTab: next.tab,
    remaining,
    note: nextUpNote(remaining),
  }
}
