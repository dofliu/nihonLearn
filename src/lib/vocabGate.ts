/**
 * 詞彙解鎖閘門：一個詞只在「它用到的假名你都學過」時才會被引入。
 * 讓詞彙修行自然跟著五十音進度走，初學者不會看到還沒學過的假名。
 * 純函式（無 Dexie / window），供 Node 測試直接 import。
 */
import { KANA } from '../data/kana.ts'

// 所有「可當卡片學習」的假名字元（清音＋濁音＋半濁音，含片假名）。
// 小書き（ゃゅょっ 等）、長音ー、標點不在其中——它們隨主音自然習得，不作為解鎖條件。
const KANA_CH = new Set(KANA.map((k) => k.ch))

/** 讀音中「需要認得的假名字元」（去除小書き/長音/標點）。 */
export function gatingChars(reading: string): string[] {
  const out: string[] = []
  for (const ch of reading) if (KANA_CH.has(ch)) out.push(ch)
  return out
}

/** 這個讀音的假名是否都已學過（learnedChars = 已學假名的字元集合）。 */
export function isVocabUnlocked(reading: string, learnedChars: Set<string>): boolean {
  return gatingChars(reading).every((ch) => learnedChars.has(ch))
}
