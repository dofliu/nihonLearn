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

/** 採用入庫的閱讀文章（NHK Easy 導入等）。lines 形狀與 data/passages 相容 */
export interface UserPassage {
  id?: number
  title: string // 含 ruby 的安全 HTML（sidecar token 重建）
  titleZh: string
  lines: { jp: string; zh: string; read?: string }[]
  source: 'nhk' // 來源標記（未來可擴充 'ai' 等層級）
  origId: string // NHK news_id（去重用）
  newWords: { jp: string; read?: string; zh: string }[]
  createdAt: number
}

/** 待審核的生成候選（持久化審核佇列：退回前不消失、可稍後再審） */
export interface GenCandidate {
  id?: number
  theme: string
  jp: string
  zh: string
  read: string
  newWords: { jp: string; zh: string }[]
  createdAt: number
}

/**
 * 採用入庫的「段落理解題」（LLM 只生中文問題/選項，疊在已驗證短文上）。
 * 日文題材＝data/passages 的短文（不由 LLM 生）；此表只存中文 Q/選項與所屬短文 id。
 */
export interface UserListenQ {
  id?: number
  passageId: string // data/passages 的 Passage.id
  q: string // 中文問題
  options: string[] // 中文選項（含正解）
  answer: string // 正解（options 之一）
  createdAt: number
}

/** N5 模擬測驗一次作答的結果（計分與弱項分析） */
export interface QuizResult {
  id?: number
  ts: number
  total: number
  correct: number
  weakRefs: string[] // 答錯的 vocab.jp（弱項聚合用）
}

/** 假名書寫練習的成績（每個假名字元存最佳分數與練習次數）。 */
export interface WriteScore {
  ch: string // 假名字元（主鍵）
  best: number // 最佳字形相似度分數 0-100
  attempts: number // 累計練習次數
  ts: number // 最後練習時間
}

export class MichiDB extends Dexie {
  cards!: Table<Card, string>
  days!: Table<DaySession, string>
  stamps!: Table<Stamp, string>
  attempts!: Table<Attempt, number>
  settings!: Table<Setting, string>
  userSentences!: Table<UserSentence, number>
  ttsCache!: Table<TTSCacheEntry, string>
  userPassages!: Table<UserPassage, number>
  genQueue!: Table<GenCandidate, number>
  quizResults!: Table<QuizResult, number>
  userListenQ!: Table<UserListenQ, number>
  writeScores!: Table<WriteScore, string>

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
    this.version(4).stores({
      userPassages: '++id, origId, createdAt',
      genQueue: '++id, createdAt',
    })
    this.version(5).stores({
      quizResults: '++id, ts',
    })
    this.version(6).stores({
      userListenQ: '++id, passageId, createdAt',
    })
    this.version(7).stores({
      writeScores: 'ch, ts',
    })
  }
}

export const db = new MichiDB()
