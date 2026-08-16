import { useCallback, useEffect, useState } from 'react'
import { VOCAB, type Vocab } from '../data/vocab'
import { db } from '../db/schema'
import { learnedKanaChars } from '../db/repo'
import { isMastered } from '../srs/scheduler'
import { isVocabUnlocked } from '../lib/vocabGate'
import {
  MARK_LABEL,
  bookStats,
  catSummaries,
  filterVocab,
  groupByCat,
  vocabMark,
  type VocabStatus,
} from '../lib/vocabBook'
import { speak } from '../audio/tts'
import { useApp } from '../state/store'
import { RubyText } from './Ruby'

const STATUS_TABS: { key: VocabStatus; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'learned', label: '已學' },
  { key: 'new', label: '未學' },
]

interface Sets {
  learned: Set<string>
  mastered: Set<string>
  locked: Set<string>
}

const EMPTY: Sets = { learned: new Set(), mastered: new Set(), locked: new Set() }

/**
 * 單字帳：查得到、看得到進度。
 *
 * 原本這裡是把全部 300 多個詞一次攤平列出的一面牆——手機上滾不完，也沒辦法查一個詞。
 * 現在：搜尋（假名／漢字／中文）＋分類收合＋學習狀態篩選，每列標出 ◎ 定著／● 學習中／
 * 🔒 待假名解鎖（後者讓「待假名解鎖 N 詞」這個數字看得到究竟是哪些詞）。
 * 純查閱功能——不寫入任何資料、不計入每日修行。
 */
export function VocabBook() {
  const counts = useApp((s) => s.counts)
  const showKanji = useApp((s) => s.showKanji)
  const [sets, setSets] = useState<Sets>(EMPTY)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<VocabStatus>('all')
  const [openCats, setOpenCats] = useState<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    const cards = await db.cards.where('type').equals('vocab').toArray()
    const learned = new Set(cards.map((c) => c.refId))
    const mastered = new Set(cards.filter((c) => isMastered(c.fsrs)).map((c) => c.refId))
    const kanaChars = await learnedKanaChars()
    const locked = new Set(
      VOCAB.filter((v) => !learned.has(v.jp) && !isVocabUnlocked(v.jp, kanaChars)).map((v) => v.jp),
    )
    setSets({ learned, mastered, locked })
  }, [])

  // counts 變動＝做過一輪修行，狀態標記要跟著更新
  useEffect(() => {
    void refresh()
  }, [refresh, counts])

  const list = filterVocab(VOCAB, { q, status }, sets.learned)
  const stats = bookStats(list, sets.learned, sets.mastered)
  const summaries = catSummaries(list, sets.learned)
  const searching = q.trim().length > 0

  function toggleCat(cat: string) {
    setOpenCats((s) => {
      const next = new Set(s)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  function row(w: Vocab, withCat = false) {
    const mark = vocabMark(w, sets)
    return (
      <div key={w.jp} className="wordRow" onClick={() => speak(w.jp, 0.85)}>
        <span className="wj">
          {mark !== 'none' && (
            <span className={'vbMark ' + mark} title={MARK_LABEL[mark].text}>
              {MARK_LABEL[mark].sign}
            </span>
          )}
          {showKanji && w.kanji ? <RubyText display={w.kanji} reading={w.jp} /> : w.jp}
        </span>
        <span className="wz">
          {withCat && <span className="wcat">{w.cat}</span>}
          {w.zh} 🔊
        </span>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="eyebrow">單字帳 ─ 查詞與進度</div>
      <p className="sub">
        共 <b>{stats.total}</b> 詞・已學 <b>{stats.learned}</b>・定著 <b>{stats.mastered}</b>。
        點任一詞唸一次。
      </p>
      <input
        className="vbSearch"
        type="search"
        value={q}
        placeholder="搜尋：假名／漢字／中文都可以"
        aria-label="搜尋單字"
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            className={'btn small' + (status === t.key ? '' : ' ghost')}
            onClick={() => setStatus(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="vbLegend">
        {(['master', 'learn', 'locked'] as const).map((m) => (
          <span key={m}>
            <span className={'vbMark ' + m}>{MARK_LABEL[m].sign}</span>
            {MARK_LABEL[m].text}
          </span>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="sub vbEmpty">找不到符合的詞。換個關鍵字，或把篩選切回「全部」。</p>
      ) : searching ? (
        <div className="vbResults">{list.map((w) => row(w, true))}</div>
      ) : (
        <div>
          {groupByCat(list).map((g, i) => {
            const open = openCats.has(g.cat)
            const s = summaries[i]
            return (
              <div key={g.cat}>
                <button
                  className={'vbCatBtn' + (open ? ' on' : '')}
                  aria-expanded={open}
                  onClick={() => toggleCat(g.cat)}
                >
                  <span className="catTag" style={{ margin: 0 }}>
                    {g.cat}
                  </span>
                  <span className="vbCatMeta">
                    {s.total} 詞・已學 {s.learned}
                  </span>
                  <span className="vbCatChevron">{open ? '▴' : '▾'}</span>
                </button>
                {open && <div>{g.words.map((w) => row(w))}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
