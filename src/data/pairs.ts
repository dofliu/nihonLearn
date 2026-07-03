export interface MinimalPair {
  a: { jp: string; zh: string }
  b: { jp: string; zh: string }
  type: '長音' | '促音' | '濁音'
}

// 中文母語者三大辨音盲點
export const PAIRS: MinimalPair[] = [
  { a: { jp: 'おばさん', zh: '阿姨' }, b: { jp: 'おばあさん', zh: '奶奶' }, type: '長音' },
  { a: { jp: 'おじさん', zh: '叔叔' }, b: { jp: 'おじいさん', zh: '爺爺' }, type: '長音' },
  { a: { jp: 'ビル', zh: '大樓' }, b: { jp: 'ビール', zh: '啤酒' }, type: '長音' },
  { a: { jp: 'いえ', zh: '家' }, b: { jp: 'いいえ', zh: '不是' }, type: '長音' },
  { a: { jp: 'しゅじん', zh: '丈夫' }, b: { jp: 'しゅうじん', zh: '囚犯' }, type: '長音' },
  { a: { jp: 'きて', zh: '來（て形）' }, b: { jp: 'きって', zh: '郵票' }, type: '促音' },
  { a: { jp: 'かた', zh: '肩膀' }, b: { jp: 'かった', zh: '買了' }, type: '促音' },
  { a: { jp: 'さか', zh: '坡道' }, b: { jp: 'さっか', zh: '作家' }, type: '促音' },
  { a: { jp: 'おと', zh: '聲音' }, b: { jp: 'おっと', zh: '丈夫' }, type: '促音' },
  { a: { jp: 'まち', zh: '城鎮' }, b: { jp: 'マッチ', zh: '火柴' }, type: '促音' },
  { a: { jp: 'てんき', zh: '天氣' }, b: { jp: 'でんき', zh: '電' }, type: '濁音' },
  { a: { jp: 'かき', zh: '柿子' }, b: { jp: 'かぎ', zh: '鑰匙' }, type: '濁音' },
  { a: { jp: 'ふた', zh: '蓋子' }, b: { jp: 'ぶた', zh: '豬' }, type: '濁音' },
  { a: { jp: 'たいがく', zh: '退學' }, b: { jp: 'だいがく', zh: '大學' }, type: '濁音' },
]
