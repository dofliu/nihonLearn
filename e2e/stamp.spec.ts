import { test, expect } from '@playwright/test'
import {
  gotoApp,
  navTo,
  localDateStr,
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

/**
 * 金印（純獎勵，不動蓋章門檻）：核心全達標＝一般済印；當天再做任一加練＝金印。
 * 直接播種兩個過去日的蓋章＋活動記錄，驗證金印只落在「有加練」的那天。
 */
test('金印：蓋章日有加練＝金印，只核心＝一般済印', async ({ page }) => {
  await gotoApp(page)
  const goldDay = localDateStr(-1) // 蓋章 + 加練（write）→ 金印
  const plainDay = localDateStr(-2) // 只蓋章 → 一般済印

  await page.evaluate(async ([gd, pd]) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('nihongo-michi')
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(['stamps', 'activityLog'], 'readwrite')
        tx.objectStore('stamps').put({ date: gd, complete: true })
        tx.objectStore('stamps').put({ date: pd, complete: true })
        tx.objectStore('activityLog').add({ day: gd, feature: 'write', count: 2, ts: Date.now() })
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })
  }, [goldDay, plainDay])

  await page.reload()
  await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })

  // 兩天都蓋章，只有「有加練」那天是金印
  await expect(page.locator('.stampCell .hanko')).toHaveCount(2)
  await expect(page.locator('.stampCell .hanko.gold')).toHaveCount(1)
  const [, gm, gdd] = goldDay.split('-')
  await expect(
    page.locator('.stampCell', { hasText: `${Number(gm)}/${Number(gdd)}` }).locator('.hanko.gold'),
  ).toHaveCount(1)
})
