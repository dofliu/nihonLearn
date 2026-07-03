export interface PassageLine {
  jp: string // 顯示（可含 <ruby> 振り仮名）
  zh: string
  read?: string // 純假名讀音（TTS 用；缺省 fallback 到去標籤的 jp）
}
export interface Passage {
  id: string
  title: string
  ruby?: boolean
  lines: PassageLine[]
}

export const PASSAGES: Passage[] = [
  {
    id: 'p1',
    title: '壱 ─ じこしょうかい（自我介紹・全假名）',
    lines: [
      { jp: 'わたしは たいわんじん です。', zh: '我是台灣人。' },
      { jp: 'なまえは ドフ です。', zh: '名字是 Dof。' },
      { jp: 'にほんごを べんきょうしています。', zh: '我正在學日文。' },
      { jp: 'にほんの アニメが すきです。', zh: '我喜歡日本動漫。' },
      { jp: 'どうぞ よろしく おねがいします。', zh: '請多多指教。' },
    ],
  },
  {
    id: 'p2',
    title: '弐 ─ まいにちの しゅうかん（每天的習慣）',
    lines: [
      { jp: 'まいあさ、コーヒーを のみます。', zh: '每天早上喝咖啡。' },
      { jp: 'それから、じゅっぷん にほんごを べんきょうします。', zh: '然後，學十分鐘日文。' },
      { jp: 'すこしずつ、まえに すすみます。', zh: '一點一點，向前邁進。' },
      { jp: 'きょうも がんばりましょう。', zh: '今天也加油吧。' },
    ],
  },
  {
    id: 'p3',
    title: '参 ─ ことばの にんじゃ（言葉的忍者・附漢字）',
    ruby: true,
    lines: [
      {
        jp: '<ruby>忍者<rt>にんじゃ</rt></ruby>は<ruby>毎日<rt>まいにち</rt></ruby><ruby>修行<rt>しゅぎょう</rt></ruby>します。',
        zh: '忍者每天修行。',
        read: 'にんじゃはまいにちしゅぎょうします',
      },
      {
        jp: '<ruby>雨<rt>あめ</rt></ruby>の<ruby>日<rt>ひ</rt></ruby>も、<ruby>風<rt>かぜ</rt></ruby>の<ruby>日<rt>ひ</rt></ruby>も、<ruby>休<rt>やす</rt></ruby>みません。',
        zh: '下雨天、颳風天，都不休息。',
        read: 'あめのひも、かぜのひも、やすみません',
      },
      {
        jp: '<ruby>小<rt>ちい</rt></ruby>さな<ruby>一歩<rt>いっぽ</rt></ruby>が、<ruby>大<rt>おお</rt></ruby>きな<ruby>力<rt>ちから</rt></ruby>になります。',
        zh: '小小的一步，會成為巨大的力量。',
        read: 'ちいさないっぽが、おおきなちからになります',
      },
      {
        jp: 'あなたも<ruby>今日<rt>きょう</rt></ruby>から、ことばの<ruby>忍者<rt>にんじゃ</rt></ruby>です。',
        zh: '你也從今天起，是言葉的忍者。',
        read: 'あなたもきょうから、ことばのにんじゃです',
      },
    ],
  },
]
