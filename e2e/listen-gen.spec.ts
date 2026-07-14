import { test, expect, type Page } from '@playwright/test'
import { gotoApp, navTo } from './helpers'

// Gemini 回應：text 即為 generateContent 要解析的 JSON 字串（LLM 只生中文題/選項）。
function geminiJson(obj: unknown) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }
}

async function setKey(page: Page) {
  await page.evaluate(() => localStorage.setItem('nihongo-michi:geminiKey', 'test-key'))
}

test.describe('聞き取り：AI 段落理解題（LLM 只生中文）', () => {
  test('生成 → 採用 → 併入段落題庫', async ({ page }) => {
    await page.route('**/generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({
        json: geminiJson({
          questions: [
            {
              q: '這段對話的主要場景是？',
              options: ['測試場景甲', '測試場景乙', '測試場景丙', '測試場景丁'],
              answer: '測試場景甲',
            },
          ],
        }),
      }),
    )
    await gotoApp(page)
    await setKey(page)
    await navTo(page, '聴く')

    await page.locator('.lvTabs button', { hasText: '聞き取り' }).click()
    await page.getByRole('button', { name: /AI 出更多段落理解題/ }).click()

    await expect(page.locator('main')).toContainText('AI 段落理解題')
    await page.getByRole('button', { name: /生成 3 題候選/ }).click()

    // 候選出現（中文問題 + 正解標記）
    await expect(page.locator('main')).toContainText('這段對話的主要場景是？', { timeout: 10_000 })
    await expect(page.locator('main')).toContainText('測試場景甲')

    // 採用 → 提示併入
    await page.getByRole('button', { name: /採用/ }).click()
    await expect(page.locator('.toast')).toContainText('已採用', { timeout: 10_000 })
    await expect(page.locator('main')).toContainText('本次已採用')

    // 已持久化到 Dexie userListenQ
    const count = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const req = indexedDB.open('nihongo-michi')
          req.onsuccess = () => {
            const db = req.result
            const tx = db.transaction('userListenQ', 'readonly')
            const c = tx.objectStore('userListenQ').count()
            c.onsuccess = () => {
              resolve(c.result)
              db.close()
            }
            c.onerror = () => reject(c.error)
          }
          req.onerror = () => reject(req.error)
        }),
    )
    expect(count).toBe(1)
  })

  test('未設金鑰：提示去設定填', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, '聴く')
    await page.locator('.lvTabs button', { hasText: '聞き取り' }).click()
    await page.getByRole('button', { name: /AI 出更多段落理解題/ }).click()
    await page.getByRole('button', { name: /生成 3 題候選/ }).click()
    await expect(page.locator('.toast')).toContainText('尚未設定 Gemini 金鑰', { timeout: 10_000 })
  })
})
