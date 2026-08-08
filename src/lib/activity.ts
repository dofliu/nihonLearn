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
/** 選配額外練習（不卡蓋章；做了會讓當日済印變金）。 */
export const EXTRA_FEATURES = [
  'write',
  'quiz',
  'pitch',
  'pattern',
  'roleplay',
  'tutor',
  'followup',
] as const
/**
 * 選配加練中「與 AI 來回互動」的那幾項（自由対話／助教考我／跟讀追問）。
 * 這些練習的 AI 產出僅供參考、不寫入學習庫，但**練習這件事本身**照樣記入学習記録。
 */
export const AI_FEATURES = ['roleplay', 'tutor', 'followup'] as const

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
  roleplay: '自由対話',
  tutor: '助教考我',
  followup: '追問',
}

export type FeatureGroup = 'core' | 'extra' | 'other'

/** 某功能屬於核心五修行、選配加練，還是未知（舊資料／未來新增）。 */
export function featureGroup(feature: string): FeatureGroup {
  if ((CORE_FEATURES as readonly string[]).includes(feature)) return 'core'
  if ((EXTRA_FEATURES as readonly string[]).includes(feature)) return 'extra'
  return 'other'
}

/** 給定的功能集合中是否有任一「選配加練」（金印判定用）。 */
export function hasExtraFeature(features: Iterable<string>): boolean {
  for (const f of features) if (featureGroup(f) === 'extra') return true
  return false
}

/**
 * 有做過任一「選配加練」的日子（day set）。
 * 金印判定：核心五修行蓋章日 ∩ 這個集合＝當天有額外加練 → 済印變金。
 */
export function extraDays(rows: ActivityLike[]): Set<string> {
  const s = new Set<string>()
  for (const r of rows) if (r.count > 0 && featureGroup(r.feature) === 'extra') s.add(r.day)
  return s
}

/** 核心／選配（含其中的 AI 互動子集）各自的累計動作數。 */
export function groupTotals(rows: ActivityLike[]): { core: number; extra: number; ai: number } {
  const ai = new Set<string>(AI_FEATURES as readonly string[])
  let core = 0
  let extra = 0
  let aiN = 0
  for (const r of rows) {
    const n = r.count || 0
    if (n <= 0) continue
    const g = featureGroup(r.feature)
    if (g === 'core') core += n
    else if (g === 'extra') {
      extra += n
      if (ai.has(r.feature)) aiN += n
    }
  }
  return { core, extra, ai: aiN }
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
