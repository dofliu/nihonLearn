import { test, expect, type Page } from '@playwright/test'
import { gotoApp, navTo } from './helpers'

/**
 * 生成句審核佇列持久化——候選離開頁面不消失，採用/退回各自出佇列。
 * （生成句改由 Gemini 直連，用 page.route 攔截 generativelanguage 端點）
 */

/** 包裝成 Gemini generateContent 的回應（candidates[0].content.parts[].text = JSON 字串） */
function geminiJson(payload: unknown) {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
  }
}

/** 設定 Gemini 金鑰（讓 hasLLM()=true，走 Gemini 直連而非離線示範） */
async function setGeminiKey(page: Page) {
  await page.evaluate(() => localStorage.setItem('nihongo-michi:geminiKey', 'test-key'))
}

test.describe('生成句審核佇列持久化', () => {
  test('候選入佇列、離開再回來仍在、採用/退回出佇列', async ({ page }) => {
    // 生成句改由 Gemini 直連——stub Gemini 端點回 2 句候選
    await page.route('**/generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({
        json: geminiJson({
          candidates: [
            { jp: 'みずを ください。', zh: '請給我水。', read: 'みずをください', new_words: [] },
            { jp: 'えきは どこですか。', zh: '車站在哪裡？', read: 'えきはどこですか', new_words: [] },
          ],
        }),
      }),
    )
    await gotoApp(page)
    await setGeminiKey(page) // 有金鑰 → 走 Gemini（命中上面的 stub）而非離線示範
    await navTo(page, '話す')
    await page.getByRole('button', { name: /生成新練習句/ }).click()

    // 生成 → 佇列 2 句
    await page.getByRole('button', { name: /生成 5 句候選/ }).click()
    await expect(page.locator('main')).toContainText('佇列中 2 句待審')

    // 離開審核頁再回來 → 佇列仍在（Dexie genQueue，不再打 API）
    await page.getByRole('button', { name: '返回', exact: true }).click()
    await page.getByRole('button', { name: /生成新練習句/ }).click()
    await expect(page.locator('main')).toContainText('佇列中 2 句待審')
    await expect(page.locator('.card', { hasText: 'みずを ください' })).toBeVisible()

    // 採用一句 → 佇列剩 1；退回一句 → 佇列 0
    await page
      .locator('.card', { hasText: 'みずを ください' })
      .getByRole('button', { name: '採用 ✓' })
      .click()
    await expect(page.locator('main')).toContainText('佇列中 1 句待審')
    await page
      .locator('.card', { hasText: 'えきは どこですか' })
      .getByRole('button', { name: '退回' })
      .click()
    await expect(page.locator('main')).toContainText('佇列中 0 句待審')
    await expect(page.locator('main')).toContainText('本次已採用 1 句')
  })
})
