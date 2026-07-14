/**
 * 聽力理解出題（純函式，無 Dexie／瀏覽器依賴，供 Node 測試）。
 * 素材來自已驗證的例句與情境短文（jp＋zh），播放日文 → 選中文意思。
 * 不經 LLM，天然無正確性風險。
 */

export interface ListenItem {
  play: string // 朗讀用（純假名）
  reveal: string // 作答後揭曉的日文（純假名）
  zh: string // 中文意思（正解）
}

export interface ListenQuestion {
  play: string
  reveal: string
  answer: string // 正解中文
  options: string[] // 四個中文選項（含正解，已洗牌）
}

export const LISTEN_MIN_POOL = 4

type RNG = () => number

function shuffle<T>(arr: T[], rng: RNG): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 產生 n 題聽力理解。pool 不足 4 句 → 空陣列。
 * 每題取一句當目標，另從 pool 取 3 個「中文互異且不等於正解」的誘答。
 */
export function listeningQuestions(
  pool: ListenItem[],
  n = 5,
  rng: RNG = Math.random,
): ListenQuestion[] {
  if (pool.length < LISTEN_MIN_POOL) return []
  const out: ListenQuestion[] = []
  for (const target of shuffle(pool, rng)) {
    if (out.length >= n) break
    const seen = new Set<string>([target.zh])
    const options = [target.zh]
    for (const it of shuffle(pool, rng)) {
      if (seen.has(it.zh)) continue
      seen.add(it.zh)
      options.push(it.zh)
      if (options.length >= 4) break
    }
    if (options.length < 4) continue // 誘答不足（中文太多重複）→ 跳過此目標
    out.push({
      play: target.play,
      reveal: target.reveal,
      answer: target.zh,
      options: shuffle(options, rng),
    })
  }
  return out
}
