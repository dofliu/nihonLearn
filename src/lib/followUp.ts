/**
 * 跟讀「即時追問」的純邏輯（無 Dexie / window / Capacitor 依賴，供 Node 測試 import）。
 *
 * 做什麼：跟讀完一句**已驗證**的教材例句後，AI 順勢針對這句的情境追問一句簡單日文，
 * 你必須臨場自己組句回答（而不是照著稿子唸），再拿到一段**中文**講評。
 *
 * 定位（沿用 AI 助教 v3.6／自由対話 v3.29 立下的先例）：
 *  - 追問句與講評都是使用者主動觸發、一次性、當下自己看的生成內容——**僅供參考、
 *    不寫入學習庫、不進 SRS、不計入每日蓋章**，因此不走 `needs_review` 審核佇列。
 *  - 教材例句本身仍然是已驗證資料（`data/sentences`），AI 只在它旁邊追問，不改寫、不取代。
 *  - 講評一律用**中文**（使用者能自審的語言），評價記號沿用 `lib/tutorQuiz` 的 `parseCritique`。
 *  - **無金鑰時整塊功能隱藏**，跟讀與評分照常運作（降級不中斷）。
 */

/** AI 追問的一句話（日文＋中文翻譯）。日文為 AI 生成，僅供參考。 */
export interface FollowUpQuestion {
  jp: string
  zh: string
}

/** 同一句例句最多能連續追問幾次（避免一直追問下去、也控制 API 用量）。 */
export const MAX_FOLLOWUPS = 3

/**
 * 追問用 system prompt：交代對象程度、已學詞彙與輸出格式。
 * 紅線：短句、以平假名為主、不杜撰重音、只輸出 JSON。
 */
export function buildAskSystem(known: string[]): string {
  const list = known.slice(0, 120).join('、')
  return (
    '你在一個日語學習 App 裡，陪一位中文母語、剛學完五十音的成人做「跟讀後的延伸練習」。' +
    '學習者剛唸完一句教材例句，你要**針對那句話的情境追問一句**，讓他必須自己組句回答。' +
    '規則：' +
    '(1) 只問「一句」日文問題，N5 程度、簡短（15 字以內）、以平假名為主，必要時用空白斷詞；' +
    '(2) 問題要能用學過的詞回答，盡量只用學習者「已學過的詞」；' +
    '(3) 問句要跟例句的情境直接相關，不要換話題、不要一次問兩件事；' +
    '(4) 不要杜撰重音（アクセント）或艱深敬語，沒把握就用最基本的說法；' +
    '(5) 只輸出 JSON，不要任何解說或 markdown：{"jp":"日文問句","zh":"中文翻譯"}' +
    `\n學習者已學過的詞彙：${list || '（尚無，請用最基礎的詞）'}`
  )
}

/** 追問用 user 訊息（帶入剛跟讀的已驗證例句）。 */
export function buildAskUser(sent: { jp: string; zh: string }): string {
  return (
    `學習者剛跟讀的教材例句：${sent.jp}（${sent.zh}）\n` +
    '請依規則針對這句的情境追問一句。'
  )
}

/**
 * 純解析 AI 的追問句。容錯：接受物件或（含 ``` 圍欄的）JSON 字串、陣列取第一筆；
 * `jp` 為必要欄位，`zh` 缺少時以空字串補。解析不出 → null，由呼叫端提示重試。
 */
export function parseFollowUpQuestion(raw: unknown): FollowUpQuestion | null {
  let obj: unknown = raw
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(stripFences(obj))
    } catch {
      return null
    }
  }
  if (Array.isArray(obj)) obj = obj[0]
  if (!obj || typeof obj !== 'object') return null
  const it = obj as { jp?: unknown; zh?: unknown }
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const jp = str(it.jp)
  if (!jp) return null
  return { jp, zh: str(it.zh) }
}

/** 與 `lib/llmParse.ts stripJsonFences` 同義；此檔刻意不相依，維持單檔可測。 */
function stripFences(s: string): string {
  let t = (s || '').trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z]*\n?/, '')
    if (t.endsWith('```')) t = t.slice(0, -3)
  }
  return t.trim()
}

/**
 * 講評用 system prompt。與「考我」（`lib/tutorQuiz`）的差別：追問沒有教材標準答案，
 * 所以評的是「這樣回答通不通、聽不聽得懂」，而不是跟某個參考答案比對。
 * 評價記號格式與 `parseCritique` 相同（✅／△／❌）。
 */
export function buildReplySystem(known: string[]): string {
  const list = known.slice(0, 120).join('、')
  return (
    '你是「日本語の道」App 內的日語學習助教，正在看一位中文母語、剛學完五十音的成人' +
    '「臨場回答一個日文問題」的作答。這題沒有標準答案，只要能傳達意思就算好。' +
    '規則：' +
    '(1) 全部用繁體中文講評，簡短（最多 3 行）、以鼓勵為主；' +
    '(2) 回覆的**第一個字元必須是評價記號**：答得通順自然用「✅」、意思到了但用詞或助詞可以更好用「△」、' +
    '沒回答到問題或看不懂用「❌」；' +
    '(3) 記號之後說明哪裡好、哪裡可以調整；需要示範日文時只給一句、以平假名為主並附中文；' +
    '(4) 答案本來就不只一種，不要要求學習者照你的說法改寫；' +
    '(5) 不要杜撰重音（アクセント）或艱深敬語，沒把握就不要提；' +
    '(6) 不要輸出 markdown 標題或清單符號。' +
    `\n學習者已學過的詞彙：${list || '（尚無，請用最基礎的詞）'}`
  )
}

/** 講評用 user 訊息（追問句、學習者的回答）。 */
export function buildReplyUser(q: FollowUpQuestion, myAnswer: string): string {
  return (
    `你剛剛問學習者：${q.jp}${q.zh ? `（${q.zh}）` : ''}\n` +
    `學習者的回答：${myAnswer.trim()}\n` +
    '請依規則講評。'
  )
}
