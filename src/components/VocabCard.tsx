import { useState, useEffect, useCallback } from 'react'
import { VOCAB, type Vocab } from '../data/vocab'
import { db } from '../db/schema'
import {
  ensureCard,
  gradeCard,
  incNewVocab,
  getToday,
  DAILY_VOCAB_NEW_LIMIT,
} from '../db/repo'
import { isDue, isMastered, type GradeKey } from '../srs/scheduler'
import { speak } from '../audio/tts'
import { useApp } from '../state/store'
import { toast } from '../components/ui'

export function VocabCard() {
  const bump = useApp((s) => s.bump)
  const showKanji = useApp((s) => s.showKanji)
  const [mode, setMode] = useState<'home' | 'session'>('home')
  const [queue, setQueue] = useState<Vocab[]>([])
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [learned, setLearned] = useState(0)
  const [mastered, setMastered] = useState(0)
  const [due, setDue] = useState(0)

  const refresh = useCallback(async () => {
    const cards = await db.cards.where('type').equals('vocab').toArray()
    const learnedSet = new Set(cards.map((c) => c.refId))
    setLearned(learnedSet.size)
    setMastered(cards.filter((c) => isMastered(c.fsrs)).length)
    const day = await getToday()
    const newLeft = Math.max(0, DAILY_VOCAB_NEW_LIMIT - (day.newVocab || 0))
    const dueCards = cards.filter((c) => isDue(c.fsrs)).length
    const newAvail = VOCAB.filter((v) => !learnedSet.has(v.jp)).length
    setDue(dueCards + Math.min(newLeft, newAvail))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function buildQueue(): Promise<Vocab[]> {
    const cards = await db.cards.where('type').equals('vocab').toArray()
    const learnedSet = new Set(cards.map((c) => c.refId))
    const dueRefs = cards.filter((c) => isDue(c.fsrs)).map((c) => c.refId)
    const byJp = Object.fromEntries(VOCAB.map((v) => [v.jp, v]))
    const dueVocab = dueRefs.map((r) => byJp[r]).filter(Boolean)
    const day = await getToday()
    const newLeft = Math.max(0, DAILY_VOCAB_NEW_LIMIT - (day.newVocab || 0))
    const news = VOCAB.filter((v) => !learnedSet.has(v.jp)).slice(0, newLeft)
    return [...dueVocab, ...news]
  }

  async function start() {
    const q = await buildQueue()
    if (q.length === 0) {
      toast('今日の語彙は完了！明日また来てください')
      await bump('vocab', 5)
      return
    }
    setQueue(q)
    setIdx(0)
    setRevealed(false)
    setMode('session')
  }

  function reveal() {
    setRevealed(true)
  }

  async function grade(g: GradeKey) {
    const v = queue[idx]
    const cards = await db.cards.where('type').equals('vocab').toArray()
    const existed = cards.some((c) => c.refId === v.jp)
    await ensureCard('vocab', v.jp)
    if (!existed) await incNewVocab(1)
    await gradeCard(`vocab:${v.jp}`, g)
    await bump('vocab', 1)

    let nextQueue = queue
    if (g === 'forgot') {
      nextQueue = [...queue]
      nextQueue.splice(Math.min(nextQueue.length, idx + 3), 0, v)
      setQueue(nextQueue)
    }
    const nextIdx = idx + 1
    if (nextIdx >= nextQueue.length) {
      await bump('vocab', 5) // 做完整輪即達標（封頂，到期卡少的日子也能完成）
      setMode('home')
      await refresh()
      toast('本輪語彙完成 — お見事！')
    } else {
      setIdx(nextIdx)
      setRevealed(false)
    }
  }

  if (mode === 'session') {
    const v = queue[idx]
    const front = showKanji && v.kanji ? v.kanji : v.jp
    return (
      <div className="card">
        <div className="eyebrow">
          ことば　{idx + 1} / {queue.length}
          {showKanji && '　漢字モード'}
        </div>
        <div
          className="sent"
          style={{ fontSize: 30, cursor: 'pointer' }}
          onClick={() => speak(v.jp, 0.85)}
        >
          {front} 🔊
        </div>
        {revealed && (
          <div className="sentZh" style={{ fontSize: 15 }}>
            {showKanji && v.kanji ? v.jp : v.kanji || ''}
          </div>
        )}
        <div className="reveal" style={{ fontSize: 22 }}>
          {revealed ? v.zh : ''}
        </div>
        {!revealed ? (
          <button className="btn" style={{ width: '100%' }} onClick={reveal}>
            意味を見る（翻面）
          </button>
        ) : (
          <div className="gradeRow">
            <button className="g0" onClick={() => void grade('forgot')}>
              忘了
              <br />
              &lt;10分
            </button>
            <button className="g1" onClick={() => void grade('hard')}>
              很難
              <br />
              明天
            </button>
            <button className="g2" onClick={() => void grade('good')}>
              記得
              <br />
              隔日+
            </button>
            <button className="g3" onClick={() => void grade('easy')}>
              秒答
              <br />
              數日+
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="card">
      <div className="eyebrow">読む修行 ─ ことば道場（FSRS）</div>
      <h2>今日の語彙</h2>
      <p className="sub">
        看日文、聽發音 → 心中回想意思 → 翻面自評。詞彙與假名同樣走 FSRS 排程，
        每日引入至多 {DAILY_VOCAB_NEW_LIMIT} 個新詞，其餘按記憶曲線複習。
      </p>
      <div className="spacer" />
      <button className="btn" onClick={() => void start()}>
        開始詞彙修行
      </button>
      <div className="statChips">
        <span className="chip">
          今日待修 <b>{due}</b> 詞
        </span>
        <span className="chip">
          已學 <b>{learned}</b> / {VOCAB.length}
        </span>
        <span className="chip">
          已定著 <b>{mastered}</b>
        </span>
      </div>
    </div>
  )
}
