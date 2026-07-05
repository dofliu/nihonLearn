import { test, expect } from '@playwright/test'
import { gotoApp, navTo } from './helpers'

test.describe('基本載入與導覽', () => {
  test('今日頁載入：五項修行、蓋章卡、統計', async ({ page }) => {
    await gotoApp(page)

    // 五項每日修行全部列出，初始 0 / target
    const tasks = page.locator('.task')
    await expect(tasks).toHaveCount(5)
    await expect(tasks.nth(0)).toContainText('字の修行')
    await expect(tasks.nth(0)).toContainText('0 / 10')
    await expect(tasks.nth(1)).toContainText('ことば')
    await expect(tasks.nth(2)).toContainText('耳の修行')
    await expect(tasks.nth(3)).toContainText('口の修行')
    await expect(tasks.nth(4)).toContainText('読む修行')

    // 蓋章卡 14 格、今日格標記
    await expect(page.locator('.stampCell')).toHaveCount(14)
    await expect(page.locator('.stampCell.today')).toHaveCount(1)

    // 統計 chip 與 streak 徽章初始為 0
    await expect(page.locator('.streakBadge')).toContainText('連続 0 日')
    await expect(page.locator('.statChips .chip', { hasText: '已學假名' })).toContainText('0 / 142')
  })

  test('五分頁導覽切換', async ({ page }) => {
    await gotoApp(page)

    await navTo(page, 'かな')
    await expect(page.locator('main')).toContainText('五十音道場')

    await navTo(page, '聴く')
    await expect(page.locator('main')).toContainText('辨音道場')

    await navTo(page, '話す')
    await expect(page.locator('main')).toContainText('跟讀（Shadowing）')

    await navTo(page, '読む')
    await expect(page.locator('main')).toContainText('ことば道場')

    await navTo(page, '今日')
    await expect(page.locator('main')).toContainText('今日の修行')
  })

  test('任務列「前往」按鈕導向對應分頁', async ({ page }) => {
    await gotoApp(page)
    await page.locator('.task', { hasText: '耳の修行' }).getByRole('button', { name: '前往' }).click()
    await expect(page.locator('main')).toContainText('辨音道場')
    await expect(page.locator('nav.nav button.on')).toContainText('聴く')
  })

  test('設定面板：開關漢字モード、語音來源顯示', async ({ page }) => {
    await gotoApp(page)
    await page.locator('.appHeader h1').click()

    // sidecar 不在線 → 顯示瀏覽器內建
    await expect(page.locator('main')).toContainText('語音設定')
    await expect(page.locator('main')).toContainText('瀏覽器內建')

    // 漢字モード開關反映到 .app class，且設定持久化（重整後保留）
    const kanjiBtn = page.locator('.card', { hasText: '漢字モード' }).getByRole('button')
    await expect(kanjiBtn).toHaveText('OFF')
    await kanjiBtn.click()
    await expect(kanjiBtn).toHaveText('ON')
    await expect(page.locator('.app')).toHaveClass(/kanji-mode/)

    await page.reload()
    await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })
    await expect(page.locator('.app')).toHaveClass(/kanji-mode/)

    // 返回關閉設定
    await page.locator('.appHeader h1').click()
    await page.getByRole('button', { name: '返回' }).click()
    await expect(page.locator('main')).toContainText('今日の修行')
  })

  test('Sidecar 位址：儲存正規化、持久化、清除還原同源', async ({ page }) => {
    await gotoApp(page)
    await page.locator('.appHeader h1').click()

    const card = page.locator('.card', { hasText: 'Sidecar 位址' })
    const input = card.locator('input')
    await expect(input).toHaveValue('')

    // 無 scheme → 自動補 https、去尾斜線；連不上（假網址）→ 錯誤 toast、降級不中斷
    await input.fill('sidecar.invalid/')
    await card.getByRole('button', { name: /儲存並測試/ }).click()
    await expect(page.locator('.toast')).toContainText('連不上 sidecar')
    await expect(input).toHaveValue('https://sidecar.invalid')

    // 持久化：重整後仍在（localStorage，不進 Dexie）
    await page.reload()
    await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })
    await page.locator('.appHeader h1').click()
    await expect(card.locator('input')).toHaveValue('https://sidecar.invalid')

    // 清空 → 還原同源 /api
    await card.locator('input').fill('')
    await card.getByRole('button', { name: /儲存並測試/ }).click()
    await expect(page.locator('.toast')).toContainText('同源 /api')
  })

  test('匯出 v2 備份會下載合法 JSON', async ({ page }) => {
    await gotoApp(page)
    await page.locator('.appHeader h1').click()

    const downloadP = page.waitForEvent('download')
    await page.getByRole('button', { name: '匯出 v2 備份' }).click()
    const download = await downloadP
    expect(download.suggestedFilename()).toMatch(/^nihongo-michi-backup-\d+\.json$/)

    const path = await download.path()
    const { readFileSync } = await import('node:fs')
    const data = JSON.parse(readFileSync(path, 'utf8'))
    expect(data.version).toBe(2)
    expect(Array.isArray(data.cards)).toBe(true)
    expect(Array.isArray(data.stamps)).toBe(true)
  })
})
