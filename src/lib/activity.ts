/**
 * 學習活動統計（純函式，無 Dexie／瀏覽器依賴，供 Node 測試）。
 * 輸入為 activityLog 的列（{day, feature, count}），輸出各種聚合。
 */

export interface ActivityLike {
  day: string
  feature: string
  count: number
}

/** 每日五修行核心項目（會計入蓋章）。 */
export const CORE_FEATURES = ['kana', 'vocab', 'listen', 'speak', 'read'] as const
/** 選配額外練習（不卡蓋章）。 */
export const EXTRA_FEATURES = ['write', 'quiz', 'pitch', 'pattern'] as const

export const FEATURE_LABEL: Record<string, string> = {
  kana: '假名',
  vocab: '詞彙',
  listen: '聴解',
  speak: '口說',
  read: '閱讀',
  write: '書寫',
  quiz: '測驗',
  pitch: '重音',
  pattern: '句型',
}

/** day → 當日總動作數。 */
export function totalsByDay(rows: ActivityLike[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) out[r.day] = (out[r.day] || 0) + (r.count || 0)
  return out
}

/** feature → 累計動作數（多到少不排序，呼叫端自理）。 */
export function totalsByFeature(rows: ActivityLike[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) out[r.feature] = (out[r.feature] || 0) + (r.count || 0)
  return out
}

/** 某日有練過的功能集合。 */
export function featuresOnDay(rows: ActivityLike[], day: string): Set<string> {
  const s = new Set<string>()
  for (const r of rows) if (r.day === day && r.count > 0) s.add(r.feature)
  return s
}

/** 某日是否做過任一「選配加練」（金印判定用）。 */
export function hasExtraOnDay(rows: ActivityLike[], day: string): boolean {
  const extras = new Set<string>(EXTRA_FEATURES)
  return rows.some((r) => r.day === day && r.count > 0 && extras.has(r.feature))
}

/** 已蓋章「且」當天有加練的日子集合＝金印。純交集，不改蓋章門檻。 */
export function goldStampDays(rows: ActivityLike[], stamped: Iterable<string>): Set<string> {
  const out = new Set<string>()
  for (const day of stamped) if (hasExtraOnDay(rows, day)) out.add(day)
  return out
}

/** 依日序輪替出「今日的加練」（每天推一項選配練習，穩定不隨機，每項都輪得到曝光）。 */
export function dailyExtraFeature(dayIndex: number): (typeof EXTRA_FEATURES)[number] {
  const n = EXTRA_FEATURES.length
  const i = ((dayIndex % n) + n) % n
  return EXTRA_FEATURES[i]
}

/** 有任何活動的不同天數（練習天數）。 */
export function activeDayCount(rows: ActivityLike[]): number {
  const s = new Set<string>()
  for (const r of rows) if (r.count > 0) s.add(r.day)
  return s.size
}

/**
 * 依給定日期序列（舊→新，如 lastNDays）產出日曆格，每格帶當日總數與強度分級 0~4。
 * 強度：0＝沒練；1~4 依當日動作數遞增（門檻寬鬆，鼓勵而非苛求）。
 */
export interface HeatCell {
  day: string
  count: number
  level: 0 | 1 | 2 | 3 | 4
}
export function heatLevel(count: number): HeatCell['level'] {
  if (count <= 0) return 0
  if (count < 5) return 1
  if (count < 12) return 2
  if (count < 24) return 3
  return 4
}
export function calendarCells(rows: ActivityLike[], days: string[]): HeatCell[] {
  const byDay = totalsByDay(rows)
  return days.map((day) => {
    const count = byDay[day] || 0
    return { day, count, level: heatLevel(count) }
  })
}
