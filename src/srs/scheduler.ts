import {
  fsrs,
  createEmptyCard,
  generatorParameters,
  Rating,
  State,
  type Card as FSRSCard,
  type Grade,
} from 'ts-fsrs'

// FSRS-4.5：request_retention 0.9 = 目標九成留存率。
// 這是 v2 相對 v1 的主要升級：排程由實證演算法決定，而非固定倍率。
const params = generatorParameters({
  request_retention: 0.9,
  enable_fuzz: true, // 加入抖動，避免大量卡片同日到期塞車
  maximum_interval: 365,
})

const scheduler = fsrs(params)

/** UI 的四個評級鈕 → FSRS Rating */
export const GRADE = {
  forgot: Rating.Again, // 忘了
  hard: Rating.Hard, // 很難
  good: Rating.Good, // 記得
  easy: Rating.Easy, // 秒答
} as const
export type GradeKey = keyof typeof GRADE

export function newCard(now = new Date()): FSRSCard {
  return createEmptyCard(now)
}

/** 對一張卡評級，回傳更新後的卡片狀態 */
export function review(card: FSRSCard, key: GradeKey, now = new Date()): FSRSCard {
  const rating = GRADE[key] as Grade
  const scheduling = scheduler.repeat(card, now)
  return scheduling[rating].card
}

/** 是否到期（含今天） */
export function isDue(card: FSRSCard, now = new Date()): boolean {
  return new Date(card.due).getTime() <= now.getTime()
}

/** 是否已「定著」——進入 Review 狀態且間隔 ≥ 7 天 */
export function isMastered(card: FSRSCard): boolean {
  return card.state === State.Review && card.scheduled_days >= 7
}

export function retrievability(card: FSRSCard, now = new Date()): number {
  return scheduler.get_retrievability(card, now, false) as number
}
