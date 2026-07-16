import { useState, useRef, useEffect } from 'react'
import { SENTS, type Sentence } from '../data/sentences'
import { speak } from '../audio/tts'
import {
  recognizeAndScore,
  detectScoreEngine,
  SidecarRecorder,
  type ScoreEngine,
  type MoraDiff,
} from '../audio/scorer'
import { logAttempt } from '../db/repo'
import { getUserSentences } from '../lib/content'
import { useApp } from '../state/store'
import { toast } from '../components/ui'
import { Karaoke } from '../components/Karaoke'
import { RubyText } from '../components/Ruby'
import { hasKanji } from '../lib/furigana'
import { DialogueView } from './DialogueView'

function mark(score: number) {
  return score >= 80 ? '◎' : score >= 55 ? '○' : '△'
}
function markColor(score: number) {
  return score >= 80 ? 'var(--take)' : score >= 55 ? 'var(--yama)' : 'var(--shu)'
}

export function SpeakView({ onOpenReview }: { onOpenReview: () => void }) {
  const bump = useApp((s) => s.bump)
  const showKanji = useApp((s) => s.showKanji)
  const [tab, setTab] = useState<'shadow' | 'dialogue'>('shadow')
  const [lv, setLv] = useState<1 | 2 | 3>(1)
  const [idx, setIdx] = useState(0)
  const [recording, setRecording] = useState(false)
  const [scoreTxt, setScoreTxt] = useState('')
  const [scoreColor, setScoreColor] = useState('var(--sumi)')
  const [recTxt, setRecTxt] = useState('')
  const [selfMode, setSelfMode] = useState(false)
  const [engine, setEngine] = useState<ScoreEngine>('none')
  const [moraDiff, setMoraDiff] = useState<MoraDiff[] | null>(null)
  const [userSents, setUserSents] = useState<Sentence[]>([])
  const [range, setRange] = useState<[number, number] | null>(null)
  const recorderRef = useRef<SidecarRecorder | null>(null)

  useEffect(() => {
    void (async () => setEngine(await detectScoreEngine()))()
    return () => recorderRef.current?.cancel()
  }, [])

  useEffect(() => {
    void (async () => {
      const rows = await getUserSentences()
      setUserSents(
        rows.map((r) => ({
          id: 'u' + r.id,
          lv: r.lv,
          jp: r.jp,
          zh: r.zh,
          alt: r.read,
        })),
      )
    })()
  }, [])

  const list = [...SENTS, ...userSents].filter((s) => s.lv === lv)
  const sent: Sentence = list[idx]
  const targets = sent.alt ? [sent.jp, sent.alt] : [sent.jp]

  function reset() {
    setScoreTxt('')
    setRecTxt('')
    setSelfMode(false)
    setMoraDiff(null)
    setRange(null)
  }

  // 卡拉OK朗讀：唸「顯示的假名句」（與逐字上色對齊），boundary 更新高亮範圍
  async function play(rate: number) {
    setRange([0, 0])
    await speak(sent.jp, rate, { onBoundary: (s, e) => setRange([s, e]) })
    setRange(null)
  }
  function pickLv(n: 1 | 2 | 3) {
    setLv(n)
    setIdx(0)
    reset()
  }
  function move(delta: number) {
    const L = list.length
    setIdx((i) => (i + delta + L) % L)
    reset()
  }

  async function finishScore(res: {
    score: number
    transcript: string
    source: 'asr' | 'self'
    moraDiff?: MoraDiff[]
  }) {
    setScoreTxt(`${mark(res.score)} ${res.score}点`)
    setScoreColor(markColor(res.score))
    if (res.transcript) setRecTxt('聽到：' + res.transcript)
    setMoraDiff(res.moraDiff && res.moraDiff.length ? res.moraDiff : null)
    await logAttempt({
      sentenceId: sent.id,
      score: res.score,
      transcript: res.transcript,
      source: res.source,
    })
    await bump('speak', 1)
  }

  async function record() {
    // whisper：手動開始 / 停止（faster-whisper 不自動偵測語尾）
    if (engine === 'whisper') {
      if (!recording) {
        try {
          recorderRef.current = new SidecarRecorder()
          await recorderRef.current.start()
          setRecording(true)
          setRecTxt('錄音中…再按一次停止並評分')
          setScoreTxt('')
        } catch {
          setRecTxt('無法取得麥克風 — 改用自我評分')
          setSelfMode(true)
        }
      } else {
        setRecording(false)
        setRecTxt('評分中…（whisper 轉寫）')
        try {
          const res = await recorderRef.current!.stopAndScore(targets)
          await finishScore(res)
        } catch (e) {
          setRecTxt('sidecar 評分失敗（' + (e as Error).message + '）— 改用自我評分')
          setSelfMode(true)
        }
      }
      return
    }

    // 瀏覽器 ASR：自動偵測語尾
    if (engine === 'asr') {
      if (recording) return
      setRecording(true)
      setRecTxt('聞いています…（說完會自動停止）')
      try {
        const res = await recognizeAndScore(targets)
        await finishScore(res)
      } catch (e) {
        const err = (e as Error).message
        setRecTxt(
          err === 'no-asr'
            ? '此環境不支援語音辨識 — 改用自我評分'
            : '辨識失敗（' + err + '）— 改用自我評分',
        )
        setSelfMode(true)
      } finally {
        setRecording(false)
      }
      return
    }

    // 無評分引擎：直接自評
    setRecTxt('此環境無語音評分 — 請跟讀後自評')
    setSelfMode(true)
  }

  async function selfMark(m: string, s: number) {
    setScoreTxt(m)
    setScoreColor(markColor(s))
    setSelfMode(false)
    await logAttempt({ sentenceId: sent.id, score: s, transcript: '(self)', source: 'self' })
    await bump('speak', 1)
  }

  return (
    <>
      <div className="card">
        <div className="lvTabs" style={{ marginBottom: 0 }}>
          <button className={tab === 'shadow' ? 'on' : ''} onClick={() => setTab('shadow')}>
            跟読
          </button>
          <button className={tab === 'dialogue' ? 'on' : ''} onClick={() => setTab('dialogue')}>
            会話
          </button>
        </div>
      </div>

      {tab === 'dialogue' ? (
        <DialogueView />
      ) : (
        <>
      <div className="card">
        <div className="eyebrow">口の修行 ─ 跟讀（Shadowing）</div>
        <p className="sub">
          聽 → 立刻模仿，連語調一起。每句至少跟讀三次再進下一句。
          有麥克風權限時系統會辨識比對評分；否則採自評。
        </p>
        <div className="lvTabs">
          <button className={lv === 1 ? 'on' : ''} onClick={() => pickLv(1)}>
            壱・生存句
          </button>
          <button className={lv === 2 ? 'on' : ''} onClick={() => pickLv(2)}>
            弐・日常句
          </button>
          <button className={lv === 3 ? 'on' : ''} onClick={() => pickLv(3)}>
            参・物語句
          </button>
        </div>
        <button className="btn small ghost" onClick={onOpenReview}>
          ✨ 生成新練習句 →
        </button>
      </div>

      <div className="card">
        <div className="eyebrow">
          第 {idx + 1} / {list.length} 句
        </div>
        {showKanji && sent.alt && hasKanji(sent.alt) ? (
          // 漢字モード：漢字正寫＋假名注音（ruby 顯示不逐字上色）
          <RubyText display={sent.alt} reading={sent.jp} className="sent" />
        ) : (
          <Karaoke text={sent.jp} range={range} className="sent" />
        )}
        <div className="sentZh">{sent.zh}</div>
        <div className="row center" style={{ marginBottom: 14 }}>
          <button className="btn small ghost" onClick={() => void play(0.7)}>
            🔊 慢速
          </button>
          <button className="btn small ghost" onClick={() => void play(1.0)}>
            🔊 常速
          </button>
        </div>

        <div className="sub center" style={{ marginBottom: 8 }}>
          評分：
          {engine === 'whisper'
            ? 'faster-whisper（5090・音素比對）'
            : engine === 'asr'
              ? '瀏覽器語音辨識'
              : '自我評分'}
        </div>
        <button
          className={'micBtn' + (recording ? ' rec' : '')}
          onClick={() => void record()}
        >
          {engine === 'whisper' && recording ? '⏹' : '🎤'}
        </button>

        <div className="spacer" />
        <div className="scoreBig" style={{ color: scoreColor }}>
          {scoreTxt}
        </div>
        <div className="recTxt">{recTxt}</div>

        {moraDiff && (
          <div style={{ marginTop: 10 }}>
            <div className="sub center" style={{ marginBottom: 6 }}>
              音別診断（紅＝漏發或發錯）
            </div>
            <div className="row center" style={{ gap: 4 }}>
              {moraDiff.map((m, i) => {
                const color =
                  m.status === 'ok'
                    ? 'var(--take)'
                    : m.status === 'del'
                      ? 'var(--shu)'
                      : 'var(--yama)'
                return (
                  <span
                    key={i}
                    style={{
                      fontFamily: 'var(--disp)',
                      fontSize: 22,
                      color,
                      textDecoration: m.status === 'del' ? 'line-through' : 'none',
                      opacity: m.status === 'del' ? 0.6 : 1,
                    }}
                    title={
                      m.status === 'ok' ? '發對' : m.status === 'del' ? '漏發' : '發成別的音'
                    }
                  >
                    {m.mora}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {selfMode && (
          <div className="row center">
            <button className="btn small ghost" onClick={() => void selfMark('◎', 90)}>
              ◎ 很像
            </button>
            <button className="btn small ghost" onClick={() => void selfMark('○', 65)}>
              ○ 還行
            </button>
            <button className="btn small ghost" onClick={() => void selfMark('△', 40)}>
              △ 再練
            </button>
          </div>
        )}

        <div className="spacer" />
        <div className="row between">
          <button className="btn small ghost" onClick={() => move(-1)}>
            ← 前の句
          </button>
          <button className="btn small" onClick={() => move(1)}>
            次の句 →
          </button>
        </div>
      </div>
        </>
      )}
    </>
  )
}
