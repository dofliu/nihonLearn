/**
 * 会話（情境對話引導）的「暗記モード」純函式（無 Dexie / window / React，供 Node 測試直接 import）。
 *
 * 原本 `views/DialogueView.tsx` 只有一種走法：輪到你的句子**日文就攤在眼前**，照著唸出來。
 * 這對第一次走這段對話的人剛好，但同樣的 7 段 × 8 句走過兩三次之後，看著稿子唸就只是**朗讀**——
 * 真正要練的「輪到我時能不能自己說出來」反而練不到（這正是 v3.46 給文型ドリル加回想テスト的同一個理由）。
 *
 * 暗記モード：**輪到你的句子只顯示中文與遮罩**，自己先說出來，說不出來再按「看稿」。
 * 走完一整段之後結算「幾句沒看稿」，並列出看了稿的那幾句供下次留意。
 *
 * ⚠ 誠實定位：這裡統計的是**你有沒有看稿**，**不是**評估你說得對不對——
 * 這個畫面沒有 ASR、也沒有評分（跟読分頁的發音評分才有）。故刻意不套用
 * `lib/scoreReveal.ts` 的 ◎／○／△ 等第徽章（那是相似度分數的等第，語意不同），
 * 比照 v3.46 回想テスト的判例：只給純文字結算與一句話中文提示。
 *
 * 素材完全沿用已驗證的 `data/dialogues.ts`（遮罩是對原句的純機械字元替換），
 * 不經 LLM、不新增任何日文、零正確性風險。
 */
import type { DialogueLine } from '../data/dialogues.ts'

/** 会話的兩種走法：看稿朗讀（預設，第一次走這段的人）／暗記（自己先說）。 */
export type DialogueMode = 'script' | 'recall'

/** 遮罩時保留的符號：句讀與括號本身不是「要背的音」，留著還能提示這句是問句還是陳述句。 */
const KEEP_CHARS = new Set([' ', '　', '。', '、', '？', '！', '「', '」', '，', '.', '?', '!'])

/** 遮罩用的字元（一個字元一點，長度即為原句長度的提示）。 */
export const MASK_CHAR = '・'

/**
 * 把一句日文遮成「看不出內容、但看得出句長與句型符號」的樣子。
 * 純機械替換：空白與句讀原樣保留，其餘每個字元換成一個 `MASK_CHAR`。
 */
export function maskJp(jp: string): string {
  return Array.from(jp)
    .map((ch) => (KEEP_CHARS.has(ch) ? ch : MASK_CHAR))
    .join('')
}

/** 這段對話裡「輪到你」（role 'b'）的句子索引（維持原順序）。 */
export function myLineIndexes(lines: readonly DialogueLine[]): number[] {
  const out: number[] = []
  lines.forEach((l, i) => {
    if (l.role === 'b') out.push(i)
  })
  return out
}

export interface RecallSummary {
  /** 這段對話裡輪到你的句數 */
  mine: number
  /** 沒看稿就說出來的句數 */
  unaided: number
  /** 看了稿的句數 */
  aided: number
  /** 沒看稿的比例（0–100 整數） */
  pct: number
}

/**
 * 結算：`unaided` 是「說的當下沒看稿」的句子索引（由 UI 在前進時記錄）。
 * 只認得數得出來的東西——不是 role 'b' 的索引、重複的索引一律忽略。
 */
export function recallSummary(
  lines: readonly DialogueLine[],
  unaided: readonly number[],
): RecallSummary {
  const mineIdx = myLineIndexes(lines)
  const mineSet = new Set(mineIdx)
  const counted = new Set<number>()
  for (const i of unaided) if (mineSet.has(i)) counted.add(i)
  const mine = mineIdx.length
  const un = counted.size
  return {
    mine,
    unaided: un,
    aided: mine - un,
    pct: mine > 0 ? Math.round((un / mine) * 100) : 0,
  }
}

export interface AidedLine {
  /** 在 `lines` 中的索引 */
  index: number
  jp: string
  zh: string
}

/** 看了稿的那幾句（維持對話出現順序），供結算畫面列出來下次留意。 */
export function aidedLines(
  lines: readonly DialogueLine[],
  unaided: readonly number[],
): AidedLine[] {
  const done = new Set(unaided)
  return myLineIndexes(lines)
    .filter((i) => !done.has(i))
    .map((i) => ({ index: i, jp: lines[i].jp, zh: lines[i].zh }))
}

/**
 * 結算的一句話中文提示。刻意不講「幾分」——這是「有沒有看稿」的統計，不是評分。
 */
export function recallNote(s: RecallSummary): string {
  if (s.mine === 0) return '這段對話裡沒有輪到你的句子。'
  if (s.aided === 0) return '整段都沒看稿——這幾句你已經記住了，換個場景再走一段吧。'
  if (s.unaided === 0) return '這次每一句都看了稿——再走一次，這次先自己想三秒再看。'
  return `有 ${s.aided} 句看了稿——下面列出來了，再走一次時先自己想想看。`
}
