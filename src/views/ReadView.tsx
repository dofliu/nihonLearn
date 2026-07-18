import { useState } from 'react'
import { VOCAB } from '../data/vocab'
import { PASSAGES, PASSAGE_CATS, type Passage, type PassageLine } from '../data/passages'
import { speak } from '../audio/tts'
import { useApp } from '../state/store'
import { toast } from '../components/ui'
import { VocabCard } from '../components/VocabCard'
import { Karaoke } from '../components/Karaoke'
import { RubyText } from '../components/Ruby'

/**
 * 短文標題解析：`壱 ─ じこしょうかい（自我介紹・全假名）`
 * → { jp: 'じこしょうかい', zh: '自我介紹', note: '全假名' }
 * 讓読む頁的短文按鈕同時顯示日文與中文主題（初學者看得懂是哪個情境）。
 */
function passageLabel(title: string): { jp: string; zh: string; note: string } {
  const after = title.split(' ─ ')[1] ?? title
  const jp = after.split('（')[0].trim()
  const inParen = after.match(/（(.+?)）/)?.[1] ?? ''
  const parts = inParen.split('・')
  return { jp, zh: (parts[0] ?? '').trim(), note: (parts[1] ?? '').trim() }
}

/** 閱讀器文件 */
interface ReaderDoc {
  title: string
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

  function openPassage(p: Passage) {
    setDoc({ title: p.title, lines: p.lines })
    setOpenLines(new Set())
    setShowAllZh(true)
    setPlayLine(null)
    setLineRange(null)
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

  const cats: string[] = []
  VOCAB.forEach((w) => {
    if (!cats.includes(w.cat)) cats.push(w.cat)
  })

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
                {list.map((p) => {
                  const lab = passageLabel(p.title)
                  return (
                    <button
                      key={p.id}
                      className="btn small ghost passBtn"
                      onClick={() => openPassage(p)}
                    >
                      <span className="passJp">{lab.jp}</span>
                      {lab.zh && (
                        <span className="passZh">
                          {lab.zh}
                          {lab.note ? `・${lab.note}` : ''}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {doc && (
        <div className="card">
          <div className="eyebrow">{doc.title}</div>
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
