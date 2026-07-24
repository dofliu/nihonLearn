import { useEffect, useState } from 'react'
import { useApp, TASKS } from '../state/store'
import { db } from '../db/schema'
import { allStampDates, listActivity } from '../db/repo'
import { isMastered } from '../srs/scheduler'
import { lastNDays, todayStr } from '../lib/date'
import { SENTS } from '../data/sentences'
import { KANA } from '../data/kana'
import { VOCAB } from '../data/vocab'
import { speak } from '../audio/tts'
import { Karaoke } from '../components/Karaoke'
import { RubyText } from '../components/Ruby'
import { hasKanji } from '../lib/furigana'
import { dailyPattern } from '../lib/patternDrill'
import { featuresOnDay, goldStampDays, dailyExtraFeature } from '../lib/activity'
import type { Tab } from '../components/Nav'

function greeting() {
  const h = new Date().getHours()
  return h < 11 ? 'おはようございます' : h < 18 ? 'こんにちは' : 'こんばんは'
}

function dailySentence() {
  const day = Math.floor(Date.now() / 86400000)
  return SENTS[day % SENTS.length]
}

/** 選配加練的顯示資訊（輪替曝光用；行為連到既有頁面／overlay）。 */
const EXTRA_META: Record<string, { emoji: string; name: string; desc: string }> = {
  write: { emoji: '✍', name: '書寫練習', desc: '假名・漢字手寫，看字形相似度' },
  quiz: { emoji: '📝', name: 'N5 測驗', desc: '從學過的詞出題，測意味・語彙・聽力' },
  pitch: { emoji: '📈', name: '重音道場', desc: '辨音 × 東京式重音型辨識' },
  pattern: { emoji: '🧩', name: '文型ドリル', desc: '固定句型換單字，一句多用' },
}

export function TodayView({
  onNav,
  onOpenProgress,
  onOpenQuiz,
  onOpenTutor,
  onOpenPattern,
}: {
  onNav: (t: Tab) => void
  onOpenProgress: () => void
  onOpenQuiz: () => void
  onOpenTutor: () => void
  onOpenPattern: () => void
}) {
  const { counts, streak, rate, asrAvg, setRate, showKanji } = useApp()
  const [stampDates, setStampDates] = useState<Set<string>>(new Set())
  const [hitokotoRange, setHitokotoRange] = useState<[number, number] | null>(null)
  const [learned, setLearned] = useState(0)
  const [mastered, setMastered] = useState(0)
  const [vocabLearned, setVocabLearned] = useState(0)
  const [extrasToday, setExtrasToday] = useState<Set<string>>(new Set())
  const [goldDates, setGoldDates] = useState<Set<string>>(new Set())
  const [showAllExtras, setShowAllExtras] = useState(false)

  useEffect(() => {
    void (async () => {
      const stamps = await allStampDates()
      setStampDates(stamps)
      const cards = await db.cards.where('type').equals('kana').toArray()
      setLearned(cards.length)
      setMastered(cards.filter((c) => isMastered(c.fsrs)).length)
      const vcards = await db.cards.where('type').equals('vocab').toArray()
      setVocabLearned(vcards.length)
      const rows = await listActivity()
      setExtrasToday(featuresOnDay(rows, todayStr()))
      setGoldDates(goldStampDays(rows, stamps))
    })()
  }, [counts])

  const sent = dailySentence()
  const dayIdx = Math.floor(Date.now() / 86400000)
  const pat = dailyPattern(dayIdx)
  const featuredExtra = dailyExtraFeature(dayIdx)
  const days = lastNDays(14)
  const today = todayStr()

  const extraAction: Record<string, () => void> = {
    write: () => onNav('kana'),
    quiz: onOpenQuiz,
    pitch: () => onNav('listen'),
    pattern: onOpenPattern,
  }
  const extraOrder = ['write', 'quiz', 'pitch', 'pattern']

  async function playHitokoto(rate: number) {
    setHitokotoRange([0, 0])
    await speak(sent.jp, rate, { onBoundary: (s, e) => setHitokotoRange([s, e]) })
    setHitokotoRange(null)
  }

  return (
    <>
      <div className="card">
        <div className="eyebrow">今日の修行 ─ 每日十分鐘</div>
        <h2>{greeting()}</h2>
        <p className="sub">
          {today}　── 章不斷，力不斷。
        </p>
        <div>
          {TASKS.map((t) => {
            const c = counts[t.id] || 0
            const done = c >= t.target
            return (
              <div key={t.id} className={'task' + (done ? ' done' : '')}>
                <div className="tmark">{done ? '済' : '印'}</div>
                <div className="tinfo">
                  <div className="tname">{t.name}</div>
                  <div className="tprog">
                    {c} / {t.target}
                  </div>
                  <div className="bar">
                    <i style={{ width: Math.round((c / t.target) * 100) + '%' }} />
                  </div>
                </div>
                <button className="go" onClick={() => onNav(t.tab as Tab)}>
                  前往
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">今日の加練（選配・不影響蓋章）</div>
        <p className="sub" style={{ marginBottom: 8 }}>
          每天推一項加練換換口味。做任一項，今日的済印會升級成
          <b style={{ color: 'var(--yama)' }}> 金印 </b>——想加強再做，不做也不扣分。
        </p>
        {!showAllExtras ? (
          <div className="featExtra">
            <div className="featInfo">
              <div className="featName">
                {extrasToday.has(featuredExtra) ? '✓ ' : ''}
                {EXTRA_META[featuredExtra].emoji} {EXTRA_META[featuredExtra].name}
              </div>
              <div className="featDesc">{EXTRA_META[featuredExtra].desc}</div>
            </div>
            <button className="btn small" onClick={extraAction[featuredExtra]}>
              開始 →
            </button>
          </div>
        ) : (
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {extraOrder.map((f) => (
              <button key={f} className="btn small ghost" onClick={extraAction[f]}>
                {extrasToday.has(f) ? '✓ ' : ''}
                {EXTRA_META[f].emoji} {EXTRA_META[f].name}
              </button>
            ))}
          </div>
        )}
        <div className="row center" style={{ marginTop: 8 }}>
          <button
            className="btn small ghost"
            onClick={() => setShowAllExtras((v) => !v)}
          >
            {showAllExtras ? '收合 ▴' : '展開全部 ▾'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">出席印 ─ 蓋章卡</div>
        <p className="sub">
          五項修行全部完成，即蓋下今日之印；當天再做任一加練即升
          <b style={{ color: 'var(--yama)' }}> 金印</b>。
        </p>
        <div className="stampGrid">
          {days.map((d) => {
            const hit = stampDates.has(d)
            const gold = hit && goldDates.has(d)
            const isToday = d === today
            const [, m, day] = d.split('-')
            return (
              <div
                key={d}
                className={
                  'stampCell' + (hit ? ' hit' : '') + (isToday ? ' today' : '')
                }
              >
                <span className="d">
                  {Number(m)}/{Number(day)}
                </span>
                {hit && (
                  <div
                    className={
                      'hanko' + (gold ? ' gold' : '') + (isToday ? ' pop' : '')
                    }
                  >
                    済
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <div className="eyebrow">今日の文型 ─ 一句多用</div>
          {extrasToday.has('pattern') && <span className="chip">✓ 今日已練</span>}
        </div>
        <div className="sent" style={{ fontSize: 20 }}>{pat.label}</div>
        <div className="sentZh">{pat.zh}</div>
        <p className="sub" style={{ textAlign: 'center' }}>
          用學過的單字換著套進去，每天重複——句型自然記住。
        </p>
        <div className="row center">
          <button className="btn small" onClick={onOpenPattern}>
            🧩 開始練習 →
          </button>
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">今日のひとこと</div>
        {showKanji && sent.alt && hasKanji(sent.alt) ? (
          <RubyText display={sent.alt} reading={sent.jp} className="sent" />
        ) : (
          <Karaoke text={sent.jp} range={hitokotoRange} className="sent" />
        )}
        <div className="sentZh">{sent.zh}</div>
        <div className="row center">
          <button className="btn small ghost" onClick={() => void playHitokoto(0.75)}>
            🔊 慢速
          </button>
          <button className="btn small ghost" onClick={() => void playHitokoto(1.0)}>
            🔊 常速
          </button>
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">修行の記録</div>
        <div className="statChips">
          <span className="chip">
            連続 <b>{streak}</b> 日
          </span>
          <span className="chip">
            已學假名 <b>{learned}</b> / {KANA.length}
          </span>
          <span className="chip">
            已學詞彙 <b>{vocabLearned}</b> / {VOCAB.length}
          </span>
          <span className="chip">
            假名定著 <b>{mastered}</b>
          </span>
          {asrAvg != null && (
            <span className="chip">
              發音均分 <b>{asrAvg}</b>
            </span>
          )}
        </div>
        <div className="rateRow">
          語速基準：
          <select value={String(rate)} onChange={(e) => void setRate(Number(e.target.value))}>
            <option value="0.7">ゆっくり 0.7</option>
            <option value="0.85">ふつう 0.85</option>
            <option value="1">ネイティブ 1.0</option>
          </select>
        </div>
        <div className="spacer" />
        <div className="row">
          <button className="btn small ghost" onClick={onOpenProgress}>
            📈 發音の成長曲線 →
          </button>
          <button className="btn small ghost" onClick={onOpenQuiz}>
            📝 N5 模擬測驗 →
          </button>
          <button className="btn small ghost" onClick={onOpenTutor}>
            🤖 AI 助教 →
          </button>
        </div>
      </div>
    </>
  )
}
