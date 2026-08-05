/**
 * 文型ドリル「自由造句」的純邏輯（無 Dexie / window / Capacitor 依賴，供 Node 測試 import）。
 *
 * 做什麼：回想テスト是「照著給定的詞把句子想出來」，這裡再進一步——**自己挑一個詞**、
 * 用該句型造一句自己的句子，打字送出後拿到回饋。
 *
 * 責任分工（延續 v3.10「LLM 只生中文」、v3.30 考我模式的紅線）：
 *  - **句型骨架與填空詞由程式檢核**（`checkShape`）：作答有沒有用到這個句型的接續、
 *    填進去的詞是不是**已驗證詞庫**（`data/vocab`）裡的詞、屬不屬於這個句型允許的分類。
 *    純字串比對，零正確性風險，**無 Gemini 金鑰時照樣有回饋**（降級不中斷）。
 *  - LLM 只負責用**中文**講評（自然不自然、助詞可怎麼調），是使用者能自審的語言；
 *    產物僅供參考、**不寫入學習庫、不進 SRS、不計入蓋章**，故不走 needs_review 審核佇列。
 */
import type { Pattern } from '../data/patterns.ts'
import { VOCAB, type Vocab } from '../data/vocab.ts'

/** 比對用正規化：去掉所有空白與句讀，讓「みずをください。」與「みず を ください」等價。 */
export function normJa(s: string): string {
  return (s || '').replace(/[\s　。、，．・！？!?,.]/g, '')
}

/** 程式對「自由造句」的機械檢核結果（不含任何 AI 判斷）。 */
export interface ShapeCheck {
  /** 正規化後的作答（去空白與句讀） */
  norm: string
  /** 有用到句型的詞前接續（`pre` 為空字串時恆為 true） */
  hasPre: boolean
  /** 有用到句型的詞後接續 */
  hasPost: boolean
  /** 骨架符合：pre 在開頭、post 在結尾，且中間至少留下一個字 */
  ok: boolean
  /** 中間填進去的部分（骨架不符時為空字串） */
  slot: string
  /** 填入的部分對得上已驗證詞庫的哪個詞（比對假名與漢字正寫）；對不上為 null */
  word: Vocab | null
  /** 該詞是否已 FSRS 學過（learned 未提供時恆為 false） */
  learned: boolean
  /** 該詞是否落在這個句型允許的分類內（＝語意安全的填空） */
  inCats: boolean
}

/** 依假名或漢字正寫查已驗證詞庫。 */
export function lookupVocab(slot: string): Vocab | null {
  const s = normJa(slot)
  if (!s) return null
  return VOCAB.find((v) => normJa(v.jp) === s || (v.kanji ? normJa(v.kanji) === s : false)) ?? null
}

/**
 * 機械檢核一句自由造句是否套用了該句型。
 * 刻意寬鬆：只看「接續有沒有出現在正確位置」，不做文法分析（那超出程式能誠實保證的範圍）。
 */
export function checkShape(p: Pattern, answer: string, learned?: Set<string>): ShapeCheck {
  const norm = normJa(answer)
  const pre = normJa(p.pre)
  const post = normJa(p.post)
  const hasPre = pre === '' || norm.startsWith(pre)
  const hasPost = post === '' || norm.endsWith(post)
  const ok = hasPre && hasPost && norm.length > pre.length + post.length
  const slot = ok ? norm.slice(pre.length, norm.length - post.length) : ''
  const word = ok ? lookupVocab(slot) : null
  return {
    norm,
    hasPre,
    hasPost,
    ok,
    slot,
    word,
    learned: !!(word && learned?.has(word.jp)),
    inCats: !!(word && p.cats.includes(word.cat)),
  }
}

/** 檢核結果的一句話中文摘要（UI 直接顯示，無 AI 參與）。 */
export function shapeSummary(p: Pattern, c: ShapeCheck): string {
  if (!c.norm) return '還沒寫任何字。'
  if (!c.ok) return `還沒看到「${p.label.replace('〜', '')}」這個句型的接續——再對照一次句型試試。`
  if (!c.word) return `句型用對了！不過「${c.slot}」不在本 App 的詞庫裡，正確與否請自行確認。`
  if (!c.inCats) return `句型用對了，填入的是「${c.word.jp}（${c.word.zh}）」——這個詞不在本句型建議的分類，語意通不通要自己想一下。`
  return `句型用對了，填入「${c.word.jp}（${c.word.zh}）」${c.learned ? '——而且是你已經學過的詞。' : '——這個詞你還沒學到，正好順便記起來。'}`
}

/**
 * 講評用 system prompt。與「考我」（`lib/tutorQuiz`）的差別：這裡沒有指定要填的詞，
 * 學習者自己挑詞造句，所以評的是「這個句型用得對不對、自然不自然」。
 * 評價記號格式與 `parseCritique` 相同（✅／△／❌）。
 */
export function buildComposeSystem(known: string[]): string {
  const list = known.slice(0, 120).join('、')
  return (
    '你是「日本語の道」App 內的日語學習助教，正在看一位中文母語、剛學完五十音的成人' +
    '「用指定句型自己造一句話」的作答。' +
    '規則：' +
    '(1) 全部用繁體中文講評，簡短（最多 3 行）、以鼓勵為主；' +
    '(2) 回覆的**第一個字元必須是評價記號**：句型用對且自然用「✅」、句型看得出來但用詞或助詞可以更好用「△」、' +
    '沒用到這個句型或看不懂用「❌」；' +
    '(3) 記號之後說明句型用得對不對、填入的詞合不合適；需要示範日文時只給一句、以平假名為主並附中文；' +
    '(4) 學習者可以自由挑詞，只要語意通就算對，不要硬要他改成教材例句那個詞；' +
    '(5) 不要杜撰重音（アクセント）或艱深敬語，沒把握就不要提；' +
    '(6) 不要輸出 markdown 標題或清單符號。' +
    `\n學習者已學過的詞彙：${list || '（尚無，請用最基礎的詞）'}`
  )
}

/** 講評用 user 訊息（句型、已驗證教材例句、程式檢核結果、學習者作答）。 */
export function buildComposeUser(
  p: Pattern,
  myAnswer: string,
  examples: string[] = [],
  check?: ShapeCheck,
): string {
  const ex = examples.filter(Boolean).slice(0, 3)
  return (
    `句型：${p.label}（${p.zh}）\n` +
    `用法：${p.note}\n` +
    (ex.length ? `教材例句：${ex.join(' ／ ')}\n` : '') +
    (check ? `程式檢核：${check.ok ? `句型接續正確，填入的部分是「${check.slot}」` : '沒有偵測到這個句型的接續'}\n` : '') +
    `學習者自己造的句子：${myAnswer.trim()}\n` +
    '請依規則講評。'
  )
}
