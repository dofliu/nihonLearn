import { db } from '../db/schema'
import { newCard } from '../srs/scheduler'
import { KANA_BY_ID } from '../data/kana'

/**
 * v1 Artifact 的存檔格式（persistent storage 的 JSON）：
 * { srs: { [kanaId]: {ef, iv, reps, due} }, stamps: {date:true}, daily, rate, attempts }
 *
 * v1 用 SM-2 風格；FSRS 沒有直接對應欄位，因此採「保守播種」：
 * 依 v1 的間隔 iv 推估初始 stability，讓已學過的假名不必從零重來，
 * 但 difficulty 交給 FSRS 用預設，之後幾次複習就會自我校正。
 */
export interface V1Save {
  srs?: Record<string, { ef?: number; iv?: number; reps?: number; due?: number }>
  stamps?: Record<string, boolean>
  attempts?: number
  rate?: number
}

export interface ImportResult {
  cards: number
  stamps: number
  skipped: number
}

export async function importV1(json: V1Save): Promise<ImportResult> {
  let cards = 0
  let stamps = 0
  let skipped = 0

  // --- 假名 SRS ---
  if (json.srs) {
    for (const [kanaId, s] of Object.entries(json.srs)) {
      if (!KANA_BY_ID[kanaId]) {
        skipped++
        continue
      }
      const id = `kana:${kanaId}`
      if (await db.cards.get(id)) {
        skipped++
        continue
      }
      const card = newCard()
      // 保守播種：v1 間隔（天）→ FSRS stability 下限，reps 沿用
      const iv = Math.max(0, s.iv ?? 0)
      if (iv > 0) {
        card.stability = Math.max(card.stability, iv)
        card.scheduled_days = iv
        card.reps = s.reps ?? 1
        card.state = 2 // Review
        const due = new Date()
        due.setDate(due.getDate() + iv)
        card.due = due
        card.last_review = new Date()
      }
      await db.cards.put({ id, type: 'kana', refId: kanaId, fsrs: card })
      cards++
    }
  }

  // --- 蓋章（連續天數是習慣資產，直接沿用不歸零）---
  if (json.stamps) {
    for (const [date, ok] of Object.entries(json.stamps)) {
      if (!ok) continue
      if (await db.stamps.get(date)) continue
      await db.stamps.put({ date, complete: true })
      stamps++
    }
  }

  return { cards, stamps, skipped }
}

/** 匯出 v2 進度為 JSON（備份 / 跨裝置搬遷） */
export async function exportV2(): Promise<string> {
  const [cards, days, stampsRows, attempts, settings, userSentences] = await Promise.all([
    db.cards.toArray(),
    db.days.toArray(),
    db.stamps.toArray(),
    db.attempts.toArray(),
    db.settings.toArray(),
    db.userSentences.toArray(),
  ])
  return JSON.stringify(
    { version: 2, cards, days, stamps: stampsRows, attempts, settings, userSentences },
    null,
    2,
  )
}
