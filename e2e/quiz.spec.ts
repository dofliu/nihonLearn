import { test, expect } from '@playwright/test'
import { gotoApp, seedVocabLearned, seedQuizResult, quizRecords } from './helpers'
import { VOCAB } from '../src/data/vocab'

// 取前 14 個詞當已學詞庫（足夠誘答與四種題型）
const LEARNED = VOCAB.slice(0, 14).map((v) => v.jp)

test.describe('N5 模擬測驗', () => {
  test('從已學詞出題 → 作答 10 題 → 計分、結果持久化', async ({ page }) => {
    await gotoApp(page)
    await seedVocabLearned(page, LEARNED)
    await page.reload()
    await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })

    // 今日頁 → 開啟測驗
    await page.getByRole('button', { name: /N5 模擬測驗/ }).click()
    const home = page.locator('.card', { hasText: '腕試し' })
    await expect(home).toContainText('可出題詞庫')
    await home.getByRole('button', { name: '開始測驗' }).click()

    // 進度條隨題號更新（動畫視覺輔助）
    await expect(page.locator('.progressBar[aria-valuenow="1"]')).toBeVisible()

    // 作答 10 題：選擇題點第一個選項；並べ替え點完所有字塊
    for (let i = 1; i <= 10; i++) {
      const eyebrow = page.locator('.card .eyebrow')
      await expect(eyebrow).toContainText(`${i} / 10`)
      await expect(page.locator('.progressBar')).toHaveAttribute('aria-valuenow', String(i))
      const isListen = (await eyebrow.textContent())?.includes('聞き取り')
      const opts = page.locator('button.qopt')
      const tiles = page.locator('button.qtile')
      if (await opts.count()) {
        await opts.first().click()
        // 作答回饋動畫：正解/錯解各有一個徽章 class（v3.28）
        await expect(page.locator('button.qopt.ok, button.qopt.ng').first()).toBeVisible()
        // 聽力題：答完顯示日文對照（v3.11）
        if (isListen) await expect(page.locator('.card .sent').first()).toBeVisible()
      } else {
        const n = await tiles.count()
        for (let t = 0; t < n; t++) await tiles.nth(t).click()
      }
    }

    // 結果頁：分數與正答率
    const result = page.locator('.card', { hasText: '測驗結果' })
    await expect(result).toBeVisible({ timeout: 10_000 })
    await expect(result).toContainText('/ 10')
    await expect(result).toContainText('正答率')

    // 持久化：quizResults 至少一筆
    const count = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const req = indexedDB.open('nihongo-michi')
          req.onsuccess = () => {
            const db = req.result
            const tx = db.transaction('quizResults', 'readonly')
            const c = tx.objectStore('quizResults').count()
            c.onsuccess = () => {
              db.close()
              resolve(c.result)
            }
            c.onerror = () => reject(c.error)
          }
          req.onerror = () => reject(req.error)
        }),
    )
    expect(count).toBeGreaterThanOrEqual(1)

    // v3.49：這一輪考過哪些詞也要記下來（弱點「答對會退」的判定材料）
    const recs = await quizRecords(page)
    expect(recs[recs.length - 1].askedRefs?.length).toBeGreaterThan(0)

    // 再測一次可重新開始
    await page.getByRole('button', { name: '再測一次' }).click()
    await expect(page.locator('.card .eyebrow').first()).toContainText('1 / 10')
  })


  test('弱點特訓：只考答錯過的詞，連續答對兩次就從清單消失', async ({ page }) => {
    const w1 = VOCAB[3] // ありがとう
    const w2 = VOCAB[6] // さようなら

    await gotoApp(page)
    await seedVocabLearned(page, LEARNED)
    await seedQuizResult(page, [w1.jp, w2.jp], [w1.jp, w2.jp])
    await page.reload()
    await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })

    async function openQuiz() {
      await page.getByRole('button', { name: /N5 模擬測驗/ }).click()
    }
    // 一輪弱點特訓：兩題都答對（第 1 題看題幹判斷是哪個詞，第 2 題必是另一個）
    async function playWeakRound() {
      await page.getByRole('button', { name: /只考弱點（2 詞）/ }).click()
      await expect(page.locator('.card .eyebrow').first()).toContainText('1 / 2')
      const prompt = (await page.locator('.card .sent').first().textContent())?.trim()
      const first = [w1, w2].find((v) => v.jp === prompt)!
      const second = first.jp === w1.jp ? w2 : w1
      const answers = [first.zh, second.zh]
      for (let k = 1; k <= 2; k++) {
        // 等這一題真的換上來（上一題答完會停留一下顯示對錯／日文對照）
        await expect(page.locator('.card .eyebrow').first()).toContainText(`${k} / 2`)
        await expect(page.locator('button.qopt.ok, button.qopt.ng')).toHaveCount(0)
        const opts = page.locator('button.qopt')
        const texts = (await opts.allTextContents()).map((t) => t.trim())
        const i = texts.indexOf(answers[k - 1])
        expect(i).toBeGreaterThanOrEqual(0)
        await opts.nth(i).click()
      }
      const result = page.locator('.card', { hasText: '測驗結果' })
      await expect(result).toBeVisible({ timeout: 10_000 })
      await expect(result).toContainText('2 / 2')
      await page.getByRole('button', { name: '返回' }).click()
    }

    await openQuiz()
    const weakCard = page.locator('.card', { hasText: '弱點分析' })
    await expect(weakCard).toContainText(w1.zh)
    await expect(weakCard).toContainText(w2.zh)
    await expect(weakCard).toContainText(`連續答對 2 次就會消失`)

    // 第一輪全對 → 連對 1 次，還不算克服，仍留在清單
    await playWeakRound()
    await openQuiz()
    await expect(page.locator('.card', { hasText: '弱點分析' })).toContainText(w1.zh)

    // 第二輪全對 → 克服，弱點卡消失、改成「已克服 2 詞」
    await playWeakRound()
    await openQuiz()
    await expect(page.locator('.card', { hasText: '弱點分析' })).toHaveCount(0)
    await expect(page.locator('.statChips .chip', { hasText: '已克服' })).toContainText('2')
  })

  test('一般測驗：答錯過的詞優先出題', async ({ page }) => {
    const weak = VOCAB[5] // ごめんなさい
    await gotoApp(page)
    await seedVocabLearned(page, LEARNED)
    await seedQuizResult(page, [weak.jp], [weak.jp])
    await page.reload()
    await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })

    await page.getByRole('button', { name: /N5 模擬測驗/ }).click()
    const home = page.locator('.card', { hasText: '腕試し' })
    await expect(home).toContainText('答錯過的詞會優先出題')
    await home.getByRole('button', { name: '開始測驗' }).click()

    // 第 1 題（意味を選ぶ）題幹就是那個弱點詞
    await expect(page.locator('.card .eyebrow').first()).toContainText('1 / 10')
    await expect(page.locator('.card .sent').first()).toHaveText(weak.jp)
  })

  test('已學詞不足 4 個：提示先學詞、無法開始', async ({ page }) => {
    await gotoApp(page)
    await seedVocabLearned(page, VOCAB.slice(0, 2).map((v) => v.jp))
    await page.reload()
    await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })

    await page.getByRole('button', { name: /N5 模擬測驗/ }).click()
    await expect(page.getByRole('button', { name: /先學會 4 個詞/ })).toBeDisabled()
  })
})
