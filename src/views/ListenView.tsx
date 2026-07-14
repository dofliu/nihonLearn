import { useState, useCallback, useRef, useEffect } from 'react'
import { PAIRS, type MinimalPair } from '../data/pairs'
import { SENTS } from '../data/sentences'
import { PASSAGES } from '../data/passages'
import {
  listeningQuestions,
  pickParagraphs,
  responseQuestions,
  expressionQuestions,
  type ListenItem,
  type ListenQuestion,
  type ResponseQuestion,
  type ExpressionQuestion,
} from '../lib/listening'
import { RESPONSES, EXPRESSIONS } from '../data/kaiwa'
import { speak } from '../audio/tts'
import { useApp } from '../state/store'
import { toast } from '../components/ui'
import { PitchView } from './PitchView'

interface Round {
  pair: MinimalPair
  ans: 'a' | 'b'
}

type Mode = 'sound' | 'comprehension' | 'pitch'

export function ListenView() {
  const [mode, setMode] = useState<Mode>('sound')
  const bump = useApp((s) => s.bump)
  const [active, setActive] = useState(false)
  const [n, setN] = useState(0)
  const [round, setRound] = useState<Round | null>(null)
  const [picked, setPicked] = useState<'a' | 'b' | null>(null)
  const [fb, setFb] = useState('')
  const orderRef = useRef<MinimalPair[]>([])

  const nextRound = useCallback(
    (count: number) => {
      if (count > 5) {
        setActive(false)
        setRound(null)
        toast('耳の修行 完成！')
        return
      }
      const pair = orderRef.current[(count - 1) % orderRef.current.length]
      const ans: 'a' | 'b' = Math.random() < 0.5 ? 'a' : 'b'
      setRound({ pair, ans })
      setPicked(null)
      setFb('')
      setN(count)
      window.setTimeout(() => speak(pair[ans].jp, 0.9), 350)
    },
    [],
  )

  function start() {
    orderRef.current = [...PAIRS].sort(() => Math.random() - 0.5)
    setActive(true)
    nextRound(1)
  }

  function answer(k: 'a' | 'b') {
    if (!round || picked) return
    setPicked(k)
    const ok = k === round.ans
    if (ok) {
      setFb('正解！再聽兩詞的差異 →')
    } else {
      const tip =
        round.pair.type === '長音'
          ? '注意長音的長度差'
          : round.pair.type === '促音'
            ? '注意促音（小っ）的停頓'
            : '注意濁音（゛）的清濁差別'
      setFb(`是「${round.pair[round.ans].jp}」。${tip}。`)
    }
    void bump('listen', 1)
    // 對比重播：慢速播 a、再播 b
    window.setTimeout(() => speak(round.pair.a.jp, 0.7), 600)
    window.setTimeout(() => speak(round.pair.b.jp, 0.7), 2100)
    window.setTimeout(() => nextRound(n + 1), 3600)
  }

  return (
    <>
      <div className="card">
        <div className="lvTabs" style={{ marginBottom: 0 }}>
          <button className={mode === 'sound' ? 'on' : ''} onClick={() => setMode('sound')}>
            辨音
          </button>
          <button
            className={mode === 'comprehension' ? 'on' : ''}
            onClick={() => setMode('comprehension')}
          >
            聞き取り
          </button>
          <button className={mode === 'pitch' ? 'on' : ''} onClick={() => setMode('pitch')}>
            重音
          </button>
        </div>
      </div>

      {mode === 'pitch' ? (
        <PitchView />
      ) : mode === 'comprehension' ? (
        <ListenComprehension />
      ) : (
        <>
          <div className="card">
            <div className="eyebrow">耳の修行 ─ 辨音道場</div>
            <h2>最小對立組</h2>
            <p className="sub">
              中文母語者三大盲點：<b>促音っ・長音・濁音</b>。聽一次，判斷是哪個詞。
              答錯不要緊——大腦正是在對比中長出新的音類。
            </p>
            <div className="spacer" />
            {!active && (
              <button className="btn" onClick={start}>
                開始 5 題
              </button>
            )}
          </div>

          {active && round && (
            <div className="card">
          <div className="eyebrow">
            第 {n} / 5 題　── 焦點：{round.pair.type}
          </div>
          <div className="row center" style={{ margin: '6px 0 14px' }}>
            <button className="btn red" onClick={() => speak(round.pair[round.ans].jp, 0.9)}>
              🔊 再聽一次
            </button>
          </div>
          <div>
            {(['a', 'b'] as const).map((k) => {
              const w = round.pair[k]
              let cls = 'qopt'
              if (picked) {
                if (k === round.ans) cls += ' ok'
                else if (k === picked) cls += ' ng'
              }
              return (
                <button key={k} className={cls} onClick={() => answer(k)}>
                  <span style={{ fontFamily: 'var(--disp)', fontSize: 22 }}>{w.jp}</span>
                  <div className="zh">{w.zh}</div>
                </button>
              )
            })}
          </div>
          <div className="sub center" style={{ minHeight: 22, marginTop: 6 }}>
            {fb}
          </div>
        </div>
      )}
        </>
      )}
    </>
  )
}

// ---------- 聞き取り（聽力理解）----------
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '')
}

/** 句子聽解題庫：例句＋情境短文的每一行（皆有中文對照）。 */
function buildPool(): ListenItem[] {
  const fromSents: ListenItem[] = SENTS.map((s) => ({ play: s.jp, reveal: s.jp, zh: s.zh }))
  const fromPassages: ListenItem[] = PASSAGES.flatMap((p) =>
    p.lines.map((l) => {
      const kana = l.read || stripTags(l.jp)
      return { play: kana, reveal: kana, zh: l.zh }
    }),
  )
  return [...fromSents, ...fromPassages]
}

interface ParaItem {
  id: string
  title: string
  play: string // 整段朗讀
  reveal: { read: string; zh: string }[]
  q: string
  answer: string
  options: string[]
}

/** 段落聽解題庫：附理解題的短文（整段朗讀 → 回答大意/場景）。 */
function buildParaPool(): ParaItem[] {
  return PASSAGES.filter((p) => p.quiz).map((p) => {
    const readings = p.lines.map((l) => l.read || stripTags(l.jp))
    return {
      id: p.id,
      title: p.title.split(' ─ ')[1]?.split('（')[0] ?? p.title,
      play: readings.join('。'),
      reveal: p.lines.map((l, i) => ({ read: readings[i], zh: l.zh })),
      q: p.quiz!.q,
      answer: p.quiz!.answer,
      options: p.quiz!.options,
    }
  })
}

type ListenSub = 'menu' | 'sentence' | 'para' | 'response' | 'expression'

const LISTEN_MENU: {
  key: ListenSub
  jp: string
  jlpt: string
  desc: string
  ghost?: boolean
}[] = [
  { key: 'sentence', jp: '句子聽解', jlpt: 'ポイント理解', desc: '聽單句 → 選中文意思（5 題）' },
  { key: 'para', jp: '段落對話', jlpt: '課題理解', desc: '聽整段對話 → 答大意／場景（3 題）', ghost: true },
  { key: 'response', jp: '即時応答', jlpt: '即時応答', desc: '聽一句短問／招呼 → 選恰當回應（5 題）', ghost: true },
  { key: 'expression', jp: '発話表現', jlpt: '発話表現', desc: '看情境 → 選該說的日文（5 題）', ghost: true },
]

function ListenComprehension() {
  const [sub, setSub] = useState<ListenSub>('menu')
  const back = () => setSub('menu')
  if (sub === 'sentence') return <SentenceQuiz onBack={back} />
  if (sub === 'para') return <ParagraphQuiz onBack={back} />
  if (sub === 'response') return <ResponseQuiz onBack={back} />
  if (sub === 'expression') return <ExpressionQuiz onBack={back} />
  return (
    <div className="card">
      <div className="eyebrow">耳の修行 ─ 聞き取り（JLPT N5 題型）</div>
      <h2>聽日文，選意思</h2>
      <p className="sub">
        四種練習貼近 JLPT N5 聴解題型，題材全來自已驗證的日文（不經 AI 生成、無正確性風險）。
        選一種開始：
      </p>
      <div className="spacer" />
      <div className="jlptMenu">
        {LISTEN_MENU.map((m) => (
          <button
            key={m.key}
            className={`btn ${m.ghost ? 'ghost' : ''} jlptItem`}
            onClick={() => setSub(m.key)}
          >
            <span className="jlptTitle">{m.jp}</span>
            <span className="jlptTag">{m.jlpt}</span>
            <span className="jlptDesc">{m.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// 即時応答：播放一句短問／招呼 → 選恰當的「回應」（選項皆日文）。
function ResponseQuiz({ onBack }: { onBack: () => void }) {
  const bump = useApp((s) => s.bump)
  const rate = useApp((s) => s.rate)
  const [qs, setQs] = useState<ResponseQuestion[]>([])
  const [n, setN] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const q = qs[n - 1]

  useEffect(() => {
    const generated = responseQuestions(RESPONSES, 5)
    setQs(generated)
    setN(1)
    window.setTimeout(() => speak(generated[0].play, rate), 350)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function answer(opt: string) {
    if (!q || picked) return
    setPicked(opt)
    void bump('listen', 1)
    window.setTimeout(() => {
      if (n >= qs.length) {
        toast('即時応答 完成！')
        onBack()
        return
      }
      const next = n + 1
      setN(next)
      setPicked(null)
      window.setTimeout(() => speak(qs[next - 1].play, rate), 300)
    }, 1800)
  }

  if (!q) return null
  return (
    <div className="card">
      <div className="row between">
        <div className="eyebrow">即時応答　第 {n} / {qs.length} 題</div>
        <button className="btn small ghost" onClick={onBack}>
          返回
        </button>
      </div>
      <p className="sub center" style={{ marginTop: 2 }}>聽對方說了什麼，選出你該怎麼回應。</p>
      <div className="row center" style={{ margin: '6px 0 12px' }}>
        <button className="btn red" onClick={() => speak(q.play, rate)}>
          🔊 再聽一次
        </button>
      </div>
      {picked && (
        <div className="sent center" style={{ fontSize: 18, marginBottom: 6 }}>
          對方：{q.play}
          <div className="zh">{q.playZh}</div>
        </div>
      )}
      <div>
        {q.options.map((opt) => {
          let cls = 'qopt big'
          if (picked) {
            if (opt === q.answer) cls += ' ok'
            else if (opt === picked) cls += ' ng'
          }
          return (
            <button key={opt} className={cls} onClick={() => answer(opt)}>
              {opt}
            </button>
          )
        })}
      </div>
      {picked && (
        <div className="sub center" style={{ marginTop: 8 }}>
          正解：<b>{q.answer}</b>（{q.answerZh}）
        </div>
      )}
    </div>
  )
}

// 発話表現：給情境（中文）→ 選出該說的日文（選項皆日文，可點聽）。
function ExpressionQuiz({ onBack }: { onBack: () => void }) {
  const bump = useApp((s) => s.bump)
  const rate = useApp((s) => s.rate)
  const [qs, setQs] = useState<ExpressionQuestion[]>([])
  const [n, setN] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const q = qs[n - 1]

  useEffect(() => {
    setQs(expressionQuestions(EXPRESSIONS, 5))
    setN(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function answer(opt: string) {
    if (!q || picked) return
    setPicked(opt)
    void bump('listen', 1)
    void speak(q.answer, rate)
    window.setTimeout(() => {
      if (n >= qs.length) {
        toast('発話表現 完成！')
        onBack()
        return
      }
      setN(n + 1)
      setPicked(null)
    }, 1800)
  }

  if (!q) return null
  return (
    <div className="card">
      <div className="row between">
        <div className="eyebrow">発話表現　第 {n} / {qs.length} 題</div>
        <button className="btn small ghost" onClick={onBack}>
          返回
        </button>
      </div>
      <p className="sub center" style={{ margin: '10px 0 4px', fontSize: 16 }}>
        {q.situationZh}
      </p>
      <p className="sub center" style={{ marginBottom: 10 }}>（點選項可試聽）</p>
      <div>
        {q.options.map((opt) => {
          let cls = 'qopt big'
          if (picked) {
            if (opt === q.answer) cls += ' ok'
            else if (opt === picked) cls += ' ng'
          }
          return (
            <button
              key={opt}
              className={cls}
              onClick={() => (picked ? undefined : answer(opt))}
              onDoubleClick={() => speak(opt, rate)}
            >
              {opt}
            </button>
          )
        })}
      </div>
      {picked && (
        <div className="sub center" style={{ marginTop: 8 }}>
          正解：<b>{q.answer}</b>（{q.answerZh}）
        </div>
      )}
    </div>
  )
}

function SentenceQuiz({ onBack }: { onBack: () => void }) {
  const bump = useApp((s) => s.bump)
  const rate = useApp((s) => s.rate)
  const [qs, setQs] = useState<ListenQuestion[]>([])
  const [n, setN] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const q = qs[n - 1]

  useEffect(() => {
    const generated = listeningQuestions(buildPool(), 5)
    setQs(generated)
    setN(1)
    window.setTimeout(() => speak(generated[0].play, rate), 350)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function answer(opt: string) {
    if (!q || picked) return
    setPicked(opt)
    void bump('listen', 1)
    window.setTimeout(() => {
      if (n >= qs.length) {
        toast('聞き取り 完成！')
        onBack()
        return
      }
      const next = n + 1
      setN(next)
      setPicked(null)
      window.setTimeout(() => speak(qs[next - 1].play, rate), 300)
    }, 1600)
  }

  if (!q) return null
  return (
    <div className="card">
      <div className="row between">
        <div className="eyebrow">聞き取り　第 {n} / {qs.length} 題</div>
        <button className="btn small ghost" onClick={onBack}>
          返回
        </button>
      </div>
      <div className="row center" style={{ margin: '6px 0 14px' }}>
        <button className="btn red" onClick={() => speak(q.play, rate)}>
          🔊 再聽一次
        </button>
      </div>
      {picked && (
        <div className="sent" style={{ fontSize: 20, marginBottom: 6 }}>
          {q.reveal}
        </div>
      )}
      <div>
        {q.options.map((opt) => {
          let cls = 'qopt big'
          if (picked) {
            if (opt === q.answer) cls += ' ok'
            else if (opt === picked) cls += ' ng'
          }
          return (
            <button key={opt} className={cls} onClick={() => answer(opt)}>
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ParagraphQuiz({ onBack }: { onBack: () => void }) {
  const bump = useApp((s) => s.bump)
  const rate = useApp((s) => s.rate)
  const [items, setItems] = useState<ParaItem[]>([])
  const [n, setN] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const it = items[n - 1]

  useEffect(() => {
    const chosen = pickParagraphs(buildParaPool(), 3)
    setItems(chosen)
    setN(1)
    window.setTimeout(() => speak(chosen[0].play, rate), 400)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function answer(opt: string) {
    if (!it || picked) return
    setPicked(opt)
    void bump('listen', 1)
    window.setTimeout(() => {
      if (n >= items.length) {
        toast('段落聽解 完成！')
        onBack()
        return
      }
      const next = n + 1
      setN(next)
      setPicked(null)
      window.setTimeout(() => speak(items[next - 1].play, rate), 400)
    }, 2200)
  }

  if (!it) return null
  return (
    <div className="card">
      <div className="row between">
        <div className="eyebrow">段落聽解　第 {n} / {items.length} 題</div>
        <button className="btn small ghost" onClick={onBack}>
          返回
        </button>
      </div>
      <div className="row center" style={{ margin: '8px 0 12px' }}>
        <button className="btn red" onClick={() => speak(it.play, rate)}>
          ▶ 播放對話
        </button>
      </div>
      <p className="sub center" style={{ fontSize: 15 }}>
        {it.q}
      </p>
      <div>
        {it.options.map((opt) => {
          let cls = 'qopt big'
          if (picked) {
            if (opt === it.answer) cls += ' ok'
            else if (opt === picked) cls += ' ng'
          }
          return (
            <button key={opt} className={cls} onClick={() => answer(opt)}>
              {opt}
            </button>
          )
        })}
      </div>
      {picked && (
        <div style={{ marginTop: 10 }}>
          <div className="sub" style={{ marginBottom: 4 }}>對話內容：</div>
          {it.reveal.map((l, i) => (
            <div key={i} className="rline open">
              <div className="jp">{l.read}</div>
              <div className="zh">{l.zh}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
