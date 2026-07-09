import { test, expect } from '@playwright/test'
import { gotoApp, seedVocabLearned } from './helpers'
import { VOCAB } from '../src/data/vocab'

// 取前 14 個詞當已學詞庫（足夠誘答與四種題型）
const LEARNED = VOCAB.slice(0, 14).map((v) => v.jp)

test.describe('N5 模擬測驗', () => {
  test('從已學詞出題 → 作答 10 題 → 計分、結果持久化', async ({ page }) => {
    await gotoApp(page)
    await seedVocabLearned(page, LEARNED)
    await page.reload()
    await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })

    // 今日頁 → 開啟測驗
    await page.getByRole('button', { name: /N5 模擬測驗/ }).click()
    const home = page.locator('.card', { hasText: '腕試し' })
    await expect(home).toContainText('可出題詞庫')
    await home.getByRole('button', { name: '開始測驗' }).click()

    // 作答 10 題：選擇題點第一個選項；並べ替え點完所有字塊
    for (let i = 1; i <= 10; i++) {
      await expect(page.locator('.card .eyebrow')).toContainText(`${i} / 10`)
      const opts = page.locator('button.qopt')
      const tiles = page.locator('button.qtile')
      if (await opts.count()) {
        await opts.first().click()
      } else {
        const n = await tiles.count()
        for (let t = 0; t < n; t++) await tiles.nth(t).click()
      }
    }

    // 結果頁：分數與正答率
    const result = page.locator('.card', { hasText: '測驗結果' })
    await expect(result).toBeVisible({ timeout: 10_000 })
    await expect(result).toContainText('/ 10')
    await expect(result).toContainText('正答率')

    // 持久化：quizResults 至少一筆
    const count = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const req = indexedDB.open('nihongo-michi')
          req.onsuccess = () => {
            const db = req.result
            const tx = db.transaction('quizResults', 'readonly')
            const c = tx.objectStore('quizResults').count()
            c.onsuccess = () => {
              db.close()
              resolve(c.result)
            }
            c.onerror = () => reject(c.error)
          }
          req.onerror = () => reject(req.error)
        }),
    )
    expect(count).toBeGreaterThanOrEqual(1)

    // 再測一次可重新開始
    await page.getByRole('button', { name: '再測一次' }).click()
    await expect(page.locator('.card .eyebrow').first()).toContainText('1 / 10')
  })

  test('已學詞不足 4 個：提示先學詞、無法開始', async ({ page }) => {
    await gotoApp(page)
    await seedVocabLearned(page, VOCAB.slice(0, 2).map((v) => v.jp))
    await page.reload()
    await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })

    await page.getByRole('button', { name: /N5 模擬測驗/ }).click()
    await expect(page.getByRole('button', { name: /先學會 4 個詞/ })).toBeDisabled()
  })
})
