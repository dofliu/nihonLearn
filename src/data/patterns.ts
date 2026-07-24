/**
 * 文型ドリル（句型練習）題庫——固定的 N5 教科書句型模板。
 *
 * 每個模板是一個「挖空句型」（slot ＝ 一個名詞），與 kaiwa/dialogues 同一安全等級：
 * 全為最基本固定表現、無 pitch、無複雜敬語，零正確性風險。空格由**已驗證的 VOCAB 詞**
 * 填入（見 lib/patternDrill.ts），不經 LLM。這對應 Dof 的資料誠信原則：
 * 正確性交給權威來源（教科書句型＋已驗證詞庫）與程式驗證，不由 AI 生成句子。
 *
 * 重要約束（由 tests/integration.ts 保證）：
 *  1. `post`（詞後接續）與 `pre`（詞前）一律純假名——確保能與帶漢字的詞組出可還原的 alt。
 *  2. `cats` 限定的**每個**詞填進去語意都通（如「〜をください」對整個「食べ物／物」類都成立），
 *     故不放需分辨「可吃／可喝」的動詞句型（たべます／のみます），避免「コーヒーをたべます」這種錯配。
 */

export interface Pattern {
  id: string
  /** 顯示用句型（〜 為填空處），如 '〜を ください' */
  label: string
  /** 中文句型名，如 '請給我〜' */
  zh: string
  /** 詞前接續（純假名，通常為空） */
  pre: string
  /** 詞後接續（純假名，含助詞），如 'を ください' */
  post: string
  /** 中文：填入詞的前綴，如 '請給我' */
  zhPre: string
  /** 中文：填入詞的後綴，如 '多少錢？' */
  zhPost: string
  /** 可填入此空格的 VOCAB 分類（該類任一詞填入語意皆通） */
  cats: string[]
  /** 用法小提示（中文） */
  note: string
}

export const PATTERNS: Pattern[] = [
  {
    id: 'kudasai',
    label: '〜を ください',
    zh: '請給我〜',
    pre: '',
    post: 'を ください',
    zhPre: '請給我',
    zhPost: '',
    cats: ['食べ物', '物'],
    note: '在店裡、餐廳點餐或購物時，指定要某樣東西。',
  },
  {
    id: 'ikura',
    label: '〜は いくらですか',
    zh: '〜多少錢？',
    pre: '',
    post: 'は いくらですか',
    zhPre: '',
    zhPost: '多少錢？',
    cats: ['食べ物', '物'],
    note: '問價錢。「いくら」＝多少錢。',
  },
  {
    id: 'doko',
    label: '〜は どこですか',
    zh: '〜在哪裡？',
    pre: '',
    post: 'は どこですか',
    zhPre: '',
    zhPost: '在哪裡？',
    cats: ['場所', '物'],
    note: '問地點或東西在哪。「どこ」＝哪裡。',
  },
  {
    id: 'hoshii',
    label: '〜が ほしいです',
    zh: '我想要〜',
    pre: '',
    post: 'が ほしいです',
    zhPre: '我想要',
    zhPost: '',
    cats: ['食べ物', '物'],
    note: '表達「想要某樣東西」。',
  },
  {
    id: 'suki',
    label: '〜が すきです',
    zh: '我喜歡〜',
    pre: '',
    post: 'が すきです',
    zhPre: '我喜歡',
    zhPost: '',
    cats: ['食べ物', '物', '場所'],
    note: '表達喜好。「すき」＝喜歡。',
  },
  {
    id: 'ikimasu',
    label: '〜へ いきます',
    zh: '我要去〜',
    pre: '',
    post: 'へ いきます',
    zhPre: '我要去',
    zhPost: '',
    cats: ['場所'],
    note: '說要去某個地方。助詞「へ」在此唸作 e。',
  },
]
