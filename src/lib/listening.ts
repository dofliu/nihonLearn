/**
 * 聽力理解出題（純函式，無 Dexie／瀏覽器依賴，供 Node 測試）。
 * 素材來自已驗證的例句與情境短文（jp＋zh），播放日文 → 選中文意思。
 * 不經 LLM，天然無正確性風險。
 */

export interface ListenItem {
  play: string // 朗讀用（純假名）
  reveal: string // 作答後揭曉的日文（純假名）
  revealKanji?: string // 漢字正寫（有的話；漢字モード揭曉時附假名注音）
  zh: string // 中文意思（正解）
}

export interface ListenQuestion {
  play: string
  reveal: string
  revealKanji?: string
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
 * 依 groupOf 分組後輪流取（round-robin），讓同一組的項目不要擠在前面。
 * 組的先後與組內順序都沿用傳入的順序（呼叫端先洗牌 → 這裡只負責「攤開」），
 * 且回傳的元素個數與內容與輸入完全相同（只是順序不同）。
 */
export function spreadByGroup<T>(items: T[], groupOf: (it: T) => string): T[] {
  const groups = new Map<string, T[]>()
  for (const it of items) {
    const k = groupOf(it)
    const arr = groups.get(k)
    if (arr) arr.push(it)
    else groups.set(k, [it])
  }
  const buckets = [...groups.values()]
  const out: T[] = []
  for (let round = 0; out.length < items.length; round++) {
    for (const b of buckets) if (round < b.length) out.push(b[round])
  }
  return out
}

/**
 * 段落聽解：從「已附理解題」的題庫洗牌取 n 題，並洗牌每題的選項。
 * 選項為預先撰寫（答案由短文內容直接支持），此處只負責選材與選項順序。
 *
 * 給 groupOf（例如「這題屬於哪一篇短文」）時，同一篇短文的題目會被攤開——
 * 一篇短文可能有大意題＋多題細節題，不加處理的話一輪三題可能連聽三次同一段音檔。
 */
export function pickParagraphs<T extends { options: string[] }>(
  items: T[],
  n: number,
  rng: RNG = Math.random,
  groupOf?: (it: T) => string,
): T[] {
  const shuffled = shuffle(items, rng)
  const order = groupOf ? spreadByGroup(shuffled, groupOf) : shuffled
  return order.slice(0, n).map((it) => ({ ...it, options: shuffle(it.options, rng) }))
}

// ── JLPT 題型：即時応答・発話表現 ──
// 選項＝正解＋誘答洗牌（各題自帶誘答，皆為真實日文句）。純選材與順序，無正確性風險。

interface HasChoices {
  answer: string
  distractors: string[]
}

/** 從一題的正解＋誘答組出「至多 4 個、含正解、已洗牌」的選項。 */
function buildChoices(item: HasChoices, rng: RNG): string[] {
  const opts = [item.answer, ...item.distractors].slice(0, 4)
  return shuffle(opts, rng)
}

export interface ResponseQuestion {
  play: string // 播放的日文短問／招呼
  playZh: string
  answer: string // 正確回應（日文）
  answerZh: string
  options: string[] // 日文回應選項（含正解，已洗牌）
}

/** 即時応答：洗牌取 n 題，各題選項洗牌。pool 不足 1 題 → 空陣列。 */
export function responseQuestions<
  T extends HasChoices & { prompt: string; promptZh: string; answerZh: string },
>(pool: T[], n = 5, rng: RNG = Math.random): ResponseQuestion[] {
  return shuffle(pool, rng)
    .slice(0, n)
    .map((it) => ({
      play: it.prompt,
      playZh: it.promptZh,
      answer: it.answer,
      answerZh: it.answerZh,
      options: buildChoices(it, rng),
    }))
}

export interface ExpressionQuestion {
  situationZh: string // 情境（中文）
  answer: string // 正確說法（日文）
  answerZh: string
  options: string[] // 日文說法選項（含正解，已洗牌）
}

/** 発話表現：洗牌取 n 題，各題選項洗牌。pool 不足 1 題 → 空陣列。 */
export function expressionQuestions<
  T extends HasChoices & { situationZh: string; answerZh: string },
>(pool: T[], n = 5, rng: RNG = Math.random): ExpressionQuestion[] {
  return shuffle(pool, rng)
    .slice(0, n)
    .map((it) => ({
      situationZh: it.situationZh,
      answer: it.answer,
      answerZh: it.answerZh,
      options: buildChoices(it, rng),
    }))
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
      revealKanji: target.revealKanji,
      answer: target.zh,
      options: shuffle(options, rng),
    })
  }
  return out
}
