import { useEffect, useState, useCallback, useRef } from 'react'
import { KANA, KANA_BY_ID, type Kana } from '../data/kana'
import { db } from '../db/schema'
import { ensureCard, gradeCard, incNewIntro, getToday, DAILY_NEW_LIMIT } from '../db/repo'
import { isDue, isMastered, type GradeKey } from '../srs/scheduler'
import { speak } from '../audio/tts'
import { useApp } from '../state/store'
import { toast } from '../components/ui'
import { WriteView } from './WriteView'

type Mode = 'home' | 'session' | 'ear' | 'write'

export function KanaView() {
  const bump = useApp((s) => s.bump)
  const [mode, setMode] = useState<Mode>('home')
  const [queue, setQueue] = useState<Kana[]>([])
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [cardMap, setCardMap] = useState<Record<string, boolean>>({}) // id -> mastered
  const [learnedSet, setLearnedSet] = useState<Set<string>>(new Set())
  const [dueCount, setDueCount] = useState(0)

  const refreshMap = useCallback(async () => {
    const cards = await db.cards.where('type').equals('kana').toArray()
    const learned = new Set(cards.map((c) => c.refId))
    const master: Record<string, boolean> = {}
    for (const c of cards) master[c.refId] = isMastered(c.fsrs)
    setLearnedSet(learned)
    setCardMap(master)
    // 計算今日待修行
    const day = await getToday()
    const newLeft = Math.max(0, DAILY_NEW_LIMIT - day.newIntro)
    let due = 0
    for (const c of cards) if (isDue(c.fsrs)) due++
    const newAvail = KANA.filter((k) => !learned.has(k.id)).length
    setDueCount(due + Math.min(newLeft, newAvail))
  }, [])

  useEffect(() => {
    void refreshMap()
  }, [refreshMap])

  async function buildQueue(): Promise<Kana[]> {
    const cards = await db.cards.where('type').equals('kana').toArray()
    const learned = new Set(cards.map((c) => c.refId))
    const dueIds = cards.filter((c) => isDue(c.fsrs)).map((c) => c.refId)
    const due = dueIds.map((id) => KANA_BY_ID[id]).filter(Boolean)
    const day = await getToday()
    const newLeft = Math.max(0, DAILY_NEW_LIMIT - day.newIntro)
    const news = KANA.filter((k) => !learned.has(k.id)).slice(0, newLeft)
    return [...due, ...news]
  }

  async function start() {
    const q = await buildQueue()
    if (q.length === 0) {
      toast('今日の修行は完了！明日また来てください')
      await bump('kana', 10)
      return
    }
    setQueue(q)
    setIdx(0)
    setRevealed(false)
    setMode('session')
  }

  async function reveal() {
    setRevealed(true)
    speak(queue[idx].ch, 0.85)
  }

  async function grade(g: GradeKey) {
    const k = queue[idx]
    const existed = learnedSet.has(k.id)
    await ensureCard('kana', k.id)
    if (!existed) await incNewIntro(1)
    await gradeCard(`kana:${k.id}`, g)
    await bump('kana', 1)

    let nextQueue = queue
    if (g === 'forgot') {
      // 稍後重出
      nextQueue = [...queue]
      nextQueue.splice(Math.min(nextQueue.length, idx + 3), 0, k)
      setQueue(nextQueue)
    }
    const nextIdx = idx + 1
    if (nextIdx >= nextQueue.length) {
      await bump('kana', 10) // 做完整輪即達標（封頂）
      setMode('home')
      await refreshMap()
      toast('本輪完成 — お見事！')
    } else {
      setIdx(nextIdx)
      setRevealed(false)
    }
  }

  if (mode === 'session') {
    const k = queue[idx]
    return (
      <div className="card">
        <div className="eyebrow">
          {idx + 1} / {queue.length}　{learnedSet.has(k.id) ? '復習' : '新しい字'}
        </div>
        <div className="kanaFace">{k.ch}</div>
        <div className="kanaMeta">{k.script === 'hiragana' ? 'ひらがな' : 'カタカナ'}</div>
        <div className="reveal">{revealed ? k.ro : ''}</div>
        {!revealed ? (
          <button className="btn" style={{ width: '100%' }} onClick={() => void reveal()}>
            答えを見る（翻面）
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

  if (mode === 'ear') {
    return <EarQuiz learnedSet={learnedSet} onExit={() => { setMode('home'); void refreshMap() }} />
  }

  if (mode === 'write') {
    return (
      <>
        <div className="card">
          <button className="btn small ghost" onClick={() => setMode('home')}>
            ← 返回五十音道場
          </button>
        </div>
        <WriteView />
      </>
    )
  }

  // home
  const seion = (from: number, to: number) =>
    KANA.slice(from, to).map((k) => {
      const cls = !learnedSet.has(k.id) ? '' : cardMap[k.id] ? 'master' : 'learn'
      return (
        <span key={k.id} className={cls}>
          {k.ch}
        </span>
      )
    })

  return (
    <div className="card">
      <div className="eyebrow">字の修行 ─ 五十音道場（FSRS）</div>
      <h2>間隔重複</h2>
      <p className="sub">
        排程由 FSRS 演算法依你的記憶曲線決定。看假名 → 心中唸讀音 → 翻面誠實自評。
      </p>
      <div className="spacer" />
      <div className="row">
        <button className="btn" onClick={() => void start()}>
          開始今日修行
        </button>
        <button className="btn ghost" onClick={() => setMode('ear')}>
          音 → 字 測驗
        </button>
        <button className="btn ghost" onClick={() => setMode('write')}>
          ✍ 書寫練習
        </button>
      </div>
      <div className="statChips">
        <span className="chip">
          今日待修行 <b>{dueCount}</b> 枚
        </span>
        <span className="chip">
          總進度 <b>{learnedSet.size}</b> / {KANA.length}
        </span>
      </div>
      <div className="catTag">ひらがな</div>
      <div className="kanaGrid">{seion(0, 46)}</div>
      <div className="catTag">カタカナ</div>
      <div className="kanaGrid">{seion(71, 71 + 46)}</div>
    </div>
  )
}

// ---------- 音 → 字 ----------
function EarQuiz({
  learnedSet,
  onExit,
}: {
  learnedSet: Set<string>
  onExit: () => void
}) {
  const [n, setN] = useState(0)
  const [ans, setAns] = useState<Kana | null>(null)
  const [opts, setOpts] = useState<Kana[]>([])
  const [picked, setPicked] = useState<string | null>(null)

  const pool = KANA.filter((k) => learnedSet.has(k.id))

  const next = useCallback(() => {
    if (n >= 8) {
      onExit()
      toast('音→字 完成！')
      return
    }
    const a = pool[Math.floor(Math.random() * pool.length)]
    const o = [a]
    const rest = pool.filter((k) => k.ro !== a.ro)
    while (o.length < 4 && rest.length) {
      o.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0])
    }
    o.sort(() => Math.random() - 0.5)
    setAns(a)
    setOpts(o)
    setPicked(null)
    setN((x) => x + 1)
    window.setTimeout(() => speak(a.ch, 0.85), 300)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n])

  // StrictMode 下掛載 effect 會執行兩次；next() 非冪等（會跳過第一題），用 ref 守衛
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    if (pool.length < 4) {
      toast('先修行至少 4 枚假名，再來挑戰')
      onExit()
      return
    }
    next()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!ans) return null
  return (
    <div className="card">
      <div className="eyebrow">音 → 字　{n} / 8</div>
      <p className="sub">聽發音，選出正確的假名。</p>
      <div className="row center" style={{ margin: '10px 0 14px' }}>
        <button className="btn red" onClick={() => speak(ans.ch, 0.85)}>
          🔊 再聽一次
        </button>
      </div>
      <div>
        {opts.map((o) => {
          let cls = 'qopt big'
          if (picked) {
            if (o.id === ans.id) cls += ' ok'
            else if (o.id === picked) cls += ' ng'
          }
          return (
            <button
              key={o.id}
              className={cls}
              onClick={() => {
                if (picked) return
                setPicked(o.id)
                toast(o.id === ans.id ? '正解！' : `是「${ans.ch}」`)
                window.setTimeout(next, 900)
              }}
            >
              {o.ch}
            </button>
          )
        })}
      </div>
    </div>
  )
}
