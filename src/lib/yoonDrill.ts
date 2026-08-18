/**
 * 拗音ドリル出題（純函式，無 Dexie／瀏覽器依賴，供 Node 測試）。
 *
 * **為什麼要有這個練習**：`data/kana.ts` 的 SRS 卡組只有清音／濁音 142 枚，拗音（きゃ／しゃ／
 * ちゃ…33 音）刻意不在其中（見 `lib/kanaChart.ts` 的說明——加進去會讓卡組膨脹並影響
 * `lib/vocabGate.ts` 的解鎖判定）。但「剛學完五十音」的人正好卡在這裡：看到「きょう」
 * 會唸成 ki-yo-u 而不是 kyo-u。v3.36 的五十音圖只能查、不能練，這個檔補上練習的出題邏輯。
 *
 * **正確性策略**：這裡同樣不新增任何手打的假名或羅馬字——題目與選項全部取自
 * `lib/kanaChart.ts` 的 `chartRows('yoon')`，也就是由已驗證的 `data/kana.ts` 依規則推導
 * （い段假名＋小さい ゃ／ゅ／ょ；羅馬字由 `yoonRomaji` 規則生成）。本檔只負責挑選與洗牌。
 */
// 帶副檔名：本檔會被 Node 直跑的 `tests/integration.ts` import（見 CLAUDE.md 已知陷阱）
import { chartRows, type ChartCell } from './kanaChart.ts'

type RNG = () => number

export interface YoonQuestion {
  cell: ChartCell
  /** 羅馬字選項（含正解，已洗牌） */
  options: string[]
  /** 正解＝該格的羅馬字 */
  answer: string
}

/** 一輪題數。 */
export const YOON_QUIZ_LEN = 10
/** 每題選項數。 */
export const YOON_OPTIONS = 4

function shuffle<T>(arr: T[], rng: RNG): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 全部 33 枚拗音，依五十音圖順序（KY→SH→CH→NY→HY→MY→RY→GY→J→BY→PY × ゃゅょ）。 */
export function yoonPool(): ChartCell[] {
  return chartRows('yoon').flatMap((r) => r.cells.filter((c): c is ChartCell => c != null))
}

/** 拗音的基底（い段假名，如 きゃ→き）——同基底＝同一列。 */
export function yoonBase(cell: ChartCell): string {
  return cell.h.slice(0, -1)
}

/** 拗音的小假名（ゃ／ゅ／ょ）——同小假名＝同一欄（母音相同）。 */
export function yoonSmall(cell: ChartCell): string {
  return cell.h.slice(-1)
}

/**
 * 誘答候選，依「容易混淆的程度」分三層：
 *  ① 同一列、不同母音（きゃ↔きゅ↔きょ）——初學者最常搞混的就是這個
 *  ② 同一欄、不同子音（きゃ↔しゃ↔ちゃ／ぎゃ）
 *  ③ 其餘
 * 每層各自洗牌，層與層之間維持上述優先序。
 */
export function distractorTiers(target: ChartCell, pool: ChartCell[], rng: RNG): ChartCell[][] {
  const base = yoonBase(target)
  const small = yoonSmall(target)
  const others = pool.filter((c) => c.ro !== target.ro)
  return [
    shuffle(others.filter((c) => yoonBase(c) === base), rng),
    shuffle(others.filter((c) => yoonBase(c) !== base && yoonSmall(c) === small), rng),
    shuffle(others.filter((c) => yoonBase(c) !== base && yoonSmall(c) !== small), rng),
  ]
}

/**
 * 一題：正解 ＋ 1 個同列誘答（練母音辨別）＋ 2 個同欄誘答（練子音辨別），洗牌後回傳。
 * 某一層不夠時往後面的層補（給小題庫／測試用；真實題庫 33 枚一定夠）。
 */
export function buildYoonQuestion(
  target: ChartCell,
  pool: ChartCell[],
  rng: RNG,
  size = YOON_OPTIONS,
): YoonQuestion {
  const tiers = distractorTiers(target, pool, rng)
  const want = [1, 2] // 想從第①②層各取幾個
  const picked: ChartCell[] = []
  tiers.forEach((tier, i) => {
    for (const c of tier.slice(0, want[i] ?? 0)) picked.push(c)
  })
  // 不夠就依層序補滿
  for (const tier of tiers) {
    for (const c of tier) {
      if (picked.length >= size - 1) break
      if (!picked.includes(c)) picked.push(c)
    }
  }
  const options = shuffle([target, ...picked.slice(0, size - 1)].map((c) => c.ro), rng)
  return { cell: target, options, answer: target.ro }
}

/** 一輪 n 題，題目不重複（n 超過題庫大小時取整個題庫）。 */
export function buildYoonQuiz(
  rng: RNG,
  n = YOON_QUIZ_LEN,
  pool: ChartCell[] = yoonPool(),
): YoonQuestion[] {
  return shuffle(pool, rng)
    .slice(0, Math.max(0, Math.min(n, pool.length)))
    .map((c) => buildYoonQuestion(c, pool, rng))
}
