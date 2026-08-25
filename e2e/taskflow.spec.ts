import { test, expect } from '@playwright/test'
import { gotoApp, navTo, completeKanaRound, completeListenRound } from './helpers'

/**
 * 修行動線（v3.48）：核心五項散在四個分頁，過去每完成一項都得自己回「今日」頁
 * 再點一次「前往」。某項剛達標時應出現提示條，一鍵直接前往下一項。
 */

test('某項修行達標 → 動線提示條指向下一項，點了直接前往', async ({ page }) => {
  test.setTimeout(120_000)
  await gotoApp(page)

  await completeKanaRound(page)

  const bar = page.locator('.nextUp')
  await expect(bar).toBeVisible()
  await expect(bar).toContainText('字の修行 完成')
  // 五項中剛完成一項 → 還差 4 項
  await expect(bar).toContainText('還差 4 項')

  // 下一項是「ことば」（在 読む 分頁）
  const go = bar.getByRole('button', { name: /次は/ })
  await expect(go).toContainText('ことば')
  await go.click()

  await expect(page.locator('nav.nav button.on')).toContainText('読む')
  await expect(bar).toHaveCount(0)
})

test('動線提示條可按 ✕ 收起；換分頁也會自動收起', async ({ page }) => {
  test.setTimeout(120_000)
  await gotoApp(page)

  await completeKanaRound(page)
  const bar = page.locator('.nextUp')
  await expect(bar).toBeVisible()
  await bar.getByRole('button', { name: '收起提示' }).click()
  await expect(bar).toHaveCount(0)

  // 再完成一項（耳の修行）→ 提示條重新出現，指向還沒做的項目
  await completeListenRound(page)
  await expect(bar).toBeVisible()
  await expect(bar).toContainText('耳の修行 完成')
  await expect(bar).toContainText('還差 3 項')

  // 自己換分頁 → 提示條收起（動線已由使用者決定）
  await navTo(page, '今日')
  await expect(bar).toHaveCount(0)
})
