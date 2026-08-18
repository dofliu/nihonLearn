import { useEffect, useRef, useState } from 'react'
import {
  chartRows,
  columnsFor,
  charOf,
  charsInOrder,
  type KanaSet,
  type ChartScript,
} from '../lib/kanaChart'
import { speak } from '../audio/tts'
import { useApp } from '../state/store'

const SET_TABS: { key: KanaSet; label: string }[] = [
  { key: 'seion', label: '清音' },
  { key: 'dakuon', label: '濁音' },
  { key: 'yoon', label: '拗音' },
]

/**
 * 五十音圖（查閱用的對照表）：平假名／片假名 × 清音／濁音／拗音，每格附羅馬字，
 * 點一格唸一次、也可以「播放全部」依序朗讀。
 *
 * 表格結構與拗音全部由 `lib/kanaChart.ts` 從已驗證的 `data/kana.ts` 推導（不手打讀音）。
 * 清音／濁音的格子會標出你在 SRS 的進度（已學／定著）；拗音不在卡組內，故不標記。
 */
export function KanaChart({
  learnedSet,
  masteredMap,
  onPractice,
  onYoonDrill,
}: {
  learnedSet: Set<string>
  masteredMap: Record<string, boolean>
  /** 「用單字卡練習」：交回呼叫端開始 FSRS 一輪 */
  onPractice: () => void
  /** 「拗音ドリル」：拗音沒有 SRS 卡片，故該分頁改開選配的拗音練習（沿用當下的平／片假名選擇） */
  onYoonDrill: (script: ChartScript) => void
}) {
  const rate = useApp((s) => s.rate)
  const [script, setScript] = useState<ChartScript>('hiragana')
  const [set, setSet] = useState<KanaSet>('seion')
  const [playing, setPlaying] = useState(false)
  const [nowPlaying, setNowPlaying] = useState<string | null>(null)
  const stopRef = useRef(false)

  // 切換分頁或離開畫面就停止連續播放
  useEffect(() => {
    return () => {
      stopRef.current = true
    }
  }, [])
  useEffect(() => {
    stopRef.current = true
    setPlaying(false)
    setNowPlaying(null)
  }, [script, set])

  const rows = chartRows(set)
  const cols = columnsFor(set)

  async function playAll() {
    if (playing) {
      stopRef.current = true
      setPlaying(false)
      setNowPlaying(null)
      return
    }
    stopRef.current = false
    setPlaying(true)
    for (const ch of charsInOrder(set, script)) {
      if (stopRef.current) break
      setNowPlaying(ch)
      await speak(ch, rate)
    }
    setPlaying(false)
    setNowPlaying(null)
  }

  return (
    <div className="card">
      <div className="row between">
        <div className="eyebrow">五十音圖 ─ 一覽表</div>
        <button className="btn small ghost" onClick={() => void playAll()}>
          {playing ? '■ 停止' : '▶ 播放全部'}
        </button>
      </div>

      <div className="lvTabs" style={{ marginTop: 10, marginBottom: 8 }}>
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

      <div className="lvTabs" style={{ marginBottom: 8 }}>
        {SET_TABS.map((t) => (
          <button key={t.key} className={set === t.key ? 'on' : ''} onClick={() => setSet(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {set === 'yoon' ? (
        <button className="btn" style={{ width: '100%' }} onClick={() => onYoonDrill(script)}>
          🔡 拗音ドリル（練這 33 音）
        </button>
      ) : (
        <button className="btn" style={{ width: '100%' }} onClick={onPractice}>
          📇 用單字卡練習
        </button>
      )}

      <div
        className="kanaChart"
        style={{ gridTemplateColumns: `1.6em repeat(${cols.length}, 1fr)` }}
      >
        <span className="kcCorner" />
        {cols.map((c) => (
          <span key={c} className="kcCol">
            {c}
          </span>
        ))}
        {rows.map((row) => (
          <Row
            key={row.key}
            rowKey={row.key}
            cells={row.cells}
            script={script}
            rate={rate}
            nowPlaying={nowPlaying}
            learnedSet={learnedSet}
            masteredMap={masteredMap}
          />
        ))}
      </div>

      <p className="sub" style={{ marginTop: 10 }}>
        點任一格聽發音。
        {set === 'yoon'
          ? '拗音＝い段假名＋小さい ゃ／ゅ／ょ，兩字合起來只唸一拍。不在 SRS 卡組內，要練請用上方的拗音ドリル（選配加練，不卡蓋章）。'
          : '底線標記為你的修行進度：藍＝已學、綠＝定著。'}
      </p>
    </div>
  )
}

function Row({
  rowKey,
  cells,
  script,
  rate,
  nowPlaying,
  learnedSet,
  masteredMap,
}: {
  rowKey: string
  cells: ReturnType<typeof chartRows>[number]['cells']
  script: ChartScript
  rate: number
  nowPlaying: string | null
  learnedSet: Set<string>
  masteredMap: Record<string, boolean>
}) {
  return (
    <>
      <span className="kcRow">{rowKey}</span>
      {cells.map((cell, i) => {
        if (!cell) return <span key={i} className="kcCell empty" />
        const ch = charOf(cell, script)
        const state = !cell.id || !learnedSet.has(cell.id)
          ? ''
          : masteredMap[cell.id]
            ? ' master'
            : ' learn'
        return (
          <button
            key={i}
            className={'kcCell' + state + (nowPlaying === ch ? ' on' : '')}
            onClick={() => void speak(ch, rate)}
            aria-label={`${ch} ${cell.ro}`}
          >
            <span className="kcCh">{ch}</span>
            <span className="kcRo">{cell.ro}</span>
          </button>
        )
      })}
    </>
  )
}
