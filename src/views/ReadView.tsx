import { useEffect, useState } from 'react'
import { VOCAB } from '../data/vocab'
import { PASSAGES, PASSAGE_CATS, type Passage, type PassageLine } from '../data/passages'
import { speak } from '../audio/tts'
import { useApp } from '../state/store'
import { toast } from '../components/ui'
import { VocabCard } from '../components/VocabCard'
import { Karaoke } from '../components/Karaoke'
import { RubyText } from '../components/Ruby'
import { analyzeCoverage } from '../lib/coverage'
import {
  fetchArticleList,
  fetchArticle,
  annotateArticle,
  adoptArticle,
  listUserPassages,
  deleteUserPassage,
  type ArticleMeta,
  type FetchedArticle,
  type Annotation,
} from '../lib/articles'
import type { UserPassage } from '../db/schema'

const KNOWN_READS = VOCAB.map((v) => v.jp)

/** 閱讀器統一文件：靜態短文與使用者文章共用 */
interface ReaderDoc {
  title: string
  titleIsHtml?: boolean
  titleZh?: string
  lines: PassageLine[]
}

export function ReadView() {
  const bump = useApp((s) => s.bump)
  const showKanji = useApp((s) => s.showKanji)
  const [doc, setDoc] = useState<ReaderDoc | null>(null)
  const [openLines, setOpenLines] = useState<Set<number>>(new Set())
  const [showAllZh, setShowAllZh] = useState(true) // 初學者預設整篇中文對照
  const [playLine, setPlayLine] = useState<number | null>(null) // 正在朗讀的行
  const [lineRange, setLineRange] = useState<[number, number] | null>(null)

  // NHK 導入流程狀態
  const [articles, setArticles] = useState<ArticleMeta[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [fetching, setFetching] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ art: FetchedArticle; ann: Annotation } | null>(null)
  const [mine, setMine] = useState<UserPassage[]>([])

  async function reloadMine() {
    setMine(await listUserPassages())
  }
  useEffect(() => {
    void reloadMine()
  }, [])

  function openDoc(d: ReaderDoc) {
    setDoc(d)
    setOpenLines(new Set())
    setShowAllZh(true)
    setPlayLine(null)
    setLineRange(null)
  }
  function openPassage(p: Passage) {
    openDoc({ title: p.title, lines: p.lines })
  }
  function openUserPassage(p: UserPassage) {
    openDoc({ title: p.title, titleIsHtml: true, titleZh: p.titleZh, lines: p.lines })
  }
  // 純假名行（無 ruby）才逐字上色——讀音與顯示對齊
  function isPlainKana(l: PassageLine) {
    return !l.jp.includes('<') && (!l.read || l.read.replace(/\s/g, '') === l.jp.replace(/\s/g, ''))
  }
  async function toggleLine(i: number, read: string) {
    setOpenLines((s) => {
      const next = new Set(s)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
    const line = doc?.lines[i]
    if (line && isPlainKana(line)) {
      setPlayLine(i)
      setLineRange([0, 0])
      await speak(line.jp, useApp.getState().rate, { onBoundary: (s, e) => setLineRange([s, e]) })
      setPlayLine(null)
      setLineRange(null)
    } else {
      speak(read, useApp.getState().rate)
    }
  }
  function playDoc() {
    if (!doc) return
    const txt = doc.lines.map((l) => l.read || l.jp.replace(/<[^>]+>/g, '')).join('。')
    speak(txt, useApp.getState().rate)
  }

  // ── NHK やさしいニュース ──
  async function loadList() {
    setListLoading(true)
    try {
      setArticles(await fetchArticleList())
    } catch {
      toast('取不到文章列表——sidecar 未在線或 NHK 連線失敗')
    } finally {
      setListLoading(false)
    }
  }

  async function pick(meta: ArticleMeta) {
    setFetching(meta.id)
    setPreview(null)
    try {
      const art = await fetchArticle(meta.id)
      // 注音來自 NHK 人工標註；LLM 只補中文對照（無 key 時 zh 為空）
      const ann = await annotateArticle(art, KNOWN_READS)
      setPreview({ art, ann })
    } catch {
      toast('文章載入失敗')
    } finally {
      setFetching(null)
    }
  }

  async function adopt() {
    if (!preview) return
    await adoptArticle(preview.art, preview.ann)
    setPreview(null)
    await reloadMine()
    toast('已加入「わたしの読み物」')
  }

  async function removeMine(p: UserPassage) {
    if (p.id != null) await deleteUserPassage(p.id)
    await reloadMine()
  }

  const cats: string[] = []
  VOCAB.forEach((w) => {
    if (!cats.includes(w.cat)) cats.push(w.cat)
  })

  const previewCov = preview
    ? analyzeCoverage(preview.art.lines.map((l) => l.read).join(''), KNOWN_READS)
    : null

  return (
    <>
      <VocabCard />

      <div className="card">
        <div className="eyebrow">読む修行 ─ 読み物</div>
        <p className="sub">分級短文（依情境分類）。點任一句可切換中文對照並朗讀；讀完按「読了」。</p>
        {PASSAGE_CATS.map((cat) => {
          const list = PASSAGES.filter((p) => p.cat === cat)
          if (list.length === 0) return null
          return (
            <div key={cat} style={{ marginTop: 10 }}>
              <div className="catTag">{cat}</div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {list.map((p) => (
                  <button
                    key={p.id}
                    className="btn small ghost"
                    onClick={() => openPassage(p)}
                  >
                    {p.title.split(' ─ ')[1]?.split('（')[0] ?? p.title}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="eyebrow">時事読み物 ─ NHK やさしいニュース</div>
        <p className="sub">
          導入 NHK 學習者新聞：注音是 NHK 的人工標註，AI 只補中文對照（標記來源、
          <b>採用後才入庫</b>）。生詞多屬 N5 之外，當「泛讀挑戰」用。
        </p>
        <button className="btn small" onClick={() => void loadList()} disabled={listLoading}>
          {listLoading ? '取得中…' : '📰 取得最新ニュース'}
        </button>
        {articles.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {articles.map((a) => (
              <div
                key={a.id}
                className="wordRow"
                onClick={() => fetching || void pick(a)}
                style={{ cursor: 'pointer' }}
              >
                <span className="wj" style={{ fontSize: 14.5 }}>
                  {fetching === a.id ? '⏳ ' : ''}
                  {a.title}
                </span>
                <span className="wz">{a.date}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {preview && (
        <div className="card">
          <div className="eyebrow">審核 ─ 採用後才進書庫</div>
          <div
            className="sent"
            style={{ fontSize: 19, lineHeight: 2 }}
            dangerouslySetInnerHTML={{ __html: preview.art.title }}
          />
          {preview.ann.title_zh && <div className="sentZh">{preview.ann.title_zh}</div>}
          <div className="statChips">
            <span className="chip">來源 <b>NHK Easy</b></span>
            <span className="chip">{preview.art.lines.length} 句</span>
            {previewCov && (
              <span className="chip">
                詞彙覆蓋 <b>{previewCov.coveragePct}%</b>
              </span>
            )}
          </div>
          {preview.ann.demo && (
            <div className="hint">
              未設定 Gemini 金鑰——本篇僅原文＋注音，沒有中文對照。到設定填入金鑰即可。
            </div>
          )}
          {preview.ann.new_words.length > 0 && (
            <div className="statChips">
              {preview.ann.new_words.map((w, i) => (
                <span className="chip" key={i}>
                  生詞 <b>{w.jp}</b>
                  {w.read ? `（${w.read}）` : ''} {w.zh}
                </span>
              ))}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            {preview.art.lines.slice(0, 3).map((l, i) => (
              <div className="rline open" key={i}>
                <div className="jp" dangerouslySetInnerHTML={{ __html: l.jp }} />
                {preview.ann.zh[i] && <div className="zh">{preview.ann.zh[i]}</div>}
              </div>
            ))}
            {preview.art.lines.length > 3 && (
              <p className="sub">…… 其餘 {preview.art.lines.length - 3} 句採用後可讀</p>
            )}
          </div>
          <div className="spacer" />
          <div className="row between">
            <button className="btn small ghost" onClick={() => setPreview(null)}>
              退回
            </button>
            <button className="btn small" onClick={() => void adopt()}>
              採用 ✓
            </button>
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <div className="card">
          <div className="eyebrow">わたしの読み物（已採用）</div>
          {mine.map((p) => (
            <div key={p.id} className="wordRow">
              <span
                className="wj"
                style={{ fontSize: 14.5, cursor: 'pointer' }}
                onClick={() => openUserPassage(p)}
              >
                📰 <span dangerouslySetInnerHTML={{ __html: p.title }} />
              </span>
              <span
                className="wz"
                style={{ cursor: 'pointer' }}
                onClick={() => void removeMine(p)}
              >
                刪除 ✕
              </span>
            </div>
          ))}
        </div>
      )}

      {doc && (
        <div className="card">
          <div className="eyebrow">
            {doc.titleIsHtml ? (
              <span dangerouslySetInnerHTML={{ __html: doc.title }} />
            ) : (
              doc.title
            )}
          </div>
          {doc.titleZh && <p className="sub">{doc.titleZh}</p>}
          <div className="row" style={{ marginBottom: 6 }}>
            <button
              className={'btn small' + (showAllZh ? '' : ' ghost')}
              onClick={() => setShowAllZh((v) => !v)}
            >
              {showAllZh ? '中文對照：開' : '中文對照：關'}
            </button>
            <span className="sub" style={{ alignSelf: 'center' }}>
              點任一句可單獨朗讀
            </span>
          </div>
          <div className={showAllZh ? 'reader-parallel' : ''}>
            {doc.lines.map((l, i) => (
              <div
                key={i}
                className={'rline' + (openLines.has(i) ? ' open' : '')}
                onClick={() => void toggleLine(i, l.read || l.jp.replace(/<[^>]+>/g, ''))}
              >
                {isPlainKana(l) ? (
                  <Karaoke
                    text={l.jp}
                    range={playLine === i ? lineRange : null}
                    className="jp"
                  />
                ) : (
                  <div className="jp" dangerouslySetInnerHTML={{ __html: l.jp }} />
                )}
                <div className="zh">{l.zh}</div>
              </div>
            ))}
          </div>
          <div className="spacer" />
          <div className="row between">
            <button className="btn small ghost" onClick={playDoc}>
              🔊 全文朗讀
            </button>
            <button
              className="btn small red"
              onClick={() => {
                void bump('read', 1)
                toast('読了の印、承りました')
              }}
            >
              読了 ✓
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="eyebrow">單字帳（點擊發音）</div>
        <div>
          {cats.map((cat) => (
            <div key={cat}>
              <div className="catTag">{cat}</div>
              {VOCAB.filter((w) => w.cat === cat).map((w) => (
                <div key={w.jp} className="wordRow" onClick={() => speak(w.jp, 0.85)}>
                  <span className="wj">
                    {showKanji && w.kanji ? (
                      <RubyText display={w.kanji} reading={w.jp} />
                    ) : (
                      w.jp
                    )}
                  </span>
                  <span className="wz">{w.zh} 🔊</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
