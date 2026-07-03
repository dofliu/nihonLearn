export interface PitchWord {
  jp: string
  zh: string
  accent: number // 0=平板, 1=頭高, k=第k拍後下降
  pairKey?: string // 同 key 的詞構成 accent 最小對立組
}

// 東京式標準、教科書級高信度詞。pitch accent 有地區與世代差異，此處僅供辨識訓練。
export const PITCH: PitchWord[] = [
  // 最小對立組（accent 不同、拍相同）
  { jp: 'あめ', zh: '雨', accent: 1, pairKey: 'あめ' },
  { jp: 'あめ', zh: '飴', accent: 0, pairKey: 'あめ' },
  { jp: 'はし', zh: '箸', accent: 1, pairKey: 'はし' },
  { jp: 'はし', zh: '橋', accent: 2, pairKey: 'はし' },
  // 頭高型（1）
  { jp: 'ねこ', zh: '貓', accent: 1 },
  { jp: 'でんき', zh: '電', accent: 1 },
  // 中高／尾高型（≥2）
  { jp: 'やま', zh: '山', accent: 2 },
  { jp: 'いぬ', zh: '狗', accent: 2 },
  { jp: 'おとうと', zh: '弟弟', accent: 4 },
  // 平板型（0）
  { jp: 'みず', zh: '水', accent: 0 },
  { jp: 'さかな', zh: '魚', accent: 0 },
  { jp: 'ともだち', zh: '朋友', accent: 0 },
  { jp: 'にほんご', zh: '日本語', accent: 0 },
  { jp: 'がくせい', zh: '學生', accent: 0 },
]
