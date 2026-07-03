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
  // 點擊可提前關閉
  await stamp.click()
  await expect(stamp).toBeHidden()

  // 今日頁：五項全 済、今日格已蓋章、streak 1
  await navTo(page, '今日')
  await expect(page.locator('.task.done')).toHaveCount(5)
  await expect(page.locator('.stampCell.today.hit')).toHaveCount(1)
  await expect(page.locator('.streakBadge')).toContainText('連続 1 日')

  // 重整後蓋章與 streak 保留
  await page.reload()
  await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })
  await expect(page.locator('.stampCell.today.hit')).toHaveCount(1)
  await expect(page.locator('.streakBadge')).toContainText('連続 1 日')
})
