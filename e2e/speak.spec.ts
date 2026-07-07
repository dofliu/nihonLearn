import { test, expect } from '@playwright/test'
import {
  gotoApp,
  navTo,
  disableSpeechRecognition,
  completeSpeakSelf,
  taskRow,
} from './helpers'

test.describe('話す：跟讀與評分降級', () => {
  test('無語音辨識環境 → 正確降級為自我評分（CLAUDE.md A-3）', async ({ page }) => {
    await disableSpeechRecognition(page)
    await gotoApp(page)
    await navTo(page, '話す')

    // sidecar 離線 + 無瀏覽器 ASR → 引擎顯示「自我評分」
    await expect(page.getByText('評分：自我評分')).toBeVisible({ timeout: 10_000 })

    await page.locator('button.micBtn').click()
    await expect(page.locator('.recTxt')).toContainText('此環境無語音評分')
    // 自評三鈕出現
    await expect(page.getByRole('button', { name: '◎ 很像' })).toBeVisible()
    await page.getByRole('button', { name: '○ 還行' }).click()
    await expect(page.locator('.scoreBig')).toContainText('○')

    await navTo(page, '今日')
    await expect(taskRow(page, '口の修行')).toContainText('1 / 3')
  })

  test('句子導覽與層級切換', async ({ page }) => {
    await disableSpeechRecognition(page)
    await gotoApp(page)
    await navTo(page, '話す')

    await expect(page.locator('.card .eyebrow', { hasText: '句' })).toContainText('第 1 /')
    const firstSent = await page.locator('.sent').textContent()

    await page.getByRole('button', { name: '次の句 →' }).click()
    await expect(page.locator('.card .eyebrow', { hasText: '句' })).toContainText('第 2 /')
    expect(await page.locator('.sent').textContent()).not.toBe(firstSent)

    await page.getByRole('button', { name: '← 前の句' }).click()
    await expect(page.locator('.card .eyebrow', { hasText: '句' })).toContainText('第 1 /')

    // 層級切換後回到第 1 句
    await page.locator('.lvTabs button', { hasText: '弐・日常句' }).click()
    await expect(page.locator('.card .eyebrow', { hasText: '句' })).toContainText('第 1 /')
  })

  test('跟讀 3 次達標，發音紀錄寫入 DB（重整後任務保持完成）', async ({ page }) => {
    await disableSpeechRecognition(page)
    await gotoApp(page)
    await completeSpeakSelf(page, 3)

    await navTo(page, '今日')
    await expect(taskRow(page, '口の修行')).toHaveClass(/done/)
    await expect(taskRow(page, '口の修行')).toContainText('3 / 3')

    await page.reload()
    await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })
    await expect(taskRow(page, '口の修行')).toContainText('3 / 3')
  })

  test('生成句審核佇列：未設 Gemini 金鑰時走離線示範（不噴 JSON 錯誤）', async ({ page }) => {
    await disableSpeechRecognition(page)
    await gotoApp(page)
    await navTo(page, '話す')
    await page.getByRole('button', { name: /生成新練習句/ }).click()
    await expect(page.locator('main')).toContainText('練習句審核佇列')

    // 未設定 sidecar → 直接回離線示範候選（降級不中斷），並標示示範
    await page.getByRole('button', { name: /生成 5 句候選/ }).click()
    await expect(page.locator('main')).toContainText('佇列中 5 句待審')
    await expect(page.locator('main')).toContainText('示範候選')
    // 不應出現原本的 JSON 解析錯誤
    await expect(page.locator('.toast')).not.toContainText('is not valid json')
  })
})
