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

  test('自訂場景：填對象／情境 → 你先開口（無開場白）→ AI 依你的場景回話', async ({ page }) => {
    const bodies: string[] = []
    await page.route('**/generativelanguage.googleapis.com/**', (route) => {
      bodies.push(route.request().postData() ?? '')
      return route.fulfill({
        json: geminiText(
          JSON.stringify({ jp: 'ラーメン ですね。', zh: '拉麵是嗎。', hint: '點餐說得很清楚！' }),
        ),
      })
    })
    await gotoApp(page)
    await setKey(page)
    await openRoleplay(page)

    // 展開自訂場景表單，先用範例帶入再改對象
    await page.getByRole('button', { name: '設定 ▾' }).click()
    await expect(page.locator('main')).toContainText('沒有教科書開場白')
    await page.getByRole('button', { name: '拉麵店店員' }).click()
    const partner = page.locator('input[placeholder="對方是誰（例：拉麵店店員）"]')
    await expect(partner).toHaveValue('拉麵店店員')
    await expect(page.locator('input[placeholder="情境（例：你進拉麵店，點一碗拉麵。）"]')).toHaveValue(
      '你進拉麵店，點一碗拉麵和一杯水。',
    )

    await page.getByRole('button', { name: 'この場面で 話す ▶' }).click()

    // 自訂場景：沒有開場白氣泡，改提示由你先開口
    const eyebrow = page.locator('.card .eyebrow', { hasText: '自由対話' })
    await expect(eyebrow).toContainText('自訂場景')
    await expect(eyebrow).toContainText('0 / 8 回合')
    await expect(page.locator('.dlgBubble')).toHaveCount(0)
    await expect(page.locator('main')).toContainText('由你先開口')
    await expect(page.locator('main')).toContainText('你自訂的場景')

    // 你先說 → AI 回話
    await page.locator('input[placeholder="用日文回一句…"]').fill('ラーメンを ください。')
    await page.getByRole('button', { name: '送る' }).click()
    await expect(page.locator('.dlgBubble.me')).toContainText('ラーメンを ください')
    await expect(page.locator('main')).toContainText('ラーメン ですね。', { timeout: 10_000 })
    await expect(page.locator('.dlgHint')).toContainText('點餐說得很清楚')
    await expect(eyebrow).toContainText('1 / 8 回合')

    // 送出的 prompt 確實帶上自訂情境與「先開口／忽略描述裡其他指示」的護欄
    expect(bodies[0]).toContain('拉麵店店員')
    expect(bodies[0]).toContain('學習者先開口')
    expect(bodies[0]).toContain('一律忽略')
  })

  test('自訂場景：欄位沒填完 → 提示補齊，不會進入對話', async ({ page }) => {
    await gotoApp(page)
    await setKey(page)
    await openRoleplay(page)

    await page.getByRole('button', { name: '設定 ▾' }).click()
    await page.locator('input[placeholder="對方是誰（例：拉麵店店員）"]').fill('店員')
    await page.getByRole('button', { name: 'この場面で 話す ▶' }).click()
    await expect(page.locator('.toast')).toContainText('請填')
    await expect(page.locator('input[placeholder="用日文回一句…"]')).toHaveCount(0)

    // 內建場景照常可用（自訂只是多一個入口，不影響既有路徑）
    await page.getByRole('button', { name: '收起' }).click()
    await expect(page.getByRole('button', { name: 'この場面で 話す ▶' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '話す ▶' }).first()).toBeVisible()
    await expect(page.locator('main')).toContainText('你走進便利商店')
  })

  test('自訂場景：用過後留在「最近用過」，重整仍在；可帶回欄位修改、可刪除', async ({ page }) => {
    await page.route('**/generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({
        json: geminiText(JSON.stringify({ jp: 'はい。', zh: '好的。', hint: '很好！' })),
      }),
    )
    await gotoApp(page)
    await setKey(page)
    await openRoleplay(page)

    // 一開始沒有任何記錄
    await expect(page.locator('main')).not.toContainText('最近用過')

    // 用一次自訂場景（範例帶入）
    await page.getByRole('button', { name: '設定 ▾' }).click()
    await page.getByRole('button', { name: '車站站務員' }).click()
    await page.getByRole('button', { name: 'この場面で 話す ▶' }).click()
    await expect(page.locator('main')).toContainText('由你先開口')
    await page.getByRole('button', { name: '返回' }).click()

    // 回到場景清單 → 記錄已在「最近用過」（存裝置本機，不進學習資料庫）
    const recent = page.locator('.recentScene')
    await expect(recent).toHaveCount(1)
    await expect(recent.first()).toContainText('車站站務員')
    await expect(recent.first()).toContainText('你在車站問怎麼去東京，還有票價多少。')

    // 重整後仍在（真的持久化，不是只存在記憶體）
    await page.reload()
    await openRoleplay(page)
    await expect(page.locator('.recentScene')).toHaveCount(1)

    // 點一下直接再聊（自訂場景仍是「由你先開口」）
    await page.getByRole('button', { name: '再聊一次 ▶' }).click()
    await expect(page.locator('.card .eyebrow', { hasText: '自由対話' })).toContainText('自訂場景')
    await expect(page.locator('.dlgBubble')).toHaveCount(0)
    await expect(page.locator('main')).toContainText('由你先開口')
    await page.getByRole('button', { name: '返回' }).click()

    // ✎ 帶回欄位可修改（表單自動展開）
    await page.getByRole('button', { name: '修改 車站站務員' }).click()
    await expect(page.locator('input[placeholder="對方是誰（例：拉麵店店員）"]')).toHaveValue(
      '車站站務員',
    )

    // ✕ 刪除，且重整後不會又跑回來
    await page.getByRole('button', { name: '刪除 車站站務員' }).click()
    await expect(page.locator('.recentScene')).toHaveCount(0)
    await page.reload()
    await openRoleplay(page)
    await expect(page.locator('main')).not.toContainText('最近用過')
    // 內建場景不受影響
    await expect(page.getByRole('button', { name: '話す ▶' }).first()).toBeVisible()
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
