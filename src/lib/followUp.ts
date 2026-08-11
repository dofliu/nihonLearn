/**
 * 「即時追問」的純邏輯（無 Dexie / window / Capacitor 依賴，供 Node 測試 import）。
 *
 * 做什麼：練完一段**已驗證**的教材素材後，AI 順勢針對那個情境追問一句簡單日文，
 * 你必須臨場自己組句回答（而不是照著稿子唸），再拿到一段**中文**講評。
 * 素材有兩種（`FollowUpKind`）：跟讀分頁的單句例句（`data/sentences`），
 * 以及会話分頁走完的一整段情境對話（`data/dialogues`）。
 *
 * 定位（沿用 AI 助教 v3.6／自由対話 v3.29 立下的先例）：
 *  - 追問句與講評都是使用者主動觸發、一次性、當下自己看的生成內容——**僅供參考、
 *    不寫入學習庫、不進 SRS、不計入每日蓋章**，因此不走 `needs_review` 審核佇列。
 *  - 教材素材本身仍然是已驗證資料（`data/sentences`／`data/dialogues`），AI 只在它旁邊追問，
 *    不改寫、不取代。
 *  - 講評一律用**中文**（使用者能自審的語言），評價記號沿用 `lib/tutorQuiz` 的 `parseCritique`。
 *  - **無金鑰時整塊功能隱藏**，跟讀／会話引導照常運作（降級不中斷）。
 */

import type { ChatMsg } from './llmParse.ts'

/** AI 追問的一句話（日文＋中文翻譯）。日文為 AI 生成，僅供參考。 */
export interface FollowUpQuestion {
  jp: string
  zh: string
}

/** 追問的題材種類：跟讀的單句例句／会話走完的一整段對話。 */
export type FollowUpKind = 'sentence' | 'dialogue'

/**
 * 一個「可以被追問」的題材。`askUser` 已把已驗證素材組成給 AI 的 user 訊息，
 * `id` 供呼叫端在換題材時重置追問區（追問是綁在當下這個情境上的）。
 */
export interface FollowUpTopic {
  id: string
  kind: FollowUpKind
  askUser: string
}

/** 同一句例句最多能連續追問幾次（避免一直追問下去、也控制 API 用量）。 */
export const MAX_FOLLOWUPS = 3

/**
 * 追問用 system prompt：交代對象程度、已學詞彙與輸出格式。
 * 紅線：短句、以平假名為主、不杜撰重音、只輸出 JSON。
 * `kind` 只換掉「情境從哪來」的兩句描述，其餘規則兩種題材共用。
 */
export function buildAskSystem(known: string[], kind: FollowUpKind = 'sentence'): string {
  const list = known.slice(0, 120).join('、')
  const scene =
    kind === 'dialogue'
      ? '陪一位中文母語、剛學完五十音的成人做「情境對話後的延伸練習」。' +
        '學習者剛照著固定腳本練完一段對話，你要**扮演對話中的那個對象、接著同一個場景再問他一句**，' +
        '讓他必須自己組句回答。'
      : '陪一位中文母語、剛學完五十音的成人做「跟讀後的延伸練習」。' +
        '學習者剛唸完一句教材例句，你要**針對那句話的情境追問一句**，讓他必須自己組句回答。'
  const relevant =
    kind === 'dialogue'
      ? '(3) 問句要延續那段對話的場景與對象（同一家店、同一個人），不要換話題、不要一次問兩件事；'
      : '(3) 問句要跟例句的情境直接相關，不要換話題、不要一次問兩件事；'
  return (
    '你在一個日語學習 App 裡，' +
    scene +
    '規則：' +
    '(1) 只問「一句」日文問題，N5 程度、簡短（15 字以內）、以平假名為主，必要時用空白斷詞；' +
    '(2) 問題要能用學過的詞回答，盡量只用學習者「已學過的詞」；' +
    relevant +
    '(4) 前面若已經有問答，請**接著學習者剛剛的回答繼續問下去**（像聊天一樣自然延續），' +
    '不要重複問過的問題、也不要重新自我介紹；' +
    '(5) 不要杜撰重音（アクセント）或艱深敬語，沒把握就用最基本的說法；' +
    '(6) 只輸出 JSON，不要任何解說或 markdown：{"jp":"日文問句","zh":"中文翻譯"}' +
    `\n學習者已學過的詞彙：${list || '（尚無，請用最基礎的詞）'}`
  )
}

/** 一輪已經問答過的追問（AI 的問句＋學習者的回答；回答為空＝跳過沒答）。 */
export interface FollowUpExchange {
  q: FollowUpQuestion
  answer: string
}

/** 學習者沒回答就再按追問時，送給 AI 的替代訊息（維持 user／model 交替）。 */
export const FOLLOWUP_SKIPPED =
  '（學習者沒有回答這一題。）請換一個角度、在同一個情境再追問一句。'

/** 學習者回答之後、要 AI 接著往下問的 user 訊息。 */
export function buildAnswerUser(answer: string): string {
  return (
    `學習者的回答：${answer.trim()}\n` +
    '請依規則接著這個回答再追問一句（同一個情境，不要重複問過的問題）。'
  )
}

/**
 * 把「題材＋已經問答過的幾輪」組成 Gemini 多輪 contents（比照 `roleplay.ts roleplayHistory`）。
 * 第一則永遠是題材本身（已驗證素材組成的 `topic.askUser`），之後每輪以 model（追問句 JSON，
 * 與要求的輸出格式一致）＋user（學習者的回答）交替，讓 AI 看得到前面問過什麼、學習者怎麼回，
 * 才能真的「接著問」而不是每次從頭問。沒有已問答的輪次時＝只有第一則，與多輪化前的行為相同。
 */
export function followUpHistory(askUser: string, rounds: FollowUpExchange[]): ChatMsg[] {
  const msgs: ChatMsg[] = [{ role: 'user', text: askUser }]
  for (const r of rounds) {
    msgs.push({ role: 'model', text: JSON.stringify({ jp: r.q.jp, zh: r.q.zh }) })
    msgs.push({
      role: 'user',
      text: r.answer.trim() ? buildAnswerUser(r.answer) : FOLLOWUP_SKIPPED,
    })
  }
  return msgs
}

/** 追問用 user 訊息（帶入剛跟讀的已驗證例句）。 */
export function buildAskUser(sent: { jp: string; zh: string }): string {
  return (
    `學習者剛跟讀的教材例句：${sent.jp}（${sent.zh}）\n` +
    '請依規則針對這句的情境追問一句。'
  )
}

/** 追問用 user 訊息（帶入剛走完的已驗證對話腳本：場景、對象、每一句台詞）。 */
export function buildDialogueAskUser(dlg: {
  title: string
  partner: string
  scene: string
  lines: { role: 'a' | 'b'; jp: string; zh: string }[]
}): string {
  const script = dlg.lines
    .map((l) => `${l.role === 'a' ? dlg.partner : '學習者'}：${l.jp}（${l.zh}）`)
    .join('\n')
  return (
    `學習者剛練完的情境對話：${dlg.title}\n` +
    `場景：${dlg.scene}\n` +
    `對方：${dlg.partner}\n` +
    `腳本：\n${script}\n` +
    '請依規則扮演對方，接著這個場景再追問一句。'
  )
}

/** 把一句已驗證例句包成可追問的題材。 */
export function sentenceTopic(sent: { id: string; jp: string; zh: string }): FollowUpTopic {
  return { id: `sent:${sent.id}`, kind: 'sentence', askUser: buildAskUser(sent) }
}

/** 把一段已驗證對話腳本包成可追問的題材。 */
export function dialogueTopic(dlg: {
  id: string
  title: string
  partner: string
  scene: string
  lines: { role: 'a' | 'b'; jp: string; zh: string }[]
}): FollowUpTopic {
  return { id: `dlg:${dlg.id}`, kind: 'dialogue', askUser: buildDialogueAskUser(dlg) }
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
