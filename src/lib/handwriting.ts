/**
 * 手寫字形相似度評分（純函式，無 Canvas／瀏覽器依賴，供 Node 測試）。
 *
 * 這是「字形（形狀）參考」分數，不是筆順評分——我們沒有筆順參考資料，
 * 所以誠實地只比對「你的墨跡覆蓋率」對上「範本字形」。作法：
 *   recall    = 範本被你的筆跡覆蓋的比例（有沒有把字寫全）
 *   precision = 你的筆跡落在範本上的比例（有沒有塗到框外／亂畫）
 *   score     = F1(precision, recall) × 100
 * 兩者都算，所以「整格塗滿」會因 precision 崩掉而拿低分，無法作弊。
 * 比對前對雙方各做一次膨脹（dilate）容忍些微對位誤差。
 *
 * grid 表示：boolean[]（長度 size*size，row-major），true=有墨。
 */

export interface WriteScore {
  score: number // 0-100（字形相似度）
  precision: number // 0-1
  recall: number // 0-1
  refInk: number // 範本墨格數
  userInk: number // 使用者墨格數
  grade: '◎' | '○' | '△' | '—' // —＝沒寫
}

/** 形態學膨脹：把每個 true 格向外擴 radius（Chebyshev 距離）。radius≤0 原樣回傳副本。 */
export function dilate(grid: boolean[], size: number, radius: number): boolean[] {
  if (radius <= 0) return grid.slice()
  const out = new Array<boolean>(size * size).fill(false)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!grid[y * size + x]) continue
      const y0 = Math.max(0, y - radius)
      const y1 = Math.min(size - 1, y + radius)
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(size - 1, x + radius)
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) out[yy * size + xx] = true
      }
    }
  }
  return out
}

function count(grid: boolean[]): number {
  let n = 0
  for (const c of grid) if (c) n++
  return n
}

export function gradeOf(score: number): WriteScore['grade'] {
  if (score >= 80) return '◎'
  if (score >= 60) return '○'
  return '△'
}

export interface ScoreOpts {
  tolerance?: number // 對位容忍（膨脹半徑，格）。預設隨 size 調整。
}

/**
 * 比對使用者筆跡 user 與範本 ref（皆為 size×size 的 boolean grid），回字形相似度。
 * ref 無墨 → 無法評分（score 0、grade —）；user 無墨 → score 0、grade —。
 */
export function scoreHandwriting(
  ref: boolean[],
  user: boolean[],
  size: number,
  opts: ScoreOpts = {},
): WriteScore {
  const tol = opts.tolerance ?? Math.max(1, Math.round(size / 24))
  const refInk = count(ref)
  const userInk = count(user)
  if (refInk === 0 || userInk === 0) {
    return { score: 0, precision: 0, recall: 0, refInk, userInk, grade: '—' }
  }
  const refD = dilate(ref, size, tol)
  const userD = dilate(user, size, tol)

  let hitRef = 0 // 範本格被使用者（膨脹後）覆蓋
  let hitUser = 0 // 使用者格落在範本（膨脹後）上
  for (let i = 0; i < ref.length; i++) {
    if (ref[i] && userD[i]) hitRef++
    if (user[i] && refD[i]) hitUser++
  }
  const recall = hitRef / refInk
  const precision = hitUser / userInk
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  const score = Math.round(f1 * 100)
  return { score, precision, recall, refInk, userInk, grade: gradeOf(score) }
}
