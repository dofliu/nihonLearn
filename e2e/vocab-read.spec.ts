import { test, expect } from '@playwright/test'
import { gotoApp, navTo, completeVocabRound, statChip, taskRow } from './helpers'

test.describe('詞彙 FSRS 與閱讀', () => {
  test('詞彙翻面卡：日文 → 翻面中文 → 評級，一輪 6 新詞', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, '読む')

    await expect(statChip(page, '今日待修')).toContainText('6')
    await page.getByRole('button', { name: '開始詞彙修行' }).click()

    await expect(page.locator('.card .eyebrow', { hasText: 'ことば' })).toContainText('1 / 6')
    // 翻面前中文答案不顯示
    await expect(page.locator('.reveal')).toHaveText('')
    await page.getByRole('button', { name: /意味を見る/ }).click()
    await expect(page.locator('.reveal')).not.toHaveText('')

    await page.locator('.gradeRow .g2').click()
    await expect(page.locator('.card .eyebrow', { hasText: 'ことば' })).toContainText('2 / 6')
  })

  test('完成整輪詞彙：任務達標、重整後保留', async ({ page }) => {
    await gotoApp(page)
    await completeVocabRound(page)
    await expect(page.locator('.toast')).toContainText('本輪語彙完成')
    await expect(statChip(page, '已學')).toContainText('6')

    await navTo(page, '今日')
    await expect(taskRow(page, 'ことば')).toHaveClass(/done/)
    await expect(statChip(page, '已學詞彙')).toContainText('6')

    await page.reload()
    await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })
    await expect(statChip(page, '已學詞彙')).toContainText('6')
  })

  test('短文閱讀：開篇、點句切換對照、読了達標', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, '読む')

    // 開第一篇
    await page.locator('.card', { hasText: '読み物' }).locator('.row button').first().click()
    const lines = page.locator('.rline')
    await expect(lines.first()).toBeVisible()

    // 點句 → 切換中文對照（open class）
    await expect(lines.first()).not.toHaveClass(/open/)
    await lines.first().click()
    await expect(lines.first()).toHaveClass(/open/)
    await lines.first().click()
    await expect(lines.first()).not.toHaveClass(/open/)

    // 読了 → 任務完成
    await page.getByRole('button', { name: /読了/ }).click()
    await expect(page.locator('.toast')).toContainText('読了の印')
    await navTo(page, '今日')
    await expect(taskRow(page, '読む修行')).toHaveClass(/done/)
    await expect(taskRow(page, '読む修行')).toContainText('1 / 1')
  })

  test('單字帳依分類列出全部詞彙', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, '読む')
    const rows = page.locator('.wordRow')
    // 詞庫約 190 詞，全數渲染
    expect(await rows.count()).toBeGreaterThan(150)
  })
})
