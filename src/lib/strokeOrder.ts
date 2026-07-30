/**
 * 筆順粗略比對（純函式，供 Node 測試；沿用 handwriting.ts 的誠實定位）。
 *
 * 只用 KanjiVG 每一畫的「起筆點」座標與筆畫數，判斷使用者下筆的先後順序是否符合官方筆順——
 * 不比對筆畫方向、彎曲路徑或精確粗細，所以是「順序參考」而非精確筆順評分。
 * 正確性完全交給 KanjiVG 權威資料（data/kanjiStrokes.ts），這裡只做幾何比對。
 */

export interface Point {
  x: number
  y: number
}

export interface StrokeOrderResult {
  refCount: number // 範本筆畫數
  userCount: number // 使用者下筆畫數
  matched: number[] // 每個使用者筆畫（依下筆順序）配對到的範本筆畫序號，-1＝配不到
  orderScore: number // 0-100：符合官方順序的筆畫數（LIS）／範本筆畫數
  verdict: 'unscored' | 'correct' | 'count_mismatch' | 'out_of_order'
}

/** 從 KanjiVG path（如 "M54.5,20c0.37,2.12,..."）取起筆座標。 */
export function strokeStart(path: string): Point {
  const m = path.match(/^M\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/)
  if (!m) return { x: 0, y: 0 }
  return { x: parseFloat(m[1]), y: parseFloat(m[2]) }
}

/** 官方筆順的起筆點序列，正規化到 0..1（除以 viewBox）。 */
export function refStrokeStarts(paths: string[], viewBox: number): Point[] {
  return paths.map((p) => {
    const s = strokeStart(p)
    return { x: s.x / viewBox, y: s.y / viewBox }
  })
}

/** 使用者筆畫（畫布座標折線陣列）的起筆點序列，正規化到 0..1（除以畫布邊長）。空筆畫略過。 */
export function userStrokeStarts(strokes: Point[][], canvasSize: number): Point[] {
  return strokes.filter((s) => s.length > 0).map((s) => ({ x: s[0].x / canvasSize, y: s[0].y / canvasSize }))
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** 最長嚴格遞增子序列長度（負值視為配不到、忽略）。 */
function lisLength(seq: number[]): number {
  const tails: number[] = []
  for (const v of seq) {
    if (v < 0) continue
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (tails[mid] < v) lo = mid + 1
      else hi = mid
    }
    if (lo === tails.length) tails.push(v)
    else tails[lo] = v
  }
  return tails.length
}

/**
 * 比對使用者下筆順序是否符合官方筆順（依起筆點最近配對＋順序檢查）。
 * userStrokes：畫布座標折線陣列（依下筆順序）；refPaths：KANJI_STROKES[ch]；
 * canvasSize：使用者畫布邊長；viewBox：KanjiVG viewBox 邊長（KANJI_STROKE_VIEWBOX）。
 */
export function judgeStrokeOrder(
  userStrokes: Point[][],
  refPaths: string[],
  canvasSize: number,
  viewBox: number,
): StrokeOrderResult {
  const refStarts = refStrokeStarts(refPaths, viewBox)
  const userStarts = userStrokeStarts(userStrokes, canvasSize)
  const refCount = refStarts.length
  const userCount = userStarts.length
  if (userCount === 0 || refCount === 0) {
    return { refCount, userCount, matched: [], orderScore: 0, verdict: 'unscored' }
  }
  const used = new Array(refCount).fill(false)
  const matched: number[] = []
  for (const u of userStarts) {
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < refCount; i++) {
      if (used[i]) continue
      const d = dist(u, refStarts[i])
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    if (best >= 0) used[best] = true
    matched.push(best)
  }
  const lis = lisLength(matched)
  const orderScore = Math.round((lis / refCount) * 100)
  let verdict: StrokeOrderResult['verdict']
  if (userCount !== refCount) verdict = 'count_mismatch'
  else if (lis === refCount) verdict = 'correct'
  else verdict = 'out_of_order'
  return { refCount, userCount, matched, orderScore, verdict }
}
