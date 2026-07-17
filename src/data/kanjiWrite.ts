import { VOCAB } from './vocab'

/**
 * 漢字書寫練習字集：直接取自「已驗證的 VOCAB 單漢字詞」（讀音／釋義先前逐條確認）。
 * 不新增未驗證資料——書寫範本＝字形本身，讀音沿用 vocab.jp。純資料，供 Node 測試。
 */
export interface WriteKanji {
  ch: string // 單一漢字（書寫目標／writeScores 主鍵）
  read: string // 假名讀音（TTS 用，取自 vocab.jp）
  zh: string
}

// 單一 CJK 漢字（含々）
const SINGLE_KANJI = /^[々一-鿿]$/

export const WRITE_KANJI: WriteKanji[] = (() => {
  const seen = new Set<string>()
  const out: WriteKanji[] = []
  for (const v of VOCAB) {
    if (!v.kanji || !SINGLE_KANJI.test(v.kanji) || seen.has(v.kanji)) continue
    seen.add(v.kanji)
    out.push({ ch: v.kanji, read: v.jp, zh: v.zh })
  }
  return out
})()
