/**
 * 自由対話「最近用過的自訂場景」。
 *
 * v3.40 的自訂場景不持久化——換頁回來就要重打一次（手機上打中文尤其麻煩）。
 * 這裡把「最近用過的幾個自訂場景」記在**裝置本機 localStorage**（比照 Gemini 金鑰與
 * sidecar 位址的做法），**刻意不進 Dexie**：這是使用者自己打的練習設定，
 * 既不是教材、也不是學習進度，不該跟著學習資料備份／遷移。
 *
 * 存的內容只有使用者自己填的**中文**（對象／情境），不含任何 AI 生成的日文——
 * 對話內容本身仍然一如既往不寫入任何地方。
 *
 * 純函式（sceneKey／parseRecent／serializeRecent／addRecent／removeRecent）供 Node 測試 import；
 * 模組層不得碰 window / localStorage（存取一律在函式內、且容錯）。
 */
import { normalizeCustom, MAX_CUSTOM_PARTNER, MAX_CUSTOM_SCENE } from './roleplay.ts'

export interface RecentScene {
  partner: string
  scene: string
}

/** 最多記幾個（超過的丟掉最舊的；清單太長反而難挑）。 */
export const MAX_RECENT_SCENES = 5

const LS_KEY = 'nihongo-michi:recentScenes'

/** 比對鍵：正規化後的兩欄——只差空白不算新的一筆。 */
export function sceneKey(r: RecentScene): string {
  return (
    normalizeCustom(r.partner, MAX_CUSTOM_PARTNER) +
    '\n' +
    normalizeCustom(r.scene, MAX_CUSTOM_SCENE)
  )
}

/** 正規化一筆；任一欄空 → null（不記）。 */
function normalizeOne(r: unknown): RecentScene | null {
  if (!r || typeof r !== 'object') return null
  const o = r as Record<string, unknown>
  if (typeof o.partner !== 'string' || typeof o.scene !== 'string') return null
  const partner = normalizeCustom(o.partner, MAX_CUSTOM_PARTNER)
  const scene = normalizeCustom(o.scene, MAX_CUSTOM_SCENE)
  if (!partner || !scene) return null
  return { partner, scene }
}

/**
 * localStorage 字串 → 清單。容錯：壞 JSON／非陣列／欄位缺漏一律當沒有，
 * 逐筆正規化、去重、截到上限（存進去的東西可能被別的版本或手動改壞）。
 */
export function parseRecent(raw: string | null): RecentScene[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const out: RecentScene[] = []
  const seen = new Set<string>()
  for (const item of data) {
    const one = normalizeOne(item)
    if (!one) continue
    const k = sceneKey(one)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(one)
    if (out.length >= MAX_RECENT_SCENES) break
  }
  return out
}

export function serializeRecent(list: RecentScene[]): string {
  return JSON.stringify(list.map((r) => ({ partner: r.partner, scene: r.scene })))
}

/** 加一筆到最前面（同一個場景＝移到最前，不重複），並截到上限。空欄位 → 原清單不動。 */
export function addRecent(list: RecentScene[], item: RecentScene): RecentScene[] {
  const one = normalizeOne(item)
  if (!one) return list
  const k = sceneKey(one)
  return [one, ...list.filter((r) => sceneKey(r) !== k)].slice(0, MAX_RECENT_SCENES)
}

/** 刪掉一筆（依正規化後的比對鍵）。 */
export function removeRecent(list: RecentScene[], item: RecentScene): RecentScene[] {
  const k = sceneKey(item)
  return list.filter((r) => sceneKey(r) !== k)
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function loadRecentScenes(): RecentScene[] {
  return parseRecent(storage()?.getItem(LS_KEY) ?? null)
}

export function saveRecentScenes(list: RecentScene[]): void {
  const st = storage()
  if (!st) return
  try {
    if (list.length) st.setItem(LS_KEY, serializeRecent(list))
    else st.removeItem(LS_KEY)
  } catch {
    // 私密模式／配額滿：記不起來就算了，不該讓對話練習中斷
  }
}

/** 用過一個自訂場景 → 記起來，回傳新清單（呼叫端直接拿去 setState）。 */
export function rememberScene(item: RecentScene): RecentScene[] {
  const next = addRecent(loadRecentScenes(), item)
  saveRecentScenes(next)
  return next
}

/** 刪掉一個記錄，回傳新清單。 */
export function forgetScene(item: RecentScene): RecentScene[] {
  const next = removeRecent(loadRecentScenes(), item)
  saveRecentScenes(next)
  return next
}
