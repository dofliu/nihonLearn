import { useEffect, useState } from 'react'
import { useApp, TASKS } from '../state/store'
import { db } from '../db/schema'
import { allStampDates, todayActivityFeatures, extraActiveDays } from '../db/repo'
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
import type { Tab } from '../components/Nav'

function greeting() {
  const h = new Date().getHours()
  return h < 11 ? 'おはようございます' : h < 18 ? 'こんにちは' : 'こんばんは'
}

function dailySentence() {
  const day = Math.floor(Date.now() / 86400000)
  return SENTS[day % SENTS.length]
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
  const [goldenDates, setGoldenDates] = useState<Set<string>>(new Set())
  const [hitokotoRange, setHitokotoRange] = useState<[number, number] | null>(null)
  const [learned, setLearned] = useState(0)
  const [mastered, setMastered] = useState(0)
  const [vocabLearned, setVocabLearned] = useState(0)
  const [extrasToday, setExtrasToday] = useState<Set<string>>(new Set())
  const [showAllExtras, setShowAllExtras] = useState(false)

  useEffect(() => {
    void (async () => {
      const [stamps, extraDays] = await Promise.all([allStampDates(), extraActiveDays()])
      setStampDates(stamps)
      setGoldenDates(new Set([...stamps].filter((d) => extraDays.has(d))))
      const cards = await db.cards.where('type').equals('kana').toArray()
      setLearned(cards.length)
      setMastered(cards.filter((c) => isMastered(c.fsrs)).length)
      const vcards = await db.cards.where('type').equals('vocab').toArray()
      setVocabLearned(vcards.length)
      setExtrasToday(await todayActivityFeatures())
    })()
  }, [counts])

  const dayIndex = Math.floor(Date.now() / 86400000)
  const sent = dailySentence()
  const pat = dailyPattern(dayIndex)
  const days = lastNDays(14)
  const today = todayStr()

  // 選配加練：每天輪替主推一項（不影響蓋章）
  const EXTRAS = [
    { key: 'write', emoji: '✍', label: '書寫練習', hint: '手寫假名／漢字，練字形', onClick: () => onNav('kana') },
    { key: 'quiz', emoji: '📝', label: 'N5 測驗', hint: '從學過的詞出題，抓弱點', onClick: onOpenQuiz },
    { key: 'pitch', emoji: '📈', label: '重音道場', hint: '辨識東京式高低音', onClick: () => onNav('listen') },
    { key: 'pattern', emoji: '🧩', label: '文型ドリル', hint: '一個句型換不同單字', onClick: onOpenPattern },
  ]
  const todayExtra = EXTRAS[dayIndex % EXTRAS.length]

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
        <div className="row between">
          <div className="eyebrow">今日の加練 ─ 選配・不影響蓋章</div>
          {extrasToday.has(todayExtra.key) && <span className="chip">✓ 今日已練</span>}
        </div>
        <p className="sub" style={{ marginBottom: 8 }}>
          核心五修行之外的加練，每天換一項推薦——練了就記入学習記録、還讓済印變金 ✨；不做也不扣分。
        </p>
        <button className="btn extraRec" onClick={todayExtra.onClick}>
          <span className="extraEmoji">{todayExtra.emoji}</span>
          <span className="extraBody">
            <span className="extraLabel">{todayExtra.label}</span>
            <span className="extraHint">{todayExtra.hint}</span>
          </span>
          <span className="extraGo">→</span>
        </button>
        <button
          className="btn small ghost linkish"
          onClick={() => setShowAllExtras((v) => !v)}
        >
          {showAllExtras ? '收合 ▴' : '想練別的？全部加練 ▾'}
        </button>
        {showAllExtras && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {EXTRAS.map((e) => (
              <button key={e.key} className="btn small ghost" onClick={e.onClick}>
                {extrasToday.has(e.key) ? '✓ ' : ''}
                {e.emoji} {e.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="eyebrow">出席印 ─ 蓋章卡</div>
        <p className="sub">
          五項修行全部完成即蓋<b>済</b>印；當天再多做 1 項加練，済印變<b className="goldText">金 ✨</b>。
        </p>
        <div className="stampGrid">
          {days.map((d) => {
            const hit = stampDates.has(d)
            const gold = goldenDates.has(d)
            const isToday = d === today
            const [, m, day] = d.split('-')
            return (
              <div
                key={d}
                className={
                  'stampCell' + (hit ? ' hit' : '') + (gold ? ' gold' : '') + (isToday ? ' today' : '')
                }
              >
                <span className="d">
                  {Number(m)}/{Number(day)}
                </span>
                {hit && (
                  <div className={'hanko' + (gold ? ' gold' : '') + (isToday ? ' pop' : '')}>済</div>
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
