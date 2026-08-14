/**
 * 分數揭曉的呈現層純函式（0-100 分數的數字滾動、環形進度、等第徽章）。
 *
 * 純呈現：**不改動任何評分演算法**——字形相似度仍由 `lib/handwriting.ts` 算，
 * 跟讀分數仍由 `audio/scorer.ts` 算，這裡只決定「同一個分數要用什麼顏色／記號／
 * 一句話講評來呈現」，以及動畫每一格該顯示的數字。無瀏覽器依賴，供 Node 測試。
 *
 * 等第門檻沿用兩處原本各自寫死的判斷（書寫 80/60、跟讀 80/55），只是集中起來，
 * 讓兩處共用同一個 `ScoreReveal` 元件時行為不變（有測試釘住邊界值）。
 */

export type ScoreBandKey = 'great' | 'good' | 'work' | 'none'

export interface ScoreBand {
  key: ScoreBandKey
  mark: '◎' | '○' | '△' | '—'
  /** CSS 色票變數（沿用既有 --take／--yama／--shu／--nezu） */
  color: string
  /** 等第徽章上的中文標籤 */
  label: string
  /** 一句話講評（可為空字串＝該情境不顯示） */
  hint: string
}

export interface ScoreBandPreset {
  /** ≥ great → ◎ */
  great: number
  /** ≥ good → ○（低於則 △） */
  good: number
  /** [◎, ○, △] 三段的一句話講評 */
  hints: [string, string, string]
}

/** 書寫（字形相似度）：門檻沿用 `handwriting.ts gradeOf`（80/60）。 */
export const WRITE_BANDS: ScoreBandPreset = {
  great: 80,
  good: 60,
  hints: ['漂亮！', '不錯，再工整一點', '再多描幾次'],
}

/** 跟讀（發音相似度）：門檻沿用 `SpeakView` 原本的 80/55。 */
export const SPEAK_BANDS: ScoreBandPreset = {
  great: 80,
  good: 55,
  hints: ['很穩！', '抓到了，再唸幾次更順', '跟著慢速再唸一次'],
}

const BAND_LABEL: Record<Exclude<ScoreBandKey, 'none'>, string> = {
  great: '優秀',
  good: '良好',
  work: '再加油',
}

/** 沒有分數可呈現（未評分／分數不合法）時的等第。 */
export const NO_SCORE_BAND: ScoreBand = {
  key: 'none',
  mark: '—',
  color: 'var(--nezu)',
  label: '未評分',
  hint: '',
}

/** 依分數與門檻取等第（記號／顏色／標籤／一句話講評）。 */
export function scoreBand(score: number, preset: ScoreBandPreset): ScoreBand {
  if (!Number.isFinite(score) || score < 0) return NO_SCORE_BAND
  if (score >= preset.great) {
    return { key: 'great', mark: '◎', color: 'var(--take)', label: BAND_LABEL.great, hint: preset.hints[0] }
  }
  if (score >= preset.good) {
    return { key: 'good', mark: '○', color: 'var(--yama)', label: BAND_LABEL.good, hint: preset.hints[1] }
  }
  return { key: 'work', mark: '△', color: 'var(--shu)', label: BAND_LABEL.work, hint: preset.hints[2] }
}

/** 分數夾在 0..100（動畫與環形進度用）。非數字視為 0。 */
export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0
  return Math.min(100, Math.max(0, Math.round(score)))
}

/** 緩出三次方（動畫收尾放慢，最後一格剛好落在目標值）。 */
export function easeOutCubic(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const u = 1 - t
  return 1 - u * u * u
}

/**
 * 數字滾動：給目標分數與「已經過幾毫秒 / 總長幾毫秒」，回傳當下該顯示的整數。
 * 保證：t≤0 → 0、t≥duration → 目標值、過程單調不減、永不超過目標值。
 */
export function countUpValue(target: number, elapsed: number, duration: number): number {
  const goal = clampScore(target)
  if (!Number.isFinite(duration) || duration <= 0) return goal
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0
  if (elapsed >= duration) return goal
  return Math.round(goal * easeOutCubic(elapsed / duration))
}

/** 環形進度的半徑與周長（SVG viewBox 0 0 120 120，線寬 9）。 */
export const RING_RADIUS = 52
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/** 環形進度：分數對應的 stroke-dashoffset（0 分＝整圈空、100 分＝整圈滿）。 */
export function ringDashOffset(score: number, circumference: number = RING_CIRCUMFERENCE): number {
  const c = Number.isFinite(circumference) && circumference > 0 ? circumference : 0
  return c * (1 - clampScore(score) / 100)
}
