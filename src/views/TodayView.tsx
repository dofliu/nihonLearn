import { useEffect, useState } from 'react'
import { useApp, TASKS } from '../state/store'
import { db } from '../db/schema'
import { allStampDates } from '../db/repo'
import { isMastered } from '../srs/scheduler'
import { lastNDays, todayStr } from '../lib/date'
import { SENTS } from '../data/sentences'
import { KANA } from '../data/kana'
import { VOCAB } from '../data/vocab'
import { speak } from '../audio/tts'
import { Karaoke } from '../components/Karaoke'
import { RubyText } from '../components/Ruby'
import { hasKanji } from '../lib/furigana'
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
}: {
  onNav: (t: Tab) => void
  onOpenProgress: () => void
  onOpenQuiz: () => void
  onOpenTutor: () => void
}) {
  const { counts, streak, rate, asrAvg, setRate, showKanji } = useApp()
  const [stampDates, setStampDates] = useState<Set<string>>(new Set())
  const [hitokotoRange, setHitokotoRange] = useState<[number, number] | null>(null)
  const [learned, setLearned] = useState(0)
  const [mastered, setMastered] = useState(0)
  const [vocabLearned, setVocabLearned] = useState(0)

  useEffect(() => {
    void (async () => {
      setStampDates(await allStampDates())
      const cards = await db.cards.where('type').equals('kana').toArray()
      setLearned(cards.length)
      setMastered(cards.filter((c) => isMastered(c.fsrs)).length)
      const vcards = await db.cards.where('type').equals('vocab').toArray()
      setVocabLearned(vcards.length)
    })()
  }, [counts])

  const sent = dailySentence()
  const days = lastNDays(14)
  const today = todayStr()

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
        <div className="eyebrow">出席印 ─ 蓋章卡</div>
        <p className="sub">五項修行全部完成，即蓋下今日之印。</p>
        <div className="stampGrid">
          {days.map((d) => {
            const hit = stampDates.has(d)
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
                  <div className={'hanko' + (isToday ? ' pop' : '')}>済</div>
                )}
              </div>
            )
          })}
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
