import { db, type UserSentence, type GenCandidate, type UserListenQ } from '../db/schema'
import { VOCAB } from '../data/vocab'
import { hasLLM, generateJSON } from './llm'
import { parseListenQuestions, type ListenQCandidate } from './llmParse'
export { analyzeCoverage, type Coverage } from './coverage'
export type { ListenQCandidate } from './llmParse'

export interface Candidate {
  jp: string
  zh: string
  read: string
  new_words: { jp: string; zh: string }[]
}
export interface ContentResult {
  candidates: Candidate[]
  demo: boolean
  needsReview: boolean
}

export type Theme = 'daily' | 'ninja' | 'quest'

/** 主題 → 採用後歸入的跟讀層級 */
export const THEME_LV: Record<Theme, 1 | 2 | 3> = {
  daily: 2,
  ninja: 3,
  quest: 3,
}

// 離線示範候選（未設定 sidecar 時的降級內容，一樣進人工審核佇列）。
// 與 sidecar 端 DEMO 對齊，讓 Android 無 sidecar 也能體驗審核流程。
const CLIENT_DEMO: Record<Theme, Candidate[]> = {
  daily: [
    { jp: 'みずを ください。', zh: '請給我水。', read: 'みずをください', new_words: [] },
    { jp: 'えきは どこですか。', zh: '車站在哪裡？', read: 'えきはどこですか', new_words: [] },
    { jp: 'これは いくらですか。', zh: '這個多少錢？', read: 'これはいくらですか', new_words: [] },
    { jp: 'ありがとう ございます。', zh: '謝謝您。', read: 'ありがとうございます', new_words: [] },
    { jp: 'もう いちど おねがいします。', zh: '請再說一次。', read: 'もういちどおねがいします', new_words: [] },
  ],
  ninja: [
    { jp: 'まいにち しゅぎょうする。', zh: '每天修行。', read: 'まいにちしゅぎょうする', new_words: [{ jp: 'しゅぎょう', zh: '修行' }] },
    { jp: 'なかまを まもる。', zh: '守護夥伴。', read: 'なかまをまもる', new_words: [{ jp: 'まもる', zh: '守護' }] },
    { jp: 'あきらめない。', zh: '不放棄。', read: 'あきらめない', new_words: [{ jp: 'あきらめる', zh: '放棄' }] },
    { jp: 'つよく なりたい。', zh: '想變強。', read: 'つよくなりたい', new_words: [{ jp: 'つよい', zh: '強' }] },
    { jp: 'ぜったいに かつ。', zh: '一定會贏。', read: 'ぜったいにかつ', new_words: [{ jp: 'かつ', zh: '獲勝' }] },
  ],
  quest: [
    { jp: 'たびは つづく。', zh: '旅途繼續。', read: 'たびはつづく', new_words: [{ jp: 'たび', zh: '旅途' }] },
    { jp: 'きみを おぼえている。', zh: '我記得你。', read: 'きみをおぼえている', new_words: [{ jp: 'おぼえる', zh: '記得' }] },
    { jp: 'また あいましょう。', zh: '再相見吧。', read: 'またあいましょう', new_words: [{ jp: 'あう', zh: '見面' }] },
    { jp: 'そらが きれいだ。', zh: '天空好美。', read: 'そらがきれいだ', new_words: [{ jp: 'そら', zh: '天空' }] },
    { jp: 'ありがとう、さようなら。', zh: '謝謝，再見。', read: 'ありがとうさようなら', new_words: [] },
  ],
}

function clientDemo(theme: Theme, n: number): ContentResult {
  return { candidates: (CLIENT_DEMO[theme] ?? CLIENT_DEMO.daily).slice(0, n), demo: true, needsReview: true }
}

const THEME_DESC: Record<Theme, string> = {
  daily: '日常生活情境（買東西、問路、打招呼、點餐）',
  ninja: '熱血忍者冒險（修行、夥伴、成長、不放棄）',
  quest: '奇幻魔法旅途（旅行、回憶、時間、溫柔的告別）',
}

/**
 * i+1 個人化的「已知詞彙」：使用者實際 FSRS 學過的詞（vocab 卡）。
 * 太少（<8）時補一小批基礎詞，讓生成有依據。傳給 Gemini 當 known_words，
 * 讓「每句最多 1 新詞」真正貼合個人進度。
 */
export async function personalKnownWords(): Promise<string[]> {
  const cards = await db.cards.where('type').equals('vocab').toArray()
  const learned = cards.map((c) => c.refId)
  if (learned.length >= 8) return learned
  const base = VOCAB.slice(0, 40).map((v) => v.jp)
  return Array.from(new Set([...learned, ...base]))
}

/**
 * 生成候選句。設定 Gemini 金鑰 → 直接呼叫 Gemini（App 內、免 sidecar）；
 * 未設金鑰 → 離線示範候選（降級不中斷）；呼叫失敗 → 丟乾淨錯誤讓 UI 提示。
 * knownWords 未給時退回整個 N5 詞庫；給了則做 i+1 個人化（見 personalKnownWords）。
 * 產物一律 needs_review，經前端審核佇列人工採用後才入庫。
 */
export async function generate(theme: Theme, n = 5, knownWords?: string[]): Promise<ContentResult> {
  if (!hasLLM()) return clientDemo(theme, n) // 沒設金鑰：離線示範
  const words = knownWords && knownWords.length ? knownWords : VOCAB.map((v) => v.jp)
  const known = words.slice(0, 120).join('、')
  const system =
    '你是日語初級教學內容設計者，服務對象是中文母語、剛學完五十音的成人。' +
    '嚴格遵守：(1) 主要使用提供的「已知詞彙」；(2) 每句最多引入 1 個新詞，' +
    '新詞在 new_words 標出中文；(3) 句子以平假名為主、簡短、實用；' +
    '(4) 只輸出 JSON，不要任何解說或 markdown。'
  const user =
    `主題：${THEME_DESC[theme] ?? theme}\n已知詞彙：${known}\n` +
    `請產出 ${n} 個句子。JSON 格式：\n` +
    '{"candidates":[{"jp":"平假名句子","zh":"中文","read":"純假名讀音",' +
    '"new_words":[{"jp":"新詞","zh":"中文"}]}]}'
  const j = (await generateJSON(system, user)) as { candidates?: Candidate[] }
  return {
    candidates: (j.candidates ?? []).slice(0, n),
    demo: false,
    needsReview: true,
  }
}

// ── 審核佇列持久化：候選存 DB，退回前不消失、可稍後再審 ──
export async function enqueueCandidates(theme: Theme, cands: Candidate[]): Promise<void> {
  const now = Date.now()
  await db.genQueue.bulkAdd(
    cands.map((c, i) => ({
      theme,
      jp: c.jp,
      zh: c.zh,
      read: c.read || c.jp,
      newWords: c.new_words || [],
      createdAt: now + i, // 保序
    })),
  )
}

export async function listQueue(): Promise<GenCandidate[]> {
  return db.genQueue.orderBy('createdAt').toArray()
}

export async function removeFromQueue(id: number): Promise<void> {
  await db.genQueue.delete(id)
}

/** 佇列項審核通過 → 入學習庫並離開佇列 */
export async function adoptFromQueue(item: GenCandidate): Promise<void> {
  await adoptSentence(
    { jp: item.jp, zh: item.zh, read: item.read, new_words: item.newWords },
    item.theme as Theme,
  )
  if (item.id != null) await db.genQueue.delete(item.id)
}

/** 採用一個候選 → 寫入學習庫 */
export async function adoptSentence(c: Candidate, theme: Theme): Promise<void> {
  const s: UserSentence = {
    lv: THEME_LV[theme] ?? 2,
    jp: c.jp,
    zh: c.zh,
    read: c.read || c.jp,
    theme,
    source: 'ai',
    createdAt: Date.now(),
  }
  await db.userSentences.add(s)
}

export async function getUserSentences(lv?: 1 | 2 | 3): Promise<UserSentence[]> {
  if (lv) return db.userSentences.where('lv').equals(lv).toArray()
  return db.userSentences.toArray()
}

export async function deleteUserSentence(id: number): Promise<void> {
  await db.userSentences.delete(id)
}

// ── 段落理解題：LLM 只寫「中文問題/選項」，疊在已驗證短文上 ──
// 日文題材＝data/passages 短文（不由 LLM 生）；生成物一律經審核採用才入段落聽解池。

export interface PassageForGen {
  id: string
  title: string
  lines: { jp: string; zh: string; read?: string }[]
}

/**
 * 依一篇已驗證短文，請 Gemini 生「中文理解題」（中文問題＋3~4 中文選項，答案須由內容直接支持）。
 * 只生中文——日文不改寫、不新增。無金鑰 → 丟 'no-key' 讓 UI 提示去設定。
 */
export async function generateListenQuestions(
  passage: PassageForGen,
  n = 3,
): Promise<ListenQCandidate[]> {
  if (!hasLLM()) throw new Error('no-key')
  const body = passage.lines.map((l, i) => `${i + 1}. ${l.jp}（${l.zh}）`).join('\n')
  const system =
    '你是日語聽力測驗出題老師，服務對象是中文母語學習者。' +
    '嚴格遵守：(1) 只輸出「中文」的問題與「中文」選項，' +
    '不要輸出、改寫或新增任何日文；(2) 問題與正解必須「由短文內容直接支持」，' +
    '不可推測短文沒提到的資訊；(3) 每題 4 個中文選項、只有 1 個正確，誘答要合理但明確為錯；' +
    '(4) 題型以「大意／場景／說話者要做什麼／細節」為主；(5) 只輸出 JSON，無任何解說或 markdown。'
  const user =
    `以下是一段日文短文（附中文對照），逐行列出：\n${body}\n\n` +
    `請出 ${n} 道中文理解題。JSON 格式：\n` +
    '{"questions":[{"q":"中文問題","options":["中文選項1","中文選項2","中文選項3","中文選項4"],"answer":"正解（必須是 options 之一）"}]}'
  const j = await generateJSON(system, user)
  return parseListenQuestions(j).slice(0, n)
}

/** 採用一題 → 寫入段落聽解池（與所屬短文綁定）。 */
export async function adoptListenQ(passageId: string, c: ListenQCandidate): Promise<void> {
  const row: UserListenQ = {
    passageId,
    q: c.q,
    options: c.options,
    answer: c.answer,
    createdAt: Date.now(),
  }
  await db.userListenQ.add(row)
}

export async function listUserListenQ(): Promise<UserListenQ[]> {
  return db.userListenQ.orderBy('createdAt').toArray()
}

export async function deleteUserListenQ(id: number): Promise<void> {
  await db.userListenQ.delete(id)
}
