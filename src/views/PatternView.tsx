import { useEffect, useMemo, useState } from 'react'
import { PATTERNS, type Pattern } from '../data/patterns'
import { itemsFor, dailyPattern } from '../lib/patternDrill'
import {
  checkShape,
  shapeSummary,
  buildComposeSystem,
  buildComposeUser,
  type ShapeCheck,
} from '../lib/patternCompose'
import { parseCritique, VERDICT_LABEL, type Verdict } from '../lib/tutorQuiz'
import { mergeSpoken } from '../lib/voiceInput'
import { chatGemini, hasLLM } from '../lib/llm'
import { personalKnownWords } from '../lib/content'
import { db } from '../db/schema'
import { logActivity } from '../db/repo'
import { speak } from '../audio/tts'
import { useApp } from '../state/store'
import { Karaoke } from '../components/Karaoke'
import { RubyText } from '../components/Ruby'
import { VoiceInput } from '../components/VoiceInput'
import { hasKanji } from '../lib/furigana'
import { toast } from '../components/ui'

type Mode = 'practice' | 'recall' | 'compose'

/**
 * 文型ドリル（句型練習）：固定句型 × 已學過的單字 = 完整例句，每天重複、換不同單字。
 * 三種模式：
 *  ・練習：看日文＋中文、聽發音（逐字上色），把學過的詞輪流套進句型。
 *  ・回想テスト：只看中文，先在心裡（或小聲）說出日文 → 看答案自評。**主動產出＝加深印象**。
 *  ・自由造句：自己挑詞用該句型造一句 → 程式檢核句型骨架與填空詞（零風險、無金鑰照樣可用），
 *    有 Gemini 金鑰時再加一段**中文**講評（僅供參考、不寫入學習庫）。
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
  // 自由造句
  const [known, setKnown] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [check, setCheck] = useState<ShapeCheck | null>(null)
  const [critique, setCritique] = useState<{ verdict: Verdict; body: string } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void (async () => {
      const cards = await db.cards.where('type').equals('vocab').toArray()
      setLearned(new Set(cards.map((c) => c.refId)))
      setKnown(await personalKnownWords())
    })()
  }, [])

  const todayPat = dailyPattern(todayIdx)
  const pat = PATTERNS.find((p) => p.id === patId) ?? PATTERNS[0]
  const items = useMemo(() => itemsFor(pat, learned), [pat, learned])
  const item = items.length ? items[idx % items.length] : null

  function resetCompose() {
    setInput('')
    setCheck(null)
    setCritique(null)
  }
  function pick(p: Pattern) {
    setPatId(p.id)
    setIdx(0)
    setRange(null)
    setRevealed(false)
    resetCompose()
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
    resetCompose()
  }

  /**
   * 送出自由造句：先跑程式檢核（一定有回饋），再視有無金鑰加一段 AI 中文講評。
   * AI 講評僅供參考、不寫入學習庫；連線失敗也不影響上面的程式檢核結果。
   */
  async function submitCompose() {
    const my = input.trim()
    if (!my || loading) return
    const c = checkShape(pat, my, learned)
    setCheck(c)
    setCritique(null)
    setPracticed((n) => n + 1)
    void logActivity('pattern')
    if (!hasLLM()) return
    setLoading(true)
    try {
      const examples = items.slice(0, 3).map((it) => `${it.jp}（${it.zh}）`)
      const text = await chatGemini(buildComposeSystem(known), [
        { role: 'user', text: buildComposeUser(pat, my, examples, c) },
      ])
      setCritique(parseCritique(text))
    } catch (e) {
      const err = (e as Error).message
      toast(
        err.startsWith('gemini-http-4')
          ? 'Gemini 金鑰無效或額度用盡 — 請到設定確認'
          : '講評連線失敗，上面的句型檢核仍然有效',
      )
    } finally {
      setLoading(false)
    }
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
          用「回想テスト」只看中文說出日文；再進一步用「自由造句」<b>自己挑詞</b>造一句
          ——主動產出，記得更牢。
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
          <button
            className={'btn small' + (mode === 'compose' ? '' : ' ghost')}
            onClick={() => switchMode('compose')}
          >
            ✍ 自由造句
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

      {mode === 'compose' ? (
        <div className="card">
          <div className="row between">
            <div className="eyebrow">自由造句 ─ 自分で つくる</div>
            <span className="chip">{pat.label}</span>
          </div>
          <div className="recallZh">用「{pat.zh}」造一句</div>
          <p className="sub" style={{ textAlign: 'center', marginTop: 2 }}>
            這次<b>自己挑一個單字</b>填進句型，打出完整的日文句子。
          </p>
          {items.length > 0 && (
            <p className="sub" style={{ marginTop: 8 }}>
              教材例句：{items[0].jp}（{items[0].zh}）
            </p>
          )}

          <div className="row" style={{ marginTop: 10, gap: 6 }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitCompose()
              }}
              placeholder={`用「${pat.label}」造句…`}
              style={{
                flex: 1,
                fontSize: 15,
                borderRadius: 8,
                border: '1px solid var(--washi2)',
                padding: '8px 10px',
              }}
            />
            <button className="btn small" onClick={() => void submitCompose()} disabled={loading}>
              送出
            </button>
          </div>
          {/* 用說的：辨識結果併進輸入框，使用者確認／修改後才送出（ASR 會聽錯） */}
          {!check && (
            <VoiceInput
              disabled={loading}
              hint="說出來也可以——辨識結果會先填進輸入框"
              onText={(txt) => setInput((cur) => mergeSpoken(cur, txt))}
            />
          )}

          {check && (
            <div className="composeCk">
              <div className={'ckLine ' + (check.ok ? 'ok' : 'ng')}>
                {check.ok ? '✓' : '✗'} 句型接續（{pat.label}）
              </div>
              <div className={'ckLine ' + (check.word ? 'ok' : 'ng')}>
                {check.word ? '✓' : '—'} 填入的詞
                {check.slot && <>：<b>{check.slot}</b></>}
              </div>
              <p className="sub" style={{ marginTop: 4 }}>{shapeSummary(pat, check)}</p>
              <p className="sub" style={{ marginTop: 2 }}>
                以上為<b>程式比對</b>結果（句型接續與詞庫查詢），不含文法判斷。
              </p>
            </div>
          )}

          {loading && <p className="sub center">AI 講評中…</p>}
          {critique && (
            <div className="card" style={{ marginTop: 10, background: 'var(--washi)' }}>
              <div className="sub" style={{ marginBottom: 2 }}>
                講評
                {VERDICT_LABEL[critique.verdict] && (
                  <b style={{ marginLeft: 6 }}>{VERDICT_LABEL[critique.verdict]}</b>
                )}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.7 }}>
                {critique.body}
              </div>
              <div className="hint" style={{ marginTop: 8 }}>
                ⚠️ 講評由 AI 生成、<b>僅供參考</b>，不會寫入你的學習資料；上方教材例句才是已驗證的說法。
              </div>
            </div>
          )}

          {check && (
            <div className="row center" style={{ marginTop: 10 }}>
              <button className="btn small ghost" onClick={resetCompose}>
                再造一句 →
              </button>
            </div>
          )}
          {!hasLLM() && (
            <p className="sub" style={{ marginTop: 10 }}>
              到<b>設定</b>（點頁首標題）填入 Gemini 金鑰後，送出的句子還會多一段<b>中文講評</b>。
              沒有金鑰也能練——上面的句型檢核由程式完成。
            </p>
          )}

          <p className="sub" style={{ marginTop: 12 }}>
            💡 {pat.note}
          </p>
          {practiced > 0 && (
            <p className="sub" style={{ marginTop: 4 }}>
              今回已練 <b>{practiced}</b> 句——已記入学習記録。
            </p>
          )}
        </div>
      ) : item ? (
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
