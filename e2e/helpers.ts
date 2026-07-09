import { expect, type Page } from '@playwright/test'

/** 與 src/lib/date.ts 的 todayStr 相同：本地時區 YYYY-MM-DD */
export function localDateStr(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  )
}

/** 進入 app 並等待 bootstrap 完成（読み込み中 消失） */
export async function gotoApp(page: Page) {
  await page.goto('/')
  await expect(page.locator('.appHeader h1')).toContainText('日本語の道')
  await expect(page.locator('main')).not.toContainText('読み込み中', { timeout: 15_000 })
}

export type NavLabel = '今日' | 'かな' | '聴く' | '話す' | '読む'

export async function navTo(page: Page, label: NavLabel) {
  await page.locator('nav.nav button', { hasText: label }).click()
}

/** 話す頁降級測試用：載入前移除瀏覽器語音辨識 API，強制走「自評」路徑 */
export async function disableSpeechRecognition(page: Page) {
  await page.addInitScript(() => {
    // @ts-expect-error 測試環境刻意移除
    delete window.SpeechRecognition
    // @ts-expect-error 測試環境刻意移除
    delete window.webkitSpeechRecognition
  })
}

/** 完成一整輪假名 SRS（全部按「記得」），結束回到道場首頁 */
export async function completeKanaRound(page: Page) {
  await navTo(page, 'かな')
  const home = page.getByRole('button', { name: '開始今日修行' })
  await home.click()
  const flip = page.getByRole('button', { name: /答えを見る/ })
  for (let i = 0; i < 40; i++) {
    await expect(flip.or(home)).toBeVisible()
    if (await home.isVisible()) return
    await flip.click()
    await page.locator('.gradeRow .g2').click() // 記得
  }
  throw new Error('kana round did not finish within 40 cards')
}

/**
 * 預埋「已學假名」卡片（詞彙解鎖用）。需在 gotoApp 之後呼叫（DB 已建立），
 * 之後 reload 讓 VocabCard 重讀。fsrs 用最小合法值，只有 refId 影響解鎖。
 */
export async function seedKanaLearned(page: Page, refIds: string[]) {
  await page.evaluate(async (ids) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('nihongo-michi')
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('cards', 'readwrite')
        const store = tx.objectStore('cards')
        for (const id of ids) {
          store.put({
            id: 'kana:' + id,
            type: 'kana',
            refId: id,
            fsrs: {
              due: new Date(Date.now() + 3 * 86400000),
              stability: 5,
              difficulty: 5,
              elapsed_days: 0,
              scheduled_days: 3,
              reps: 2,
              lapses: 0,
              state: 2,
              last_review: new Date(),
            },
          })
        }
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })
  }, refIds)
}

/** 預埋「已學詞彙」卡片（refId = vocab.jp）。需在 gotoApp 之後呼叫，之後 reload。 */
export async function seedVocabLearned(page: Page, refIds: string[]) {
  await page.evaluate(async (ids) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('nihongo-michi')
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('cards', 'readwrite')
        const store = tx.objectStore('cards')
        for (const id of ids) {
          store.put({
            id: 'vocab:' + id,
            type: 'vocab',
            refId: id,
            fsrs: {
              due: new Date(Date.now() + 3 * 86400000),
              stability: 5,
              difficulty: 5,
              elapsed_days: 0,
              scheduled_days: 3,
              reps: 2,
              lapses: 0,
              state: 2,
              last_review: new Date(),
            },
          })
        }
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })
  }, refIds)
}

/** 完成一整輪詞彙 FSRS（全部按「記得」） */
export async function completeVocabRound(page: Page) {
  await navTo(page, '読む')
  const home = page.getByRole('button', { name: '開始詞彙修行' })
  await home.click()
  const flip = page.getByRole('button', { name: /意味を見る/ })
  for (let i = 0; i < 40; i++) {
    await expect(flip.or(home)).toBeVisible()
    if (await home.isVisible()) return
    await flip.click()
    await page.locator('.gradeRow .g2').click()
  }
  throw new Error('vocab round did not finish within 40 cards')
}

/** 完成辨音 5 題（隨便選，答錯也計數） */
export async function completeListenRound(page: Page) {
  await navTo(page, '聴く')
  await page.getByRole('button', { name: '開始 5 題' }).click()
  for (let n = 1; n <= 5; n++) {
    // 每題間隔 3.6 秒自動進下一題
    await expect(
      page.locator('.card .eyebrow', { hasText: `第 ${n} / 5 題` }),
    ).toBeVisible({ timeout: 15_000 })
    await page.locator('button.qopt').first().click()
  }
  await expect(page.locator('.toast')).toContainText('耳の修行 完成！', { timeout: 15_000 })
}

/** 以自評路徑完成 n 次跟讀（需先 disableSpeechRecognition） */
export async function completeSpeakSelf(page: Page, times: number) {
  await navTo(page, '話す')
  await expect(page.getByText('評分：自我評分')).toBeVisible({ timeout: 10_000 })
  for (let i = 0; i < times; i++) {
    await page.locator('button.micBtn').click()
    await page.getByRole('button', { name: '◎ 很像' }).click()
    await expect(page.locator('.scoreBig')).toContainText('◎')
  }
}

/** 讀完一篇短文（按 読了） */
export async function completeRead(page: Page) {
  await navTo(page, '読む')
  await page
    .locator('.card', { hasText: '読み物' })
    .locator('.row button')
    .first()
    .click()
  await page.getByRole('button', { name: /読了/ }).click()
}

/** 今日頁上某任務列（依名稱關鍵字） */
export function taskRow(page: Page, keyword: string) {
  return page.locator('.task', { hasText: keyword })
}

/** 今日頁「修行の記録」中的統計 chip */
export function statChip(page: Page, label: string) {
  return page.locator('.statChips .chip', { hasText: label })
}
