import { test, expect, type Page } from '@playwright/test'
import { gotoApp, navTo, activityCount, taskRow } from './helpers'

/** 假語音（本環境無真 TTS）——避免揭曉時的朗讀卡住流程 */
async function stubTts(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [],
        cancel() {},
        speak(u: SpeechSynthesisUtterance) {
          setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 5)
        },
      },
    })
  })
}

async function openDrill(page: Page) {
  await navTo(page, 'かな')
  await page.getByRole('button', { name: /拗音ドリル/ }).click()
  await expect(page.locator('.kanaFace')).toBeVisible()
}

test.describe('拗音ドリル（選配加練）', () => {
  test('一輪 10 題：答完不自動跳題、手動前進、結算並記入学習記録', async ({ page }) => {
    await stubTts(page)
    await gotoApp(page)
    await openDrill(page)

    const bar = page.locator('.progressBar')
    await expect(bar).toHaveAttribute('aria-valuenow', '1')
    await expect(bar).toHaveAttribute('aria-valuemax', '10')
    // 題目是一個兩字拗音（い段假名＋小さい ゃ／ゅ／ょ）
    await expect(page.locator('.kanaFace')).toHaveText(/^.[ゃゅょ]$/)
    // 四個羅馬字選項
    await expect(page.locator('.qopt')).toHaveCount(4)

    for (let i = 1; i <= 10; i++) {
      await expect(bar).toHaveAttribute('aria-valuenow', String(i))
      await page.locator('.qopt').first().click()
      // 作答後一定有一格標成正解（選對→同一格 .ok，選錯→另一格 .ok）
      await expect(page.locator('.qopt.ok')).toHaveCount(1)
      // 不自動跳題：題號停在原地，等使用者自己按
      await expect(bar).toHaveAttribute('aria-valuenow', String(i))
      await page.getByRole('button', { name: i < 10 ? /下一題/ : /完成/ }).click()
    }

    await expect(page.locator('main')).toContainText('正解')
    await expect(page.locator('main')).toContainText('拗音ドリル ─ 結果')

    // 記入学習記録（選配加練），但**不**計入核心「字の修行」任務
    await expect.poll(() => activityCount(page, 'yoon')).toBe(1)
    expect(await activityCount(page, 'kana')).toBe(0)
    await navTo(page, '今日')
    await expect(taskRow(page, '字の修行')).toContainText('0 / 10')
    // 今日の加練清單中「拗音ドリル」已打勾
    const toggle = page.getByRole('button', { name: /全部加練/ })
    if (await toggle.isVisible().catch(() => false)) await toggle.click()
    await expect(page.getByRole('button', { name: /拗音ドリル/ }).first()).toContainText('✓')
  })

  test('五十音圖拗音分頁改為拗音ドリル入口，並沿用平／片假名選擇', async ({ page }) => {
    await stubTts(page)
    await gotoApp(page)
    await navTo(page, 'かな')
    await page.getByRole('button', { name: /五十音圖/ }).click()

    // 清音分頁：仍是「用單字卡練習」
    await expect(page.getByRole('button', { name: /用單字卡練習/ })).toBeVisible()

    // 拗音分頁：拗音沒有 SRS 卡片，故改成拗音ドリル
    await page.getByRole('button', { name: '拗音' }).click()
    await expect(page.getByRole('button', { name: /用單字卡練習/ })).toHaveCount(0)
    await expect(page.locator('main')).toContainText('不在 SRS 卡組內')

    // 先切片假名 → 進練習時題目是片假名拗音
    await page.getByRole('button', { name: 'ア 片假名' }).click()
    await page.getByRole('button', { name: /拗音ドリル/ }).click()
    await expect(page.locator('.kanaFace')).toHaveText(/^.[ャュョ]$/)
    // 練習內可切回平假名
    await page.getByRole('button', { name: 'あ 平假名' }).click()
    await expect(page.locator('.kanaFace')).toHaveText(/^.[ゃゅょ]$/)
  })
})
