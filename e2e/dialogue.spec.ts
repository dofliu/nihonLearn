import { test, expect, type Page } from '@playwright/test'
import { gotoApp, navTo, taskRow } from './helpers'

/**
 * 会話（情境對話引導）：預設「📖 看稿」與新的「🎯 暗記モード」。
 * 暗記モード把輪到你的句子遮起來（只看中文自己說），走完結算「幾句沒看稿」。
 * 統計的是有沒有看稿、不是評分——結算畫面要講清楚這件事。
 */

/** 進入話す▸会話並開始第一段對話（8 句、其中 4 句輪到你） */
async function openDialogue(page: Page) {
  await navTo(page, '話す')
  await page.locator('.lvTabs button', { hasText: '会話' }).click()
  await page.getByRole('button', { name: '開始 ▶' }).first().click()
}

test.describe('会話：暗記モード', () => {
  test('遮起來自己說 → 看稿一次 → 走完結算「幾句沒看稿」', async ({ page }) => {
    await gotoApp(page)
    await openDialogue(page)

    // 進度條隨句號前進（v3.28 的共用 ProgressBar，這次補到会話）
    const bar = page.locator('.progressBar')
    await expect(bar).toHaveAttribute('aria-valuenow', '1')
    await expect(bar).toHaveAttribute('aria-valuemax', '8')

    await page.getByRole('button', { name: '🎯 暗記モード' }).click()
    await expect(page.getByText('輪到你的句子會遮起來')).toBeVisible()

    const nextA = page.getByRole('button', { name: 'つぎへ ▶', exact: true })
    const nextMine = page.getByRole('button', { name: '言えた、つぎへ ▶' })
    const nextRead = page.getByRole('button', { name: '唸完了，下一句 ▶' })
    const look = page.getByRole('button', { name: '👀 看稿' })
    const again = page.getByRole('button', { name: '再來一次' })
    const curJp = page.locator('.dlgBubble.now .dlgJp')
    const bubbles = page.locator('.dlgBubble')

    let revealedOnce = false
    for (let i = 0; i < 20; i++) {
      if (await again.isVisible().catch(() => false)) break
      await expect(nextA.or(nextMine).or(again)).toBeVisible({ timeout: 15_000 })
      if (await again.isVisible().catch(() => false)) break
      const before = await bubbles.count()

      if (await nextA.isVisible().catch(() => false)) {
        await nextA.click({ timeout: 15_000 })
      } else if (!revealedOnce) {
        // 輪到我的第一句：應該是遮起來的（看得到 ・，看不到假名）
        await expect(curJp).toContainText('・')
        await expect(curJp).not.toContainText(/[ぁ-んァ-ヶ]/)
        // 說不出來 → 按「看稿」：真正的日文出現、鈕換成「聽手本／唸完了」
        await look.click()
        await expect(curJp).toContainText(/[ぁ-ん]/)
        await expect(page.getByRole('button', { name: '🔊 聽手本（慢速）' })).toBeVisible()
        revealedOnce = true
        await nextRead.click({ timeout: 15_000 })
      } else {
        // 其餘三句都自己說出來（不看稿）
        await expect(curJp).toContainText('・')
        await nextMine.click({ timeout: 15_000 })
      }

      await expect
        .poll(
          async () =>
            (await again.isVisible().catch(() => false)) || (await bubbles.count()) > before,
          { timeout: 15_000 },
        )
        .toBe(true)
    }

    await expect(again).toBeVisible({ timeout: 15_000 })
    await expect(bar).toHaveAttribute('aria-valuenow', '8')

    // 結算：輪到我 4 句、看了 1 句稿 → 3 句沒看稿，並列出看了稿的那一句
    const sum = page.locator('.composeCk')
    await expect(sum).toContainText('輪到你 4 句')
    await expect(sum).toContainText('3 句沒看稿')
    await expect(sum).toContainText('有 1 句看了稿')
    await expect(sum.locator('.slotWord')).toHaveCount(1)
    // 誠實文案：這是「有沒有看稿」的統計，不是評分
    await expect(sum).toContainText('評估你說得對不對')

    // 走完後每一句都看得到日文（可以對答案）
    await expect(page.locator('.dlgBox')).not.toContainText('・')

    // 每日「口」任務照舊計數（暗記モード不動核心門檻）
    await navTo(page, '今日')
    await expect(taskRow(page, '口の修行')).toContainText('3 / 3')
  })

  test('預設是看稿模式：句子照常顯示、走完不出現暗記結算', async ({ page }) => {
    await gotoApp(page)
    await openDialogue(page)

    // 一開始就看得到日文（沒有遮罩）
    await expect(page.locator('.dlgBubble.now .dlgJp')).toContainText(/[ぁ-んァ-ヶ]/)
    await expect(page.locator('.dlgBox')).not.toContainText('・')

    const next = page
      .getByRole('button', { name: 'つぎへ ▶', exact: true })
      .or(page.getByRole('button', { name: '唸完了，下一句 ▶' }))
    const again = page.getByRole('button', { name: '再來一次' })
    const bubbles = page.locator('.dlgBubble')

    for (let i = 0; i < 20; i++) {
      if (await again.isVisible().catch(() => false)) break
      const before = await bubbles.count()
      await expect(next.or(again)).toBeVisible({ timeout: 15_000 })
      if (await again.isVisible().catch(() => false)) break
      await next.click({ timeout: 15_000 })
      await expect
        .poll(
          async () =>
            (await again.isVisible().catch(() => false)) || (await bubbles.count()) > before,
          { timeout: 15_000 },
        )
        .toBe(true)
    }

    await expect(again).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.composeCk')).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText('句沒看稿')
  })
})
