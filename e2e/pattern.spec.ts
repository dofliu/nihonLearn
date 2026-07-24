import { test, expect } from '@playwright/test'
import { gotoApp } from './helpers'

test.describe('文型ドリル（句型練習）', () => {
  test('今日頁入口 → 選句型、換單字、日文對照顯示', async ({ page }) => {
    await gotoApp(page)

    // 今日頁「今日の文型」卡的開始鈕
    await page.getByRole('button', { name: /開始練習/ }).click()

    // 進入文型ドリル：標題與句型選單
    await expect(page.locator('main')).toContainText('句型練習')
    await expect(page.locator('main')).toContainText('請給我〜')

    // 選「請給我〜」句型
    await page.locator('.patGrid .passBtn', { hasText: '請給我〜' }).click()
    await expect(page.locator('.sentZh')).toContainText('請給我')

    // 記下目前例句，換一個單字後應變化
    const first = await page.locator('.sent').innerText()
    await page.getByRole('button', { name: /換一個單字/ }).click()
    await expect(page.locator('.sent')).not.toHaveText(first)

    // 填入的單字提示存在
    await expect(page.locator('.slotWord')).toContainText('填入的單字')

    // 返回
    await page.getByRole('button', { name: /返回/ }).click()
    await expect(page.locator('main')).toContainText('今日の修行')
  })

  test('+α 列亦可開啟文型ドリル', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: /文型ドリル/ }).click()
    await expect(page.locator('main')).toContainText('選一個句型')
    // 切到「〜在哪裡？」句型
    await page.locator('.patGrid .passBtn', { hasText: '在哪裡' }).click()
    await expect(page.locator('.sentZh')).toContainText('在哪裡')
  })
})
