import { useState, useEffect, useCallback } from 'react'
import { VOCAB, type Vocab } from '../data/vocab'
import { db } from '../db/schema'
import { saveQuizResult, weakWordCounts } from '../db/repo'
import { generateQuiz, MIN_POOL, type QuizQuestion } from '../lib/quiz'
import { speak } from '../audio/tts'
import { toast } from '../components/ui'

const BY_JP = Object.fromEntries(VOCAB.map((v) => [v.jp, v])) as Record<string, Vocab>
const QUIZ_N = 10

const KIND_LABEL: Record<QuizQuestion['kind'], string> = {
  meaning: '意味を選ぶ（日→中）',
  word: '語彙を選ぶ（中→日）',
  listen: '聞き取り（音→中）',
  arrange: '並べ替え（かな）',
}

export function QuizView({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'home' | 'run' | 'result'>('home')
  const [learnedVocab, setLearnedVocab] = useState<Vocab[]>([])
  const [weak, setWeak] = useState<{ jp: string; zh: string; count: number }[]>([])
  const [qs, setQs] = useState<QuizQuestion[]>([])
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [built, setBuilt] = useState<string[]>([]) // arrange 已排字元
  const [correct, setCorrect] = useState(0)
  const [wrong, setWrong] = useState<string[]>([]) // 答錯的 refId

  const refresh = useCallback(async () => {
    const cards = await db.cards.where('type').equals('vocab').toArray()
    const learned = cards.map((c) => BY_JP[c.refId]).filter(Boolean)
    setLearnedVocab(learned)
    const counts = await weakWordCounts()
    setWeak(
      counts
        .slice(0, 6)
        .map((c) => ({ jp: c.refId, zh: BY_JP[c.refId]?.zh ?? '', count: c.count }))
        .filter((w) => w.zh),
    )
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  function start() {
    const generated = generateQuiz(learnedVocab, QUIZ_N)
    if (generated.length === 0) {
      toast(`先學會至少 ${MIN_POOL} 個詞，再來測驗`)
      return
    }
    setQs(generated)
    setIdx(0)
    setPicked(null)
    setBuilt([])
    setCorrect(0)
    setWrong([])
    setMode('run')
    const first = generated[0]
    if (first.kind === 'listen') window.setTimeout(() => speak(first.promptRead || '', 0.85), 300)
  }

  function advance(ok: boolean, refId: string) {
    if (!ok) setWrong((w) => (w.includes(refId) ? w : [...w, refId]))
    if (ok) setCorrect((c) => c + 1)
    window.setTimeout(() => {
      const next = idx + 1
      if (next >= qs.length) {
        void finish(ok)
      } else {
        setIdx(next)
        setPicked(null)
        setBuilt([])
        const q = qs[next]
        if (q.kind === 'listen') window.setTimeout(() => speak(q.promptRead || '', 0.85), 300)
      }
    }, 850)
  }

  async function finish(lastOk: boolean) {
    const finalCorrect = correct + (lastOk ? 1 : 0)
    const finalWrong = Array.from(
      new Set(lastOk ? wrong : [...wrong, qs[idx].refId]),
    )
    await saveQuizResult(qs.length, finalCorrect, finalWrong)
    setCorrect(finalCorrect)
    setMode('result')
    await refresh()
  }

  function choose(opt: string) {
    if (picked) return
    const q = qs[idx]
    setPicked(opt)
    const ok = opt === q.answer
    if (ok) speak(q.refId, 0.85)
    else toast(`正解：${q.answer}`)
    advance(ok, q.refId)
  }

  function tapTile(ch: string, i: number) {
    if (picked) return
    const q = qs[idx]
    const next = [...built, ch]
    setBuilt(next)
    if (next.length === [...q.answer].length) {
      const guess = next.join('')
      const ok = guess === q.answer
      setPicked(guess)
      if (ok) speak(q.answer, 0.85)
      else toast(`正解：${q.answer}`)
      advance(ok, q.refId)
    }
    void i
  }

  // ---------- 結果 ----------
  if (mode === 'result') {
    const pct = qs.length ? Math.round((correct / qs.length) * 100) : 0
    const missed = Array.from(new Set(wrong)).map((r) => BY_JP[r]).filter(Boolean)
    return (
      <>
        <div className="card">
          <div className="eyebrow">測驗結果 ─ N5 模擬</div>
          <div className="sent" style={{ fontSize: 34, textAlign: 'center' }}>
            {correct} / {qs.length}
          </div>
          <p className="sub" style={{ textAlign: 'center' }}>
            正答率 <b>{pct}%</b>
            {pct >= 80 ? '　お見事！' : pct >= 50 ? '　その調子！' : '　まだまだ、頑張ろう'}
          </p>
        </div>
        {missed.length > 0 && (
          <div className="card">
            <div className="eyebrow">要復習（本次答錯）</div>
            {missed.map((v) => (
              <div key={v.jp} className="wordRow" onClick={() => speak(v.jp, 0.85)}>
                <span className="wj">{v.jp} 🔊</span>
                <span className="wz">{v.zh}</span>
              </div>
            ))}
          </div>
        )}
        <div className="card">
          <div className="row center">
            <button className="btn" onClick={start}>
              再測一次
            </button>
            <button className="btn ghost" onClick={onDone}>
              返回
            </button>
          </div>
        </div>
      </>
    )
  }

  // ---------- 作答 ----------
  if (mode === 'run') {
    const q = qs[idx]
    return (
      <div className="card">
        <div className="eyebrow">
          {idx + 1} / {qs.length}　{KIND_LABEL[q.kind]}
        </div>

        {q.kind === 'listen' ? (
          <div className="row center" style={{ margin: '12px 0' }}>
            <button className="btn red" onClick={() => speak(q.promptRead || '', 0.85)}>
              🔊 再聽一次
            </button>
          </div>
        ) : (
          <div className="sent" style={{ fontSize: 26, textAlign: 'center', margin: '8px 0' }}>
            {q.prompt}
          </div>
        )}

        {q.kind === 'arrange' ? (
          <>
            <div className="sent" style={{ fontSize: 24, textAlign: 'center', minHeight: 34 }}>
              {built.join('') || '　'}
            </div>
            <div className="row center" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {q.tiles!.map((ch, i) => (
                <button
                  key={i}
                  className="btn small ghost qtile"
                  disabled={Boolean(picked)}
                  style={{ minWidth: 44, fontSize: 20 }}
                  onClick={() => tapTile(ch, i)}
                >
                  {ch}
                </button>
              ))}
            </div>
            {built.length > 0 && !picked && (
              <div className="row center" style={{ marginTop: 8 }}>
                <button className="btn small ghost" onClick={() => setBuilt([])}>
                  重來
                </button>
              </div>
            )}
          </>
        ) : (
          <div style={{ marginTop: 8 }}>
            {q.options!.map((o) => {
              let cls = 'qopt big'
              if (picked) {
                if (o === q.answer) cls += ' ok'
                else if (o === picked) cls += ' ng'
              }
              return (
                <button key={o} className={cls} onClick={() => choose(o)}>
                  {o}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ---------- 首頁 ----------
  return (
    <>
      <div className="card">
        <div className="eyebrow">腕試し ─ N5 模擬測驗</div>
        <p className="sub">
          從你<b>已學過的詞彙</b>出題（意味・語彙・聞き取り・並べ替え共 {QUIZ_N} 題）。
          題目全部來自已驗證資料，考的就是你學過的內容。
        </p>
        <div className="statChips">
          <span className="chip">
            可出題詞庫 <b>{learnedVocab.length}</b>
          </span>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={start} disabled={learnedVocab.length < MIN_POOL}>
          {learnedVocab.length < MIN_POOL ? `先學會 ${MIN_POOL} 個詞` : '開始測驗'}
        </button>
      </div>

      {weak.length > 0 && (
        <div className="card">
          <div className="eyebrow">弱點分析（最常答錯）</div>
          {weak.map((w) => (
            <div key={w.jp} className="wordRow" onClick={() => speak(w.jp, 0.85)}>
              <span className="wj">{w.jp} 🔊</span>
              <span className="wz">
                {w.zh}　✕{w.count}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="row center">
          <button className="btn ghost" onClick={onDone}>
            返回
          </button>
        </div>
      </div>
    </>
  )
}
