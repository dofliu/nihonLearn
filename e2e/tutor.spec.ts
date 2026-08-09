import { test, expect, type Page } from '@playwright/test'
import { gotoApp, fakeSpeechRecognition, disableSpeechRecognition } from './helpers'

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

test.describe('AI 助教 ─ 考我（主動造句）', () => {
  test('未設金鑰也能練：出題 → 看參考答案 → 換一題（降級不中斷）', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: /AI 助教/ }).click()
    await page.getByRole('button', { name: '🎯 考我' }).click()

    // 題目（中文）出現，來源標籤在 chip
    const q = page.locator('.tutorQ')
    await expect(q).toBeVisible()
    const first = (await q.textContent())!.trim()
    expect(first.length).toBeGreaterThan(0)

    // 看參考答案：揭曉已驗證日文；並提示設金鑰可獲得講評
    await page.getByRole('button', { name: '看參考答案' }).click()
    await expect(page.locator('main')).toContainText('教材參考答案（已驗證）')
    await expect(page.locator('main')).toContainText('設定 Gemini 金鑰後')

    // 換一題 → 換成別題、回到作答狀態
    await page.getByRole('button', { name: '換一題 →' }).click()
    await expect(page.locator('main')).not.toContainText('教材參考答案（已驗證）')
    await expect(q).not.toHaveText(first)
  })

  test('有金鑰：作答 → AI 中文講評＋評價徽章，同時揭曉已驗證參考答案', async ({ page }) => {
    await page.route('**/generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({ json: geminiText('✅ 很好，意思完全表達到了。也可以說「これを ください」。') }),
    )
    await gotoApp(page)
    await setKey(page)
    await page.getByRole('button', { name: /AI 助教/ }).click()
    await page.getByRole('button', { name: '🎯 考我' }).click()

    await page.locator('input[placeholder="用日文寫一句…"]').fill('みずを ください。')
    await page.getByRole('button', { name: '送出作答' }).click()

    await expect(page.locator('main')).toContainText('意思完全表達到了', { timeout: 10_000 })
    await expect(page.locator('main')).toContainText('✅ 表達到了') // 解析出的評價徽章
    await expect(page.locator('main')).toContainText('教材參考答案（已驗證）')
    await expect(page.locator('main')).toContainText('講評由 AI 生成、僅供參考')
    await expect(page.locator('main')).toContainText('みずを ください。') // 自己的作答留著對照
  })

  test('題源分頁：只練「固定表現」時，題目與參考答案都來自挨拶・定型句題庫', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: /AI 助教/ }).click()
    await page.getByRole('button', { name: '🎯 考我' }).click()

    await page.getByRole('button', { name: '固定表現', exact: true }).click()

    // 連換幾題都落在固定表現題源（chip 只會是這兩種標籤）
    const tag = page.locator('.card', { has: page.locator('.tutorQ') }).locator('.chip')
    for (let i = 0; i < 4; i++) {
      await expect(tag).toHaveText(/情境表達|即時應答/)
      await page.getByRole('button', { name: '換一題 →' }).click()
    }

    // 無金鑰照樣能練：看參考答案（已驗證的固定表現）
    await page.getByRole('button', { name: '看參考答案' }).click()
    await expect(page.locator('main')).toContainText('教材參考答案（已驗證）')

    // 切回「句型」→ 題源標籤換成句型名（不再是固定表現）
    await page.getByRole('button', { name: '句型', exact: true }).click()
    await expect(tag).not.toHaveText(/情境表達|即時應答/)
    await expect(page.locator('main')).not.toContainText('教材參考答案（已驗證）') // 切題源會重置作答狀態
  })

  test('用說的：辨識結果先填進輸入框，確認後才送出作答', async ({ page }) => {
    await fakeSpeechRecognition(page, ['みずを', 'ください'])
    await gotoApp(page)
    await page.getByRole('button', { name: /AI 助教/ }).click()
    await page.getByRole('button', { name: '🎯 考我' }).click()

    const input = page.locator('input[placeholder="用日文寫一句…"]')
    const mic = page.getByRole('button', { name: '🎤 用說的' })
    await expect(mic).toBeVisible()

    // 說兩次 → 併進輸入框，且尚未揭曉答案（不會代替使用者送出）
    await mic.click()
    await expect(input).toHaveValue('みずを', { timeout: 10_000 })
    await mic.click()
    await expect(input).toHaveValue('みずを ください', { timeout: 10_000 })
    await expect(page.locator('main')).not.toContainText('教材參考答案（已驗證）')

    // 確認後才送出 → 揭曉參考答案，麥克風鈕退場
    await page.getByRole('button', { name: '送出作答' }).click()
    await expect(page.locator('main')).toContainText('教材參考答案（已驗證）')
    await expect(mic).toHaveCount(0)
  })

  test('無語音辨識環境：不顯示麥克風鈕，打字作答照常（降級不中斷）', async ({ page }) => {
    await disableSpeechRecognition(page)
    await gotoApp(page)
    await page.getByRole('button', { name: /AI 助教/ }).click()
    await page.getByRole('button', { name: '🎯 考我' }).click()

    await expect(page.getByRole('button', { name: '🎤 用說的' })).toHaveCount(0)
    await page.locator('input[placeholder="用日文寫一句…"]').fill('みずを ください')
    await page.getByRole('button', { name: '送出作答' }).click()
    await expect(page.locator('main')).toContainText('教材參考答案（已驗證）')
  })
})
