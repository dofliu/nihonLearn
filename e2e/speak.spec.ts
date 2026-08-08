import { test, expect, type Page } from '@playwright/test'
import {
  gotoApp,
  navTo,
  disableSpeechRecognition,
  fakeSpeechRecognition,
  completeSpeakSelf,
  taskRow,
  activityCount,
} from './helpers'

test.describe('話す：跟讀與評分降級', () => {
  test('無語音辨識環境 → 正確降級為自我評分（CLAUDE.md A-3）', async ({ page }) => {
    await disableSpeechRecognition(page)
    await gotoApp(page)
    await navTo(page, '話す')

    // sidecar 離線 + 無瀏覽器 ASR → 引擎顯示「自我評分」
    await expect(page.getByText('評分：自我評分')).toBeVisible({ timeout: 10_000 })

    await page.locator('button.micBtn').click()
    await expect(page.locator('.recTxt')).toContainText('此環境無語音評分')
    // 自評三鈕出現
    await expect(page.getByRole('button', { name: '◎ 很像' })).toBeVisible()
    await page.getByRole('button', { name: '○ 還行' }).click()
    await expect(page.locator('.scoreBig')).toContainText('○')

    await navTo(page, '今日')
    await expect(taskRow(page, '口の修行')).toContainText('1 / 3')
  })

  test('句子以逐字 span 呈現（朗讀逐字上色的結構）', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, '話す')
    // 目標句渲染成逐字 .kw span（Karaoke 元件）
    const kw = page.locator('.card .sent .kw')
    expect(await kw.count()).toBeGreaterThan(1)
    // 慢速朗讀不報錯（headless 無語音時不驗上色時序，只驗不崩）
    await page.getByRole('button', { name: /慢速/ }).click()
  })

  test('句子導覽與層級切換', async ({ page }) => {
    await disableSpeechRecognition(page)
    await gotoApp(page)
    await navTo(page, '話す')

    await expect(page.locator('.card .eyebrow', { hasText: '句' })).toContainText('第 1 /')
    const firstSent = await page.locator('.sent').textContent()

    await page.getByRole('button', { name: '次の句 →' }).click()
    await expect(page.locator('.card .eyebrow', { hasText: '句' })).toContainText('第 2 /')
    expect(await page.locator('.sent').textContent()).not.toBe(firstSent)

    await page.getByRole('button', { name: '← 前の句' }).click()
    await expect(page.locator('.card .eyebrow', { hasText: '句' })).toContainText('第 1 /')

    // 層級切換後回到第 1 句
    await page.locator('.lvTabs button', { hasText: '弐・日常句' }).click()
    await expect(page.locator('.card .eyebrow', { hasText: '句' })).toContainText('第 1 /')
  })

  test('跟讀 3 次達標，發音紀錄寫入 DB（重整後任務保持完成）', async ({ page }) => {
    await disableSpeechRecognition(page)
    await gotoApp(page)
    await completeSpeakSelf(page, 3)

    await navTo(page, '今日')
    await expect(taskRow(page, '口の修行')).toHaveClass(/done/)
    await expect(taskRow(page, '口の修行')).toContainText('3 / 3')

    await page.reload()
    await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })
    await expect(taskRow(page, '口の修行')).toContainText('3 / 3')
  })

  test('会話引導：選場景 → 對方說/換你說輪替 → 完成計入口任務', async ({ page }) => {
    await disableSpeechRecognition(page)
    await gotoApp(page)
    await navTo(page, '話す')

    await page.locator('.lvTabs button', { hasText: '会話' }).click()
    await expect(page.locator('main')).toContainText('情境對話引導')
    // 六類對象都列出
    for (const tag of ['店員', '家人', '情人', '同學', '朋友', '廠商']) {
      await expect(page.locator('main .chip', { hasText: tag }).first()).toBeVisible()
    }

    await page.getByRole('button', { name: '開始 ▶' }).first().click()
    const eyebrow = page.locator('.card .eyebrow', { hasText: '会話' })
    await expect(eyebrow).toContainText('1 / 8')

    // 依「つぎへ（對方）／唸完了（自己）」交替走完整段（第一段對話共 8 句）
    for (let i = 1; i <= 8; i++) {
      await expect(eyebrow).toContainText(`${i} / 8`)
      await page.getByRole('button', { name: /つぎへ ▶|唸完了/ }).click()
    }
    await expect(page.locator('.toast')).toContainText('会話練習 完成', { timeout: 10_000 })
    await expect(page.getByRole('button', { name: '再來一次' })).toBeVisible()

    // 使用者台詞（4 句）計入「口」任務
    await navTo(page, '今日')
    await expect(taskRow(page, '口の修行')).toHaveClass(/done/)
  })

  test('漢字モード：跟讀句顯示漢字＋假名注音（ruby rt 可見）', async ({ page }) => {
    await disableSpeechRecognition(page)
    await gotoApp(page)
    // 開啟漢字モード（設定頁），關閉回今日
    await page.locator('.appHeader h1').click()
    const kanjiBtn = page.locator('.card', { hasText: '漢字モード' }).getByRole('button')
    await kanjiBtn.click()
    await expect(page.locator('.app')).toHaveClass(/kanji-mode/)
    await page.getByRole('button', { name: '返回' }).click()

    await navTo(page, '話す')
    // 前進到有漢字正寫的句（s3：これをください → これを下さい）
    await page.getByRole('button', { name: '次の句 →' }).click()
    await page.getByRole('button', { name: '次の句 →' }).click()
    await expect(page.locator('.card .eyebrow', { hasText: '句' })).toContainText('第 3 /')

    const sent = page.locator('.card .sent').first()
    await expect(sent).toContainText('下')
    await expect(sent.locator('ruby rt').first()).toHaveText('くだ')
  })

  test('生成句審核佇列：未設 Gemini 金鑰時走離線示範（不噴 JSON 錯誤）', async ({ page }) => {
    await disableSpeechRecognition(page)
    await gotoApp(page)
    await navTo(page, '話す')
    await page.getByRole('button', { name: /生成新練習句/ }).click()
    await expect(page.locator('main')).toContainText('練習句審核佇列')

    // 未設定 sidecar → 直接回離線示範候選（降級不中斷），並標示示範
    await page.getByRole('button', { name: /生成 5 句候選/ }).click()
    await expect(page.locator('main')).toContainText('佇列中 5 句待審')
    await expect(page.locator('main')).toContainText('示範候選')
    // 不應出現原本的 JSON 解析錯誤
    await expect(page.locator('.toast')).not.toContainText('is not valid json')
  })
})

// ───────────────────── 跟讀後的即時追問（AI，選配加練） ─────────────────────

function geminiText(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] }
}

async function setKey(page: Page) {
  await page.evaluate(() => localStorage.setItem('nihongo-michi:geminiKey', 'test-key'))
}

test.describe('話す：跟讀＋即時追問', () => {
  test('未設金鑰：只顯示說明，跟讀與自評不受影響（降級不中斷）', async ({ page }) => {
    await disableSpeechRecognition(page)
    await gotoApp(page)
    await navTo(page, '話す')

    await expect(page.locator('main')).toContainText('追問 ─ AI に聞かれる')
    await expect(page.locator('main')).toContainText('填入 Gemini 金鑰')
    await expect(page.getByRole('button', { name: '🤖 追問一句' })).toHaveCount(0)

    // 跟讀自評照常可用
    await page.locator('button.micBtn').click()
    await page.getByRole('button', { name: '◎ 很像' }).click()
    await expect(page.locator('.scoreBig')).toContainText('◎')
  })

  test('有金鑰：AI 追問 → 自己組句回答 → 中文講評＋徽章；換句子後重置', async ({ page }) => {
    let calls = 0
    await page.route('**/generativelanguage.googleapis.com/**', (route) => {
      calls += 1
      // 第 1、3 次是「追問」（JSON），第 2 次是「講評」（純文字）
      const json =
        calls === 2
          ? geminiText('✅ 回答得很自然，助詞也對。')
          : geminiText(`{"jp":"なにが すきですか。","zh":"你喜歡什麼？"}`)
      return route.fulfill({ json })
    })
    await disableSpeechRecognition(page)
    await gotoApp(page)
    await setKey(page)
    await navTo(page, '話す')

    await page.getByRole('button', { name: '🤖 追問一句' }).click()
    await expect(page.locator('.followUpQ')).toContainText('なにが すきですか。', {
      timeout: 10_000,
    })
    await expect(page.locator('main')).toContainText('你喜歡什麼？')
    await expect(page.locator('main')).toContainText('僅供參考')
    await expect(page.locator('main .chip', { hasText: '1 / 3' })).toBeVisible()

    // 自己打日文回答 → 中文講評與解析出的評價徽章
    await page.locator('input[placeholder="用日文回答…"]').fill('みずが すきです。')
    await page.getByRole('button', { name: '送出回答' }).click()
    await expect(page.locator('main')).toContainText('回答得很自然', { timeout: 10_000 })
    await expect(page.locator('main')).toContainText('✅ 表達到了')

    // 臨場組句這件事記入学習記録（選配加練）
    await expect
      .poll(() => activityCount(page, 'followup'), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1)

    // 再追問一句 → 次數累計
    await page.getByRole('button', { name: '再追問一句 →' }).click()
    await expect(page.locator('main .chip', { hasText: '2 / 3' })).toBeVisible({
      timeout: 10_000,
    })

    // 換下一句例句 → 追問區重置（回到「追問一句」按鈕）
    await page.getByRole('button', { name: '次の句 →' }).click()
    await expect(page.getByRole('button', { name: '🤖 追問一句' })).toBeVisible()
    await expect(page.locator('.followUpQ')).toHaveCount(0)

    // 追問屬選配加練：「口」任務仍靠跟讀計數，完全不受影響
    await navTo(page, '今日')
    await expect(taskRow(page, '口の修行').locator('.tprog')).toContainText('0 / 3')
  })

  test('追問可以用說的：辨識結果先填進輸入框，確認後才送出回答', async ({ page }) => {
    let calls = 0
    await page.route('**/generativelanguage.googleapis.com/**', (route) => {
      calls += 1
      const json =
        calls === 1
          ? geminiText(`{"jp":"なにが すきですか。","zh":"你喜歡什麼？"}`)
          : geminiText('✅ 說得很清楚。')
      return route.fulfill({ json })
    })
    // 佇列只給「追問回答」用（跟讀評分不會動到，這個測試不按錄音鈕）
    await fakeSpeechRecognition(page, ['みずが すきです'])
    await gotoApp(page)
    await setKey(page)
    await navTo(page, '話す')

    await page.getByRole('button', { name: '🤖 追問一句' }).click()
    await expect(page.locator('.followUpQ')).toContainText('なにが すきですか。', {
      timeout: 10_000,
    })

    const input = page.locator('input[placeholder="用日文回答…"]')
    await page.getByRole('button', { name: '🎤 用說的' }).click()
    await expect(input).toHaveValue('みずが すきです', { timeout: 10_000 })
    // 只填進輸入框、不自動送出（此時還沒有講評）
    await expect(page.locator('main')).not.toContainText('說得很清楚')

    await page.getByRole('button', { name: '送出回答' }).click()
    await expect(page.locator('main')).toContainText('說得很清楚', { timeout: 10_000 })
  })
})
