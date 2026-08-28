import { db, type Card, type CardType } from './schema'
import { newCard, review, type GradeKey } from '../srs/scheduler'
import { todayStr } from '../lib/date'
import { extraDays } from '../lib/activity'
import { KANA_BY_ID } from '../data/kana'
import type { Card as FSRSCard } from 'ts-fsrs'
import { TASKS } from '../data/tasks'
import { weakStats, type WeakEntry } from '../lib/quizWeak'

/** 每日五項修行的定義（純資料檔 `data/tasks.ts`，供 Node 測試直接 import） */
export { TASKS }

export const DAILY_NEW_LIMIT = 10
export const DAILY_VOCAB_NEW_LIMIT = 6

// ---------- 卡片 ----------
export async function getCard(id: string): Promise<Card | undefined> {
  return db.cards.get(id)
}

export async function allCards(type?: CardType): Promise<Card[]> {
  return type ? db.cards.where('type').equals(type).toArray() : db.cards.toArray()
}

/**
 * 已學假名的字元集合（詞彙解鎖判定用，餵給 `lib/vocabGate.ts` 的 `isVocabUnlocked`）。
 * 詞彙修行（VocabCard）與單字帳（VocabBook）共用同一份判定，避免兩處各寫一次。
 */
export async function learnedKanaChars(): Promise<Set<string>> {
  const kanaCards = await db.cards.where('type').equals('kana').toArray()
  const chars = new Set<string>()
  for (const c of kanaCards) {
    const ch = KANA_BY_ID[c.refId]?.ch
    if (ch) chars.add(ch)
  }
  return chars
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
  await logActivity(taskId, n) // 五核心的練習也記進活動記錄
  return { day, stamped }
}

// ---------- 學習活動記錄（每日 × 每功能累計）----------
/** 記一次某功能的練習（今日 day+feature 累加 n）。額外練習（write/quiz/pitch）直接呼叫。 */
export async function logActivity(feature: string, n = 1) {
  if (n <= 0) return
  const day = todayStr()
  const now = Date.now()
  const row = await db.activityLog.where('[day+feature]').equals([day, feature]).first()
  if (row) {
    row.count += n
    row.ts = now
    await db.activityLog.put(row)
  } else {
    await db.activityLog.add({ day, feature, count: n, ts: now })
  }
}

export async function listActivity() {
  return db.activityLog.toArray()
}

/** 今日有練過的功能集合（今日頁 +α 顯示用）。 */
export async function todayActivityFeatures(): Promise<Set<string>> {
  const day = todayStr()
  const rows = await db.activityLog.where('day').equals(day).toArray()
  return new Set(rows.filter((r) => r.count > 0).map((r) => r.feature))
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

/**
 * 有做過任一「選配加練」的日子（day set）。
 * 用於「金印」：核心五修行蓋章日 ∩ 這個集合＝當天有額外加練→金印。
 */
export async function extraActiveDays(): Promise<Set<string>> {
  return extraDays(await db.activityLog.toArray())
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
export async function saveQuizResult(
  total: number,
  correct: number,
  weakRefs: string[],
  askedRefs: string[] = [],
) {
  await db.quizResults.add({ ts: Date.now(), total, correct, weakRefs, askedRefs })
}

/**
 * 跨紀錄聚合弱點（答錯次數、最後一次答錯之後的連對次數、是否已克服）。
 * 判定邏輯在純函式 `lib/quizWeak.ts weakStats`（可被 Node 測試）。
 */
export async function quizWeakness(): Promise<WeakEntry[]> {
  const rows = await db.quizResults.toArray()
  return weakStats(rows)
}

// ---------- 假名書寫練習成績 ----------
/** 記錄一次書寫評分：保留該字元的最佳分數、累計次數。回傳更新後的最佳分。 */
export async function saveWriteScore(ch: string, score: number): Promise<number> {
  const prev = await db.writeScores.get(ch)
  const best = Math.max(score, prev?.best ?? 0)
  await db.writeScores.put({
    ch,
    best,
    attempts: (prev?.attempts ?? 0) + 1,
    ts: Date.now(),
  })
  return best
}

/** 字元 → 最佳分數的對照表（進度顯示用）。 */
export async function writeBestMap(): Promise<Record<string, number>> {
  const rows = await db.writeScores.toArray()
  const map: Record<string, number> = {}
  for (const r of rows) map[r.ch] = r.best
  return map
}

// ---------- 設定 ----------
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}
export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value })
}
