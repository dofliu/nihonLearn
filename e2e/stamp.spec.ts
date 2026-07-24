import { test, expect } from '@playwright/test'
import {
  gotoApp,
  navTo,
  disableSpeechRecognition,
  completeKanaRound,
  completeVocabRound,
  completeListenRound,
  completeSpeakSelf,
  completeRead,
  taskRow,
  openExtra,
} from './helpers'

/**
 * 黃金路徑（CLAUDE.md A-4）：一天內完成五項修行 → 自動蓋章、
 * 大印 overlay 動畫、蓋章卡標記、streak 從 0 → 1。
 */

test('五項修行全完成 → 蓋章、大印動畫、streak +1', async ({ page }) => {
  test.setTimeout(180_000)
  await disableSpeechRecognition(page)
  await gotoApp(page)

  // 1. 字の修行（10）
  await completeKanaRound(page)
  // 2. ことば（5，做完整輪封頂）
  await completeVocabRound(page)
  // 3. 耳の修行（5 題）
  await completeListenRound(page)
  // 4. 口の修行（自評 3 次）
  await completeSpeakSelf(page, 3)

  // 前四項完成、尚未蓋章
  await navTo(page, '今日')
  for (const kw of ['字の修行', 'ことば', '耳の修行', '口の修行']) {
    await expect(taskRow(page, kw)).toHaveClass(/done/)
  }
  await expect(taskRow(page, '読む修行')).not.toHaveClass(/done/)
  await expect(page.locator('.stampCell.hit')).toHaveCount(0)

  // 5. 読む修行（最後一項）→ 觸發蓋章
  await completeRead(page)

  // 大印 overlay 出現（2.6 秒內可見），顯示「済」與日期
  const stamp = page.locator('.bigStamp')
  await expect(stamp).toBeVisible()
  await expect(stamp).toContainText('済')
  const d = new Date()
  await expect(stamp).toContainText(`${d.getMonth() + 1}／${d.getDate()}`)
  // 蓋章當下尚未加練 → 大印為一般朱印（非金）
  await expect(stamp.locator('.inner.gold')).toHaveCount(0)
  // 點擊可提前關閉
  await stamp.click()
  await expect(stamp).toBeHidden()

  // 今日頁：五項全 済、今日格已蓋章、streak 1
  await navTo(page, '今日')
  await expect(page.locator('.task.done')).toHaveCount(5)
  await expect(page.locator('.stampCell.today.hit')).toHaveCount(1)
  await expect(page.locator('.streakBadge')).toContainText('連続 1 日')

  // 金印：只完成核心五項、尚未加練 → 済印非金
  await expect(page.locator('.stampCell.today .hanko.gold')).toHaveCount(0)
  // 做一項選配加練（文型ドリル 回想テスト・看答案即記入）→ 済印變金
  await openExtra(page, /文型ドリル/)
  await page.getByRole('button', { name: /回想テスト/ }).click()
  await page.getByRole('button', { name: /看答案/ }).click()
  await page.getByRole('button', { name: /返回/ }).click()
  await expect(page.locator('.stampCell.today .hanko.gold')).toHaveCount(1)

  // 重整後蓋章、streak、金印保留
  await page.reload()
  await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })
  await expect(page.locator('.stampCell.today.hit')).toHaveCount(1)
  await expect(page.locator('.stampCell.today .hanko.gold')).toHaveCount(1)
  await expect(page.locator('.streakBadge')).toContainText('連続 1 日')
})

/**
 * 金印大印：若「蓋章前」已做過任一加練，完成核心五項當下的大印 overlay
 * 應同步升為金印（済＋金印字樣、.inner.gold）。
 */
test('蓋章前已加練 → 大印 overlay 同步金印', async ({ page }) => {
  test.setTimeout(180_000)
  await disableSpeechRecognition(page)
  await gotoApp(page)

  // 先做一項加練（文型ドリル 回想テスト → 看答案 即記入 pattern 活動）
  await openExtra(page, /文型ドリル/)
  await page.getByRole('button', { name: /回想テスト/ }).click()
  await page.getByRole('button', { name: /看答案/ }).click()
  await page.getByRole('button', { name: /返回/ }).click()

  // 再完成核心五項 → 蓋章當下大印即為金印
  await completeKanaRound(page)
  await completeVocabRound(page)
  await completeListenRound(page)
  await completeSpeakSelf(page, 3)
  await completeRead(page)

  const stamp = page.locator('.bigStamp')
  await expect(stamp).toBeVisible()
  await expect(stamp.locator('.inner.gold')).toBeVisible()
  await expect(stamp).toContainText('金印')
})
