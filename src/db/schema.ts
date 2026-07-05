import Dexie, { type Table } from 'dexie'
import type { Card as FSRSCard } from 'ts-fsrs'

export type CardType = 'kana' | 'vocab'

/** SRS 卡片：ts-fsrs 的 Card 狀態 + 我們的關聯資訊 */
export interface Card {
  id: string // 'kana:h0' | 'vocab:これ'
  type: CardType
  refId: string // kana.id 或 vocab.jp
  fsrs: FSRSCard // due/stability/difficulty/reps/lapses/state/last_review...
}

/** 每日修行計數（驅動蓋章） */
export interface DaySession {
  date: string // YYYY-MM-DD（本地時區）
  counts: Record<string, number> // taskId -> 完成數
  newIntro: number // 今日已引入新假名卡數
  newVocab: number // 今日已引入新詞彙卡數
  durationSec: number
}

/** 蓋章：某日五項全完成 */
export interface Stamp {
  date: string // YYYY-MM-DD
  complete: true
}

/** 發音嘗試紀錄 —— 用來畫「發音成長曲線」 */
export interface Attempt {
  ts: number
  sentenceId: string
  score: number // 0-100
  transcript: string
  source: 'asr' | 'self' // 語音辨識 or 自評
}

export interface Setting {
  key: string
  value: unknown
}

/** VOICEVOX TTS 音檔快取（取代 service worker CacheFirst；原生 App 也可用） */
export interface TTSCacheEntry {
  key: string // ttsCacheKey(text, speaker, rate)，見 lib/sidecar.ts
  blob: Blob // wav
  lastUsed: number // LRU 淘汰依據
}

/** 審核通過、採用入庫的 AI 生成句 */
export interface UserSentence {
  id?: number
  lv: 1 | 2 | 3
  jp: string
  zh: string
  read: string
  theme: string
  source: 'ai'
  createdAt: number
}

export class MichiDB extends Dexie {
  cards!: Table<Card, string>
  days!: Table<DaySession, string>
  stamps!: Table<Stamp, string>
  attempts!: Table<Attempt, number>
  settings!: Table<Setting, string>
  userSentences!: Table<UserSentence, number>
  ttsCache!: Table<TTSCacheEntry, string>

  constructor() {
    super('nihongo-michi')
    this.version(1).stores({
      cards: 'id, type, refId',
      days: 'date',
      stamps: 'date',
      attempts: '++id, sentenceId, ts',
      settings: 'key',
    })
    this.version(2).stores({
      userSentences: '++id, lv',
    })
    this.version(3).stores({
      ttsCache: 'key, lastUsed',
    })
  }
}

export const db = new MichiDB()
