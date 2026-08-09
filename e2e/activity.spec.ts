import { test, expect, type Page } from '@playwright/test'
import { gotoApp, navTo, activityCount, openExtra } from './helpers'

function geminiText(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] }
}

async function setKey(page: Page) {
  await page.evaluate(() => localStorage.setItem('nihongo-michi:geminiKey', 'test-key'))
}

test.describe('學習活動記錄與統計', () => {
  test('書寫後：activityLog 記錄、今日+α 打勾、統計頁顯示練習日曆', async ({ page }) => {
    await gotoApp(page)
    await navTo(page, 'かな')
    await page.getByRole('button', { name: /書寫練習/ }).click()

    // 畫一筆並評分 → 記一次 write 活動
    const canvas = page.locator('canvas.writeCanvas')
    const box = (await canvas.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8, { steps: 8 })
    await page.mouse.up()
    await page.getByRole('button', { name: '評分', exact: true }).click()
    await expect(page.locator('.scoreBig')).toBeVisible()

    // activityLog 有 write 列
    expect(await activityCount(page, 'write')).toBeGreaterThanOrEqual(1)

    // 今日頁 加練 卡：展開全部加練後，書寫已打勾
    await navTo(page, '今日')
    await expect(page.locator('main')).toContainText('今日の加練')
    await page.getByRole('button', { name: /全部加練/ }).click()
    await expect(page.getByRole('button', { name: /✓.*書寫練習/ })).toBeVisible()

    // 統計頁：學習記録 / 練習日曆 / 各項目累計
    await page.getByRole('button', { name: /發音の成長曲線/ }).click()
    await expect(page.locator('main')).toContainText('学習記録')
    await expect(page.locator('main')).toContainText('練習日曆')
    await expect(page.locator('main')).toContainText('各項目累計次數')
    // 書寫項目出現在累計條
    await expect(page.locator('.featRow', { hasText: '書寫' })).toBeVisible()
    // 日曆格數 = 70
    await expect(page.locator('.heatGrid .heatCell')).toHaveCount(70)
  })

  test('AI 互動練習（自由対話）：記入学習記録、今日+α 打勾、統計頁分組計數', async ({ page }) => {
    await page.route('**/generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({
        json: geminiText(
          JSON.stringify({ jp: 'はい、どうぞ。', zh: '好的，請。', hint: '說得很自然！' }),
        ),
      }),
    )
    await gotoApp(page)
    await setKey(page)

    // 今日頁「全部加練」→ 🗣 自由対話，直接落在 話す▸会話 分頁
    // （用 openExtra：輪替到自由対話的那幾天，主推鈕與展開清單會同時出現同名鈕）
    await openExtra(page, /🗣.*自由対話/)
    await expect(page.locator('main')).toContainText('情境對話引導')

    // 進自由対話、聊一回合
    await page.getByRole('button', { name: '試す ▶' }).click()
    await page.getByRole('button', { name: '話す ▶' }).first().click()
    await page.locator('input[placeholder="用日文回一句…"]').fill('おにぎりを ください。')
    await page.getByRole('button', { name: '送る' }).click()
    await expect(page.locator('main')).toContainText('はい、どうぞ。', { timeout: 10_000 })

    // 練習本身記入 activityLog（AI 的台詞不入庫，但練了就算數）
    await expect.poll(() => activityCount(page, 'roleplay'), { timeout: 10_000 }).toBeGreaterThanOrEqual(1)

    // 今日頁：自由対話已打勾
    await navTo(page, '今日')
    await page.getByRole('button', { name: /全部加練/ }).click()
    await expect(page.getByRole('button', { name: /✓.*自由対話/ }).first()).toBeVisible()

    // 統計頁：出現「自由対話」累計條與 AI 互動練習分組 chip
    await page.getByRole('button', { name: /發音の成長曲線/ }).click()
    await expect(page.locator('.featRow', { hasText: '自由対話' })).toBeVisible()
    await expect(page.locator('.statChips .chip', { hasText: 'AI 互動練習' })).toBeVisible()
    await expect(page.locator('.statChips .chip', { hasText: '核心' })).toBeVisible()
  })

  test('助教「考我」作答：記入学習記録（無金鑰也記），且不影響每日五修行計數', async ({ page }) => {
    await gotoApp(page)

    // 無金鑰也能練「考我」：出題 → 自己作答 → 揭曉參考答案
    await page.getByRole('button', { name: /AI 助教/ }).click()
    await page.getByRole('button', { name: '🎯 考我' }).click()
    await page.locator('input[placeholder="用日文寫一句…"]').fill('これを ください。')
    await page.getByRole('button', { name: '送出作答' }).click()
    await expect(page.locator('main')).toContainText('教材參考答案（已驗證）')

    await expect
      .poll(() => activityCount(page, 'tutor'), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1)

    // 選配加練：不會被算進核心五修行（口の修行仍是 0 / 3、今日未蓋章）
    await page.getByRole('button', { name: '返回' }).click()
    await expect(
      page.locator('.task', { hasText: '口の修行' }).locator('.tprog'),
    ).toContainText('0 / 3')
    await expect(page.locator('.stampCell.today .hanko')).toHaveCount(0)
  })
})
