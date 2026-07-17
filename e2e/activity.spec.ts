import { test, expect } from '@playwright/test'
import { gotoApp, navTo } from './helpers'

test.describe('學習活動記錄與統計', () => {
  test('書寫後：activityLog 記錄、今日+α 打勾、統計頁顯示練習日曆', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, 'かな')
    await page.getByRole('button', { name: /書寫練習/ }).click()

    // 畫一筆並評分 → 記一次 write 活動
    const canvas = page.locator('canvas.writeCanvas')
    const box = (await canvas.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8, { steps: 8 })
    await page.mouse.up()
    await page.getByRole('button', { name: '評分', exact: true }).click()
    await expect(page.locator('.scoreBig')).toBeVisible()

    // activityLog 有 write 列
    const writeCount = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const req = indexedDB.open('nihongo-michi')
          req.onsuccess = () => {
            const db = req.result
            const tx = db.transaction('activityLog', 'readonly')
            let n = 0
            tx.objectStore('activityLog').openCursor().onsuccess = (e: Event) => {
              const cur = (e.target as IDBRequest).result as IDBCursorWithValue | null
              if (cur) {
                if (cur.value.feature === 'write') n += cur.value.count
                cur.continue()
              } else {
                db.close()
                resolve(n)
              }
            }
            tx.onerror = () => reject(tx.error)
          }
          req.onerror = () => reject(req.error)
        }),
    )
    expect(writeCount).toBeGreaterThanOrEqual(1)

    // 今日頁 +α 卡：書寫已打勾
    await navTo(page, '今日')
    await expect(page.locator('main')).toContainText('今日の +α')
    await expect(page.getByRole('button', { name: /✓.*書寫練習/ })).toBeVisible()

    // 統計頁：學習記録 / 練習日曆 / 各項目累計
    await page.getByRole('button', { name: /發音の成長曲線/ }).click()
    await expect(page.locator('main')).toContainText('学習記録')
    await expect(page.locator('main')).toContainText('練習日曆')
    await expect(page.locator('main')).toContainText('各項目累計次數')
    // 書寫項目出現在累計條
    await expect(page.locator('.featRow', { hasText: '書寫' })).toBeVisible()
    // 日曆格數 = 70
    await expect(page.locator('.heatGrid .heatCell')).toHaveCount(70)
  })
})
