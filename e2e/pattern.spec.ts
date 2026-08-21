import { test, expect, type Page } from '@playwright/test'
import { gotoApp, openExtra, fakeSpeechRecognition } from './helpers'

function geminiText(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] }
}

/** 開啟文型ドリル的「請給我〜」句型 → 自由造句模式 */
async function openCompose(page: Page) {
  await openExtra(page, /文型ドリル/)
  await page.locator('.patGrid .passBtn', { hasText: '請給我〜' }).click()
  await page.getByRole('button', { name: /自由造句/ }).click()
}

test.describe('文型ドリル（句型練習）', () => {
  test('今日頁入口 → 選句型、換單字、日文對照顯示', async ({ page }) => {
    await gotoApp(page)

    // 今日頁「今日の文型」卡的開始鈕
    await page.getByRole('button', { name: /開始練習/ }).click()

    // 進入文型ドリル：標題與句型選單
    await expect(page.locator('main')).toContainText('句型練習')
    await expect(page.locator('main')).toContainText('請給我〜')

    // 選「請給我〜」句型
    await page.locator('.patGrid .passBtn', { hasText: '請給我〜' }).click()
    await expect(page.locator('.sentZh')).toContainText('請給我')

    // 記下目前例句，換一個單字後應變化
    const first = await page.locator('.sent').innerText()
    await page.getByRole('button', { name: /換一個單字/ }).click()
    await expect(page.locator('.sent')).not.toHaveText(first)

    // 填入的單字提示存在
    await expect(page.locator('.slotWord')).toContainText('填入的單字')

    // 返回
    await page.getByRole('button', { name: /返回/ }).click()
    await expect(page.locator('main')).toContainText('今日の修行')
  })

  test('+α 列亦可開啟文型ドリル', async ({ page }) => {
    await gotoApp(page)
    await openExtra(page, /文型ドリル/)
    await expect(page.locator('main')).toContainText('選一個句型')
    // 切到「〜在哪裡？」句型
    await page.locator('.patGrid .passBtn', { hasText: '在哪裡' }).click()
    await expect(page.locator('.sentZh')).toContainText('在哪裡')
  })

  test('回想テスト：一輪制 → 自評 → 結算可只練沒說對的', async ({ page }) => {
    await gotoApp(page)
    await openExtra(page, /文型ドリル/)
    await page.locator('.patGrid .passBtn', { hasText: '請給我〜' }).click()

    // 切到回想模式：一輪固定題數，進度條從 0 開始
    await page.getByRole('button', { name: /回想テスト/ }).click()
    const bar = page.locator('[role="progressbar"]')
    await expect(bar).toHaveAttribute('aria-valuenow', '0')
    const total = Number(await bar.getAttribute('aria-valuemax'))
    expect(total).toBeGreaterThan(1)

    // 中文題目出現、日文答案先隱藏
    await expect(page.locator('.recallZh')).toContainText('請給我')
    await expect(page.locator('.sent')).toHaveCount(0)

    // 第 1 題：看答案 → 自評「再一次」（結算時要能被挑出來重練）
    await page.getByRole('button', { name: /看答案/ }).click()
    await expect(page.locator('.sent')).toBeVisible()
    const first = await page.locator('.recallZh').innerText()
    await page.getByRole('button', { name: /再一次/ }).click()
    await expect(page.locator('.sent')).toHaveCount(0)
    await expect(page.locator('.recallZh')).not.toHaveText(first)
    await expect(bar).toHaveAttribute('aria-valuenow', '1')
    await expect(page.locator('main')).toContainText('說對')

    // 其餘題目全部自評「說對了」→ 進結算
    for (let i = 1; i < total; i++) {
      await page.getByRole('button', { name: /看答案/ }).click()
      await page.getByRole('button', { name: /說對了/ }).click()
    }
    await expect(page.locator('.recallZh')).toContainText(`說對 ${total - 1} / ${total}`)
    await expect(page.locator('main')).toContainText('還沒說順的句子')
    await expect(page.locator('main')).toContainText('不是系統評分')
    await expect(bar).toHaveAttribute('aria-valuenow', String(total))

    // 只練沒說對的 → 新的一輪只剩那 1 題
    await page.getByRole('button', { name: /只練沒說對的（1 句）/ }).click()
    await expect(bar).toHaveAttribute('aria-valuemax', '1')
    await expect(page.locator('.recallZh')).toHaveText(first)

    // 說對 → 結算全對，不再出現「只練沒說對的」
    await page.getByRole('button', { name: /看答案/ }).click()
    await page.getByRole('button', { name: /說對了/ }).click()
    await expect(page.locator('.recallZh')).toContainText('說對 1 / 1')
    await expect(page.getByRole('button', { name: /只練沒說對的/ })).toHaveCount(0)
    await expect(page.locator('main')).toContainText('整輪都說對了')

    // 再來一輪 → 回到整個詞池
    await page.getByRole('button', { name: /再來一輪/ }).click()
    await expect(bar).toHaveAttribute('aria-valuemax', String(total))
    await expect(bar).toHaveAttribute('aria-valuenow', '0')
  })
})

test.describe('文型ドリル ─ 自由造句', () => {
  test('無金鑰：程式檢核照樣給回饋（句型對／不對兩種情況）', async ({ page }) => {
    await gotoApp(page)
    await openCompose(page)

    // 沒有金鑰時提示可去設定，但練習照常
    await expect(page.locator('main')).toContainText('沒有金鑰也能練')

    // 用錯句型 → 接續檢核不通過
    await page.locator('input[placeholder*="造句"]').fill('みずです')
    await page.getByRole('button', { name: '送出' }).click()
    await expect(page.locator('.composeCk .ckLine').first()).toHaveClass(/ng/)
    await expect(page.locator('.composeCk')).toContainText('接續')

    // 再造一句 → 檢核區清空
    await page.getByRole('button', { name: /再造一句/ }).click()
    await expect(page.locator('.composeCk')).toHaveCount(0)

    // 正確造句 → 兩行檢核皆通過，並認出填入的詞
    await page.locator('input[placeholder*="造句"]').fill('みずを ください')
    await page.getByRole('button', { name: '送出' }).click()
    await expect(page.locator('.composeCk .ckLine').first()).toHaveClass(/ok/)
    await expect(page.locator('.composeCk .ckLine').nth(1)).toContainText('みず')
    await expect(page.locator('main')).toContainText('已記入学習記録')
  })

  test('有金鑰：送出後除了程式檢核，還有中文講評＋徽章與免責提示', async ({ page }) => {
    await page.route('**/generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({ json: geminiText('✅ 句型用得很好，助詞「を」也正確。') }),
    )
    await gotoApp(page)
    await page.evaluate(() => localStorage.setItem('nihongo-michi:geminiKey', 'test-key'))
    await openCompose(page)
    await expect(page.locator('main')).not.toContainText('沒有金鑰也能練')

    await page.locator('input[placeholder*="造句"]').fill('コーヒーを ください')
    await page.getByRole('button', { name: '送出' }).click()

    await expect(page.locator('.composeCk .ckLine').first()).toHaveClass(/ok/)
    await expect(page.locator('main')).toContainText('助詞「を」也正確', { timeout: 10_000 })
    await expect(page.locator('main')).toContainText('✅ 表達到了')
    await expect(page.locator('main')).toContainText('僅供參考')
  })

  test('用說的：辨識結果先填進輸入框，確認後才送出檢核', async ({ page }) => {
    await fakeSpeechRecognition(page, ['みずを', 'ください'])
    await gotoApp(page)
    await openCompose(page)

    const input = page.locator('input[placeholder*="造句"]')
    const mic = page.getByRole('button', { name: '🎤 用說的' })
    await expect(mic).toBeVisible()

    // 說兩次 → 併進輸入框，且尚未送出檢核
    await mic.click()
    await expect(input).toHaveValue('みずを', { timeout: 10_000 })
    await mic.click()
    await expect(input).toHaveValue('みずを ください', { timeout: 10_000 })
    await expect(page.locator('.composeCk')).toHaveCount(0)

    // 確認後才送出 → 程式檢核通過（無金鑰也有回饋），麥克風鈕退場
    await page.getByRole('button', { name: '送出' }).click()
    await expect(page.locator('.composeCk .ckLine').first()).toHaveClass(/ok/)
    await expect(page.locator('.composeCk .ckLine').nth(1)).toContainText('みず')
    await expect(mic).toHaveCount(0)
  })
})
