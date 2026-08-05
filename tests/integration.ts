// 整合測試：直接 import 真實原始碼（Node 22 --experimental-strip-types）
// 涵蓋 FSRS 排程、pitch pattern、發音相似度、mora 對齊思路、日期/streak、
// 覆蓋率檢核、資料完整性。不含瀏覽器 UI（見 MANUAL_QA.md）。

import { KANA, KANA_BY_ID } from '../src/data/kana.ts'
import { VOCAB } from '../src/data/vocab.ts'
import { splitMora, pitchPattern, accentTypeName } from '../src/lib/pitch.ts'
import { similarity, normKana } from '../src/audio/scorer.ts'
import { computeStreak, todayStr, lastNDays } from '../src/lib/date.ts'
import { newCard, review, isDue, isMastered } from '../src/srs/scheduler.ts'
import { analyzeCoverage } from '../src/lib/coverage.ts'
import { normalizeBase, joinApi, ttsCacheKey } from '../src/lib/sidecar.ts'
import { gatingChars, isVocabUnlocked } from '../src/lib/vocabGate.ts'
import { stripJsonFences, extractText, chatContents, parseListenQuestions, parseRoleplayTurn } from '../src/lib/llmParse.ts'
import {
  ROLEPLAY_SCENES,
  sceneById,
  buildRoleplaySystem,
  roleplayHistory,
  myTurnCount,
  isRoleplayOver,
  entryFromTurn,
  MAX_TURNS,
  type RoleplayEntry,
} from '../src/lib/roleplay.ts'
import { generateQuiz, seededRng, MIN_POOL } from '../src/lib/quiz.ts'
import { karaokeChars, activeCharIndices } from '../src/lib/karaoke.ts'
import { listeningQuestions, pickParagraphs, responseQuestions, expressionQuestions, LISTEN_MIN_POOL, type ListenItem } from '../src/lib/listening.ts'
import { PASSAGES, PASSAGE_CATS } from '../src/data/passages.ts'
import { RESPONSES, EXPRESSIONS } from '../src/data/kaiwa.ts'
import { alignFurigana, hasKanji, stripIgnored } from '../src/lib/furigana.ts'
import { DIALOGUES } from '../src/data/dialogues.ts'
import { SENTS } from '../src/data/sentences.ts'
import { scoreHandwriting, dilate, gradeOf } from '../src/lib/handwriting.ts'
import { totalsByDay, totalsByFeature, featuresOnDay, activeDayCount, heatLevel, calendarCells } from '../src/lib/activity.ts'
import { PATTERNS } from '../src/data/patterns.ts'
import { poolFor, candidatesFor, buildItem, itemsFor, dailyPattern } from '../src/lib/patternDrill.ts'
import { KANJI_STROKES, KANJI_STROKE_VIEWBOX } from '../src/data/kanjiStrokes.ts'
import { strokeStart, refStrokeStarts, judgeStrokeOrder, pathEnd, strokeVector } from '../src/lib/strokeOrder.ts'
import { sentencePrompts, patternPrompts, tutorPrompts, pickPrompt, buildQuizSystem, buildQuizUser, parseCritique, VERDICT_LABEL } from '../src/lib/tutorQuiz.ts'
import {
  normJa,
  lookupVocab,
  checkShape,
  shapeSummary,
  buildComposeSystem,
  buildComposeUser,
} from '../src/lib/patternCompose.ts'
import {
  buildAskSystem,
  buildAskUser,
  parseFollowUpQuestion,
  buildReplySystem,
  buildReplyUser,
  MAX_FOLLOWUPS,
} from '../src/lib/followUp.ts'

let pass = 0
let fail = 0
const fails: string[] = []
function ok(name: string, cond: boolean) {
  if (cond) {
    pass++
  } else {
    fail++
    fails.push(name)
    console.log('  ✗ ' + name)
  }
}

console.log('\n=== 1. FSRS 排程 ===')
{
  const c0 = newCard(new Date('2026-01-01T00:00:00Z'))
  ok('新卡 state=New(0)', c0.state === 0)
  const good1 = review(c0, 'good', new Date('2026-01-01T00:00:00Z'))
  ok('good 後 reps 增加', good1.reps === 1)
  const easy = review(c0, 'easy', new Date('2026-01-01T00:00:00Z'))
  const good = review(c0, 'good', new Date('2026-01-01T00:00:00Z'))
  ok('easy 到期晚於 good', new Date(easy.due).getTime() >= new Date(good.due).getTime())
  // 連續 good 數次應進入 Review 且間隔拉長到定著
  let c = newCard(new Date('2026-01-01'))
  let d = new Date('2026-01-01')
  for (let i = 0; i < 6; i++) {
    c = review(c, 'good', d)
    d = new Date(c.due)
  }
  ok('連續 good 後定著 (isMastered)', isMastered(c))
  // FSRS 語義：lapse 只在 Review 狀態答錯才計
  const relapse = review(c, 'forgot', new Date(c.due))
  ok('Review 狀態 forgot 增 lapses', relapse.lapses >= 1)
  ok('新卡當下到期 (isDue)', isDue(newCard(new Date()), new Date()))
}

console.log('=== 2. Pitch pattern（東京式）===')
{
  ok('あめ雨 accent1 → HL', pitchPattern(2, 1).join('') === 'truefalse')
  ok('あめ飴 accent0 → LH', pitchPattern(2, 0).join('') === 'falsetrue')
  ok('はし橋 accent2 → LH', pitchPattern(2, 2).join('') === 'falsetrue')
  ok('にほんご accent0 → LHHH', pitchPattern(4, 0).join('') === 'falsetruetruetrue')
  ok('拗音合併 しゅぎょう=3拍', splitMora('しゅぎょう').length === 3)
  ok('型名 0→平板', accentTypeName(0, 3) === '平板型')
  ok('型名 1→頭高', accentTypeName(1, 3) === '頭高型')
  ok('型名 n→尾高', accentTypeName(2, 2) === '尾高型')
  ok('型名 中高', accentTypeName(2, 4) === '中高型')
}

console.log('=== 3. 發音相似度 ===')
{
  ok('完全一致=100', similarity('これをください', ['これをください']) === 100)
  ok('片假名正規化', normKana('コーヒー').length > 0)
  ok('多 target 取最高', similarity('わたしはドフです', ['まちがい', 'わたしはドフです']) === 100)
  ok('部分相符 0<x<100', (() => { const s = similarity('きて', ['きって']); return s > 0 && s < 100 })())
}

console.log('=== 4. 日期 / streak ===')
{
  const today = todayStr()
  const y = new Date(); y.setDate(y.getDate() - 1)
  const yStr = todayStr(y)
  ok('今日+昨日連續=2', computeStreak(new Set([today, yStr])) === 2)
  ok('只有今日=1', computeStreak(new Set([today])) === 1)
  ok('斷開的舊章不計今日', computeStreak(new Set(['2020-01-01'])) === 0)
  ok('lastNDays(14) 長度=14', lastNDays(14).length === 14)
}

console.log('=== 5. 覆蓋率檢核 ===')
{
  const known = VOCAB.map((v) => v.jp)
  const a = analyzeCoverage('みずをください', known)
  ok('已知詞句覆蓋率高', a.coveragePct >= 90 && !a.flagged)
  const b = analyzeCoverage('しゅぎょうする', known)
  ok('超綱句 flagged', b.flagged)
  ok('超綱句標出未覆蓋段', b.newSpans.length >= 1)
}

console.log('=== 5b. Sidecar 位址與 TTS 快取 key ===')
{
  ok('空輸入 → 空 base（同源相對路徑）', normalizeBase('') === '' && normalizeBase('   ') === '')
  ok('無 scheme 自動補 https', normalizeBase('sidecar.example.com') === 'https://sidecar.example.com')
  ok('保留明確的 http（LAN 除錯用）', normalizeBase('http://192.168.1.5:8848') === 'http://192.168.1.5:8848')
  ok('去尾斜線', normalizeBase('https://x.example.com///') === 'https://x.example.com')
  ok('空 base join 維持相對路徑', joinApi('', '/api/tts') === '/api/tts')
  ok('有 base join 成絕對路徑', joinApi('https://x.example.com', '/api/tts') === 'https://x.example.com/api/tts')
  ok('cache key 含 speaker/rate/text', ttsCacheKey('こんにちは', 3, 0.85) === '3|0.85|こんにちは')
  ok('無 speaker 用 default', ttsCacheKey('ねこ', null, 1) === 'default|1|ねこ')
  ok('不同 rate 不同 key', ttsCacheKey('ねこ', 3, 0.85) !== ttsCacheKey('ねこ', 3, 1))
}

console.log('=== 5c. 詞彙解鎖閘門（隨假名進度） ===')
{
  // gatingChars 只取「可當卡片的假名」，忽略小書き/長音/標點
  ok('gatingChars 取基本假名', JSON.stringify(gatingChars('みず')) === JSON.stringify(['み', 'ず']))
  ok('小書き ゃゅょっ 不計入', gatingChars('しゅぎょう').every((c) => !'ゃゅょっぁぃぅぇぉ'.includes(c)))
  ok('長音ー 不計入', !gatingChars('コーヒー').includes('ー'))
  ok('標點不計入', gatingChars('みずを、ください。').every((c) => !'、。'.includes(c)))

  // isVocabUnlocked：假名全學過才解鎖
  const known = new Set(['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ'])
  ok('假名全會 → 解鎖', isVocabUnlocked('えき', known))
  ok('含未學假名 → 未解鎖', !isVocabUnlocked('これ', known)) // れ 未學
  ok('小書き詞：主音會了即解鎖', isVocabUnlocked('きゃく', new Set(['き', 'く']))) // ゃ 不 gating
  ok('空集合下多數詞未解鎖', VOCAB.filter((v) => isVocabUnlocked(v.jp, new Set())).length < VOCAB.length)
}

console.log('=== 5d. Gemini 回應解析 ===')
{
  ok('去 ```json 圍欄', stripJsonFences('```json\n{"a":1}\n```') === '{"a":1}')
  ok('去無語言標記圍欄', stripJsonFences('```\n{"a":1}```') === '{"a":1}')
  ok('無圍欄原樣', stripJsonFences('{"a":1}') === '{"a":1}')
  const resp = { candidates: [{ content: { parts: [{ text: '{"ok":' }, { text: 'true}' }] } }] }
  ok('抽出並串接 parts 文字', extractText(resp) === '{"ok":true}')
  ok('空回應回空字串', extractText({}) === '' && extractText({ candidates: [] }) === '')

  // 對話歷史 → Gemini contents（role 對映）
  const cc = chatContents([
    { role: 'user', text: 'こんにちは' },
    { role: 'model', text: 'はい' },
  ])
  ok('user role 保留、text 進 parts', cc[0].role === 'user' && cc[0].parts[0].text === 'こんにちは')
  ok('model role 對映', cc[1].role === 'model')
}

console.log('=== 5e. N5 模擬測驗生成 ===')
{
  const pool = VOCAB.slice(0, 30)
  ok('已學不足 4 詞 → 空', generateQuiz(VOCAB.slice(0, 3), 10, seededRng(1)).length === 0)
  ok('MIN_POOL 常數為 4', MIN_POOL === 4)
  const q = generateQuiz(pool, 10, seededRng(42))
  ok('產出 10 題', q.length === 10)
  ok('每題 refId 在詞庫內', q.every((x) => pool.some((v) => v.jp === x.refId)))
  ok('四種題型都出現', new Set(q.map((x) => x.kind)).size === 4)

  const choice = q.filter((x) => x.kind !== 'arrange')
  ok('選擇題四選項', choice.every((x) => x.options!.length === 4))
  ok('正解在選項內', choice.every((x) => x.options!.includes(x.answer)))
  ok('選項互異', choice.every((x) => new Set(x.options).size === x.options!.length))
  ok('listen 題有讀音、prompt 空', q.filter((x) => x.kind === 'listen').every((x) => x.promptRead && !x.prompt))

  const arr = q.filter((x) => x.kind === 'arrange')
  ok(
    'arrange tiles 為答案字元的排列',
    arr.every((x) => [...x.answer].slice().sort().join('') === x.tiles!.slice().sort().join('')),
  )
  ok('seed 相同 → 結果可重現', JSON.stringify(generateQuiz(pool, 6, seededRng(7))) === JSON.stringify(generateQuiz(pool, 6, seededRng(7))))
}

console.log('=== 5f. 朗讀逐字上色對齊 ===')
{
  // 空白不計入 cleaned 索引（與 tts clean() 一致）
  const c = karaokeChars('きょうは いい')
  ok('非空白字元 ci 連續遞增', c.filter((x) => x.ci >= 0).map((x) => x.ci).join(',') === '0,1,2,3,4,5')
  ok('空白 ci = -1', c.find((x) => x.ch === ' ')!.ci === -1)
  // 去標籤
  ok('ruby 標籤剝除', karaokeChars('<ruby>山<rt>やま</rt></ruby>').every((x) => x.ch !== '<'))

  // 範圍高亮
  const chars = karaokeChars('みずをください')
  const set = activeCharIndices(chars, 0, 2)
  ok('range [0,2) 高亮前兩字', set.has(0) && set.has(1) && !set.has(2))
  // 未知長度（end<=start）→ 高亮整個「詞」（此處無空白＝整句）
  const spaced = karaokeChars('きょう は')
  const w = activeCharIndices(spaced, 0, 0)
  ok('未知長度：高亮 start 所在的詞', w.has(0) && w.has(1) && w.has(2) && !w.has(3))
  ok('空白不被高亮', !activeCharIndices(spaced, 0, 3).has(3))
}

console.log('=== 5g. 聽力理解出題 ===')
{
  const pool: ListenItem[] = Array.from({ length: 12 }, (_, i) => ({
    play: `ぶん${i}`,
    reveal: `ぶん${i}`,
    zh: `中文${i}`,
  }))
  ok('LISTEN_MIN_POOL 為 4', LISTEN_MIN_POOL === 4)
  ok('不足 4 句 → 空', listeningQuestions(pool.slice(0, 3), 5, seededRng(1)).length === 0)
  const qs = listeningQuestions(pool, 5, seededRng(3))
  ok('產出 5 題', qs.length === 5)
  ok('每題四選項', qs.every((x) => x.options.length === 4))
  ok('正解在選項內', qs.every((x) => x.options.includes(x.answer)))
  ok('選項互異', qs.every((x) => new Set(x.options).size === 4))
  ok('answer 對得上某句 zh', qs.every((x) => pool.some((p) => p.zh === x.answer)))
  ok('seed 相同可重現', JSON.stringify(listeningQuestions(pool, 5, seededRng(9))) === JSON.stringify(listeningQuestions(pool, 5, seededRng(9))))

  // 段落聽解選材
  const paras = [
    { id: 'a', options: ['甲', '乙', '丙', '丁'] },
    { id: 'b', options: ['戊', '己', '庚', '辛'] },
    { id: 'c', options: ['壬', '癸', '子', '丑'] },
    { id: 'd', options: ['寅', '卯', '辰', '巳'] },
  ]
  const picked = pickParagraphs(paras, 3, seededRng(5))
  ok('段落取 3 篇', picked.length === 3)
  ok('段落選項洗牌後仍為原集合', picked.every((p) => {
    const orig = paras.find((x) => x.id === p.id)!
    return [...p.options].sort().join() === [...orig.options].sort().join()
  }))
  ok('段落 seed 可重現', JSON.stringify(pickParagraphs(paras, 3, seededRng(2))) === JSON.stringify(pickParagraphs(paras, 3, seededRng(2))))
}

console.log('=== 5h. 短文分類與段落理解題 ===')
{
  ok('每篇短文都有分類', PASSAGES.every((p) => PASSAGE_CATS.includes(p.cat)))
  const withQuiz = PASSAGES.filter((p) => p.quiz)
  ok('有理解題的短文 ≥ 8 篇', withQuiz.length >= 8)
  ok('理解題四選項且含正解', withQuiz.every((p) => p.quiz!.options.length === 4 && p.quiz!.options.includes(p.quiz!.answer)))
  ok('四個分類都有短文', PASSAGE_CATS.every((c) => PASSAGES.some((p) => p.cat === c)))

  const withDetail = PASSAGES.filter((p) => p.detailQuiz?.length)
  ok('有細節理解題的短文 ≥ 5 篇', withDetail.length >= 5)
  ok(
    '細節理解題四選項且含正解',
    withDetail.every((p) => p.detailQuiz!.every((dq) => dq.options.length === 4 && dq.options.includes(dq.answer))),
  )
  ok(
    '細節理解題答案由短文 zh 台詞直接支持（逐字出現）',
    withDetail.every((p) => {
      const zhText = p.lines.map((l) => l.zh).join('')
      return p.detailQuiz!.every((dq) => zhText.includes(dq.answer))
    }),
  )
}

console.log('=== 5i. JLPT 題型：即時応答・発話表現 ===')
{
  // 資料完整性：正解不在誘答內、各題選項湊得到 3~4 個
  ok('即時応答題庫 ≥ 10', RESPONSES.length >= 10)
  ok('発話表現題庫 ≥ 10', EXPRESSIONS.length >= 10)
  ok('即時応答 id 唯一', new Set(RESPONSES.map((r) => r.id)).size === RESPONSES.length)
  ok('発話表現 id 唯一', new Set(EXPRESSIONS.map((e) => e.id)).size === EXPRESSIONS.length)
  ok('即時応答正解不混入誘答', RESPONSES.every((r) => !r.distractors.includes(r.answer)))
  ok('発話表現正解不混入誘答', EXPRESSIONS.every((e) => !e.distractors.includes(e.answer)))

  const rq = responseQuestions(RESPONSES, 5, seededRng(4))
  ok('即時応答產出 5 題', rq.length === 5)
  ok('即時応答含正解', rq.every((x) => x.options.includes(x.answer)))
  ok('即時応答選項互異', rq.every((x) => new Set(x.options).size === x.options.length))
  ok('即時応答帶播放日文與中文', rq.every((x) => x.play && x.playZh && x.answerZh))
  ok('即時応答 seed 可重現', JSON.stringify(responseQuestions(RESPONSES, 5, seededRng(7))) === JSON.stringify(responseQuestions(RESPONSES, 5, seededRng(7))))

  const eq = expressionQuestions(EXPRESSIONS, 5, seededRng(6))
  ok('発話表現產出 5 題', eq.length === 5)
  ok('発話表現含正解', eq.every((x) => x.options.includes(x.answer)))
  ok('発話表現選項互異', eq.every((x) => new Set(x.options).size === x.options.length))
  ok('発話表現帶情境中文', eq.every((x) => x.situationZh && x.answerZh))
  ok('n 大於題庫時不超量', expressionQuestions(EXPRESSIONS.slice(0, 3), 5, seededRng(1)).length === 3)
}

console.log('=== 5j. AI 段落理解題純解析（LLM 只生中文） ===')
{
  const good = parseListenQuestions({
    questions: [
      { q: '這段對話發生在哪裡？', options: ['機場', '餐廳', '醫院', '學校'], answer: '機場' },
      { q: '說話者要做什麼？', options: ['辦入住', '問路', '點餐'], answer: '辦入住' },
    ],
  })
  ok('解析出 2 題', good.length === 2)
  ok('保留正解在選項', good.every((x) => x.options.includes(x.answer)))
  ok('接受 3 選項題', good[1].options.length === 3)

  // 容錯：頂層直接是陣列
  ok('頂層陣列亦可', parseListenQuestions([{ q: 'a', options: ['甲', '乙', '丙'], answer: '甲' }]).length === 1)
  // 丟棄：正解不在選項、選項太少、缺欄位
  ok('正解不在選項→丟', parseListenQuestions([{ q: 'a', options: ['甲', '乙', '丙'], answer: '丁' }]).length === 0)
  ok('選項不足 3→丟', parseListenQuestions([{ q: 'a', options: ['甲', '乙'], answer: '甲' }]).length === 0)
  ok('缺問題→丟', parseListenQuestions([{ q: '', options: ['甲', '乙', '丙'], answer: '甲' }]).length === 0)
  ok('選項超過 4→丟', parseListenQuestions([{ q: 'a', options: ['甲', '乙', '丙', '丁', '戊'], answer: '甲' }]).length === 0)
  ok('重複選項去重後不足→丟', parseListenQuestions([{ q: 'a', options: ['甲', '甲', '乙'], answer: '甲' }]).length === 0)
  ok('非物件輸入→空陣列', parseListenQuestions('nope').length === 0 && parseListenQuestions(null).length === 0)
}

console.log('=== 5k. 漢字↔假名注音對齊（furigana） ===')
{
  ok('hasKanji 判斷', hasKanji('駅まで') && !hasKanji('えきまで') && hasKanji('日々'))
  ok('無漢字 → null', alignFurigana('えきまで', 'えきまで') === null)
  ok('對不上 → null', alignFurigana('駅まで', 'あめのひ') === null)

  const segs = alignFurigana('駅までいくらですか', 'えきまで いくらですか')
  ok('基本對齊：駅→えき', segs?.[0].text === '駅' && segs?.[0].ruby === 'えき')

  // 錨點假名出現在讀音內（回溯處理）：学校が → がっこう+が
  const amb = alignFurigana('学校が', 'がっこうが')
  ok('回溯對齊：学校→がっこう', amb?.[0].ruby === 'がっこう' && amb?.[1].text === 'が')

  // 程式驗證：全部 SENTS.alt 與 VOCAB.kanji 都能對齊，且重組完全還原
  const sentAlts = SENTS.filter((s) => s.alt && hasKanji(s.alt))
  ok('SENTS 有漢字正寫的句子 ≥ 15', sentAlts.length >= 15)
  const reconstructs = (display: string, reading: string): boolean => {
    const sg = alignFurigana(display, reading)
    if (!sg) return false
    const disp = sg.map((x) => x.text).join('')
    const read = sg.map((x) => (x.ruby != null ? x.ruby : stripIgnored(x.text))).join('')
    return disp === display && read === stripIgnored(reading)
  }
  ok('SENTS 全部對齊且重組還原', sentAlts.every((s) => reconstructs(s.alt!, s.jp)))
  const vocabKanji = VOCAB.filter((v) => v.kanji && hasKanji(v.kanji))
  ok('VOCAB 有漢字的詞 ≥ 20', vocabKanji.length >= 20)
  ok('VOCAB 全部對齊且重組還原', vocabKanji.every((v) => reconstructs(v.kanji!, v.jp)))
}

console.log('=== 5l. 情境對話（会話引導） ===')
{
  ok('對話 ≥ 6 段', DIALOGUES.length >= 6)
  ok('id 唯一', new Set(DIALOGUES.map((d) => d.id)).size === DIALOGUES.length)
  ok('每段有對象與場景', DIALOGUES.every((d) => d.partner && d.scene && d.title))
  ok('每段 ≥ 6 句', DIALOGUES.every((d) => d.lines.length >= 6))
  ok('每句 jp/zh 非空', DIALOGUES.every((d) => d.lines.every((l) => l.jp && l.zh)))
  ok('全假名（初學者友善，無漢字）', DIALOGUES.every((d) => d.lines.every((l) => !hasKanji(l.jp))))
  ok('雙方輪流說話', DIALOGUES.every((d) => d.lines.every((l, i) => i === 0 || l.role !== d.lines[i - 1].role)))
  ok('使用者（b）都有台詞', DIALOGUES.every((d) => d.lines.some((l) => l.role === 'b')))
  ok('涵蓋店員/家人/情人/同學/朋友/廠商', ['店員', '家人', '情人', '同學', '朋友', '廠商'].every((p) => DIALOGUES.some((d) => d.partnerTag === p)))
}

console.log('=== 5m. 手寫字形相似度評分 ===')
{
  const N = 8
  const blank = () => new Array<boolean>(N * N).fill(false)
  // 中央 4×4 方塊當「範本」
  const box = () => {
    const g = blank()
    for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) g[y * N + x] = true
    return g
  }
  const ref = box()

  ok('完全一致 → 100', scoreHandwriting(ref, box(), N, { tolerance: 0 }).score === 100)
  ok('沒寫 → grade —', scoreHandwriting(ref, blank(), N).grade === '—')
  ok('沒寫 → score 0', scoreHandwriting(ref, blank(), N).score === 0)
  ok('範本空 → 無法評分', scoreHandwriting(blank(), box(), N).grade === '—')

  // 整格塗滿：recall=1 但 precision 低 → 分數被壓低（不能作弊）
  const full = new Array<boolean>(N * N).fill(true)
  const cheat = scoreHandwriting(ref, full, N, { tolerance: 0 })
  ok('塗滿整格 recall 高', cheat.recall === 1)
  ok('塗滿整格 precision 低', cheat.precision < 0.4)
  ok('塗滿整格分數被壓低', cheat.score < 60)

  // 只寫一半 → recall 掉、分數中段
  const half = blank()
  for (let y = 2; y <= 5; y++) for (let x = 2; x <= 3; x++) half[y * N + x] = true
  const h = scoreHandwriting(ref, half, N, { tolerance: 0 })
  ok('寫一半 recall≈0.5', Math.abs(h.recall - 0.5) < 0.01)
  ok('寫一半分數 0<score<100', h.score > 0 && h.score < 100)

  // 位移 1 格但在容忍內 → 仍高分
  const shifted = blank()
  for (let y = 3; y <= 6; y++) for (let x = 3; x <= 6; x++) shifted[y * N + x] = true
  ok('位移1格容忍內仍高分', scoreHandwriting(ref, shifted, N, { tolerance: 1 }).score >= 80)

  // dilate 基本行為
  const single = blank()
  single[3 * N + 3] = true
  ok('dilate r=1 → 3×3=9 格', dilate(single, N, 1).filter(Boolean).length === 9)
  ok('dilate r=0 → 原樣', dilate(single, N, 0).filter(Boolean).length === 1)

  ok('gradeOf 門檻', gradeOf(85) === '◎' && gradeOf(65) === '○' && gradeOf(30) === '△')
}

console.log('=== 5n. 學習活動統計 ===')
{
  const rows = [
    { day: '2026-07-01', feature: 'kana', count: 10 },
    { day: '2026-07-01', feature: 'write', count: 3 },
    { day: '2026-07-02', feature: 'listen', count: 5 },
    { day: '2026-07-02', feature: 'kana', count: 2 },
    { day: '2026-07-04', feature: 'quiz', count: 1 },
  ]
  const byDay = totalsByDay(rows)
  ok('每日總數：07-01=13', byDay['2026-07-01'] === 13)
  ok('每日總數：07-02=7', byDay['2026-07-02'] === 7)
  const byFeat = totalsByFeature(rows)
  ok('功能累計：kana=12', byFeat['kana'] === 12)
  ok('功能累計：write=3', byFeat['write'] === 3)
  ok('某日功能集合', featuresOnDay(rows, '2026-07-01').has('write') && featuresOnDay(rows, '2026-07-01').has('kana'))
  ok('練習天數＝3', activeDayCount(rows) === 3)
  ok('count 0 不算練習天', activeDayCount([{ day: 'x', feature: 'kana', count: 0 }]) === 0)

  ok('heatLevel 分級', heatLevel(0) === 0 && heatLevel(3) === 1 && heatLevel(8) === 2 && heatLevel(20) === 3 && heatLevel(40) === 4)
  const cells = calendarCells(rows, ['2026-07-01', '2026-07-02', '2026-07-03'])
  ok('日曆格對齊日期序', cells.length === 3 && cells[0].day === '2026-07-01')
  ok('日曆格帶總數與分級', cells[0].count === 13 && cells[0].level === 3 && cells[2].count === 0 && cells[2].level === 0)
}

console.log('=== 5o. 文型ドリル（句型 × 已學單字） ===')
{
  ok('句型 id 唯一', new Set(PATTERNS.map((p) => p.id)).size === PATTERNS.length)
  ok('句型 ≥ 12', PATTERNS.length >= 12)
  ok('句型皆有分類', PATTERNS.every((p) => p.cats.length > 0))
  // pre/post 純假名——保證與帶漢字的詞組出可還原的 alt（漢字モード）
  ok('句型接續純假名', PATTERNS.every((p) => !hasKanji(p.pre) && !hasKanji(p.post)))
  ok('每個分類都對得到詞', PATTERNS.every((p) => poolFor(p).length > 0))

  // 空 learned：初學者 fallback，每個句型仍有詞可練、畫面不空
  const empty = new Set<string>()
  ok('空進度也非空（fallback）', PATTERNS.every((p) => candidatesFor(p, empty).length > 0))
  ok('空進度 items 皆標 fallback', itemsFor(PATTERNS[0], empty).every((it) => it.fallback))

  // 學過夠多時只出學過的詞
  const learned = new Set(poolFor(PATTERNS[0]).slice(0, 6).map((v) => v.jp))
  const cand = candidatesFor(PATTERNS[0], learned)
  ok('學過夠多→只出學過', cand.length >= 4 && cand.every((v) => learned.has(v.jp)))

  // 核心正確性：任一句型 × 任一分類詞，若詞有漢字，alt 必能被 furigana 對齊（漢字モード安全）
  let alignFail = 0
  for (const p of PATTERNS)
    for (const w of poolFor(p)) {
      const it = buildItem(p, w)
      if (it.alt && alignFurigana(it.alt, it.jp) === null) alignFail++
    }
  ok('全句型×詞的 alt 皆可 furigana 對齊', alignFail === 0)

  // 具體組句：をください × コーヒー
  const coffee = VOCAB.find((v) => v.jp === 'コーヒー')!
  const kudasai = PATTERNS.find((p) => p.id === 'kudasai')!
  const it = buildItem(kudasai, coffee)
  ok('jp 組句正確', it.jp === 'コーヒーを ください')
  ok('zh 組句正確', it.zh === '請給我咖啡')

  ok('dailyPattern 在範圍內', [0, 1, 5, 13, 100].every((d) => PATTERNS.includes(dailyPattern(d))))
  ok('dailyPattern 每天輪替', dailyPattern(0).id !== dailyPattern(1).id)
}

console.log('=== 5p. 漢字筆順動画（KanjiVG stroke data） ===')
{
  // 與 data/kanjiWrite.ts WRITE_KANJI 同一套篩選邏輯（該檔 import 無副檔名，Node 無法直接載入，故此處重現判斷）
  const SINGLE_KANJI = /^[々一-鿿]$/
  const seen = new Set<string>()
  const writeKanjiChars: string[] = []
  for (const v of VOCAB) {
    if (!v.kanji || !SINGLE_KANJI.test(v.kanji) || seen.has(v.kanji)) continue
    seen.add(v.kanji)
    writeKanjiChars.push(v.kanji)
  }

  ok('viewBox 為 109（KanjiVG 標準座標系）', KANJI_STROKE_VIEWBOX === 109)
  ok('筆順資料非空', Object.keys(KANJI_STROKES).length > 0)
  ok(
    '書寫練習每個漢字都有筆順資料',
    writeKanjiChars.every((ch) => Array.isArray(KANJI_STROKES[ch]) && KANJI_STROKES[ch].length > 0),
  )
  const allD = Object.values(KANJI_STROKES).flat()
  ok('每畫皆為非空 SVG path 字串、以 M 開頭', allD.every((d) => typeof d === 'string' && /^M[\d.]/.test(d)))
  ok('每畫皆互不相同（同一字內無重複筆畫）', Object.values(KANJI_STROKES).every((ds) => new Set(ds).size === ds.length))
}

console.log('=== 5q. 筆順順序粗略比對 ===')
{
  ok('strokeStart 解析 M 命令座標', strokeStart('M54.5,20c0.37,2.12,-0.5,2.25').x === 54.5)
  ok('strokeStart y 座標正確', strokeStart('M54.5,20c0.37,2.12,-0.5,2.25').y === 20)

  const paths = KANJI_STROKES['人'] // 2 畫：撇（左上起筆）→ 捺（中段起筆）
  ok('人 有 2 畫筆順資料', paths.length === 2)
  const starts = refStrokeStarts(paths, KANJI_STROKE_VIEWBOX)
  ok('refStrokeStarts 正規化到 0..1', starts.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1))

  const CANVAS = 260
  // 依官方順序下筆（正規化座標 × CANVAS 還原成使用者畫布座標）→ 應判定順序正確
  const inOrder = starts.map((p) => [{ x: p.x * CANVAS, y: p.y * CANVAS }, { x: p.x * CANVAS + 5, y: p.y * CANVAS + 5 }])
  const rOk = judgeStrokeOrder(inOrder, paths, CANVAS, KANJI_STROKE_VIEWBOX)
  ok('依官方順序下筆 → verdict correct', rOk.verdict === 'correct')
  ok('依官方順序下筆 → orderScore 100', rOk.orderScore === 100)

  // 反過來下筆 → 順序不對
  const reversed = [...inOrder].reverse()
  const rBad = judgeStrokeOrder(reversed, paths, CANVAS, KANJI_STROKE_VIEWBOX)
  ok('反順序下筆 → verdict out_of_order', rBad.verdict === 'out_of_order')
  ok('反順序下筆 → orderScore 低於 100', rBad.orderScore < 100)

  // 只畫 1 筆（範本 2 筆）→ 筆畫數不符
  const rCount = judgeStrokeOrder([inOrder[0]], paths, CANVAS, KANJI_STROKE_VIEWBOX)
  ok('筆畫數不同 → verdict count_mismatch', rCount.verdict === 'count_mismatch')

  // 沒下筆 → unscored
  const rEmpty = judgeStrokeOrder([], paths, CANVAS, KANJI_STROKE_VIEWBOX)
  ok('沒下筆 → verdict unscored', rEmpty.verdict === 'unscored')

  // 對全部有筆順資料的漢字：起筆點皆可解析為有限數字（資料完整性、不會產生 NaN）
  const allFinite = Object.values(KANJI_STROKES).every((ds) =>
    refStrokeStarts(ds, KANJI_STROKE_VIEWBOX).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
  )
  ok('全部筆順起筆點皆可解析（無 NaN）', allFinite)
}

console.log('=== 5r. 筆順「行筆方向」粗略比對 ===')
{
  ok('pathEnd 解析純 c（相對）路徑收筆座標', pathEnd('M10,10c5,5,10,10,20,20').x === 30)
  ok('pathEnd 相對路徑 y 座標正確', pathEnd('M10,10c5,5,10,10,20,20').y === 30)
  ok('pathEnd 解析絕對 C 命令收筆座標', pathEnd('M10,10C12,12,15,15,40,10').x === 40)
  ok('pathEnd 對無法解析的片段仍回傳有限座標', Number.isFinite(pathEnd('M5,5').x))

  const paths = KANJI_STROKES['人'] // 2 畫：撇（左上→左下）、捺（中段→右下）
  const CANVAS = 260
  const scale = CANVAS / KANJI_STROKE_VIEWBOX

  // 完全依範本「起筆→收筆」方向下筆（同向量等比縮放）→ cosine 應為 1、方向應判定相符
  const sameDir = paths.map((p) => {
    const s = strokeStart(p)
    const e = pathEnd(p)
    return [{ x: s.x * scale, y: s.y * scale }, { x: e.x * scale, y: e.y * scale }]
  })
  const rDir = judgeStrokeOrder(sameDir, paths, CANVAS, KANJI_STROKE_VIEWBOX)
  ok('依範本方向下筆 → directionVerdict match', rDir.directionVerdict === 'match')
  ok('依範本方向下筆 → directionScore 100', rDir.directionScore === 100)

  // 從範本起筆點下筆、但往反方向拉（同一起點配對到同一畫，只是行進方向相反）→ 方向應判定明顯不同
  const reversedDir = paths.map((p) => {
    const s = strokeStart(p)
    const v = strokeVector(p)
    return [{ x: s.x * scale, y: s.y * scale }, { x: (s.x - v.x) * scale, y: (s.y - v.y) * scale }]
  })
  const rBadDir = judgeStrokeOrder(reversedDir, paths, CANVAS, KANJI_STROKE_VIEWBOX)
  ok('反方向下筆 → directionVerdict mismatch', rBadDir.directionVerdict === 'mismatch')
  ok('反方向下筆 → directionScore 為 0', rBadDir.directionScore === 0)

  // 只點一下（單點，無行進方向）→ 無法判斷方向
  const tapOnly = paths.map((p) => {
    const s = strokeStart(p)
    return [{ x: s.x * scale, y: s.y * scale }]
  })
  const rTap = judgeStrokeOrder(tapOnly, paths, CANVAS, KANJI_STROKE_VIEWBOX)
  ok('單點下筆（無行進方向）→ directionVerdict unscored', rTap.directionVerdict === 'unscored')
  ok('單點下筆 → directionScore 為 NaN', Number.isNaN(rTap.directionScore))

  // 沒下筆 → 方向也 unscored（承 5q 的 unscored 情境）
  const rEmptyDir = judgeStrokeOrder([], paths, CANVAS, KANJI_STROKE_VIEWBOX)
  ok('沒下筆 → directionVerdict unscored', rEmptyDir.directionVerdict === 'unscored')

  // 資料完整性：全部筆順的方向向量皆可解析為有限數字（不含 NaN、Infinity）
  const allVecFinite = Object.values(KANJI_STROKES).every((ds) =>
    ds.every((p) => {
      const v = strokeVector(p)
      return Number.isFinite(v.x) && Number.isFinite(v.y)
    }),
  )
  ok('全部筆畫方向向量皆可解析（無 NaN）', allVecFinite)
}

console.log('=== 5s. 自由対話（AI 角色扮演）純邏輯 ===')
{
  // 場景沿用已驗證腳本：開場白必須逐字等於該段對話的第一句（且由對方先開口）
  ok('可用場景非空', ROLEPLAY_SCENES.length >= 5)
  ok('場景 id 唯一', new Set(ROLEPLAY_SCENES.map((s) => s.id)).size === ROLEPLAY_SCENES.length)
  const openingsVerified = ROLEPLAY_SCENES.every((s) => {
    const d = DIALOGUES.find((x) => x.id === s.id)
    return !!d && d.lines[0].role === 'a' && d.lines[0].jp === s.opening && d.lines[0].zh === s.openingZh
  })
  ok('開場白逐字取自已驗證腳本第一句', openingsVerified)
  ok('開場白全假名（無漢字）', ROLEPLAY_SCENES.every((s) => !hasKanji(s.opening)))
  ok('每個場景都有對象與情境說明', ROLEPLAY_SCENES.every((s) => s.partner && s.scene && s.title))
  ok('sceneById 取得得到', sceneById(ROLEPLAY_SCENES[0].id)?.title === ROLEPLAY_SCENES[0].title)
  ok('sceneById 不存在回 undefined', sceneById('no-such-scene') === undefined)

  // system prompt：帶場景／對象／已學詞，且守住「只輸出 JSON、不杜撰重音」的紅線
  const sys = buildRoleplaySystem(ROLEPLAY_SCENES[0], ['みず', 'たべる'])
  ok('system 帶入對象', sys.includes(ROLEPLAY_SCENES[0].partner))
  ok('system 帶入場景說明', sys.includes(ROLEPLAY_SCENES[0].scene))
  ok('system 帶入已學詞', sys.includes('みず') && sys.includes('たべる'))
  ok('system 要求只輸出 JSON', sys.includes('只輸出 JSON') && sys.includes('"hint"'))
  ok('system 禁止杜撰重音', sys.includes('不要杜撰重音'))
  const sysNoWords = buildRoleplaySystem(ROLEPLAY_SCENES[0], [])
  ok('無已學詞時有 fallback 說明', sysNoWords.includes('尚無'))

  // 對話歷史 → Gemini contents（對方回合以 JSON 字串回填，維持輸出格式）
  const entries: RoleplayEntry[] = [
    { who: 'partner', jp: 'いらっしゃいませ。', zh: '歡迎光臨。' },
    { who: 'me', jp: 'みずを ください。' },
    { who: 'partner', jp: 'はい、どうぞ。', zh: '好的，請。', hint: '很自然！' },
  ]
  const hist = roleplayHistory(entries)
  ok('歷史長度一致', hist.length === 3)
  ok('我方對映 user 且原文不變', hist[1].role === 'user' && hist[1].text === 'みずを ください。')
  ok('對方對映 model', hist[0].role === 'model' && hist[2].role === 'model')
  const firstJson = JSON.parse(hist[0].text) as { jp: string; zh: string; hint: string }
  ok('對方回合為合法 JSON 且欄位齊全', firstJson.jp === 'いらっしゃいませ。' && firstJson.zh === '歡迎光臨。' && firstJson.hint === '')

  ok('myTurnCount 只算我方', myTurnCount(entries) === 1)
  ok('未達上限不結束', !isRoleplayOver(entries))
  const full: RoleplayEntry[] = Array.from({ length: MAX_TURNS }, () => ({ who: 'me' as const, jp: 'はい。' }))
  ok('達回合上限即結束', isRoleplayOver(full))

  // 回合解析（容錯）
  const t1 = parseRoleplayTurn({ jp: 'なんめいさまですか。', zh: '請問幾位？', hint: '可以說ふたりです。' })
  ok('解析物件回合', t1?.jp === 'なんめいさまですか。' && t1?.hint === '可以說ふたりです。')
  const t2 = parseRoleplayTurn('```json\n{"jp":"はい。","zh":"好的","hint":"不錯"}\n```')
  ok('解析含 ``` 圍欄的 JSON 字串', t2?.jp === 'はい。' && t2?.zh === '好的')
  const t3 = parseRoleplayTurn([{ jp: 'どうぞ。' }])
  ok('陣列取第一筆、缺 zh/hint 補空字串', t3?.jp === 'どうぞ。' && t3?.zh === '' && t3?.hint === '')
  ok('缺 jp → null', parseRoleplayTurn({ zh: '只有中文' }) === null)
  ok('jp 空白 → null', parseRoleplayTurn({ jp: '   ' }) === null)
  ok('非 JSON 字串 → null', parseRoleplayTurn('抱歉我不知道') === null)
  ok('null/數字 → null', parseRoleplayTurn(null) === null && parseRoleplayTurn(42) === null)

  const e = entryFromTurn({ jp: 'はい。', zh: '好的', hint: '很好' })
  ok('entryFromTurn 產生對方氣泡', e.who === 'partner' && e.jp === 'はい。')
}

console.log('=== 5t. AI 助教「考我」出題與講評解析 ===')
{
  // 題目與參考答案一律來自已驗證資料（日文不由 LLM 生），這裡逐條核對來源
  const sp = sentencePrompts()
  ok('例句題非空', sp.length >= 10)
  ok(
    '例句題只取壱／弐級（参・物語句不出）',
    sp.every((p) => {
      const s = SENTS.find((x) => `sent:${x.id}` === p.id)
      return !!s && (s.lv === 1 || s.lv === 2)
    }),
  )
  ok(
    '例句題的中文題目與參考答案逐字取自 data/sentences',
    sp.every((p) => {
      const s = SENTS.find((x) => `sent:${x.id}` === p.id)
      return !!s && s.zh === p.zh && s.jp === p.answer && (s.alt ?? undefined) === p.alt
    }),
  )

  const learned = new Set(VOCAB.slice(0, 30).map((v) => v.jp))
  const pp = patternPrompts(learned)
  ok('句型題非空', pp.length >= 6)
  ok('每個句型最多取 3 題', PATTERNS.every((p) => pp.filter((x) => x.id.startsWith(`pat:${p.id}:`)).length <= 3))
  ok(
    '句型題由「句型模板 × 已驗證詞」組成（可還原）',
    pp.every((p) => {
      const [, pid, word] = p.id.split(':')
      const pat = PATTERNS.find((x) => x.id === pid)
      const v = VOCAB.find((x) => x.jp === word)
      return !!pat && !!v && p.answer === `${pat.pre}${v.jp}${pat.post}` && p.zh === `${pat.zhPre}${v.zh}${pat.zhPost}`
    }),
  )
  ok('句型題 tag 為句型標籤', pp.every((p) => PATTERNS.some((x) => x.label === p.tag)))

  const pool = tutorPrompts(learned)
  ok('題庫＝例句題＋句型題', pool.length === sp.length + pp.length)
  ok('題目 id 唯一', new Set(pool.map((p) => p.id)).size === pool.length)
  ok('每題都有中文題目與日文參考答案', pool.every((p) => p.zh.trim() && p.answer.trim() && p.tag.trim()))

  // 抽題：不重複上一題；題庫只剩一題時只好重複；空題庫回 null
  ok('抽題落在題庫內', pool.includes(pickPrompt(pool, null, () => 0.5)!))
  const first = pickPrompt(pool, null, () => 0)!
  ok('換一題不會抽到同一題', pickPrompt(pool, first.id, () => 0)!.id !== first.id)
  ok('rng 回 1（邊界）也不會越界', pickPrompt(pool, null, () => 1) !== null)
  ok('只剩一題時允許重複', pickPrompt([pool[0]], pool[0].id)!.id === pool[0].id)
  ok('空題庫回 null', pickPrompt([], null) === null)

  // 講評 prompt：帶題目/參考答案/作答與已學詞，且守住紅線（只講中文、不杜撰重音）
  const sys = buildQuizSystem(['みず', 'たべる'])
  ok('system 帶入已學詞', sys.includes('みず') && sys.includes('たべる'))
  ok('system 要求繁體中文講評', sys.includes('繁體中文'))
  ok('system 要求開頭評價記號', sys.includes('✅') && sys.includes('△') && sys.includes('❌'))
  ok('system 禁止杜撰重音', sys.includes('不要杜撰重音'))
  ok('system 允許參考答案以外的正確說法', sys.includes('不要硬要他照抄'))
  ok('無已學詞時有 fallback 說明', buildQuizSystem([]).includes('尚無'))
  const user = buildQuizUser(pool[0], '  みずを ください。 ')
  ok('user 帶入題目與參考答案', user.includes(pool[0].zh) && user.includes(pool[0].answer))
  ok('user 帶入作答（已 trim）', user.includes('學習者的作答：みずを ください。\n'))

  // 講評解析（寬鬆：沒照格式只是少了徽章，內容照樣顯示）
  ok('✅ → ok', parseCritique('✅ 很好，完全表達到了。').verdict === 'ok')
  ok('△ → soso', parseCritique('△：助詞可以改成を。').verdict === 'soso')
  ok('❌ → ng', parseCritique('❌ 這句意思沒傳達到。').verdict === 'ng')
  ok('⚠️（含變體選擇符）→ soso', parseCritique('⚠️ 差一點').verdict === 'soso')
  ok('記號後的標點被清掉', parseCritique('✅：很好').body === '很好')
  ok('無記號 → unknown 但保留全文', parseCritique('寫得不錯喔').verdict === 'unknown' && parseCritique('寫得不錯喔').body === '寫得不錯喔')
  ok('空字串 → unknown 且 body 空', parseCritique('').verdict === 'unknown' && parseCritique('').body === '')
  ok('前後空白會被 trim', parseCritique('  ✅ 好  ').body === '好')
  ok('VERDICT_LABEL 三種評價都有文案、unknown 為空', VERDICT_LABEL.ok && VERDICT_LABEL.soso && VERDICT_LABEL.ng && VERDICT_LABEL.unknown === '')
}

console.log('=== 5u. 跟讀「即時追問」純邏輯 ===')
{
  const sent = SENTS[0]

  // 追問 prompt：帶入剛跟讀的已驗證例句與已學詞，守住紅線
  const asys = buildAskSystem(['みず', 'たべる'])
  ok('追問 system 帶入已學詞', asys.includes('みず') && asys.includes('たべる'))
  ok('追問 system 要求只問一句、N5 程度', asys.includes('只問「一句」') && asys.includes('N5'))
  ok('追問 system 要求貼合例句情境', asys.includes('不要換話題'))
  ok('追問 system 禁止杜撰重音', asys.includes('不要杜撰重音'))
  ok('追問 system 要求只輸出 JSON', asys.includes('只輸出 JSON') && asys.includes('"jp"'))
  ok('無已學詞時有 fallback 說明', buildAskSystem([]).includes('尚無'))
  const auser = buildAskUser(sent)
  ok('追問 user 帶入例句原文與中文', auser.includes(sent.jp) && auser.includes(sent.zh))

  // 追問句解析（容錯，比照 parseRoleplayTurn）
  ok(
    '物件可解析',
    parseFollowUpQuestion({ jp: 'なにが すきですか。', zh: '你喜歡什麼？' })?.jp ===
      'なにが すきですか。',
  )
  ok(
    'JSON 字串可解析',
    parseFollowUpQuestion('{"jp":"どこへ いきますか。","zh":"你要去哪裡？"}')?.zh ===
      '你要去哪裡？',
  )
  ok(
    '含 ``` 圍欄的字串可解析',
    parseFollowUpQuestion('```json\n{"jp":"はい、どうぞ。","zh":"好的，請。"}\n```')?.jp ===
      'はい、どうぞ。',
  )
  ok('陣列取第一筆', parseFollowUpQuestion([{ jp: 'いくつ ですか。' }, { jp: 'x' }])?.jp === 'いくつ ですか。')
  ok('缺 zh 補空字串', parseFollowUpQuestion({ jp: 'いくつ ですか。' })?.zh === '')
  ok('缺 jp → null', parseFollowUpQuestion({ zh: '只有中文' }) === null)
  ok('jp 只有空白 → null', parseFollowUpQuestion({ jp: '   ' }) === null)
  ok('壞掉的字串 → null', parseFollowUpQuestion('not json at all') === null)
  ok('null/數字 → null', parseFollowUpQuestion(null) === null && parseFollowUpQuestion(42) === null)
  ok('前後空白會被 trim', parseFollowUpQuestion({ jp: '  はい。 ', zh: ' 好 ' })?.jp === 'はい。')

  // 講評 prompt：沒有標準答案，評的是「通不通」；記號格式與 parseCritique 相同
  const rsys = buildReplySystem(['みず'])
  ok('講評 system 帶入已學詞', rsys.includes('みず'))
  ok('講評 system 說明沒有標準答案', rsys.includes('沒有標準答案'))
  ok('講評 system 要求繁體中文', rsys.includes('繁體中文'))
  ok('講評 system 要求開頭評價記號', rsys.includes('✅') && rsys.includes('△') && rsys.includes('❌'))
  ok('講評 system 禁止杜撰重音', rsys.includes('不要杜撰重音'))
  const ruser = buildReplyUser({ jp: 'なにが すきですか。', zh: '你喜歡什麼？' }, '  みずが すきです。 ')
  ok('講評 user 帶入追問句與中文', ruser.includes('なにが すきですか。') && ruser.includes('你喜歡什麼？'))
  ok('講評 user 帶入回答（已 trim）', ruser.includes('學習者的回答：みずが すきです。\n'))
  ok('沒有中文翻譯時不會多出空括號', !buildReplyUser({ jp: 'はい。', zh: '' }, 'はい').includes('（）'))

  // 講評解析沿用 tutorQuiz（同一套記號），確認接得上
  ok('AI 講評可被 parseCritique 解析出徽章', parseCritique('✅ 回答得很自然。').verdict === 'ok')
  ok('追問次數上限為正整數', Number.isInteger(MAX_FOLLOWUPS) && MAX_FOLLOWUPS > 0)
}

console.log('=== 5v. 文型ドリル「自由造句」檢核與講評 ===')
{
  const kudasai = PATTERNS.find((p) => p.id === 'kudasai')!
  const doko = PATTERNS.find((p) => p.id === 'doko')!

  // 正規化：空白與句讀不影響比對
  ok('normJa 去半形/全形空白', normJa('みず を  ください') === 'みずをください')
  ok('normJa 去句讀', normJa('みずを ください。') === 'みずをください')
  ok('normJa 對空值安全', normJa('') === '' && normJa('　 。') === '')

  // 基本檢核：句型骨架
  const c1 = checkShape(kudasai, 'みずを ください。')
  ok('骨架正確 → ok', c1.ok && c1.hasPre && c1.hasPost)
  ok('抽出填入的詞', c1.slot === 'みず')
  ok('填入的詞對得上詞庫', c1.word?.jp === 'みず')
  ok('填入的詞屬於此句型分類', c1.inCats)
  ok('未提供 learned → learned 為 false', c1.learned === false)
  ok('提供 learned 時可判定已學過', checkShape(kudasai, 'みずをください', new Set(['みず'])).learned)

  // 沒用到句型 → 不 ok
  ok('缺接續 → 不 ok', !checkShape(kudasai, 'みずです').ok)
  ok('接續在錯的位置 → 不 ok', !checkShape(kudasai, 'を ください みず').ok)
  ok('只有接續沒有填空 → 不 ok', !checkShape(kudasai, 'を ください').ok)
  ok('空作答 → 不 ok 且 slot 空', (() => { const c = checkShape(kudasai, '  '); return !c.ok && c.slot === '' })())
  ok('用錯句型的接續 → 不 ok', !checkShape(doko, 'みずを ください').ok)

  // 漢字寫法也查得到（比對假名與漢字正寫）
  ok('漢字作答可對回詞庫', checkShape(kudasai, '水を ください').word?.jp === 'みず')
  ok('lookupVocab 吃假名', lookupVocab('みず')?.zh === VOCAB.find((v) => v.jp === 'みず')!.zh)
  ok('lookupVocab 吃漢字', lookupVocab('水')?.jp === 'みず')
  ok('lookupVocab 查無 → null', lookupVocab('ぜったいにない') === null && lookupVocab('') === null)

  // 詞庫外的詞：句型仍算對，但不宣稱那個詞的正確性
  const c2 = checkShape(kudasai, 'パスタを ください')
  ok('詞庫外的詞 → 句型仍 ok', c2.ok && c2.slot === 'パスタ')
  ok('詞庫外的詞 → word 為 null 且不宣稱分類', c2.word === null && !c2.inCats)

  // 分類外的詞（語意可能不通）：可偵測，交給使用者自己想
  const outCat = VOCAB.find((v) => !kudasai.cats.includes(v.cat))!
  const c3 = checkShape(kudasai, `${outCat.jp}を ください`)
  ok('分類外的詞 → word 對得上但 inCats 為 false', c3.word?.jp === outCat.jp && !c3.inCats)

  // 一致性：**已驗證資料組出的每一句**送回檢核都必須通過（程式驗證，非口頭聲稱）
  let bad = 0
  for (const p of PATTERNS)
    for (const w of poolFor(p)) {
      const it = buildItem(p, w)
      const ck = checkShape(p, it.jp)
      if (!ck.ok || ck.word?.jp !== w.jp || !ck.inCats) bad++
      if (it.alt) {
        const ca = checkShape(p, it.alt)
        if (!ca.ok || ca.word?.jp !== w.jp) bad++
      }
    }
  ok('全句型×詞的組句皆通過自我檢核（含漢字寫法）', bad === 0)

  // 摘要文字：四種情境都要有話可說，且不空
  ok('摘要：空作答', shapeSummary(kudasai, checkShape(kudasai, '')).includes('還沒'))
  ok('摘要：骨架不符', shapeSummary(kudasai, checkShape(kudasai, 'みずです')).includes('接續'))
  ok('摘要：詞庫外', shapeSummary(kudasai, c2).includes('詞庫'))
  ok('摘要：正確填空', shapeSummary(kudasai, c1).includes('みず'))
  ok(
    '摘要皆非空字串',
    ['', 'みずです', 'パスタを ください', 'みずを ください'].every(
      (a) => shapeSummary(kudasai, checkShape(kudasai, a)).length > 0,
    ),
  )

  // 講評 prompt：只生中文、記號格式接得上 parseCritique、紅線齊全
  const csys = buildComposeSystem(['みず', 'コーヒー'])
  ok('造句 system 帶入已學詞', csys.includes('みず') && csys.includes('コーヒー'))
  ok('造句 system 要求繁體中文', csys.includes('繁體中文'))
  ok('造句 system 要求開頭評價記號', csys.includes('✅') && csys.includes('△') && csys.includes('❌'))
  ok('造句 system 禁止杜撰重音', csys.includes('不要杜撰重音'))
  ok('造句 system 允許自由挑詞', csys.includes('自由挑詞'))
  ok('無已學詞時有 fallback 說明', buildComposeSystem([]).includes('尚無'))

  const cuser = buildComposeUser(kudasai, '  コーヒーを ください  ', ['みずを ください（請給我水）'], c1)
  ok('造句 user 帶入句型與中文', cuser.includes('〜を ください') && cuser.includes('請給我〜'))
  ok('造句 user 帶入教材例句', cuser.includes('みずを ください（請給我水）'))
  ok('造句 user 帶入作答（已 trim）', cuser.includes('學習者自己造的句子：コーヒーを ください\n'))
  ok('造句 user 帶入程式檢核結果', cuser.includes('程式檢核：') && cuser.includes('「みず」'))
  ok('無例句時不產生空的例句行', !buildComposeUser(kudasai, 'みずをください').includes('教材例句：'))
  ok('例句取前 3 句', buildComposeUser(kudasai, 'x', ['a', 'b', 'c', 'd']).includes('a ／ b ／ c'))
  ok('例句不超過 3 句', !buildComposeUser(kudasai, 'x', ['a', 'b', 'c', 'd']).includes('d'))

  // 講評沿用 tutorQuiz 的記號解析
  ok('造句講評可被 parseCritique 解析', parseCritique('✅ 句型用對了。').verdict === 'ok')
  ok('沒照格式也照樣顯示正文', parseCritique('句型用對了。').body === '句型用對了。')
}

console.log('=== 6. 資料完整性 ===')
{
  ok('假名 142 枚', KANA.length === 142)
  const kanaIds = KANA.map((k) => k.id)
  ok('假名 id 唯一', new Set(kanaIds).size === 142)
  ok('KANA_BY_ID 對得上', KANA_BY_ID['h0'].ch === 'あ')
  ok('詞彙 jp 唯一', new Set(VOCAB.map((v) => v.jp)).size === VOCAB.length)
  ok('詞彙皆有中文與分類', VOCAB.every((v) => v.zh && v.cat && v.level))
  ok('詞庫已擴充 ≥ 320', VOCAB.length >= 320)
  ok('含新分類 自然／交通', VOCAB.some((v) => v.cat === '自然') && VOCAB.some((v) => v.cat === '交通'))
  ok('含新增食物 ジュース／おにぎり', VOCAB.some((v) => v.jp === 'ジュース') && VOCAB.some((v) => v.jp === 'おにぎり'))
  ok('有漢字的詞其 kanji 皆含漢字', VOCAB.every((v) => !v.kanji || hasKanji(v.kanji)))
}

console.log(`\n=== 結果：${pass} passed, ${fail} failed ===`)
if (fail > 0) {
  console.log('失敗項：' + fails.join('; '))
  process.exit(1)
}
