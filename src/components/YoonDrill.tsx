import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildYoonQuiz, yoonPool, YOON_QUIZ_LEN, type YoonQuestion } from '../lib/yoonDrill'
import { charOf, type ChartScript } from '../lib/kanaChart'
import { speak } from '../audio/tts'
import { logActivity } from '../db/repo'
import { useApp } from '../state/store'
import { ProgressBar, toast } from './ui'

/**
 * 拗音ドリル：看拗音 → 選羅馬字（33 音，一輪 10 題）。
 *
 * 「剛學完五十音」的人正好卡在拗音——きょう 會被唸成 ki-yo-u 而不是 kyo-u。
 * v3.36 的五十音圖只能查、不能練（拗音沒有 SRS 卡片），這裡補上練習本身。
 *
 * 定位：**選配加練**（feature key `yoon`）——記入学習記録、當日核心蓋章後可讓済印變金，
 * 但**不卡蓋章、不進 SRS**（`data/kana.ts` 的 142 枚卡組一枚不動）。
 * 題目與選項全部由 `lib/yoonDrill.ts` 從已驗證資料推導，不經 LLM、零正確性風險。
 * 答完不自動跳題（比照 v3.18 聞き取り，讓答案停留到自己看完再按「下一題」）。
 */
export function YoonDrill({
  initialScript = 'hiragana',
  onExit,
}: {
  initialScript?: ChartScript
  onExit: () => void
}) {
  const rate = useApp((s) => s.rate)
  const [script, setScript] = useState<ChartScript>(initialScript)
  const [qs, setQs] = useState<YoonQuestion[]>([])
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [correct, setCorrect] = useState(0)
  const [done, setDone] = useState(false)

  const total = useMemo(() => yoonPool().length, [])

  const start = useCallback(() => {
    setQs(buildYoonQuiz(Math.random, YOON_QUIZ_LEN))
    setIdx(0)
    setPicked(null)
    setCorrect(0)
    setDone(false)
  }, [])

  useEffect(() => start(), [start])

  const q = qs[idx]

  function choose(o: string) {
    if (picked || !q) return
    setPicked(o)
    if (o === q.answer) setCorrect((n) => n + 1)
    void speak(charOf(q.cell, script), rate)
  }

  async function next() {
    if (idx + 1 < qs.length) {
      setIdx(idx + 1)
      setPicked(null)
      return
    }
    setDone(true)
    await logActivity('yoon')
    toast('拗音の稽古、記録しました')
  }

  if (done) {
    return (
      <div className="card">
        <div className="eyebrow">拗音ドリル ─ 結果</div>
        <h2>
          {correct} / {qs.length} 正解
        </h2>
        <p className="sub">
          拗音是「い段假名＋小さい ゃ／ゅ／ょ」，兩個字合起來只唸一拍——きょう 是 kyo-u
          （兩拍），不是 ki-yo-u。多練幾輪就會反應得過來。
        </p>
        <div className="spacer" />
        <div className="row">
          <button className="btn" onClick={start}>
            もう一度（再一輪）
          </button>
          <button className="btn ghost" onClick={onExit}>
            ← 返回五十音道場
          </button>
        </div>
      </div>
    )
  }

  if (!q) return null

  const ch = charOf(q.cell, script)

  return (
    <div className="card">
      <div className="row between">
        <div className="eyebrow">拗音ドリル ─ 字を見て 音を選ぶ</div>
        <button className="btn small ghost" onClick={onExit}>
          ← 返回
        </button>
      </div>

      <div className="lvTabs" style={{ marginTop: 8 }}>
        <button
          className={script === 'hiragana' ? 'on' : ''}
          onClick={() => setScript('hiragana')}
        >
          あ 平假名
        </button>
        <button
          className={script === 'katakana' ? 'on' : ''}
          onClick={() => setScript('katakana')}
        >
          ア 片假名
        </button>
      </div>

      <div className="sub" style={{ marginTop: 8 }}>
        {idx + 1} / {qs.length} 題　全 {total} 音・選配加練，不列入每日修行
      </div>
      <ProgressBar current={idx + 1} total={qs.length} />

      <div className="kanaFace">{ch}</div>

      <div style={{ marginTop: 8 }}>
        {q.options.map((o) => {
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

      {picked && (
        <>
          <p className="sub" style={{ marginTop: 10 }}>
            {ch} ＝ {q.answer}　（{q.cell.h} ／ {q.cell.k}）
          </p>
          <div className="row between" style={{ marginTop: 8 }}>
            <button className="btn small ghost" onClick={() => void speak(ch, rate)}>
              🔊 再聽一次
            </button>
            <button className="btn red" onClick={() => void next()}>
              {idx + 1 < qs.length ? '下一題 →' : '完成 ✓'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
