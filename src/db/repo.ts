import { db, type Card, type CardType } from './schema'
import { newCard, review, type GradeKey } from '../srs/scheduler'
import { todayStr } from '../lib/date'
import type { Card as FSRSCard } from 'ts-fsrs'

/** 每日五項修行的定義（驅動今日頁與蓋章） */
export const TASKS = [
  { id: 'kana', name: '字の修行（五十音 SRS）', target: 10, tab: 'kana' },
  { id: 'vocab', name: 'ことば（今日的 5 語）', target: 5, tab: 'read' },
  { id: 'listen', name: '耳の修行（辨音 5 題）', target: 5, tab: 'listen' },
  { id: 'speak', name: '口の修行（跟讀 3 句）', target: 3, tab: 'speak' },
  { id: 'read', name: '読む修行（短文 1 篇）', target: 1, tab: 'read' },
] as const

export const DAILY_NEW_LIMIT = 10
export const DAILY_VOCAB_NEW_LIMIT = 6

// ---------- 卡片 ----------
export async function getCard(id: string): Promise<Card | undefined> {
  return db.cards.get(id)
}

export async function allCards(type?: CardType): Promise<Card[]> {
  return type ? db.cards.where('type').equals(type).toArray() : db.cards.toArray()
}

export async function ensureCard(
  type: CardType,
  refId: string,
): Promise<Card> {
  const id = `${type}:${refId}`
  let c = await db.cards.get(id)
  if (!c) {
    c = { id, type, refId, fsrs: newCard() }
    await db.cards.put(c)
  }
  return c
}

export async function gradeCard(
  id: string,
  grade: GradeKey,
): Promise<FSRSCard> {
  const c = await db.cards.get(id)
  if (!c) throw new Error('card not found: ' + id)
  c.fsrs = review(c.fsrs, grade)
  await db.cards.put(c)
  return c.fsrs
}

// ---------- 每日計數 / 蓋章 ----------
export async function getToday() {
  const date = todayStr()
  let d = await db.days.get(date)
  if (!d) {
    d = { date, counts: {}, newIntro: 0, newVocab: 0, durationSec: 0 }
    for (const t of TASKS) d.counts[t.id] = 0
    await db.days.put(d)
  }
  if (d.newVocab == null) d.newVocab = 0 // v2.0 舊資料相容
  return d
}

/** 完成某任務 n 次；若五項全達標則自動蓋章。回傳 { day, stamped } */
export async function bumpTask(taskId: string, n = 1) {
  const day = await getToday()
  const t = TASKS.find((x) => x.id === taskId)
  if (!t) throw new Error('unknown task ' + taskId)
  day.counts[taskId] = Math.min(t.target, (day.counts[taskId] || 0) + n)

  const allDone = TASKS.every((x) => (day.counts[x.id] || 0) >= x.target)
  let stamped = false
  if (allDone) {
    const existing = await db.stamps.get(day.date)
    if (!existing) {
      await db.stamps.put({ date: day.date, complete: true })
      stamped = true
    }
  }
  await db.days.put(day)
  return { day, stamped }
}

export async function incNewIntro(n = 1) {
  const day = await getToday()
  day.newIntro += n
  await db.days.put(day)
  return day.newIntro
}

export async function incNewVocab(n = 1) {
  const day = await getToday()
  day.newVocab = (day.newVocab || 0) + n
  await db.days.put(day)
  return day.newVocab
}

export async function addDuration(sec: number) {
  const day = await getToday()
  day.durationSec += sec
  await db.days.put(day)
}

// ---------- 蓋章 / streak ----------
export async function allStampDates(): Promise<Set<string>> {
  const rows = await db.stamps.toArray()
  return new Set(rows.map((r) => r.date))
}

// ---------- 發音紀錄 ----------
export async function logAttempt(a: {
  sentenceId: string
  score: number
  transcript: string
  source: 'asr' | 'self'
}) {
  await db.attempts.add({ ...a, ts: Date.now() })
}

export async function attemptStats() {
  const rows = await db.attempts.toArray()
  const asr = rows.filter((r) => r.source === 'asr')
  const avg =
    asr.length > 0
      ? Math.round(asr.reduce((s, r) => s + r.score, 0) / asr.length)
      : null
  return { total: rows.length, asrAvg: avg }
}

/** 依時間排序的全部嘗試（畫成長曲線用） */
export async function allAttempts() {
  const rows = await db.attempts.toArray()
  return rows.sort((a, b) => a.ts - b.ts)
}

/** 每句最佳分與練習次數 */
export async function perSentenceBest() {
  const rows = await db.attempts.toArray()
  const map = new Map<string, { best: number; count: number; last: number }>()
  for (const r of rows) {
    const cur = map.get(r.sentenceId)
    if (!cur) map.set(r.sentenceId, { best: r.score, count: 1, last: r.ts })
    else {
      cur.best = Math.max(cur.best, r.score)
      cur.count++
      cur.last = Math.max(cur.last, r.ts)
    }
  }
  return map
}

// ---------- N5 模擬測驗 ----------
export async function saveQuizResult(total: number, correct: number, weakRefs: string[]) {
  await db.quizResults.add({ ts: Date.now(), total, correct, weakRefs })
}

/** 依時間新到舊的測驗紀錄。 */
export async function listQuizResults() {
  const rows = await db.quizResults.toArray()
  return rows.sort((a, b) => b.ts - a.ts)
}

/** 跨紀錄聚合最常答錯的詞（refId → 次數），多到少。 */
export async function weakWordCounts(): Promise<{ refId: string; count: number }[]> {
  const rows = await db.quizResults.toArray()
  const map = new Map<string, number>()
  for (const r of rows) for (const ref of r.weakRefs) map.set(ref, (map.get(ref) || 0) + 1)
  return [...map.entries()]
    .map(([refId, count]) => ({ refId, count }))
    .sort((a, b) => b.count - a.count)
}

// ---------- 設定 ----------
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}
export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value })
}
