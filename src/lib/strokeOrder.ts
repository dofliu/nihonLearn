/**
 * 筆順粗略比對（純函式，供 Node 測試；沿用 handwriting.ts 的誠實定位）。
 *
 * 用 KanjiVG 每一畫的「起筆點」座標與筆畫數，判斷使用者下筆的先後順序是否符合官方筆順；
 * 另外用每一畫「起筆→收筆」的方向向量（cosine 相似度）粗略比對行筆方向是否大致相符。
 * 不比對彎曲路徑或精確粗細，所以仍是「順序／方向參考」而非精確筆順評分。
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
  directionScore: number // 0-100：配對到的筆畫「起筆→收筆」方向 cosine 相似度平均（NaN＝無可比對筆畫）
  directionVerdict: 'unscored' | 'match' | 'rough' | 'mismatch'
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

/** 從 KanjiVG path 解析收筆座標（走完全部 M/C/S/c/s 命令後的最終筆位置）。 */
export function pathEnd(path: string): Point {
  const tokens = path.match(/[MCSmcs][^MCSmcs]*/g) || []
  let cur: Point = { x: 0, y: 0 }
  for (const tok of tokens) {
    const cmd = tok[0]
    const nums = (tok.slice(1).match(/-?\d*\.?\d+(?:[eE]-?\d+)?/g) || []).map(Number)
    if (cmd === 'M' || cmd === 'm') {
      if (nums.length >= 2) cur = { x: nums[0], y: nums[1] }
    } else if (cmd === 'C') {
      for (let i = 0; i + 5 < nums.length; i += 6) cur = { x: nums[i + 4], y: nums[i + 5] }
    } else if (cmd === 'c') {
      for (let i = 0; i + 5 < nums.length; i += 6) cur = { x: cur.x + nums[i + 4], y: cur.y + nums[i + 5] }
    } else if (cmd === 'S') {
      for (let i = 0; i + 3 < nums.length; i += 4) cur = { x: nums[i + 2], y: nums[i + 3] }
    } else if (cmd === 's') {
      for (let i = 0; i + 3 < nums.length; i += 4) cur = { x: cur.x + nums[i + 2], y: cur.y + nums[i + 3] }
    }
  }
  return cur
}

/** 一畫「起筆→收筆」的方向向量（未正規化長度，cosine 比對只看方向、不看粗細）。 */
export function strokeVector(path: string): Point {
  const s = strokeStart(path)
  const e = pathEnd(path)
  return { x: e.x - s.x, y: e.y - s.y }
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** 兩向量的 cosine 相似度；任一向量太短（近乎一點）視為無法判斷方向，回 null。 */
function cosineSim(a: Point, b: Point): number | null {
  const ma = Math.hypot(a.x, a.y)
  const mb = Math.hypot(b.x, b.y)
  if (ma < 1e-6 || mb < 1e-6) return null
  return (a.x * b.x + a.y * b.y) / (ma * mb)
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
    return {
      refCount,
      userCount,
      matched: [],
      orderScore: 0,
      verdict: 'unscored',
      directionScore: NaN,
      directionVerdict: 'unscored',
    }
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

  const nonEmptyStrokes = userStrokes.filter((s) => s.length > 0)
  const cosines: number[] = []
  nonEmptyStrokes.forEach((s, i) => {
    const refIdx = matched[i]
    if (refIdx < 0) return
    const uVec = { x: s[s.length - 1].x - s[0].x, y: s[s.length - 1].y - s[0].y }
    const rVec = strokeVector(refPaths[refIdx])
    const cos = cosineSim(uVec, rVec)
    if (cos !== null) cosines.push(cos)
  })
  const directionScore = cosines.length
    ? Math.round(((cosines.reduce((a, b) => a + b, 0) / cosines.length + 1) / 2) * 100)
    : NaN
  let directionVerdict: StrokeOrderResult['directionVerdict']
  if (!cosines.length) directionVerdict = 'unscored'
  else if (directionScore >= 65) directionVerdict = 'match'
  else if (directionScore >= 40) directionVerdict = 'rough'
  else directionVerdict = 'mismatch'

  return { refCount, userCount, matched, orderScore, verdict, directionScore, directionVerdict }
}
