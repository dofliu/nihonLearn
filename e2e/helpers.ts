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

/**
 * 今日頁「今日の加練」改為每日輪替主推一項＋「全部加練」可展開。
 * 展開全部後點指定選配（不論它今天是不是被主推，都找得到）。
 */
export async function openExtra(page: Page, name: RegExp) {
  const toggle = page.getByRole('button', { name: /全部加練/ })
  if (await toggle.isVisible().catch(() => false)) await toggle.click()
  await page.getByRole('button', { name }).first().click()
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

/**
 * 注入假的瀏覽器語音辨識（`window.SpeechRecognition`），讓「用說的」路徑可被 e2e 測試。
 * 依序回傳 transcripts 的每一句；佇列用完或該句為空字串時觸發 `no-speech` 錯誤。
 * 需在 gotoApp 之前呼叫。
 */
export async function fakeSpeechRecognition(page: Page, transcripts: string[]) {
  await page.addInitScript((txts: string[]) => {
    const queue = txts.slice()
    class FakeSpeechRecognition {
      lang = ''
      interimResults = false
      maxAlternatives = 1
      onresult: ((e: unknown) => void) | null = null
      onerror: ((e: unknown) => void) | null = null
      start() {
        setTimeout(() => {
          const t = queue.shift()
          if (!t) {
            this.onerror?.({ error: 'no-speech' })
            return
          }
          this.onresult?.({ results: [[{ transcript: t }]] })
        }, 20)
      }
    }
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: FakeSpeechRecognition,
    })
  }, transcripts)
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

/**
 * 走完一整段情境對話（話す▸会話 的第一個場景），停在完成畫面。
 * 對方的台詞按「つぎへ」、自己的台詞按「唸完了，下一句」，直到出現「再來一次」。
 */
export async function completeDialogue(page: Page) {
  await navTo(page, '話す')
  await page.locator('.lvTabs button', { hasText: '会話' }).click()
  await page.getByRole('button', { name: '開始 ▶' }).first().click()

  const again = page.getByRole('button', { name: '再來一次' })
  // 對方句與自己句的按鈕文字不同，但同一時間只會出現其中一個——
  // 用 or() 交給 Playwright auto-wait，不要先 isVisible() 再點（讀到的狀態可能已被重繪）
  const next = page
    .getByRole('button', { name: 'つぎへ ▶' })
    .or(page.getByRole('button', { name: '唸完了，下一句 ▶' }))
  const bubbles = page.locator('.dlgBubble')

  for (let i = 0; i < 30; i++) {
    if (await again.isVisible().catch(() => false)) return
    const before = await bubbles.count()
    await expect(next.or(again)).toBeVisible({ timeout: 15_000 })
    if (await again.isVisible().catch(() => false)) return
    await next.click({ timeout: 15_000 })
    // 等這一步真的前進（多一顆氣泡）或整段結束，避免重複點到同一顆按鈕
    await expect
      .poll(
        async () => (await again.isVisible().catch(() => false)) || (await bubbles.count()) > before,
        { timeout: 15_000 },
      )
      .toBe(true)
  }
  throw new Error('dialogue did not finish within 30 steps')
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

/** 讀 activityLog 中某 feature 的累計次數（学習記録驗證用） */
export async function activityCount(page: Page, feature: string): Promise<number> {
  return page.evaluate(
    (feat: string) =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('nihongo-michi')
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('activityLog', 'readonly')
          let n = 0
          tx.objectStore('activityLog').openCursor().onsuccess = (e: Event) => {
            const cur = (e.target as IDBRequest).result as IDBCursorWithValue | null
            if (cur) {
              if (cur.value.feature === feat) n += cur.value.count
              cur.continue()
            } else {
              db.close()
              resolve(n)
            }
          }
          tx.onerror = () => reject(tx.error)
        }
        req.onerror = () => reject(req.error)
      }),
    feature,
  )
}

/** 今日頁上某任務列（依名稱關鍵字） */
export function taskRow(page: Page, keyword: string) {
  return page.locator('.task', { hasText: keyword })
}

/** 今日頁「修行の記録」中的統計 chip */
export function statChip(page: Page, label: string) {
  return page.locator('.statChips .chip', { hasText: label })
}
