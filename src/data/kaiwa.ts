/**
 * JLPT N5 聴解 題型素材（即時応答・発話表現）。
 *
 * 全部是「最基本的固定表現」（挨拶・定型句），textbook 標準、無地區/世代差異、
 * 不涉 pitch 與複雜敬語——這是可以安全內建的日文，零正確性風險。
 * 誘答（distractors）也都是真實存在的日文句，只是在該情境不適用。
 *
 * 純資料，無依賴，供 Node 測試 import。
 */

/** 即時応答：聽一句短問／招呼 → 選出恰當的「回應」（選項皆為日文）。 */
export interface ResponseItem {
  id: string
  prompt: string // 播放／顯示的日文（純假名）
  promptZh: string // 中文對照（揭曉用）
  answer: string // 正確回應（日文純假名）
  answerZh: string
  distractors: string[] // 其他日文回應（真實存在但此處不恰當）
}

/** 発話表現：給一個「情境」（中文描述）→ 選出該說的日文（選項皆為日文）。 */
export interface ExpressionItem {
  id: string
  situationZh: string // 情境描述（中文）
  answer: string // 正確說法（日文純假名）
  answerZh: string
  distractors: string[]
}

export const RESPONSES: ResponseItem[] = [
  {
    id: 'r1',
    prompt: 'おげんきですか。',
    promptZh: '你好嗎？',
    answer: 'はい、げんきです。',
    answerZh: '嗯，我很好。',
    distractors: ['どういたしまして。', 'いってきます。'],
  },
  {
    id: 'r2',
    prompt: 'ありがとう ございます。',
    promptZh: '謝謝您。',
    answer: 'どういたしまして。',
    answerZh: '不客氣。',
    distractors: ['はじめまして。', 'おやすみなさい。'],
  },
  {
    id: 'r3',
    prompt: 'はじめまして。',
    promptZh: '初次見面。',
    answer: 'どうぞ よろしく おねがいします。',
    answerZh: '請多多指教。',
    distractors: ['おかえりなさい。', 'いただきます。'],
  },
  {
    id: 'r4',
    prompt: 'いってきます。',
    promptZh: '我出門了。',
    answer: 'いってらっしゃい。',
    answerZh: '路上小心（慢走）。',
    distractors: ['ただいま。', 'おめでとう。'],
  },
  {
    id: 'r5',
    prompt: 'ただいま。',
    promptZh: '我回來了。',
    answer: 'おかえりなさい。',
    answerZh: '你回來啦。',
    distractors: ['いってらっしゃい。', 'はじめまして。'],
  },
  {
    id: 'r6',
    prompt: 'おなまえは なんですか。',
    promptZh: '你叫什麼名字？',
    answer: 'ドフ です。',
    answerZh: '我是 Dof。',
    distractors: ['さんじ です。', 'たいわんから きました。'],
  },
  {
    id: 'r7',
    prompt: 'いま なんじですか。',
    promptZh: '現在幾點？',
    answer: 'ごぜん くじです。',
    answerZh: '上午九點。',
    distractors: ['ごひゃくえん です。', 'げんきです。'],
  },
  {
    id: 'r8',
    prompt: 'これは いくらですか。',
    promptZh: '這個多少錢？',
    answer: 'ごひゃくえん です。',
    answerZh: '五百日圓。',
    distractors: ['さんじ です。', 'たいわんじん です。'],
  },
  {
    id: 'r9',
    prompt: 'どこから きましたか。',
    promptZh: '你從哪裡來的？',
    answer: 'たいわんから きました。',
    answerZh: '我從台灣來。',
    distractors: ['ドフ です。', 'ろくじ です。'],
  },
  {
    id: 'r10',
    prompt: 'コーヒーは いかがですか。',
    promptZh: '要不要來杯咖啡？',
    answer: 'はい、おねがいします。',
    answerZh: '好，麻煩你了。',
    distractors: ['どういたしまして。', 'おかえりなさい。'],
  },
  {
    id: 'r11',
    prompt: 'すみません。',
    promptZh: '不好意思／對不起。',
    answer: 'だいじょうぶです。',
    answerZh: '沒關係。',
    distractors: ['いってきます。', 'おめでとう ございます。'],
  },
  {
    id: 'r12',
    prompt: 'おさきに しつれいします。',
    promptZh: '我先告辭了。',
    answer: 'おつかれさまでした。',
    answerZh: '辛苦了。',
    distractors: ['はじめまして。', 'いってらっしゃい。'],
  },
  {
    id: 'r13',
    prompt: 'おやすみなさい。',
    promptZh: '晚安（睡前）。',
    answer: 'おやすみなさい。',
    answerZh: '晚安。',
    distractors: ['おはよう ございます。', 'ただいま。'],
  },
  {
    id: 'r14',
    prompt: 'おたんじょうび おめでとう。',
    promptZh: '生日快樂。',
    answer: 'ありがとう ございます。',
    answerZh: '謝謝。',
    distractors: ['いってらっしゃい。', 'どういたしまして。'],
  },
]

export const EXPRESSIONS: ExpressionItem[] = [
  {
    id: 'e1',
    situationZh: '吃飯前，要開動了。這時候說：',
    answer: 'いただきます。',
    answerZh: '我要開動了。',
    distractors: ['ごちそうさまでした。', 'おやすみなさい。'],
  },
  {
    id: 'e2',
    situationZh: '吃飽了、用餐結束。這時候說：',
    answer: 'ごちそうさまでした。',
    answerZh: '我吃飽了（謝謝招待）。',
    distractors: ['いただきます。', 'いってきます。'],
  },
  {
    id: 'e3',
    situationZh: '早上第一次見到人。這時候說：',
    answer: 'おはよう ございます。',
    answerZh: '早安。',
    distractors: ['こんばんは。', 'おやすみなさい。'],
  },
  {
    id: 'e4',
    situationZh: '要出門去上班／上學。這時候說：',
    answer: 'いってきます。',
    answerZh: '我出門了。',
    distractors: ['ただいま。', 'おかえりなさい。'],
  },
  {
    id: 'e5',
    situationZh: '回到家。這時候說：',
    answer: 'ただいま。',
    answerZh: '我回來了。',
    distractors: ['いってきます。', 'いってらっしゃい。'],
  },
  {
    id: 'e6',
    situationZh: '睡覺前，跟家人道晚安。這時候說：',
    answer: 'おやすみなさい。',
    answerZh: '晚安。',
    distractors: ['おはよう ございます。', 'こんにちは。'],
  },
  {
    id: 'e7',
    situationZh: '別人幫了你，想道謝。這時候說：',
    answer: 'ありがとう ございます。',
    answerZh: '謝謝您。',
    distractors: ['すみません。', 'どういたしまして。'],
  },
  {
    id: 'e8',
    situationZh: '不小心踩到別人的腳，要道歉。這時候說：',
    answer: 'すみません。',
    answerZh: '對不起。',
    distractors: ['どういたしまして。', 'おめでとう ございます。'],
  },
  {
    id: 'e9',
    situationZh: '第一次跟對方見面、自我介紹。這時候說：',
    answer: 'はじめまして。',
    answerZh: '初次見面。',
    distractors: ['おかえりなさい。', 'ごちそうさまでした。'],
  },
  {
    id: 'e10',
    situationZh: '進別人的房間或辦公室前。這時候說：',
    answer: 'しつれいします。',
    answerZh: '打擾了。',
    distractors: ['いただきます。', 'おやすみなさい。'],
  },
  {
    id: 'e11',
    situationZh: '沒聽清楚，想請對方再說一次。這時候說：',
    answer: 'もう いちど おねがいします。',
    answerZh: '請再說一次。',
    distractors: ['だいじょうぶです。', 'いってらっしゃい。'],
  },
  {
    id: 'e12',
    situationZh: '在店裡，想跟店員要這個。這時候說：',
    answer: 'これを ください。',
    answerZh: '請給我這個。',
    distractors: ['ごちそうさまでした。', 'はじめまして。'],
  },
  {
    id: 'e13',
    situationZh: '比同事早下班、先離開公司。這時候說：',
    answer: 'おさきに しつれいします。',
    answerZh: '我先告辭了。',
    distractors: ['おはよう ございます。', 'いただきます。'],
  },
  {
    id: 'e14',
    situationZh: '看到同事很辛苦、慰勞對方。這時候說：',
    answer: 'おつかれさまです。',
    answerZh: '辛苦了。',
    distractors: ['おめでとう ございます。', 'ただいま。'],
  },
]
