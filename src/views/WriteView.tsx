import { useEffect, useRef, useState, useCallback } from 'react'
import { KANA, type Kana } from '../data/kana'
import { scoreHandwriting, type WriteScore } from '../lib/handwriting'
import { saveWriteScore, writeBestMap } from '../db/repo'
import { speak } from '../audio/tts'
import { toast } from '../components/ui'

const GRID = 32 // 評分光柵解析度（GRID×GRID）
const CANVAS = 260 // 顯示畫布邏輯尺寸（px）
const PEN = 11 // 畫筆粗細（顯示 px）

type Script = 'hiragana' | 'katakana'
type WMode = 'trace' | 'blank' // 描紅 / 空白默寫

function markColor(g: WriteScore['grade']) {
  return g === '◎' ? 'var(--take)' : g === '○' ? 'var(--yama)' : g === '△' ? 'var(--shu)' : 'var(--nezu)'
}

/** 把一個字元渲染到 GRID×GRID 離屏畫布，回 boolean 墨格（範本）。 */
function rasterGlyph(ch: string): boolean[] {
  const c = document.createElement('canvas')
  c.width = GRID
  c.height = GRID
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, GRID, GRID)
  ctx.fillStyle = '#000'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `bold ${Math.round(GRID * 0.78)}px 'Noto Sans CJK JP','Noto Sans JP','Hiragino Sans',sans-serif`
  ctx.fillText(ch, GRID / 2, GRID / 2 + 1)
  const data = ctx.getImageData(0, 0, GRID, GRID).data
  const out: boolean[] = new Array(GRID * GRID)
  for (let i = 0; i < GRID * GRID; i++) out[i] = data[i * 4 + 3] > 64
  return out
}

/** 把使用者筆畫（顯示座標的折線）光柵化到 GRID×GRID，回 boolean 墨格。 */
function rasterStrokes(strokes: { x: number; y: number }[][]): boolean[] {
  const c = document.createElement('canvas')
  c.width = GRID
  c.height = GRID
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, GRID, GRID)
  ctx.strokeStyle = '#000'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(1.6, (PEN * GRID) / CANVAS)
  const s = GRID / CANVAS
  for (const stroke of strokes) {
    if (stroke.length === 0) continue
    ctx.beginPath()
    ctx.moveTo(stroke[0].x * s, stroke[0].y * s)
    for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x * s, stroke[i].y * s)
    if (stroke.length === 1) ctx.lineTo(stroke[0].x * s + 0.1, stroke[0].y * s + 0.1)
    ctx.stroke()
  }
  const data = ctx.getImageData(0, 0, GRID, GRID).data
  const out: boolean[] = new Array(GRID * GRID)
  for (let i = 0; i < GRID * GRID; i++) out[i] = data[i * 4 + 3] > 64
  return out
}

export function WriteView() {
  const [script, setScript] = useState<Script>('hiragana')
  const [wmode, setWmode] = useState<WMode>('trace')
  const [idx, setIdx] = useState(0)
  const [result, setResult] = useState<WriteScore | null>(null)
  const [best, setBest] = useState<Record<string, number>>({})
  const [hasInk, setHasInk] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<{ x: number; y: number }[][]>([])
  const drawingRef = useRef(false)

  // 只練清音 46（初學者友善），依 KANA 順序
  const chars: Kana[] = KANA.filter((k) => k.script === script && k.seion)
  const cur = chars[idx % chars.length]

  useEffect(() => {
    void (async () => setBest(await writeBestMap()))()
  }, [])

  const clear = useCallback(() => {
    const cv = canvasRef.current
    if (cv) {
      const ctx = cv.getContext('2d')!
      ctx.clearRect(0, 0, cv.width, cv.height)
    }
    strokesRef.current = []
    setResult(null)
    setHasInk(false)
  }, [])

  // 換字或換模式 → 清空
  useEffect(() => {
    clear()
  }, [idx, script, wmode, clear])

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * CANVAS, y: ((e.clientY - r.top) / r.height) * CANVAS }
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (result) return
    e.preventDefault()
    canvasRef.current!.setPointerCapture(e.pointerId)
    drawingRef.current = true
    const p = pos(e)
    strokesRef.current.push([p])
    setHasInk(true)
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.strokeStyle = '#1b2b3a'
    ctx.lineWidth = PEN
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    e.preventDefault()
    const p = pos(e)
    const stroke = strokesRef.current[strokesRef.current.length - 1]
    stroke.push(p)
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  function up() {
    drawingRef.current = false
  }

  function grade() {
    if (!cur || strokesRef.current.length === 0) {
      toast('先寫寫看再評分 ✍')
      return
    }
    const ref = rasterGlyph(cur.ch)
    const user = rasterStrokes(strokesRef.current)
    const r = scoreHandwriting(ref, user, GRID)
    setResult(r)
    void (async () => {
      const b = await saveWriteScore(cur.ch, r.score)
      setBest((m) => ({ ...m, [cur.ch]: b }))
    })()
  }

  function next() {
    setIdx((i) => (i + 1) % chars.length)
  }
  function prev() {
    setIdx((i) => (i - 1 + chars.length) % chars.length)
  }

  const done = Object.values(best).filter((v) => v >= 60).length

  return (
    <>
      <div className="card">
        <div className="lvTabs" style={{ marginBottom: 10 }}>
          <button className={script === 'hiragana' ? 'on' : ''} onClick={() => setScript('hiragana')}>
            ひらがな
          </button>
          <button className={script === 'katakana' ? 'on' : ''} onClick={() => setScript('katakana')}>
            カタカナ
          </button>
        </div>
        <div className="lvTabs">
          <button className={wmode === 'trace' ? 'on' : ''} onClick={() => setWmode('trace')}>
            描紅（照著描）
          </button>
          <button className={wmode === 'blank' ? 'on' : ''} onClick={() => setWmode('blank')}>
            空白默寫
          </button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          用手指或滑鼠寫在方格裡，按「評分」看<b>字形相似度</b>。
          這是形狀參考分數（比對你的筆跡覆蓋範本字形），<b>不是筆順評分</b>。
        </p>
      </div>

      <div className="card">
        <div className="row between">
          <div className="eyebrow">
            書く　{cur.ro}
            {best[cur.ch] != null && <span style={{ marginLeft: 8 }}>最佳 {best[cur.ch]}</span>}
          </div>
          <button className="btn small ghost" onClick={() => speak(cur.ch, 0.85)}>
            🔊 唸這個音
          </button>
        </div>

        <div className="writeWrap">
          {/* 底層：格線＋和紙底（不透明，必須在最下層，否則會蓋住描紅範本） */}
          <div className="writeGuide" />
          {/* 描紅範本：淡淡的目標字（空白默寫時隱藏；評分後以對照色顯示） */}
          {(wmode === 'trace' || result) && (
            <div className={'writeGhost' + (result ? ' revealed' : '')}>{cur.ch}</div>
          )}
          <canvas
            ref={canvasRef}
            width={CANVAS}
            height={CANVAS}
            className="writeCanvas"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
        </div>

        {result ? (
          <>
            <div className="scoreBig" style={{ color: markColor(result.grade) }}>
              {result.grade}　{result.score}
              <span style={{ fontSize: 14 }}> / 100</span>
            </div>
            <p className="sub center">
              字形相似度 {result.score}（覆蓋 {Math.round(result.recall * 100)}%・準度{' '}
              {Math.round(result.precision * 100)}%）
              {result.score >= 80 ? '　漂亮！' : result.score >= 60 ? '　不錯，再工整一點' : '　再多描幾次'}
            </p>
            <div className="row between">
              <button className="btn small ghost" onClick={clear}>
                再寫一次
              </button>
              <button className="btn small" onClick={next}>
                下一個 →
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="row center" style={{ margin: '4px 0 10px' }}>
              <button className="btn small ghost" onClick={clear} disabled={!hasInk}>
                清除
              </button>
              <button className="btn" onClick={grade}>
                評分
              </button>
            </div>
            <div className="row between">
              <button className="btn small ghost" onClick={prev}>
                ← 上一個
              </button>
              <span className="sub">
                {(idx % chars.length) + 1} / {chars.length}
              </span>
              <button className="btn small ghost" onClick={next}>
                下一個 →
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <p className="sub center">
          已寫得工整（≥60 分）<b>{done}</b> / {chars.length} 個{script === 'hiragana' ? '平假名' : '片假名'}
        </p>
      </div>
    </>
  )
}
