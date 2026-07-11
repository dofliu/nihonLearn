import { test, expect, type Page } from '@playwright/test'
import { gotoApp } from './helpers'

function geminiText(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] }
}

async function setKey(page: Page) {
  await page.evaluate(() => localStorage.setItem('nihongo-michi:geminiKey', 'test-key'))
}

test.describe('AI 助教', () => {
  test('未設金鑰：提示先到設定填 Gemini 金鑰', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: /AI 助教/ }).click()
    await expect(page.locator('main')).toContainText('填入金鑰')
    await expect(page.locator('main')).not.toContainText('先生に聞く')
  })

  test('有金鑰：提問 → Gemini 回答、顯示免責提示', async ({ page }) => {
    await page.route('**/generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({
        json: geminiText('「食べる」是「吃」的意思。例：ごはんを たべる。\n※ 以上為 AI 說明，僅供參考。'),
      }),
    )
    await gotoApp(page)
    await setKey(page)
    await page.getByRole('button', { name: /AI 助教/ }).click()

    // 免責橫幅
    await expect(page.locator('main')).toContainText('僅供參考')
    await expect(page.locator('main')).toContainText('不會改動你的學習資料')

    // 點建議提問 → 出現我方訊息與助教回答
    await page.getByRole('button', { name: /「食べる」怎麼用/ }).click()
    await expect(page.locator('main')).toContainText('「食べる」怎麼用')
    await expect(page.locator('main')).toContainText('是「吃」的意思', { timeout: 10_000 })

    // 也能用輸入框送出
    await page.locator('input[placeholder="輸入問題…"]').fill('は 和 が 的差別？')
    await page.getByRole('button', { name: '送出' }).click()
    await expect(page.locator('main')).toContainText('は 和 が 的差別')
  })
})
