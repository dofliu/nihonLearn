import { test, expect } from '@playwright/test'
import { gotoApp, navTo, completeKanaRound, statChip, taskRow } from './helpers'

test.describe('假名 SRS 與 IndexedDB 持久化', () => {
  test('翻面自評流程：新字 → 翻面顯示讀音 → 評級推進', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, 'かな')

    await expect(statChip(page, '今日待修行')).toContainText('10')
    await page.getByRole('button', { name: '開始今日修行' }).click()

    // 第一張：新しい字、假名面朝上、讀音尚未揭示
    await expect(page.locator('.card .eyebrow')).toContainText('1 / 10')
    await expect(page.locator('.card .eyebrow')).toContainText('新しい字')
    const face = page.locator('.kanaFace')
    await expect(face).toBeVisible()
    const firstKana = (await face.textContent())!.trim()
    expect(firstKana.length).toBeGreaterThan(0)
    await expect(page.locator('.reveal')).toHaveText('')

    // 翻面 → 顯示羅馬字讀音（第一張新卡是 あ=a）
    await page.getByRole('button', { name: /答えを見る/ }).click()
    await expect(page.locator('.reveal')).not.toHaveText('')

    // 評「記得」→ 推進到第二張、翻面狀態重置
    await page.locator('.gradeRow .g2').click()
    await expect(page.locator('.card .eyebrow')).toContainText('2 / 10')
    await expect(page.locator('.reveal')).toHaveText('')
  })

  test('「忘了」會把該字排回本輪隊列', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, 'かな')
    await page.getByRole('button', { name: '開始今日修行' }).click()

    await expect(page.locator('.card .eyebrow')).toContainText('1 / 10')
    await page.getByRole('button', { name: /答えを見る/ }).click()
    await page.locator('.gradeRow .g0').click() // 忘了
    // 隊列由 10 變 11（稍後重出）
    await expect(page.locator('.card .eyebrow')).toContainText('2 / 11')
  })

  test('完成整輪：任務達標、進度寫入 IndexedDB、重整後保留', async ({ page }) => {
    await gotoApp(page)
    await completeKanaRound(page)
    await expect(page.locator('.toast')).toContainText('本輪完成')

    // 道場首頁：總進度 10、今日待修行歸 0（新卡額度用完、無到期卡）
    await expect(statChip(page, '總進度')).toContainText('10')
    await expect(statChip(page, '今日待修行')).toContainText('0')
    // 進度地圖上 10 枚已學（learn 或 master 樣式）
    await expect(page.locator('.kanaGrid span.learn, .kanaGrid span.master')).toHaveCount(10)

    // 今日頁：字の修行 済、已學假名 10
    await navTo(page, '今日')
    await expect(taskRow(page, '字の修行')).toHaveClass(/done/)
    await expect(taskRow(page, '字の修行')).toContainText('10 / 10')
    await expect(statChip(page, '已學假名')).toContainText('10 / 142')

    // ★ 重整（重開 IndexedDB）：進度不遺失
    await page.reload()
    await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })
    await expect(statChip(page, '已學假名')).toContainText('10 / 142')
    await expect(taskRow(page, '字の修行')).toContainText('10 / 10')
    await navTo(page, 'かな')
    await expect(page.locator('.kanaGrid span.learn, .kanaGrid span.master')).toHaveCount(10)

    // 再按開始 → 今日額度已用完
    await page.getByRole('button', { name: '開始今日修行' }).click()
    await expect(page.locator('.toast')).toContainText('今日の修行は完了')
  })

  test('音 → 字 測驗：需先學 4 枚假名，答題後推進', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, 'かな')

    // 尚未學任何假名 → 直接退回並提示
    await page.getByRole('button', { name: '音 → 字 測驗' }).click()
    await expect(page.locator('.toast')).toContainText('先修行至少 4 枚假名')

    // 學完一輪（10 枚）後可作答
    await completeKanaRound(page)
    await page.getByRole('button', { name: '音 → 字 測驗' }).click()
    await expect(page.locator('.card .eyebrow')).toContainText('音 → 字　1 / 8')
    await expect(page.locator('button.qopt')).toHaveCount(4)
    await page.locator('button.qopt').first().click()
    // 900ms 後進下一題
    await expect(page.locator('.card .eyebrow')).toContainText('2 / 8', { timeout: 5_000 })
  })
})
