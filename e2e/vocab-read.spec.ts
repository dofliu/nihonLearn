import { test, expect } from '@playwright/test'
import { gotoApp, navTo, completeVocabRound, seedKanaLearned, statChip, taskRow } from './helpers'
import { KANA } from '../src/data/kana'

const ALL_KANA_IDS = KANA.map((k) => k.id)

/** gotoApp + 預埋全部假名為已學（讓詞彙全數解鎖）+ reload */
async function gotoWithAllKana(page: import('@playwright/test').Page) {
  await gotoApp(page)
  await seedKanaLearned(page, ALL_KANA_IDS)
  await page.reload()
  await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })
}

test.describe('詞彙 FSRS 與閱讀', () => {
  test('詞彙翻面卡：日文 → 翻面中文 → 評級，一輪 6 新詞', async ({ page }) => {
    await gotoWithAllKana(page)
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

  test('詞彙隨假名解鎖：全新使用者無新詞 → 自動達標並提示', async ({ page }) => {
    await gotoApp(page) // 不預埋假名
    await navTo(page, '読む')
    // 尚未學假名 → 幾乎所有詞待解鎖
    await expect(statChip(page, '待假名解鎖')).toBeVisible()
    await expect(statChip(page, '今日待修')).toContainText('0')

    await page.getByRole('button', { name: '開始詞彙修行' }).click()
    await expect(page.locator('.toast')).toContainText('先多學幾個假名')

    // 自動達標：今日「ことば」任務完成，蓋章不被卡住
    await navTo(page, '今日')
    await expect(taskRow(page, 'ことば')).toHaveClass(/done/)
  })

  test('完成整輪詞彙：任務達標、重整後保留', async ({ page }) => {
    await gotoWithAllKana(page)
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

    // 短文按鈕同時顯示日文與中文主題（初學者看得懂情境）
    const firstPass = page.locator('.card', { hasText: '読む修行' }).locator('.row button').first()
    await expect(firstPass.locator('.passJp')).toHaveText('じこしょうかい')
    await expect(firstPass.locator('.passZh')).toContainText('自我介紹')

    // 開第一篇（第一個「読み物」卡＝分級短文）
    await firstPass.click()
    const lines = page.locator('.rline')
    await expect(lines.first()).toBeVisible()

    // 預設「中文對照：開」→ 初學者整篇中文一起可見
    const toggle = page.getByRole('button', { name: /中文對照：/ })
    await expect(toggle).toHaveText('中文對照：開')
    await expect(lines.first().locator('.zh')).toBeVisible()

    // 關閉對照 → 中文隱藏，回到點句才顯示的模式
    await toggle.click()
    await expect(toggle).toHaveText('中文對照：關')
    await expect(lines.first().locator('.zh')).toBeHidden()
    await lines.first().click()
    await expect(lines.first()).toHaveClass(/open/)
    await expect(lines.first().locator('.zh')).toBeVisible()

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
