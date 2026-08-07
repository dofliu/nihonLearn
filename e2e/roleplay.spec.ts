import { test, expect, type Page } from '@playwright/test'
import {
  gotoApp,
  navTo,
  fakeSpeechRecognition,
  disableSpeechRecognition,
} from './helpers'

function geminiText(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] }
}

async function setKey(page: Page) {
  await page.evaluate(() => localStorage.setItem('nihongo-michi:geminiKey', 'test-key'))
}

/** 話す → 会話分頁 → 自由対話入口 */
async function openRoleplay(page: Page) {
  await navTo(page, '話す')
  await page.locator('.lvTabs button', { hasText: '会話' }).click()
  await page.getByRole('button', { name: '試す ▶' }).click()
}

test.describe('自由対話（AI 角色扮演）', () => {
  test('未設金鑰：提示去設定，固定腳本会話仍可用（降級不中斷）', async ({ page }) => {
    await gotoApp(page)
    await openRoleplay(page)
    await expect(page.locator('main')).toContainText('填入金鑰')
    await expect(page.locator('main')).not.toContainText('話す ▶')

    // 返回後固定腳本会話照常在
    await page.getByRole('button', { name: '返回' }).click()
    await expect(page.locator('main')).toContainText('情境對話引導')
    await expect(page.getByRole('button', { name: '開始 ▶' }).first()).toBeVisible()
  })

  test('有金鑰：選場景 → 打字 → AI 回話＋中文小提示；回合數遞增', async ({ page }) => {
    let n = 0
    await page.route('**/generativelanguage.googleapis.com/**', (route) => {
      n++
      return route.fulfill({
        json: geminiText(
          JSON.stringify({
            jp: n === 1 ? 'はい、どうぞ。' : 'ぜんぶで さんびゃくえんです。',
            zh: n === 1 ? '好的，請。' : '總共三百日圓。',
            hint: n === 1 ? '說得很自然！' : '也可以說「これを ください」。',
          }),
        ),
      })
    })
    await gotoApp(page)
    await setKey(page)
    await openRoleplay(page)

    // 免責與場景清單
    await expect(page.locator('main')).toContainText('僅供參考')
    await expect(page.locator('main')).toContainText('不會寫入你的學習資料')
    await page.getByRole('button', { name: '話す ▶' }).first().click()

    // 開場白來自已驗證腳本
    const eyebrow = page.locator('.card .eyebrow', { hasText: '自由対話' })
    await expect(eyebrow).toContainText('0 / 8 回合')
    await expect(page.locator('.dlgBubble').first()).toContainText('いらっしゃいませ')

    // 打一句 → 我方氣泡 + AI 回話 + 中文小提示
    const input = page.locator('input[placeholder="用日文回一句…"]')
    await input.fill('おにぎりを ください。')
    await page.getByRole('button', { name: '送る' }).click()
    await expect(page.locator('.dlgBubble.me')).toContainText('おにぎりを ください')
    await expect(page.locator('main')).toContainText('はい、どうぞ。', { timeout: 10_000 })
    await expect(page.locator('.dlgHint')).toContainText('說得很自然')
    await expect(eyebrow).toContainText('1 / 8 回合')

    // 第二句：Enter 送出也可以
    await input.fill('いくらですか。')
    await input.press('Enter')
    await expect(page.locator('main')).toContainText('さんびゃくえん', { timeout: 10_000 })
    await expect(eyebrow).toContainText('2 / 8 回合')
  })

  test('用說的：辨識結果先填進輸入框（可再補說／改字後才送出）', async ({ page }) => {
    await page.route('**/generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({
        json: geminiText(
          JSON.stringify({ jp: 'はい、どうぞ。', zh: '好的，請。', hint: '很自然！' }),
        ),
      }),
    )
    await fakeSpeechRecognition(page, ['おにぎりを ください', 'ふたつ'])
    await gotoApp(page)
    await setKey(page)
    await openRoleplay(page)
    await page.getByRole('button', { name: '話す ▶' }).first().click()

    const input = page.locator('input[placeholder="用日文回一句…"]')
    const mic = page.getByRole('button', { name: '🎤 用說的' })
    await expect(mic).toBeVisible()
    await expect(page.locator('main')).toContainText('會先填進輸入框')

    // 說第一句 → 進輸入框，尚未送出（對話中還沒有我方氣泡）
    await mic.click()
    await expect(input).toHaveValue('おにぎりを ください', { timeout: 10_000 })
    await expect(page.locator('.dlgBubble.me')).toHaveCount(0)

    // 再說一次 → 併到後面（先說一半再補的情境）
    await mic.click()
    await expect(input).toHaveValue('おにぎりを ください ふたつ', { timeout: 10_000 })

    // 確認後才送出
    await page.getByRole('button', { name: '送る' }).click()
    await expect(page.locator('.dlgBubble.me')).toContainText('おにぎりを ください ふたつ')
    await expect(page.locator('main')).toContainText('はい、どうぞ。', { timeout: 10_000 })
  })

  test('用說的：沒聽到聲音時提示重試，輸入框不被清掉', async ({ page }) => {
    await fakeSpeechRecognition(page, []) // 佇列為空 → no-speech
    await gotoApp(page)
    await setKey(page)
    await openRoleplay(page)
    await page.getByRole('button', { name: '話す ▶' }).first().click()

    const input = page.locator('input[placeholder="用日文回一句…"]')
    await input.fill('すみません')
    await page.getByRole('button', { name: '🎤 用說的' }).click()
    await expect(page.locator('.toast')).toContainText('沒聽到聲音', { timeout: 10_000 })
    await expect(input).toHaveValue('すみません')
  })

  test('無語音辨識環境：不顯示麥克風鈕，打字照常可用（降級不中斷）', async ({ page }) => {
    await page.route('**/generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({
        json: geminiText(JSON.stringify({ jp: 'はい。', zh: '好的。', hint: 'いいね！' })),
      }),
    )
    await disableSpeechRecognition(page)
    await gotoApp(page)
    await setKey(page)
    await openRoleplay(page)
    await page.getByRole('button', { name: '話す ▶' }).first().click()

    await expect(page.getByRole('button', { name: '🎤 用說的' })).toHaveCount(0)
    await page.locator('input[placeholder="用日文回一句…"]').fill('こんにちは。')
    await page.getByRole('button', { name: '送る' }).click()
    await expect(page.locator('.dlgBubble.me')).toContainText('こんにちは')
    await expect(page.locator('main')).toContainText('はい。', { timeout: 10_000 })
  })

  test('AI 回應格式壞掉：提示重試、對話不被污染（輸入保留）', async ({ page }) => {
    await page.route('**/generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({ json: geminiText('抱歉，我不太確定。') }),
    )
    await gotoApp(page)
    await setKey(page)
    await openRoleplay(page)
    await page.getByRole('button', { name: '話す ▶' }).first().click()

    await page.locator('input[placeholder="用日文回一句…"]').fill('こんにちは。')
    await page.getByRole('button', { name: '送る' }).click()

    await expect(page.locator('.toast')).toContainText('再說一次', { timeout: 10_000 })
    await expect(page.locator('.dlgBubble.me')).toHaveCount(0)
    await expect(page.locator('input[placeholder="用日文回一句…"]')).toHaveValue('こんにちは。')
  })
})
