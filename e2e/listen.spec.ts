import { test, expect } from '@playwright/test'
import { gotoApp, navTo, completeListenRound, taskRow } from './helpers'

test.describe('聴く：辨音與重音', () => {
  test('辨音 5 題完整流程：作答回饋、任務達標', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, '聴く')

    await page.getByRole('button', { name: '開始 5 題' }).click()
    await expect(page.locator('.card .eyebrow', { hasText: '第 1 / 5 題' })).toBeVisible()
    await expect(page.locator('button.qopt')).toHaveCount(2)

    // 作答 → 選項標示 ok（正解）；答錯時另有 ng
    await page.locator('button.qopt').first().click()
    await expect(page.locator('button.qopt.ok')).toHaveCount(1)

    // 其餘 4 題（每題間隔 3.6 秒）
    for (let n = 2; n <= 5; n++) {
      await expect(
        page.locator('.card .eyebrow', { hasText: `第 ${n} / 5 題` }),
      ).toBeVisible({ timeout: 15_000 })
      await page.locator('button.qopt').first().click()
    }
    await expect(page.locator('.toast')).toContainText('耳の修行 完成！', { timeout: 15_000 })

    await navTo(page, '今日')
    await expect(taskRow(page, '耳の修行')).toHaveClass(/done/)
    await expect(taskRow(page, '耳の修行')).toContainText('5 / 5')
  })

  test('重音道場：高低型視覺化與型別測驗入口', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, '聴く')

    await page.locator('.lvTabs button', { hasText: '重音' }).click()
    // PitchView 載入
    await expect(page.locator('main')).toContainText('重音道場')
    // 切回辨音
    await page.locator('.lvTabs button', { hasText: '辨音' }).click()
    await expect(page.locator('main')).toContainText('辨音道場')
  })
})
