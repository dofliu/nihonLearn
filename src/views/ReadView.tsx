import { useState } from 'react'
import { VOCAB } from '../data/vocab'
import { PASSAGES, type Passage } from '../data/passages'
import { speak } from '../audio/tts'
import { useApp } from '../state/store'
import { toast } from '../components/ui'
import { VocabCard } from '../components/VocabCard'

export function ReadView() {
  const bump = useApp((s) => s.bump)
  const showKanji = useApp((s) => s.showKanji)
  const [passage, setPassage] = useState<Passage | null>(null)
  const [openLines, setOpenLines] = useState<Set<number>>(new Set())

  function openPassage(p: Passage) {
    setPassage(p)
    setOpenLines(new Set())
  }
  function toggleLine(i: number, read: string) {
    setOpenLines((s) => {
      const next = new Set(s)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
    speak(read, useApp.getState().rate)
  }
  function playPassage() {
    if (!passage) return
    const txt = passage.lines.map((l) => l.read || l.jp.replace(/<[^>]+>/g, '')).join('。')
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
        <p className="sub">分級短文。點任一句可切換中文對照並朗讀；讀完按「読了」。</p>
        <div className="row" style={{ marginTop: 10 }}>
          {PASSAGES.map((p) => (
            <button key={p.id} className="btn small ghost" onClick={() => openPassage(p)}>
              {p.title.split(' ─ ')[0]}
            </button>
          ))}
        </div>
      </div>

      {passage && (
        <div className="card">
          <div className="eyebrow">{passage.title}</div>
          <div>
            {passage.lines.map((l, i) => (
              <div
                key={i}
                className={'rline' + (openLines.has(i) ? ' open' : '')}
                onClick={() => toggleLine(i, l.read || l.jp.replace(/<[^>]+>/g, ''))}
              >
                <div className="jp" dangerouslySetInnerHTML={{ __html: l.jp }} />
                <div className="zh">{l.zh}</div>
              </div>
            ))}
          </div>
          <div className="spacer" />
          <div className="row between">
            <button className="btn small ghost" onClick={playPassage}>
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
                    {showKanji && w.kanji ? w.kanji : w.jp}
                    {showKanji && w.kanji && (
                      <span style={{ fontSize: 12, color: 'var(--nezu)', marginLeft: 6 }}>
                        {w.jp}
                      </span>
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
