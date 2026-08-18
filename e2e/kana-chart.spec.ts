import { test, expect, type Page } from '@playwright/test'
import { gotoApp, navTo } from './helpers'

async function openChart(page: Page) {
  await navTo(page, 'かな')
  await page.getByRole('button', { name: /五十音圖/ }).click()
  await expect(page.locator('.kanaChart')).toBeVisible()
}

test.describe('五十音圖（一覽表）', () => {
  test('清音表：欄／列標、每格假名＋羅馬字、平↔片假名切換', async ({ page }) => {
    await gotoApp(page)
    await openChart(page)

    // 欄標 A I U E O、列標含 K/S/T 與單獨的 ん 列
    await expect(page.locator('.kanaChart .kcCol')).toHaveCount(5)
    await expect(page.locator('.kanaChart .kcCol').first()).toHaveText('A')
    await expect(page.locator('.kanaChart .kcRow', { hasText: /^K$/ })).toBeVisible()
    await expect(page.locator('.kanaChart .kcRow', { hasText: /^n$/ })).toBeVisible()

    // 清音 46 格，第一格是 あ / a
    await expect(page.locator('.kanaChart .kcCell:not(.empty)')).toHaveCount(46)
    const first = page.locator('.kanaChart .kcCell:not(.empty)').first()
    await expect(first.locator('.kcCh')).toHaveText('あ')
    await expect(first.locator('.kcRo')).toHaveText('a')

    // 切片假名 → 同一格變 ア，羅馬字不變
    await page.getByRole('button', { name: 'ア 片假名' }).click()
    await expect(first.locator('.kcCh')).toHaveText('ア')
    await expect(first.locator('.kcRo')).toHaveText('a')
  })

  test('濁音／拗音分頁：格數與內容正確（拗音三欄）', async ({ page }) => {
    await gotoApp(page)
    await openChart(page)

    // 濁音 25 格，第一格 が / ga
    await page.getByRole('button', { name: '濁音' }).click()
    await expect(page.locator('.kanaChart .kcCell:not(.empty)')).toHaveCount(25)
    const g = page.locator('.kanaChart .kcCell:not(.empty)').first()
    await expect(g.locator('.kcCh')).toHaveText('が')
    await expect(g.locator('.kcRo')).toHaveText('ga')

    // 拗音 33 格、欄標改為 YA/YU/YO，第一格 きゃ / kya
    await page.getByRole('button', { name: '拗音' }).click()
    await expect(page.locator('.kanaChart .kcCol')).toHaveCount(3)
    await expect(page.locator('.kanaChart .kcCol').first()).toHaveText('YA')
    await expect(page.locator('.kanaChart .kcCell:not(.empty)')).toHaveCount(33)
    const y = page.locator('.kanaChart .kcCell:not(.empty)').first()
    await expect(y.locator('.kcCh')).toHaveText('きゃ')
    await expect(y.locator('.kcRo')).toHaveText('kya')
    // 拗音是查閱用參考表，明說不進卡組（要練走選配的拗音ドリル）
    await expect(page.locator('main')).toContainText('不在 SRS 卡組內')

    // 片假名的拗音同步
    await page.getByRole('button', { name: 'ア 片假名' }).click()
    await expect(y.locator('.kcCh')).toHaveText('キャ')
  })

  test('點格子唸一次、播放全部可停止；用單字卡練習進入 FSRS 一輪', async ({ page }) => {
    // 記錄 TTS 唸過的字（環境無真語音，攔在 speechSynthesis 層）
    await page.addInitScript(() => {
      const spoken: string[] = []
      ;(window as unknown as { __spoken: string[] }).__spoken = spoken
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          getVoices: () => [],
          cancel() {},
          speak(u: SpeechSynthesisUtterance) {
            spoken.push(u.text)
            setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 5)
          },
        },
      })
    })
    await gotoApp(page)
    await openChart(page)

    // 點第一格 → 唸「あ」
    await page.locator('.kanaChart .kcCell:not(.empty)').first().click()
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken))
      .toContain('あ')

    // 播放全部 → 按鈕變成停止，可中途停下
    await page.getByRole('button', { name: '▶ 播放全部' }).click()
    const stop = page.getByRole('button', { name: '■ 停止' })
    await expect(stop).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.length))
      .toBeGreaterThan(2)
    await stop.click()
    await expect(page.getByRole('button', { name: '▶ 播放全部' })).toBeVisible()

    // 用單字卡練習 → 進入 FSRS 一輪（翻面按鈕出現）
    await page.getByRole('button', { name: /用單字卡練習/ }).click()
    await expect(page.getByRole('button', { name: /答えを見る/ })).toBeVisible()
  })
})
