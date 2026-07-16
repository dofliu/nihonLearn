import { test, expect } from '@playwright/test'
import { gotoApp, navTo } from './helpers'

test.describe('假名書寫練習', () => {
  test('描紅 → 畫 → 評分顯示分數並持久化', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, 'かな')
    await page.getByRole('button', { name: /書寫練習/ }).click()

    // 兩種模式與兩種字集的分頁都在
    await expect(page.getByRole('button', { name: 'ひらがな' })).toBeVisible()
    await expect(page.getByRole('button', { name: /描紅/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /空白默寫/ })).toBeVisible()

    const canvas = page.locator('canvas.writeCanvas')
    await expect(canvas).toBeVisible()
    const box = (await canvas.boundingBox())!

    // 在畫布中央畫幾筆（滑鼠→pointer 事件）
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, box.y + box.height * 0.2)
    await page.mouse.down()
    await page.mouse.move(cx, box.y + box.height * 0.8, { steps: 8 })
    await page.mouse.up()
    await page.mouse.move(box.x + box.width * 0.25, cy)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.75, cy, { steps: 8 })
    await page.mouse.up()

    // 評分 → 顯示分數（/ 100）與等級
    await page.getByRole('button', { name: '評分', exact: true }).click()
    await expect(page.locator('.scoreBig')).toBeVisible()
    await expect(page.locator('main')).toContainText('/ 100')
    await expect(page.locator('main')).toContainText('字形相似度')

    // 持久化到 writeScores（至少一筆）
    const count = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const req = indexedDB.open('nihongo-michi')
          req.onsuccess = () => {
            const db = req.result
            const tx = db.transaction('writeScores', 'readonly')
            const c = tx.objectStore('writeScores').count()
            c.onsuccess = () => {
              resolve(c.result)
              db.close()
            }
            c.onerror = () => reject(c.error)
          }
          req.onerror = () => reject(req.error)
        }),
    )
    expect(count).toBeGreaterThanOrEqual(1)

    // 可繼續下一個
    await page.getByRole('button', { name: /下一個/ }).click()
    await expect(page.locator('.scoreBig')).toHaveCount(0)
  })

  test('沒寫就評分 → 提示先寫', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, 'かな')
    await page.getByRole('button', { name: /書寫練習/ }).click()
    await page.getByRole('button', { name: '評分', exact: true }).click()
    await expect(page.locator('.toast')).toContainText('先寫寫看')
  })
})
