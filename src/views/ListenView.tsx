import { useState, useCallback, useRef } from 'react'
import { PAIRS, type MinimalPair } from '../data/pairs'
import { speak } from '../audio/tts'
import { useApp } from '../state/store'
import { toast } from '../components/ui'
import { PitchView } from './PitchView'

interface Round {
  pair: MinimalPair
  ans: 'a' | 'b'
}

export function ListenView() {
  const [mode, setMode] = useState<'sound' | 'pitch'>('sound')
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
      setFb(`是「${round.pair[round.ans].jp}」。注意${round.pair.type}的長度差。`)
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
            辨音（清濁・長短）
          </button>
          <button className={mode === 'pitch' ? 'on' : ''} onClick={() => setMode('pitch')}>
            重音（高低）
          </button>
        </div>
      </div>

      {mode === 'pitch' ? (
        <PitchView />
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
