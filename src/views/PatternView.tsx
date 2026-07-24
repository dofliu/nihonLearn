import { useEffect, useMemo, useState } from 'react'
import { PATTERNS, type Pattern } from '../data/patterns'
import { itemsFor, dailyPattern } from '../lib/patternDrill'
import { db } from '../db/schema'
import { logActivity } from '../db/repo'
import { speak } from '../audio/tts'
import { useApp } from '../state/store'
import { Karaoke } from '../components/Karaoke'
import { RubyText } from '../components/Ruby'
import { hasKanji } from '../lib/furigana'

type Mode = 'practice' | 'recall'

/**
 * 文型ドリル（句型練習）：固定句型 × 已學過的單字 = 完整例句，每天重複、換不同單字。
 * 兩種模式：
 *  ・練習：看日文＋中文、聽發音（逐字上色），把學過的詞輪流套進句型。
 *  ・回想テスト：只看中文，先在心裡（或小聲）說出日文 → 看答案自評。**主動產出＝加深印象**。
 * 句型與詞皆來自已驗證來源、不經 LLM。屬今日頁「+α 選配練習」，記入学習記録、不卡蓋章。
 */
export function PatternView({ onDone }: { onDone: () => void }) {
  const showKanji = useApp((s) => s.showKanji)
  const rate = useApp((s) => s.rate)
  const [learned, setLearned] = useState<Set<string>>(new Set())
  const todayIdx = Math.floor(Date.now() / 86400000)
  const [patId, setPatId] = useState<string>(() => dailyPattern(todayIdx).id)
  const [mode, setMode] = useState<Mode>('practice')
  const [idx, setIdx] = useState(0)
  const [range, setRange] = useState<[number, number] | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [practiced, setPracticed] = useState(0)
  const [recallOk, setRecallOk] = useState(0)

  useEffect(() => {
    void (async () => {
      const cards = await db.cards.where('type').equals('vocab').toArray()
      setLearned(new Set(cards.map((c) => c.refId)))
    })()
  }, [])

  const todayPat = dailyPattern(todayIdx)
  const pat = PATTERNS.find((p) => p.id === patId) ?? PATTERNS[0]
  const items = useMemo(() => itemsFor(pat, learned), [pat, learned])
  const item = items.length ? items[idx % items.length] : null

  function pick(p: Pattern) {
    setPatId(p.id)
    setIdx(0)
    setRange(null)
    setRevealed(false)
  }
  function nextWord() {
    if (!items.length) return
    setIdx((i) => (i + 1) % items.length)
    setRange(null)
    setRevealed(false)
  }
  function switchMode(m: Mode) {
    setMode(m)
    setRevealed(false)
    setRange(null)
  }

  async function play(r: number) {
    if (!item) return
    setRange([0, 0])
    await speak(item.jp, r, { onBoundary: (s, e) => setRange([s, e]) })
    setRange(null)
    if (mode === 'practice') {
      setPracticed((n) => n + 1)
      void logActivity('pattern')
    }
  }

  function reveal() {
    setRevealed(true)
    setPracticed((n) => n + 1)
    void logActivity('pattern')
  }
  function grade(ok: boolean) {
    if (ok) setRecallOk((n) => n + 1)
    nextWord()
  }

  const jpEl =
    item &&
    (showKanji && item.alt && hasKanji(item.alt) ? (
      <RubyText display={item.alt} reading={item.jp} className="sent" />
    ) : (
      <Karaoke text={item.jp} range={range} className="sent" />
    ))

  return (
    <>
      <div className="card">
        <div className="row between">
          <div className="eyebrow">文型ドリル ─ 句型練習</div>
          <button className="btn small ghost" onClick={onDone}>
            ← 返回
          </button>
        </div>
        <h2>套一個句型，換不同單字</h2>
        <p className="sub">
          記住一個句型（如「請給我〜」），把學過的單字輪流套進去——
          <b>請給我咖啡・請給我飯糰・請給我果汁</b>。
          用「回想テスト」只看中文說出日文，主動產出，記得更牢。
        </p>
        <div className="modeRow">
          <button
            className={'btn small' + (mode === 'practice' ? '' : ' ghost')}
            onClick={() => switchMode('practice')}
          >
            📖 練習
          </button>
          <button
            className={'btn small' + (mode === 'recall' ? '' : ' ghost')}
            onClick={() => switchMode('recall')}
          >
            🎯 回想テスト
          </button>
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">選一個句型</div>
        <div className="patGrid">
          {PATTERNS.map((p) => (
            <button
              key={p.id}
              className={'btn passBtn' + (p.id === pat.id ? ' on' : '')}
              onClick={() => pick(p)}
            >
              <span className="passJp">
                {p.label}
                {p.id === todayPat.id && <span className="patToday"> ・今日</span>}
              </span>
              <span className="passZh">{p.zh}</span>
            </button>
          ))}
        </div>
      </div>

      {item ? (
        <div className="card">
          <div className="row between">
            <div className="eyebrow">{pat.zh}</div>
            <span className="chip">
              {idx + 1} / {items.length}
            </span>
          </div>

          {mode === 'practice' ? (
            <>
              {jpEl}
              <div className="sentZh">{item.zh}</div>
              <div className="slotWord">
                填入的單字：<b>{item.word.jp}</b>（{item.word.zh}）
                {item.fallback && <span className="patFallback"> ・尚未學到，先熟悉</span>}
              </div>
              <div className="row center" style={{ marginTop: 10 }}>
                <button className="btn small ghost" onClick={() => void play(0.75)}>
                  🔊 慢速
                </button>
                <button className="btn small ghost" onClick={() => void play(rate)}>
                  🔊 常速
                </button>
                <button className="btn small" onClick={nextWord}>
                  換一個單字 →
                </button>
              </div>
            </>
          ) : (
            <>
              {/* 回想テスト：只看中文，先自己說出日文再揭曉 */}
              <div className="recallZh">{item.zh}</div>
              {!revealed ? (
                <>
                  <p className="sub" style={{ textAlign: 'center', marginTop: 8 }}>
                    🤔 用「{pat.label}」句型，先在心裡（或小聲）說出日文……
                  </p>
                  <div className="row center" style={{ marginTop: 10 }}>
                    <button className="btn" onClick={reveal}>
                      看答案 👀
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {jpEl}
                  <div className="slotWord" style={{ marginTop: 4 }}>
                    單字：<b>{item.word.jp}</b>（{item.word.zh}）
                    {item.fallback && (
                      <span className="patFallback"> ・尚未學到，先熟悉</span>
                    )}
                  </div>
                  <div className="row center" style={{ marginTop: 6 }}>
                    <button className="btn small ghost" onClick={() => void play(rate)}>
                      🔊 聽一次
                    </button>
                  </div>
                  <div className="row center" style={{ marginTop: 10 }}>
                    <button className="btn ghost" onClick={() => grade(false)}>
                      🔁 再一次
                    </button>
                    <button className="btn" onClick={() => grade(true)}>
                      ✅ 說對了
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          <p className="sub" style={{ marginTop: 12 }}>
            💡 {pat.note}
          </p>
          {(practiced > 0 || recallOk > 0) && (
            <p className="sub" style={{ marginTop: 4 }}>
              今回已練 <b>{practiced}</b> 句
              {mode === 'recall' && <>・說對 <b>{recallOk}</b> 句</>}
              ——已記入学習記録。
            </p>
          )}
        </div>
      ) : (
        <div className="card">
          <p className="sub">此句型暫時沒有可用的單字。</p>
        </div>
      )}
    </>
  )
}
