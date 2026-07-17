import { test, expect } from '@playwright/test'
import { gotoApp, statChip, localDateStr } from './helpers'

/**
 * IndexedDB 深度驗證（CLAUDE.md A-1）：
 * 1. Dexie v1 → 現行 schema 升級：先以 Dexie version(1) 的原生 IDB 佈局（版本 10）
 *    塞入既有資料，再載入 app 觸發升級到現行 version(8)（版本 80），驗證資料不遺失、
 *    新表 userSentences / ttsCache / userPassages / genQueue / quizResults / userListenQ / writeScores / activityLog 建立。
 * 2. v1 Artifact 存檔 JSON 匯入：假名 SRS 播種 + 蓋章沿用（streak 不歸零）。
 */

test.describe('Dexie 升級與 v1 匯入', () => {
  test('v1 → 現行 schema 升級不遺失既有資料', async ({ page }) => {
    // 先開同源的靜態頁（不載入 app JS），以 Dexie v1 佈局建 DB 並塞資料
    await page.goto('/favicon.svg')
    const yesterday = localDateStr(-1)
    await page.evaluate(async (yday) => {
      await new Promise<void>((resolve, reject) => {
        // Dexie 的 IDB 版本 = version(n) * 10
        const req = indexedDB.open('nihongo-michi', 10)
        req.onupgradeneeded = () => {
          const db = req.result
          const cards = db.createObjectStore('cards', { keyPath: 'id' })
          cards.createIndex('type', 'type')
          cards.createIndex('refId', 'refId')
          db.createObjectStore('days', { keyPath: 'date' })
          db.createObjectStore('stamps', { keyPath: 'date' })
          const attempts = db.createObjectStore('attempts', {
            keyPath: 'id',
            autoIncrement: true,
          })
          attempts.createIndex('sentenceId', 'sentenceId')
          attempts.createIndex('ts', 'ts')
          db.createObjectStore('settings', { keyPath: 'key' })
        }
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(['cards', 'stamps'], 'readwrite')
          // 一張已定著的假名卡（あ）：Review 狀態、間隔 10 天
          tx.objectStore('cards').put({
            id: 'kana:h0',
            type: 'kana',
            refId: 'h0',
            fsrs: {
              due: new Date(Date.now() + 10 * 86400000),
              stability: 10,
              difficulty: 5,
              elapsed_days: 0,
              scheduled_days: 10,
              reps: 4,
              lapses: 0,
              state: 2,
              last_review: new Date(),
            },
          })
          tx.objectStore('stamps').put({ date: yday, complete: true })
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      })
    }, yesterday)

    // 載入 app → Dexie 開啟時執行 v2 升級
    await gotoApp(page)

    // 舊資料完好：已學假名 1、昨日蓋章仍在
    await expect(statChip(page, '已學假名')).toContainText('1 / 142')
    await expect(page.locator('.stampCell.hit')).toHaveCount(1)
    // 昨日有章、今日沒有 → streak 從昨天起算 1
    await expect(page.locator('.streakBadge')).toContainText('連続 1 日')

    // schema 已升級：IDB 版本 80（Dexie version(8)×10）、新表建立
    const info = await page.evaluate(async () => {
      const metas = await indexedDB.databases()
      const meta = metas.find((d) => d.name === 'nihongo-michi')
      const names = await new Promise<string[]>((resolve, reject) => {
        const req = indexedDB.open('nihongo-michi')
        req.onsuccess = () => {
          const list = Array.from(req.result.objectStoreNames)
          req.result.close()
          resolve(list)
        }
        req.onerror = () => reject(req.error)
      })
      return { version: meta?.version, names }
    })
    expect(info.version).toBe(80)
    expect(info.names).toContain('userSentences')
    expect(info.names).toContain('ttsCache')
    expect(info.names).toContain('userPassages')
    expect(info.names).toContain('genQueue')
    expect(info.names).toContain('quizResults')
    expect(info.names).toContain('userListenQ')
    expect(info.names).toContain('writeScores')
    expect(info.names).toContain('activityLog')
    expect(info.names).toContain('cards')

    // 卡片狀態語義保留：あ 顯示為已定著（master）
    await page.locator('nav.nav button', { hasText: 'かな' }).click()
    await expect(page.locator('.kanaGrid span.master').first()).toHaveText('あ')
  })

  test('v1 存檔 JSON 匯入：假名播種 + 蓋章沿用、streak 不歸零', async ({ page }) => {
    await gotoApp(page)
    const today = localDateStr(0)
    const yesterday = localDateStr(-1)

    await page.locator('.appHeader h1').click()
    await page
      .locator('textarea')
      .fill(
        JSON.stringify({
          srs: {
            h0: { ef: 2.5, iv: 3, reps: 4 }, // 已學 3 天間隔 → 播種為 Review 卡
            h1: { iv: 0 }, // 學過但無間隔 → 新卡
            zzz: { iv: 5 }, // 不存在的 kana id → 應跳過
          },
          stamps: { [yesterday]: true, [today]: true },
        }),
      )
    await page.getByRole('button', { name: '匯入', exact: true }).click()
    await expect(page.locator('.toast')).toContainText('匯入完成：假名 2、蓋章 2')

    await page.getByRole('button', { name: '返回' }).click()
    await expect(statChip(page, '已學假名')).toContainText('2 / 142')
    await expect(page.locator('.stampCell.hit')).toHaveCount(2)
    await expect(page.locator('.streakBadge')).toContainText('連続 2 日')

    // 重整後仍在（真正寫入 IndexedDB）
    await page.reload()
    await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })
    await expect(statChip(page, '已學假名')).toContainText('2 / 142')
    await expect(page.locator('.streakBadge')).toContainText('連続 2 日')
  })

  test('格式錯誤的 v1 JSON 顯示錯誤提示、不寫入', async ({ page }) => {
    await gotoApp(page)
    await page.locator('.appHeader h1').click()
    await page.locator('textarea').fill('not json at all')
    await page.getByRole('button', { name: '匯入', exact: true }).click()
    await expect(page.locator('.toast')).toContainText('JSON 格式錯誤')
    await page.getByRole('button', { name: '返回' }).click()
    await expect(statChip(page, '已學假名')).toContainText('0 / 142')
  })
})
