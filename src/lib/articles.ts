/**
 * NHK Easy 文章導入 client 與已採用文章庫。
 * 資料誠信：注音來自 NHK 人工標註（sidecar 解析 ruby），LLM 只做中文對照，
 * 全部 needs_review——「採用」後才寫入 userPassages。
 */
import { db, type UserPassage } from '../db/schema'
import { apiUrl } from './sidecar'

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

export async function annotateArticle(a: FetchedArticle, knownWords: string[]): Promise<Annotation> {
  const r = await fetch(apiUrl('/api/article/annotate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title_read: a.title_read,
      lines: a.lines.map((l) => l.read),
      known_words: knownWords,
    }),
    signal: AbortSignal.timeout(120000),
  })
  if (!r.ok) throw new Error('annotate-http-' + r.status)
  return (await r.json()) as Annotation
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
