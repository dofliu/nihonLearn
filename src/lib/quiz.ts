/**
 * N5 模擬測驗 — 題目生成（純函式，無 Dexie／瀏覽器依賴，供 Node 測試）。
 *
 * 資料誠信：題目只從「使用者已學過的詞彙」生成，素材全部來自已驗證的 `data/vocab`，
 * 天然無正確性風險（不經 LLM）。四種題型：
 *   - meaning 意味選択（日→中）
 *   - word    語彙選択（中→日）
 *   - listen  聽力（音→中；播放讀音選中文）
 *   - arrange かな並べ替え（給中文＋洗牌的假名，重組讀音）
 *
 * 隨機來源以參數注入（預設 Math.random），測試可傳入 seeded RNG 求determinism。
 */
import type { Vocab } from '../data/vocab'

export type QuizKind = 'meaning' | 'word' | 'listen' | 'arrange'

export interface QuizQuestion {
  kind: QuizKind
  refId: string // 對應 vocab.jp（弱項追蹤）
  prompt: string // 題幹（日文或中文；listen 為空）
  promptRead?: string // 聽力題朗讀用的假名
  answer: string // 正解顯示字串
  options?: string[] // 選擇題四選項（含正解，已洗牌）
  tiles?: string[] // arrange：洗牌後的假名字元
}

export const MIN_POOL = 4 // 需要至少 4 個已學詞才有足夠誘答

type RNG = () => number

function shuffle<T>(arr: T[], rng: RNG): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 從 pool 取 count 個「key 值互異、且不等於 answer」的誘答值。 */
function pickDistractors(
  pool: Vocab[],
  answerVal: string,
  key: (v: Vocab) => string,
  count: number,
  rng: RNG,
): string[] {
  const seen = new Set<string>([answerVal])
  const out: string[] = []
  for (const v of shuffle(pool, rng)) {
    const val = key(v)
    if (seen.has(val)) continue
    seen.add(val)
    out.push(val)
    if (out.length >= count) break
  }
  return out
}

function choiceQuestion(
  kind: 'meaning' | 'word' | 'listen',
  target: Vocab,
  pool: Vocab[],
  rng: RNG,
): QuizQuestion {
  const byMeaning = kind === 'word' // word：選項是日文；其餘選項是中文
  const answer = byMeaning ? target.jp : target.zh
  const key = byMeaning ? (v: Vocab) => v.jp : (v: Vocab) => v.zh
  const options = shuffle([answer, ...pickDistractors(pool, answer, key, 3, rng)], rng)
  return {
    kind,
    refId: target.jp,
    prompt: kind === 'listen' ? '' : byMeaning ? target.zh : target.jp,
    promptRead: kind === 'listen' ? target.jp : undefined,
    answer,
    options,
  }
}

function arrangeQuestion(target: Vocab, rng: RNG): QuizQuestion {
  const chars = [...target.jp]
  let tiles = shuffle(chars, rng)
  // 避免洗牌後恰好等於答案（單一解時重洗一次）
  if (chars.length > 1 && tiles.join('') === target.jp) tiles = shuffle(chars, rng)
  return {
    kind: 'arrange',
    refId: target.jp,
    prompt: target.zh,
    answer: target.jp,
    tiles,
  }
}

const CYCLE: QuizKind[] = ['meaning', 'listen', 'word', 'arrange']

/**
 * 產生 n 題測驗。已學詞不足 MIN_POOL → 回空陣列（呼叫端提示先多學詞）。
 * arrange 只用讀音長度 2..6 的詞，否則該題退回 meaning。
 */
export function generateQuiz(learned: Vocab[], n = 10, rng: RNG = Math.random): QuizQuestion[] {
  if (learned.length < MIN_POOL) return []
  const order = shuffle(learned, rng)
  const out: QuizQuestion[] = []
  let i = 0
  while (out.length < n) {
    const target = order[i % order.length]
    i++
    let kind = CYCLE[out.length % CYCLE.length]
    if (kind === 'arrange') {
      const len = [...target.jp].length
      if (len < 2 || len > 6) kind = 'meaning'
    }
    out.push(
      kind === 'arrange'
        ? arrangeQuestion(target, rng)
        : choiceQuestion(kind, target, learned, rng),
    )
  }
  return out
}

/** mulberry32：測試用可重現 RNG。 */
export function seededRng(seed: number): RNG {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
