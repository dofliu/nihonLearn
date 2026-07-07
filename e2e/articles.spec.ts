import { test, expect, type Page } from '@playwright/test'
import { gotoApp, navTo } from './helpers'

/**
 * v3.1 內容彈性化：
 * 1. NHK Easy 文章導入（sidecar API 用 page.route 攔截，不需真 sidecar）——
 *    列表 → 預覽（注音 ruby＋中文對照＋生詞）→ 採用 → 入庫持久化 → 閱讀 → 刪除。
 * 2. 生成句審核佇列持久化——候選離開頁面不消失，採用/退回各自出佇列。
 */

const ART = {
  id: 'ne2026070411111',
  title: '<ruby>台風<rt>たいふう</rt></ruby>が<ruby>来<rt>く</rt></ruby>る',
  title_read: 'たいふうがくる',
  lines: [
    { jp: '<ruby>日本<rt>にほん</rt></ruby>に<ruby>台風<rt>たいふう</rt></ruby>が<ruby>来<rt>き</rt></ruby>ます。', read: 'にほんにたいふうがきます。' },
    { jp: 'みなさん、<ruby>気<rt>き</rt></ruby>をつけてください。', read: 'みなさん、きをつけてください。' },
    { jp: '<ruby>雨<rt>あめ</rt></ruby>が たくさん <ruby>降<rt>ふ</rt></ruby>ります。', read: 'あめが たくさん ふります。' },
    { jp: '<ruby>風<rt>かぜ</rt></ruby>も つよく なります。', read: 'かぜも つよく なります。' },
  ],
}

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

async function stubArticleApis(page: Page) {
  // NHK 抓取＋注音仍走 sidecar
  await page.route('**/api/article/list', (route) =>
    route.fulfill({
      json: { articles: [{ id: ART.id, title: '台風が来る', date: '2026-07-04' }] },
    }),
  )
  await page.route('**/api/article/get*', (route) =>
    route.fulfill({ json: { source: 'nhk', needs_review: true, ...ART } }),
  )
  // 中文對照改由 Gemini 直連
  await page.route('**/generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({
      json: geminiJson({
        title_zh: '颱風要來了',
        zh: ['颱風要來日本了。', '大家請小心。', '會下很多雨。', '風也會變強。'],
        new_words: [{ jp: '台風', read: 'たいふう', zh: '颱風' }],
      }),
    }),
  )
}

test.describe('NHK 文章導入', () => {
  test('列表 → 審核預覽 → 採用 → 持久化 → 閱讀 → 刪除', async ({ page }) => {
    await stubArticleApis(page)
    await gotoApp(page)
    await setGeminiKey(page)
    await navTo(page, '読む')

    // 取列表、挑一篇
    await page.getByRole('button', { name: /取得最新ニュース/ }).click()
    await page.locator('.wordRow', { hasText: '台風が来る' }).click()

    // 審核預覽：中文標題、來源標記、NHK 注音（ruby）、生詞
    const preview = page.locator('.card', { hasText: '審核 ─ 採用後才進書庫' })
    await expect(preview).toContainText('颱風要來了')
    await expect(preview).toContainText('NHK Easy')
    await expect(preview.locator('ruby').first()).toBeVisible()
    await expect(preview).toContainText('生詞 台風')

    // 採用 → 進「わたしの読み物」
    await preview.getByRole('button', { name: '採用 ✓' }).click()
    await expect(page.locator('.toast')).toContainText('已加入')
    const mine = page.locator('.card', { hasText: 'わたしの読み物' })
    await expect(mine).toContainText('台風')

    // 重整（不再 stub）→ 仍在（Dexie userPassages 持久化）
    await page.reload()
    await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })
    await navTo(page, '読む')
    const mine2 = page.locator('.card', { hasText: 'わたしの読み物' })
    await expect(mine2).toContainText('台風')

    // 開啟閱讀：4 句、點句展開中文、読了可按
    await mine2.locator('.wj', { hasText: '台風' }).click()
    const reader = page.locator('.card', { hasText: '読了' })
    await expect(reader.locator('.rline')).toHaveCount(4)
    await reader.locator('.rline').first().click()
    await expect(reader.locator('.rline').first()).toHaveClass(/open/)
    await expect(reader.locator('.rline').first()).toContainText('颱風要來日本了')
    await reader.getByRole('button', { name: '読了 ✓' }).click()
    await expect(page.locator('.toast')).toContainText('読了の印')

    // 刪除 → 書庫清空
    await mine2.locator('.wz', { hasText: '刪除' }).click()
    await expect(page.locator('.card', { hasText: 'わたしの読み物' })).toHaveCount(0)
  })
})

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
