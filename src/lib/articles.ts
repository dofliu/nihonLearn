/**
 * NHK Easy 文章導入 client 與已採用文章庫。
 * 資料誠信：注音來自 NHK 人工標註（sidecar 解析 ruby），LLM 只做中文對照，
 * 全部 needs_review——「採用」後才寫入 userPassages。
 */
import { db, type UserPassage } from '../db/schema'
import { apiUrl } from './sidecar'
import { hasLLM, generateJSON } from './llm'

export interface ArticleMeta {
  id: string
  title: string
  date: string
}

export interface ArticleLine {
  jp: string // 含 ruby 的安全 HTML
  read: string
}

export interface FetchedArticle {
  id: string
  title: string
  title_read: string
  lines: ArticleLine[]
}

export interface Annotation {
  title_zh: string
  zh: string[]
  new_words: { jp: string; read?: string; zh: string }[]
  demo?: boolean
  note?: string
}

export async function fetchArticleList(): Promise<ArticleMeta[]> {
  const r = await fetch(apiUrl('/api/article/list'), { signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error('article-list-http-' + r.status)
  return ((await r.json()).articles ?? []) as ArticleMeta[]
}

export async function fetchArticle(id: string): Promise<FetchedArticle> {
  const r = await fetch(apiUrl(`/api/article/get?id=${encodeURIComponent(id)}`), {
    signal: AbortSignal.timeout(25000),
  })
  if (!r.ok) throw new Error('article-get-http-' + r.status)
  return (await r.json()) as FetchedArticle
}

/**
 * 補中文對照與生詞解說。注音已由 NHK 標註（不動），這裡只做翻譯。
 * 設定 Gemini 金鑰 → 直接呼叫 Gemini；未設金鑰 → 回空翻譯（文章本體＋注音仍可讀）。
 */
export async function annotateArticle(a: FetchedArticle, knownWords: string[]): Promise<Annotation> {
  const n = a.lines.length
  const empty: Annotation = {
    title_zh: '',
    zh: a.lines.map(() => ''),
    new_words: [],
    demo: true,
    note: '未設 Gemini 金鑰——僅原文＋注音，無中文對照。',
  }
  if (!hasLLM()) return empty

  const numbered = a.lines.map((l, i) => `${i + 1}. ${l.read}`).join('\n')
  const known = knownWords.slice(0, 120).join('、')
  const system =
    '你是日語教學助理，服務對象是中文母語的日語初學者。' +
    '對 NHK やさしいニュース 的句子提供繁體中文翻譯，並挑出對初學者重要的生詞。' +
    '生詞的假名讀音必須取自句子本身既有的讀音，不得自行標音。' +
    '只輸出 JSON，不要任何解說或 markdown。'
  const user =
    `標題（讀音）：${a.title_read}\n句子：\n${numbered}\n學習者已知詞彙：${known}\n` +
    `輸出 JSON：{"title_zh":"標題中文","zh":[依序 ${n} 句的繁體中文],` +
    '"new_words":[{"jp":"生詞（句中原形）","read":"讀音（取自句子）","zh":"中文"}]}' +
    '（new_words 最多 8 個，選最影響理解的）'
  try {
    const j = (await generateJSON(system, user)) as {
      title_zh?: string
      zh?: string[]
      new_words?: { jp: string; read?: string; zh: string }[]
    }
    const zh = (j.zh ?? []).slice(0, n)
    while (zh.length < n) zh.push('')
    return {
      title_zh: j.title_zh ?? '',
      zh: zh.map((s) => String(s ?? '')),
      new_words: (j.new_words ?? []).slice(0, 8),
    }
  } catch {
    // 生成失敗不擋導入：仍可讀原文＋注音
    return { ...empty, note: 'Gemini 生成失敗——僅原文＋注音，無中文對照。' }
  }
}

/** 審核通過 → 寫入閱讀庫。同一篇（origId）重複採用會覆蓋舊版。 */
export async function adoptArticle(a: FetchedArticle, ann: Annotation): Promise<void> {
  const p: UserPassage = {
    title: a.title,
    titleZh: ann.title_zh || '',
    lines: a.lines.map((l, i) => ({ jp: l.jp, read: l.read, zh: ann.zh[i] || '' })),
    source: 'nhk',
    origId: a.id,
    newWords: ann.new_words || [],
    createdAt: Date.now(),
  }
  const dup = await db.userPassages.where('origId').equals(a.id).first()
  if (dup?.id != null) await db.userPassages.delete(dup.id)
  await db.userPassages.add(p)
}

export async function listUserPassages(): Promise<UserPassage[]> {
  const all = await db.userPassages.toArray()
  return all.sort((x, y) => y.createdAt - x.createdAt)
}

export async function deleteUserPassage(id: number): Promise<void> {
  await db.userPassages.delete(id)
}
