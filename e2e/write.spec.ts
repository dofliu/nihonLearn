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

  test('描紅範本可見；切空白默寫時隱藏（層級不被蓋住）', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, 'かな')
    await page.getByRole('button', { name: /書寫練習/ }).click()

    // 描紅模式：範本字可見（在格線層之上、畫布之下）
    const ghost = page.locator('.writeGhost')
    await expect(ghost).toBeVisible()
    // 範本在 DOM 中須排在格線層 .writeGuide 之後（否則會被不透明底蓋住）
    const guideThenGhost = await page.evaluate(() => {
      const wrap = document.querySelector('.writeWrap')!
      const kids = Array.from(wrap.children)
      return kids.findIndex((e) => e.classList.contains('writeGuide')) <
        kids.findIndex((e) => e.classList.contains('writeGhost'))
    })
    expect(guideThenGhost).toBe(true)

    // 切到空白默寫 → 範本隱藏
    await page.getByRole('button', { name: /空白默寫/ }).click()
    await expect(page.locator('.writeGhost')).toHaveCount(0)
  })

  test('漢字書寫模式：切漢字字集、顯示讀音＋釋義、可評分', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, 'かな')
    await page.getByRole('button', { name: /書寫練習/ }).click()

    await page.getByRole('button', { name: '漢字', exact: true }).click()
    // eyebrow 顯示「讀音・釋義」（含中點）
    await expect(page.locator('.card .eyebrow').first()).toContainText('・')
    // 底部計數改「個漢字」，且字集非空
    await expect(page.locator('main')).toContainText('個漢字')

    // 畫幾筆 → 評分出現分數
    const canvas = page.locator('canvas.writeCanvas')
    const box = (await canvas.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8, { steps: 8 })
    await page.mouse.up()
    await page.getByRole('button', { name: '評分', exact: true }).click()
    await expect(page.locator('.scoreBig')).toBeVisible()
    await expect(page.locator('main')).toContainText('/ 100')
  })

  test('漢字模式：筆順動画可展開／收起，播完可重播', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, 'かな')
    await page.getByRole('button', { name: /書寫練習/ }).click()
    await page.getByRole('button', { name: '漢字', exact: true }).click()

    // 假名字集不顯示筆順按鈕
    await page.getByRole('button', { name: 'ひらがな', exact: true }).click()
    await expect(page.getByRole('button', { name: /筆順動画/ })).toHaveCount(0)
    await page.getByRole('button', { name: '漢字', exact: true }).click()

    const toggle = page.getByRole('button', { name: /看筆順動画/ })
    await expect(toggle).toBeVisible()
    await expect(page.locator('.strokeOrderSvg')).toHaveCount(0)

    await toggle.click()
    await expect(page.locator('.strokeOrderSvg path').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /收起筆順動画/ })).toBeVisible()
    await expect(page.getByText('KanjiVG')).toBeVisible()

    // 重播按鈕存在（播放中顯示「播放中…」並 disabled，之後恢復可按「▶ 重播筆順」）
    await expect(page.locator('.strokeOrder button')).toBeVisible()

    // 收起後 SVG 消失
    await page.getByRole('button', { name: /收起筆順動画/ }).click()
    await expect(page.locator('.strokeOrderSvg')).toHaveCount(0)
  })

  test('漢字模式：只畫一筆評分 → 顯示筆順筆畫數不符提示', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, 'かな')
    await page.getByRole('button', { name: /書寫練習/ }).click()
    await page.getByRole('button', { name: '漢字', exact: true }).click()

    // 提示文字說明漢字模式會額外做筆順順序參考
    await expect(page.locator('main')).toContainText('起筆點順序')

    const canvas = page.locator('canvas.writeCanvas')
    const box = (await canvas.boundingBox())!
    // 練習字集所有漢字皆至少 2 畫，只畫 1 筆必定筆畫數不符
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8, { steps: 8 })
    await page.mouse.up()
    await page.getByRole('button', { name: '評分', exact: true }).click()
    await expect(page.locator('.scoreBig')).toBeVisible()
    await expect(page.locator('main')).toContainText('筆畫數不同')
  })

  test('沒寫就評分 → 提示先寫', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, 'かな')
    await page.getByRole('button', { name: /書寫練習/ }).click()
    await page.getByRole('button', { name: '評分', exact: true }).click()
    await expect(page.locator('.toast')).toContainText('先寫寫看')
  })
})
