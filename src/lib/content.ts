import { db, type UserSentence } from '../db/schema'
import { VOCAB } from '../data/vocab'
import { apiUrl } from './sidecar'
export { analyzeCoverage, type Coverage } from './coverage'

export interface Candidate {
  jp: string
  zh: string
  read: string
  new_words: { jp: string; zh: string }[]
}
export interface ContentResult {
  candidates: Candidate[]
  demo: boolean
  needsReview: boolean
}

export type Theme = 'daily' | 'ninja' | 'quest'

/** 主題 → 採用後歸入的跟讀層級 */
export const THEME_LV: Record<Theme, 1 | 2 | 3> = {
  daily: 2,
  ninja: 3,
  quest: 3,
}

/** 呼叫 sidecar 生成候選句。sidecar 不在線 → 拋錯，UI 提示。 */
export async function generate(theme: Theme, n = 5): Promise<ContentResult> {
  const knownWords = VOCAB.map((v) => v.jp)
  const r = await fetch(apiUrl('/api/content'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme, known_words: knownWords, n }),
  })
  if (!r.ok) throw new Error('content-http-' + r.status)
  const j = await r.json()
  return {
    candidates: (j.candidates ?? []) as Candidate[],
    demo: Boolean(j.demo),
    needsReview: Boolean(j.needs_review),
  }
}

/** 採用一個候選 → 寫入學習庫 */
export async function adoptSentence(c: Candidate, theme: Theme): Promise<void> {
  const s: UserSentence = {
    lv: THEME_LV[theme],
    jp: c.jp,
    zh: c.zh,
    read: c.read || c.jp,
    theme,
    source: 'ai',
    createdAt: Date.now(),
  }
  await db.userSentences.add(s)
}

export async function getUserSentences(lv?: 1 | 2 | 3): Promise<UserSentence[]> {
  if (lv) return db.userSentences.where('lv').equals(lv).toArray()
  return db.userSentences.toArray()
}

export async function deleteUserSentence(id: number): Promise<void> {
  await db.userSentences.delete(id)
}
