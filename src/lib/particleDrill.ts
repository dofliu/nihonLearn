/**
 * 助詞クイズ（文型ドリル 第四模式）——純函式，無 Dexie／window／React，供 Node 測試直接 import。
 *
 * 為什麼做這個：中文沒有助詞，「〜を ください／〜が ほしいです／〜は いくらですか」的
 * 助詞差別是中文母語者最典型的卡點；但 App 至今沒有任何地方讓人**主動選出**該用哪個助詞
 * ——文型ドリル的三個模式裡，助詞永遠跟著模板一起出現、跟著唸過去。
 *
 * 資料誠信（本檔一個助詞、一個假名都沒有手打）：
 *  1. 正解＝**已驗證句型模板 `data/patterns.ts` 的 `post` 開頭那個 token**（`particleOf`），
 *     句子則沿用 `lib/patternDrill.ts` 的組法（句型 × 已學過的 VOCAB 詞）。不經 LLM。
 *  2. 誘答只從**本題庫句型實際用到的助詞**取（`PARTICLE_CHOICES`），不自行擴充助詞清單。
 *  3. 助詞在別的語境可能有別種說法，程式無法判斷；故本模式問的一律是
 *     「**這個教科書句型固定用哪個助詞**」，UI 文案也照這樣寫，不宣稱「其他助詞一定錯」。
 *  4. `data/patterns.ts` 標了 `noParticleQuiz` 的句型不出題——本題庫的兩個移動句型分別用
 *     へ（〜へ いきます）與 に（〜に いきたいです），**資料本身就顯示兩個助詞都接得上移動動詞**，
 *     程式無從判斷某一句裡另一個是否也成立，所以整個排除（寧可不出題，不要判錯）。
 */
import { PATTERNS, type Pattern } from '../data/patterns.ts'
import { candidatesFor, buildItem } from './patternDrill.ts'
import type { Vocab } from '../data/vocab.ts'

type RNG = () => number

export const ROUND_SIZE = 8

export interface ParticleQuestion {
  patternId: string
  pattern: Pattern
  word: Vocab
  /** 正解助詞（＝句型 post 的開頭 token） */
  particle: string
  /** 空格前（pre ＋ 填入的詞） */
  before: string
  /** 空格後（post 去掉開頭助詞與其後空白） */
  after: string
  /** 完整句（含助詞），供揭曉與朗讀 */
  jp: string
  zh: string
  /** 四選一（含正解，已洗牌） */
  options: string[]
  /** 這個詞是否為「尚未 FSRS 學過、系統補上的基礎詞」（初學者 fallback） */
  fallback: boolean
}

function shuffle<T>(arr: readonly T[], rng: RNG): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1))) // rng 回 1 的邊界：夾在範圍內
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 句型的助詞＝`post` 的第一個 token（`'を ください'` → `'を'`）。
 * 形狀不符（沒有空白分隔、token 過長、後面沒有接續）→ 回 null，該句型自動不出題（降級不中斷）。
 */
export function particleOf(p: Pattern): string | null {
  const i = p.post.indexOf(' ')
  if (i <= 0) return null
  const head = p.post.slice(0, i)
  const rest = p.post.slice(i + 1).trim()
  if (!rest) return null
  if ([...head].length > 2) return null
  return head
}

/** 句型助詞之後的接續（`'を ください'` → `'ください'`）。 */
export function restAfterParticle(p: Pattern): string {
  const head = particleOf(p)
  if (head === null) return p.post
  return p.post.slice(head.length + 1).trim()
}

/** 可出助詞題的句型：排除 `noParticleQuiz` 標記者與形狀不符者。 */
export function quizPatterns(patterns: readonly Pattern[] = PATTERNS): Pattern[] {
  return patterns.filter((p) => !p.noParticleQuiz && particleOf(p) !== null)
}

/** 選項池＝可出題句型實際用到的助詞（去重，維持資料出現順序）。 */
export const PARTICLE_CHOICES: string[] = (() => {
  const out: string[] = []
  for (const p of quizPatterns()) {
    const t = particleOf(p)
    if (t && !out.includes(t)) out.push(t)
  }
  return out
})()

/** 組一題：句型 × 一個填空詞，選項為正解＋最多 3 個其他助詞。 */
export function buildParticleQuestion(
  p: Pattern,
  w: Vocab,
  rng: RNG = Math.random,
  learned?: Set<string>,
): ParticleQuestion | null {
  const particle = particleOf(p)
  if (particle === null) return null
  const item = buildItem(p, w, learned)
  const distractors = shuffle(
    PARTICLE_CHOICES.filter((c) => c !== particle),
    rng,
  ).slice(0, 3)
  return {
    patternId: p.id,
    pattern: p,
    word: w,
    particle,
    before: `${p.pre}${w.jp}`,
    after: restAfterParticle(p),
    jp: item.jp,
    zh: item.zh,
    options: shuffle([particle, ...distractors], rng),
    fallback: item.fallback,
  }
}

/**
 * 組一輪：句型先洗牌再依序取，故**一輪內盡量不重複同一個句型**（句型數 ≥ 題數時保證不重複）；
 * 每題的填空詞從該句型的候選詞（優先已學過的詞）隨機取。
 * 可出題的句型為 0 時回空陣列（呼叫端提示）。
 */
export function buildParticleRound(
  learned: Set<string>,
  n: number = ROUND_SIZE,
  rng: RNG = Math.random,
  patterns: readonly Pattern[] = PATTERNS,
): ParticleQuestion[] {
  if (n <= 0) return []
  const pool = quizPatterns(patterns)
  if (pool.length === 0) return []
  const order = shuffle(pool, rng)
  const out: ParticleQuestion[] = []
  for (let i = 0; out.length < n && i < n * 2; i++) {
    const p = order[i % order.length]
    const words = candidatesFor(p, learned)
    if (words.length === 0) continue
    const w = words[Math.floor(rng() * words.length) % words.length]
    const q = buildParticleQuestion(p, w, rng, learned)
    if (q) out.push(q)
  }
  return out
}

export interface ParticleSummary {
  total: number
  answered: number
  ok: number
  wrong: number
  pct: number
}

/** 結算：marks 為逐題對錯（長度可小於 round＝還沒答完）。pct 以整輪題數為分母。 */
export function particleSummary(
  round: readonly ParticleQuestion[],
  marks: readonly boolean[],
): ParticleSummary {
  const total = round.length
  const answered = Math.min(marks.length, total)
  const ok = marks.slice(0, total).filter(Boolean).length
  return {
    total,
    answered,
    ok,
    wrong: answered - ok,
    pct: total > 0 ? Math.round((ok / total) * 100) : 0,
  }
}

/** 答錯的句型（去重、維持出現順序）——結算列出「這幾個句型的助詞再看一次」。 */
export function missedPatterns(
  round: readonly ParticleQuestion[],
  marks: readonly boolean[],
): Pattern[] {
  const out: Pattern[] = []
  for (let i = 0; i < Math.min(marks.length, round.length); i++) {
    if (marks[i]) continue
    const p = round[i].pattern
    if (!out.some((q) => q.id === p.id)) out.push(p)
  }
  return out
}

/** 一句話中文提示（不含「分」字——這是答對題數，不是評分等第）。 */
export function particleNote(s: ParticleSummary): string {
  if (s.total === 0) return '目前沒有可出題的句型。'
  if (s.ok === s.total) return '全部答對——助詞已經抓到感覺了！'
  if (s.wrong === 1) return '只錯一題，再看一次那個句型的固定說法就好。'
  if (s.ok === 0) return '助詞正是中文母語者最需要多看幾次的地方，先把下面的句型記起來。'
  return `答錯 ${s.wrong} 題——下面列出的句型再看一次固定說法。`
}
