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
  openingEntries,
  normalizeCustom,
  buildCustomScene,
  CUSTOM_SCENE_ID,
  CUSTOM_SCENE_SAMPLES,
  MAX_CUSTOM_PARTNER,
  MAX_CUSTOM_SCENE,
  MAX_TURNS,
  type RoleplayEntry,
} from '../src/lib/roleplay.ts'
import {
  sceneKey,
  parseRecent,
  serializeRecent,
  addRecent,
  removeRecent,
  MAX_RECENT_SCENES,
  type RecentScene,
} from '../src/lib/recentScenes.ts'
import { generateQuiz, seededRng, MIN_POOL } from '../src/lib/quiz.ts'
import { karaokeChars, activeCharIndices } from '../src/lib/karaoke.ts'
import { listeningQuestions, pickParagraphs, spreadByGroup, responseQuestions, expressionQuestions, LISTEN_MIN_POOL, type ListenItem } from '../src/lib/listening.ts'
import { PASSAGES, PASSAGE_CATS } from '../src/data/passages.ts'
import { RESPONSES, EXPRESSIONS } from '../src/data/kaiwa.ts'
import { alignFurigana, hasKanji, stripIgnored } from '../src/lib/furigana.ts'
import { DIALOGUES } from '../src/data/dialogues.ts'
import { SENTS } from '../src/data/sentences.ts'
import { scoreHandwriting, dilate, gradeOf } from '../src/lib/handwriting.ts'
import {
  scoreBand,
  clampScore,
  easeOutCubic,
  countUpValue,
  ringDashOffset,
  WRITE_BANDS,
  SPEAK_BANDS,
  NO_SCORE_BAND,
  RING_RADIUS,
  RING_CIRCUMFERENCE,
} from '../src/lib/scoreReveal.ts'
import {
  totalsByDay,
  totalsByFeature,
  featuresOnDay,
  activeDayCount,
  heatLevel,
  calendarCells,
  featureGroup,
  hasExtraFeature,
  extraDays,
  groupTotals,
  CORE_FEATURES,
  EXTRA_FEATURES,
  AI_FEATURES,
  FEATURE_LABEL,
} from '../src/lib/activity.ts'
import { PATTERNS } from '../src/data/patterns.ts'
import { poolFor, candidatesFor, buildItem, itemsFor, dailyPattern } from '../src/lib/patternDrill.ts'
import {
  buildRound,
  roundSummary,
  missedItems,
  roundNote,
  ROUND_SIZE,
} from '../src/lib/patternRound.ts'
import { KANJI_STROKES, KANJI_STROKE_VIEWBOX } from '../src/data/kanjiStrokes.ts'
import { strokeStart, refStrokeStarts, judgeStrokeOrder, pathEnd, strokeVector } from '../src/lib/strokeOrder.ts'
import { sentencePrompts, patternPrompts, kaiwaPrompts, tutorPrompts, filterPrompts, pickPrompt, buildQuizSystem, buildQuizUser, parseCritique, VERDICT_LABEL, SOURCE_TABS } from '../src/lib/tutorQuiz.ts'
import {
  normJa,
  lookupVocab,
  checkShape,
  shapeSummary,
  buildComposeSystem,
  buildComposeUser,
} from '../src/lib/patternCompose.ts'
import {
  cleanSpoken,
  pickBestAlternative,
  mergeSpoken,
  voiceErrorMessage,
} from '../src/lib/voiceInput.ts'
import {
  chartRows,
  columnsFor,
  charsInOrder,
  cellsOf,
  charOf,
  yoonRomaji,
  yoonRowKey,
  HALF,
} from '../src/lib/kanaChart.ts'
import {
  yoonPool,
  yoonBase,
  yoonSmall,
  distractorTiers,
  buildYoonQuestion,
  buildYoonQuiz,
  YOON_QUIZ_LEN,
  YOON_OPTIONS,
} from '../src/lib/yoonDrill.ts'
import {
  buildAskSystem,
  buildAskUser,
  buildDialogueAskUser,
  sentenceTopic,
  dialogueTopic,
  parseFollowUpQuestion,
  buildReplySystem,
  buildReplyUser,
  buildAnswerUser,
  followUpHistory,
  FOLLOWUP_SKIPPED,
  MAX_FOLLOWUPS,
} from '../src/lib/followUp.ts'
import {
  toHiragana,
  normalizeQuery,
  matchVocab,
  filterVocab,
  groupByCat,
  catSummaries,
  bookStats,
  vocabMark,
  VOCAB_CATS,
  MARK_LABEL,
} from '../src/lib/vocabBook.ts'

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

  // v3.44：段落聽解題庫擴充——每一篇短文都進得了段落聽解池，且都有細節題
  ok('每篇短文都有大意題', PASSAGES.every((p) => !!p.quiz))
  ok('每篇短文都有細節題', PASSAGES.every((p) => (p.detailQuiz?.length ?? 0) >= 1))
  ok('大意題正解不重複出現在選項中', PASSAGES.every((p) => p.quiz!.options.filter((o) => o === p.quiz!.answer).length === 1))
  ok(
    '細節題選項互異',
    withDetail.every((p) => p.detailQuiz!.every((dq) => new Set(dq.options).size === dq.options.length)),
  )
  ok('細節題題目皆非空且以問號結尾', withDetail.every((p) => p.detailQuiz!.every((dq) => dq.q.trim().length > 0 && dq.q.endsWith('？'))))
  ok(
    '同一篇短文的細節題不重複問同一題',
    withDetail.every((p) => new Set(p.detailQuiz!.map((dq) => dq.q)).size === p.detailQuiz!.length),
  )
  const totalParaQ = PASSAGES.reduce((s, p) => s + (p.quiz ? 1 : 0) + (p.detailQuiz?.length ?? 0), 0)
  ok('段落聽解題庫 ≥ 35 題（一輪 3 題，夠久不重複）', totalParaQ >= 35)
}

console.log('=== 5h2. 段落聽解選材：同一輪不重複同一篇短文 ===')
{
  // 同一篇短文可有大意題＋多題細節題；一輪三題若都抽到同一篇，等於連聽三次同一段音檔。
  type G = { id: string; options: string[] }
  const g = (id: string): G => ({ id, options: ['a', 'b', 'c', 'd'] })
  const groupOf = (it: G) => it.id.split(':')[0]

  const spread = spreadByGroup([g('p1'), g('p1:d0'), g('p1:d1'), g('p2'), g('p3')], groupOf)
  ok('攤開後不遺漏也不重複', spread.length === 5 && new Set(spread.map((x) => x.id)).size === 5)
  ok('攤開後前 3 個來自 3 篇不同短文', new Set(spread.slice(0, 3).map(groupOf)).size === 3)
  ok('組內順序維持原樣', spread.filter((x) => groupOf(x) === 'p1').map((x) => x.id).join() === 'p1,p1:d0,p1:d1')
  ok('組的先後沿用首次出現順序', spread.slice(0, 3).map(groupOf).join() === 'p1,p2,p3')
  ok('空陣列不當機', spreadByGroup([] as G[], groupOf).length === 0)
  ok('全部同組時＝原順序', spreadByGroup([g('p1'), g('p1:d0')], groupOf).map((x) => x.id).join() === 'p1,p1:d0')

  // 只有兩篇短文卻要三題 → 必然有一篇出兩次，但不能因此漏題或當機
  const only2 = spreadByGroup([g('p1'), g('p1:d0'), g('p1:d1'), g('p2')], groupOf)
  ok('組數不足時仍回傳全部項目', only2.length === 4 && new Set(only2.map((x) => x.id)).size === 4)
  ok('組數不足時先攤完不同組才回頭', only2.slice(0, 2).map(groupOf).join() === 'p1,p2')

  // 接上 pickParagraphs：給 groupOf 時三題必來自三篇不同短文
  const pool = [g('p1'), g('p1:d0'), g('p1:d1'), g('p1:d2'), g('p2'), g('p2:d0'), g('p3')]
  let allDistinct = true
  for (let seed = 1; seed <= 30; seed++) {
    const picked = pickParagraphs(pool, 3, seededRng(seed), groupOf)
    if (picked.length !== 3 || new Set(picked.map(groupOf)).size !== 3) allDistinct = false
  }
  ok('pickParagraphs 給 groupOf 後 30 個 seed 都取到 3 篇不同短文', allDistinct)
  ok(
    '不給 groupOf 時行為與舊版相同',
    JSON.stringify(pickParagraphs(pool, 3, seededRng(9))) ===
      JSON.stringify(pickParagraphs(pool, 3, seededRng(9), undefined)),
  )
  ok(
    '給 groupOf 仍會洗牌選項且 seed 可重現',
    JSON.stringify(pickParagraphs(pool, 3, seededRng(4), groupOf)) ===
      JSON.stringify(pickParagraphs(pool, 3, seededRng(4), groupOf)),
  )

  // 對真實題庫做同樣檢查（短文篇數 ≥ 3 才有意義）
  const realPool = PASSAGES.flatMap((p) => [
    ...(p.quiz ? [{ id: p.id, options: p.quiz.options }] : []),
    ...(p.detailQuiz ?? []).map((dq, i) => ({ id: `${p.id}:d${i}`, options: dq.options })),
  ])
  let realDistinct = true
  for (let seed = 1; seed <= 30; seed++) {
    const picked = pickParagraphs(realPool, 3, seededRng(seed), groupOf)
    if (new Set(picked.map(groupOf)).size !== 3) realDistinct = false
  }
  ok('真實題庫抽 3 題也必來自 3 篇不同短文', realDistinct)
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

console.log('=== 5x. AI 互動練習記入学習記録（分組／金印判定） ===')
{
  const core = CORE_FEATURES as readonly string[]
  const extra = EXTRA_FEATURES as readonly string[]
  const ai = AI_FEATURES as readonly string[]

  ok('核心仍是五修行', core.length === 5)
  ok('核心與選配不重疊', core.every((f) => !extra.includes(f)))
  ok('選配 key 不重複', new Set(extra).size === extra.length)
  ok('AI 互動三項＝自由対話/助教考我/追問', ai.join(',') === 'roleplay,tutor,followup')
  ok('AI 互動三項都算選配加練', ai.every((f) => extra.includes(f)))
  ok('每個 feature 都有中文標籤', [...core, ...extra].every((f) => !!FEATURE_LABEL[f]))
  ok('標籤不重複（統計條不會兩列同名）', (() => {
    const labels = [...core, ...extra].map((f) => FEATURE_LABEL[f])
    return new Set(labels).size === labels.length
  })())

  ok('featureGroup：核心', featureGroup('kana') === 'core' && featureGroup('speak') === 'core')
  ok('featureGroup：選配（含 AI 互動）', featureGroup('write') === 'extra' && featureGroup('roleplay') === 'extra' && featureGroup('tutor') === 'extra' && featureGroup('followup') === 'extra')
  ok('featureGroup：未知 feature 不誤判', featureGroup('nope') === 'other' && featureGroup('') === 'other')

  ok('hasExtraFeature：只有核心 → false', !hasExtraFeature(['kana', 'vocab', 'listen', 'speak', 'read']))
  ok('hasExtraFeature：做了自由対話 → true（金印）', hasExtraFeature(new Set(['kana', 'roleplay'])))
  ok('hasExtraFeature：做了追問 → true（金印）', hasExtraFeature(['followup']))
  ok('hasExtraFeature：未知 feature 不算加練', !hasExtraFeature(['nope']))
  ok('hasExtraFeature：空集合 → false', !hasExtraFeature([]))

  const rows = [
    { day: '2026-08-01', feature: 'kana', count: 10 },
    { day: '2026-08-01', feature: 'roleplay', count: 2 }, // 核心 + AI 互動 → 金印日
    { day: '2026-08-02', feature: 'speak', count: 3 }, // 只有核心 → 非金印日
    { day: '2026-08-03', feature: 'tutor', count: 1 },
    { day: '2026-08-04', feature: 'followup', count: 0 }, // count 0 不算練過
    { day: '2026-08-05', feature: 'nope', count: 5 }, // 未知 feature 不算加練
  ]
  const days = extraDays(rows)
  ok('extraDays：有 AI 互動的日子入列', days.has('2026-08-01') && days.has('2026-08-03'))
  ok('extraDays：只有核心的日子不入列', !days.has('2026-08-02'))
  ok('extraDays：count 0 不入列', !days.has('2026-08-04'))
  ok('extraDays：未知 feature 不入列', !days.has('2026-08-05'))

  const g = groupTotals(rows)
  ok('groupTotals：核心累計 13', g.core === 13)
  ok('groupTotals：加練累計 3', g.extra === 3)
  ok('groupTotals：AI 互動累計 3', g.ai === 3)
  ok('groupTotals：AI 互動 ⊆ 加練', g.ai <= g.extra)
  const g2 = groupTotals([
    { day: 'd', feature: 'write', count: 4 },
    { day: 'd', feature: 'roleplay', count: 1 },
  ])
  ok('groupTotals：非 AI 的加練不計入 ai', g2.extra === 5 && g2.ai === 1)
  ok('groupTotals：空輸入全 0', (() => { const z = groupTotals([]); return z.core === 0 && z.extra === 0 && z.ai === 0 })())
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

console.log('=== 5ab. 自由対話：自訂場景 ===')
{
  // 正規化：去頭尾空白、連續空白（含全形）收斂成一個、截到上限
  ok('normalizeCustom 去頭尾空白', normalizeCustom('  拉麵店店員  ', 20) === '拉麵店店員')
  ok('normalizeCustom 收斂連續空白（含全形）', normalizeCustom('拉麵店　　 店員', 20) === '拉麵店 店員')
  ok('normalizeCustom 換行也收斂', normalizeCustom('拉麵店\n店員', 20) === '拉麵店 店員')
  ok('normalizeCustom 截到上限', normalizeCustom('あ'.repeat(50), 20).length === 20)
  ok('normalizeCustom 全空白 → 空字串', normalizeCustom('  　\n ', 20) === '')
  ok('normalizeCustom 截斷剛好切在空白上不留尾巴', normalizeCustom('あいう えお', 4) === 'あいう')

  // 組場景：兩欄都要有；沒有已驗證開場白 → opening 為空（由使用者先開口）
  const cs = buildCustomScene('  拉麵店店員 ', '你進拉麵店，點一碗拉麵。')
  ok('自訂場景組得出來', !!cs)
  ok('自訂場景欄位已正規化', cs?.partner === '拉麵店店員' && cs?.scene === '你進拉麵店，點一碗拉麵。')
  ok('自訂場景 id 固定', cs?.id === CUSTOM_SCENE_ID)
  ok('自訂場景標記 custom', cs?.custom === true)
  ok('自訂場景無開場白（不由 AI 生假的教科書開場白）', cs?.opening === '' && cs?.openingZh === '')
  ok('自訂場景標題固定短字串（情境全文另外顯示）', cs?.title === '自訂場景')
  ok('自訂 id 不與內建場景衝突', !ROLEPLAY_SCENES.some((s) => s.id === CUSTOM_SCENE_ID))
  ok('sceneById 找不到自訂場景（不在內建清單裡）', sceneById(CUSTOM_SCENE_ID) === undefined)

  ok('缺對象 → null', buildCustomScene('   ', '你進拉麵店。') === null)
  ok('缺情境 → null', buildCustomScene('店員', '  　') === null)
  ok('兩欄皆空 → null', buildCustomScene('', '') === null)
  const longSc = buildCustomScene('客'.repeat(60), '情'.repeat(200))
  ok(
    '過長欄位被截到上限',
    longSc?.partner.length === MAX_CUSTOM_PARTNER && longSc?.scene.length === MAX_CUSTOM_SCENE,
  )

  // 起始氣泡：內建場景放已驗證開場白；自訂場景空陣列（你先開口）
  const builtinOpen = openingEntries(ROLEPLAY_SCENES[0])
  ok(
    '內建場景起始＝已驗證開場白一則',
    builtinOpen.length === 1 &&
      builtinOpen[0].who === 'partner' &&
      builtinOpen[0].jp === ROLEPLAY_SCENES[0].opening,
  )
  ok('全部內建場景都有起始氣泡', ROLEPLAY_SCENES.every((s) => openingEntries(s).length === 1))
  ok('自訂場景起始為空（由你先開口）', openingEntries(cs!).length === 0)
  const csHist = roleplayHistory([...openingEntries(cs!), { who: 'me', jp: 'すみません。' }])
  ok('自訂場景的歷史第一則就是 user', csHist.length === 1 && csHist[0].role === 'user')
  ok('自訂場景回合數從 0 起算', myTurnCount(openingEntries(cs!)) === 0 && !isRoleplayOver(openingEntries(cs!)))

  // system prompt：自訂場景多兩條（注入防護＋你先開口），但共用紅線一條都不能少
  const sysC = buildRoleplaySystem(cs!, ['みず'])
  ok('自訂 system 帶入自訂對象與情境', sysC.includes('拉麵店店員') && sysC.includes('你進拉麵店，點一碗拉麵。'))
  ok('自訂 system 說明由學習者先開口', sysC.includes('學習者先開口'))
  ok('自訂 system 有指示注入防護（描述裡的其他指示一律忽略）', sysC.includes('一律忽略'))
  ok('自訂 system 仍禁止杜撰重音', sysC.includes('不要杜撰重音'))
  ok('自訂 system 仍要求只輸出 JSON', sysC.includes('只輸出 JSON') && sysC.includes('"hint"'))
  ok('自訂 system 仍帶入已學詞', sysC.includes('みず'))
  const sysB = buildRoleplaySystem(ROLEPLAY_SCENES[0], ['みず'])
  ok('內建場景的 system 不含自訂條款（舊行為不變）', !sysB.includes('一律忽略') && !sysB.includes('學習者先開口'))

  // 填寫範例：純中文提示，不含任何日文假名（不宣稱任何日文說法＝零正確性風險）
  const kanaChars = /[぀-ヿ]/
  ok('範例非空且每筆兩欄齊全', CUSTOM_SCENE_SAMPLES.length >= 3 && CUSTOM_SCENE_SAMPLES.every((s) => !!s.partner && !!s.scene))
  ok(
    '範例不含日文假名（純中文提示，不宣稱任何日文說法）',
    CUSTOM_SCENE_SAMPLES.every((s) => !kanaChars.test(s.partner + s.scene)),
  )
  ok('每個範例都組得出場景', CUSTOM_SCENE_SAMPLES.every((s) => !!buildCustomScene(s.partner, s.scene)))
  ok('範例對象不重複（點選帶入時 key 唯一）', new Set(CUSTOM_SCENE_SAMPLES.map((s) => s.partner)).size === CUSTOM_SCENE_SAMPLES.length)
}

console.log('=== 5ac. 自由対話：最近用過的自訂場景（裝置本機記錄） ===')
{
  const a = { partner: '拉麵店店員', scene: '你進拉麵店，點一碗拉麵。' }
  const b = { partner: '車站站務員', scene: '你在車站問怎麼去東京。' }
  const c = { partner: '飯店櫃檯', scene: '你到飯店 check in。' }

  // 比對鍵：只差空白 → 同一筆（不會因為多打一個空白就多存一份）
  ok('sceneKey 兩欄都納入比對', sceneKey(a) !== sceneKey({ partner: a.partner, scene: b.scene }))
  ok('sceneKey 忽略頭尾空白差異', sceneKey(a) === sceneKey({ partner: ' 拉麵店店員 ', scene: a.scene + ' ' }))
  ok(
    'sceneKey 收斂連續空白（含全形）',
    sceneKey({ partner: '拉麵店　店員', scene: a.scene }) === sceneKey({ partner: '拉麵店 店員', scene: a.scene }),
  )

  // 加入：最新在最前、重複移到最前、超過上限丟最舊
  const l1 = addRecent([], a)
  ok('加入第一筆', l1.length === 1 && l1[0].partner === a.partner)
  const l2 = addRecent(l1, b)
  ok('新的一筆排在最前', l2.length === 2 && l2[0].partner === b.partner && l2[1].partner === a.partner)
  const l3 = addRecent(l2, { partner: ' 拉麵店店員 ', scene: a.scene })
  ok('重複的場景移到最前、不重複佔位', l3.length === 2 && l3[0].partner === a.partner)
  ok('加入時欄位已正規化', addRecent([], { partner: '  店員  ', scene: ' 你點餐。 ' })[0].partner === '店員')
  ok('空欄位不記錄（清單原封不動）', addRecent(l2, { partner: '  ', scene: '你點餐。' }) === l2)
  const many = ['一', '二', '三', '四', '五', '六', '七'].reduce(
    (acc, n) => addRecent(acc, { partner: `對象${n}`, scene: `情境${n}` }),
    [] as RecentScene[],
  )
  ok('超過上限只留最近的幾筆', many.length === MAX_RECENT_SCENES && many[0].partner === '對象七')
  ok('被擠掉的是最舊的一筆', !many.some((r) => r.partner === '對象一'))

  // 刪除
  ok('刪除指定的一筆', removeRecent(l2, a).length === 1 && removeRecent(l2, a)[0].partner === b.partner)
  ok('刪除時忽略空白差異', removeRecent(l2, { partner: ' 拉麵店店員 ', scene: a.scene }).length === 1)
  ok('刪除不存在的一筆 → 清單不變', removeRecent(l2, c).length === 2)

  // 序列化 ↔ 解析（存進 localStorage 再讀回來要一模一樣）
  const round = parseRecent(serializeRecent(l2))
  ok(
    '序列化再解析＝原清單（順序與欄位皆保留）',
    round.length === 2 && round[0].partner === b.partner && round[1].scene === a.scene,
  )
  ok('只存兩個欄位（不夾帶其他東西）', JSON.parse(serializeRecent(l1)).every((o: object) => Object.keys(o).sort().join(',') === 'partner,scene'))

  // 解析容錯：存在裝置上的東西可能被改壞／被舊版寫成別的格式
  ok('沒有記錄 → 空清單', parseRecent(null).length === 0 && parseRecent('').length === 0)
  ok('壞掉的 JSON → 空清單', parseRecent('{{{').length === 0)
  ok('不是陣列 → 空清單', parseRecent('{"partner":"店員"}').length === 0 && parseRecent('"x"').length === 0)
  ok('欄位缺漏／型別不對的項目被過濾', parseRecent('[{"partner":"店員"},{"scene":"你點餐。"},{"partner":1,"scene":2},null,"x"]').length === 0)
  ok('空白欄位的項目被過濾', parseRecent('[{"partner":"  ","scene":"你點餐。"}]').length === 0)
  ok(
    '解析時去重（只差空白視為同一筆）',
    parseRecent(JSON.stringify([a, { partner: ' 拉麵店店員 ', scene: a.scene }])).length === 1,
  )
  ok(
    '解析時截到上限',
    parseRecent(JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ partner: `對象${i}`, scene: `情境${i}` })))).length ===
      MAX_RECENT_SCENES,
  )
  ok(
    '解析時截掉過長欄位（沿用自訂場景的長度上限）',
    parseRecent(JSON.stringify([{ partner: '客'.repeat(60), scene: '情'.repeat(200) }]))[0].partner.length === MAX_CUSTOM_PARTNER,
  )

  // 與自訂場景一致：記下來的每一筆都必須還原得出一個可用的場景
  ok(
    '記錄可還原成自訂場景（欄位一字不差）',
    many.every((r) => {
      const sc = buildCustomScene(r.partner, r.scene)
      return !!sc && sc.partner === r.partner && sc.scene === r.scene && sc.custom === true
    }),
  )
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

  // 固定表現題（v3.37）：発話表現＋即時応答，全部逐字取自已驗證的 data/kaiwa
  const kp = kaiwaPrompts()
  ok('固定表現題非空', kp.length >= 20)
  ok(
    '情境表達題逐字取自 EXPRESSIONS',
    EXPRESSIONS.every((e) => {
      const p = kp.find((x) => x.id === `kaiwa:${e.id}`)
      return !!p && p.zh === e.situationZh && p.answer === e.answer && p.tag === '情境表達'
    }),
  )
  ok('情境表達題全部收錄', kp.filter((p) => p.tag === '情境表達').length === EXPRESSIONS.length)
  ok(
    '即時應答題的題目帶入已驗證的日文原句與中文對照，答案逐字相符',
    RESPONSES.filter((r) => !r.openEnded).every((r) => {
      const p = kp.find((x) => x.id === `kaiwa:${r.id}`)
      return !!p && p.zh.includes(r.prompt) && p.zh.includes(r.promptZh) && p.answer === r.answer && p.tag === '即時應答'
    }),
  )
  ok(
    '答案依個人情況而異的即時応答（名字/時間/價格/出身）不進考我題庫',
    RESPONSES.some((r) => r.openEnded) &&
      RESPONSES.filter((r) => r.openEnded).every((r) => !kp.some((p) => p.id === `kaiwa:${r.id}`)),
  )
  ok('固定表現題皆為純假名答案、無漢字正寫', kp.every((p) => p.alt === undefined))
  ok('固定表現題 source 皆為 kaiwa', kp.every((p) => p.source === 'kaiwa'))

  const pool = tutorPrompts(learned)
  ok('題庫＝例句題＋句型題＋固定表現題', pool.length === sp.length + pp.length + kp.length)

  // 題源篩選（UI 分頁）
  ok('SOURCE_TABS 含全部與三個題源', SOURCE_TABS.length === 4 && SOURCE_TABS[0].key === 'all')
  ok('SOURCE_TABS 的 key 唯一且皆有中文標籤', new Set(SOURCE_TABS.map((t) => t.key)).size === 4 && SOURCE_TABS.every((t) => t.label.trim()))
  ok('all 回原池（行為不變）', filterPrompts(pool, 'all').length === pool.length)
  ok('三個題源都篩得出題目', SOURCE_TABS.slice(1).every((t) => filterPrompts(pool, t.key).length > 0))
  ok('三個題源加總＝全部（無漏無重）', SOURCE_TABS.slice(1).reduce((n, t) => n + filterPrompts(pool, t.key).length, 0) === pool.length)
  ok('篩出的題目 source 一致', filterPrompts(pool, 'kaiwa').every((p) => p.source === 'kaiwa'))

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
  const kUser = buildQuizUser(kp[0], 'いただきます')
  ok('固定表現題另註明「說法基本上只有一種」', kUser.includes('固定表現') && kUser.includes('不必鼓勵他另創說法'))
  ok('例句／句型題不加固定表現註記', !buildQuizUser(sp[0], 'テスト').includes('不必鼓勵他另創說法'))

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

console.log('=== 5z. 会話走完一段後的追問（對話題材） ===')
{
  const dlg = DIALOGUES[0]

  // 對話題材的 user 訊息：整段已驗證腳本（場景、對象、每一句 jp＋zh）都要帶進去
  const duser = buildDialogueAskUser(dlg)
  ok('對話 user 帶入標題與場景', duser.includes(dlg.title) && duser.includes(dlg.scene))
  ok('對話 user 帶入對象稱呼', duser.includes(dlg.partner))
  ok('對話 user 帶入每一句日文', dlg.lines.every((l) => duser.includes(l.jp)))
  ok('對話 user 帶入每一句中文', dlg.lines.every((l) => duser.includes(l.zh)))
  ok(
    '對話 user 標示誰說的（對方／學習者）',
    duser.includes(`${dlg.partner}：${dlg.lines[0].jp}`) &&
      duser.includes(`學習者：${dlg.lines.find((l) => l.role === 'b')!.jp}`),
  )
  ok('對話 user 要求扮演對方接著問', duser.includes('扮演對方') && duser.includes('追問一句'))
  ok(
    '全部 DIALOGUES 都組得出非空 prompt 且含自己的腳本',
    DIALOGUES.every((d) => {
      const u = buildDialogueAskUser(d)
      return u.length > 0 && d.lines.every((l) => u.includes(l.jp))
    }),
  )

  // system prompt：兩種題材共用紅線，只有「情境從哪來」的描述不同
  const dsys = buildAskSystem(['みず'], 'dialogue')
  const ssys = buildAskSystem(['みず'], 'sentence')
  ok('對話 system 說明是對話後的延伸練習', dsys.includes('情境對話後的延伸練習'))
  ok('對話 system 要求扮演同一個對象', dsys.includes('扮演對話中的那個對象'))
  ok('對話 system 要求延續同一場景', dsys.includes('延續那段對話的場景'))
  ok(
    '對話 system 守住共用紅線',
    dsys.includes('只問「一句」') &&
      dsys.includes('不要換話題') &&
      dsys.includes('不要杜撰重音') &&
      dsys.includes('只輸出 JSON'),
  )
  ok('對話 system 帶入已學詞', dsys.includes('みず'))
  ok('兩種題材的 system 不同', dsys !== ssys)
  ok('預設（不給 kind）＝例句版，行為不變', buildAskSystem(['みず']) === ssys)

  // topic 包裝：id 供換題材時重置，兩種題材的 id 不會互撞
  const st = sentenceTopic({ id: 's1', jp: 'みずを ください。', zh: '請給我水。' })
  const dt = dialogueTopic(dlg)
  ok('例句 topic kind 為 sentence', st.kind === 'sentence')
  ok('對話 topic kind 為 dialogue', dt.kind === 'dialogue')
  ok('例句 topic 的 askUser ＝ buildAskUser', st.askUser === buildAskUser({ jp: 'みずを ください。', zh: '請給我水。' }))
  ok('對話 topic 的 askUser ＝ buildDialogueAskUser', dt.askUser === duser)
  ok('topic id 帶題材前綴，不同題材不互撞', st.id === 'sent:s1' && dt.id === `dlg:${dlg.id}`)
  ok(
    '每段對話的 topic id 唯一',
    new Set(DIALOGUES.map((d) => dialogueTopic(d).id)).size === DIALOGUES.length,
  )
  ok(
    '同一段對話重複組出的 topic 一致（不會誤觸重置）',
    dialogueTopic(dlg).id === dt.id && dialogueTopic(dlg).askUser === dt.askUser,
  )
}

console.log('=== 5aa. 追問接續多輪（history 組裝） ===')
{
  const topic = sentenceTopic({ id: 's1', jp: 'みずを ください。', zh: '請給我水。' })
  const q1 = { jp: 'なにが すきですか。', zh: '你喜歡什麼？' }
  const q2 = { jp: 'どこで かいますか。', zh: '在哪裡買？' }

  // 第一輪：只有題材本身 → 與多輪化之前的行為完全相同
  const h0 = followUpHistory(topic.askUser, [])
  ok('沒有前輪時只有一則訊息', h0.length === 1)
  ok('第一則＝題材（已驗證素材組成的 user 訊息）', h0[0].role === 'user' && h0[0].text === topic.askUser)

  // 一輪已問答：user（題材）→ model（追問句 JSON）→ user（回答）
  const h1 = followUpHistory(topic.askUser, [{ q: q1, answer: 'みずが すきです。' }])
  ok('一輪問答後共三則', h1.length === 3)
  ok('AI 回合以 model 角色回填', h1[1].role === 'model')
  ok(
    'model 回合是與輸出格式一致的 JSON（可被 parseFollowUpQuestion 還原）',
    parseFollowUpQuestion(h1[1].text)?.jp === q1.jp,
  )
  ok('最後一則帶入學習者的回答', h1[2].role === 'user' && h1[2].text.includes('みずが すきです。'))
  ok('最後一則要求接著回答繼續問', h1[2].text.includes('不要重複問過的問題'))

  // 兩輪：角色嚴格交替，且以 user 開頭、user 結尾（Gemini contents 要求）
  const h2 = followUpHistory(topic.askUser, [
    { q: q1, answer: 'みずが すきです。' },
    { q: q2, answer: 'コンビニで かいます。' },
  ])
  ok('兩輪問答後共五則', h2.length === 5)
  ok(
    '角色嚴格交替 user/model/user/model/user',
    h2.every((m, i) => m.role === (i % 2 === 0 ? 'user' : 'model')),
  )
  ok('每一輪的追問句都在歷史裡', h2[1].text.includes(q1.jp) && h2[3].text.includes(q2.jp))
  ok('每一輪的回答都在歷史裡', h2[2].text.includes('みずが すきです。') && h2[4].text.includes('コンビニで かいます。'))
  ok('沒有空白訊息', h2.every((m) => m.text.trim().length > 0))

  // 沒回答就再按追問：以固定的「跳過」訊息維持交替，不會謊稱他回答了什麼
  const hs = followUpHistory(topic.askUser, [{ q: q1, answer: '   ' }])
  ok('未回答的輪次用跳過訊息', hs[2].text === FOLLOWUP_SKIPPED)
  ok('跳過訊息不含「學習者的回答」', !hs[2].text.includes('學習者的回答'))
  ok('跳過訊息仍要求同一情境再問', FOLLOWUP_SKIPPED.includes('同一個情境'))

  // 回答的前後空白會被 trim（與 buildReplyUser 一致）
  ok('buildAnswerUser trim 回答', buildAnswerUser('  はい。 ').includes('學習者的回答：はい。\n'))
  ok(
    'history 內的回答也已 trim',
    followUpHistory(topic.askUser, [{ q: q1, answer: '  はい。 ' }])[2].text.includes(
      '學習者的回答：はい。\n',
    ),
  )

  // 兩種題材都適用（對話題材的第一則同樣是整段已驗證腳本）
  const dtopic = dialogueTopic(DIALOGUES[0])
  const hd = followUpHistory(dtopic.askUser, [{ q: q1, answer: 'はい。' }])
  ok('對話題材第一則＝整段腳本', hd[0].text === dtopic.askUser)
  ok(
    '全部 DIALOGUES 的 history 首則都是自己的腳本',
    DIALOGUES.every((d) => followUpHistory(dialogueTopic(d).askUser, [])[0].text === dialogueTopic(d).askUser),
  )

  // system prompt：新增「接著問」規則，且兩種題材共用的紅線一條都沒少
  const sysS = buildAskSystem(['みず'], 'sentence')
  const sysD = buildAskSystem(['みず'], 'dialogue')
  ok('system 要求接著回答繼續問', sysS.includes('接著學習者剛剛的回答繼續問下去'))
  ok('system 禁止重複問過的問題', sysS.includes('不要重複問過的問題'))
  ok('對話題材同樣有接著問的規則', sysD.includes('接著學習者剛剛的回答繼續問下去'))
  ok(
    '共用紅線仍齊全（一句／不換話題／不杜撰重音／只輸出 JSON）',
    [sysS, sysD].every(
      (s) =>
        s.includes('只問「一句」') &&
        s.includes('不要換話題') &&
        s.includes('不要杜撰重音') &&
        s.includes('只輸出 JSON'),
    ),
  )
  ok('輪數上限仍是同一個常數', Number.isInteger(MAX_FOLLOWUPS) && MAX_FOLLOWUPS > 1)
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

console.log('=== 5w. 語音輸入（口說回話）純邏輯 ===')
{
  // 正規化：全形空白也算空白、連續空白收成一個、去頭尾
  ok('去頭尾空白', cleanSpoken('  こんにちは  ') === 'こんにちは')
  ok('全形空白收成半形一個', cleanSpoken('おにぎりを　　ください') === 'おにぎりを ください')
  ok('換行也視為空白', cleanSpoken('みずを\nください') === 'みずを ください')
  ok('空字串安全', cleanSpoken('') === '' && cleanSpoken('   ') === '')

  // 候選挑選：取第一個非空（引擎已依信心排序；自由對話無目標句可比對）
  ok('取第一個候選', pickBestAlternative(['これを ください', 'これを 下さい']) === 'これを ください')
  ok('跳過空候選', pickBestAlternative(['', '  ', 'はい']) === 'はい')
  ok('候選皆空回空字串', pickBestAlternative(['', '   ']) === '')
  ok('無候選回空字串', pickBestAlternative([]) === '')

  // 併入輸入框：可以「先打一半、再用說的補」，也可以連說兩次
  ok('輸入框空 → 就是辨識結果', mergeSpoken('', 'こんにちは') === 'こんにちは')
  ok('接在既有內容後面', mergeSpoken('すみません', 'みずを ください') === 'すみません みずを ください')
  ok('既有內容也會正規化', mergeSpoken('  すみません 　', 'はい') === 'すみません はい')
  ok('沒聽到內容時不動原輸入', mergeSpoken('すみません', '   ') === 'すみません')
  ok('雙方皆空回空字串', mergeSpoken('', '') === '')

  // 錯誤訊息：一律附「可以改用打字」的退路，且不外露原始英文錯誤碼
  ok('無 ASR 有中文提示', voiceErrorMessage('no-asr').includes('不支援語音輸入'))
  ok('無權限提示允許麥克風', voiceErrorMessage('not-allowed').includes('麥克風權限'))
  ok('原生無權限共用同一則', voiceErrorMessage('no-permission') === voiceErrorMessage('not-allowed'))
  ok('沒聽到聲音提示再按一次', voiceErrorMessage('no-speech').includes('再按一次'))
  ok('沒聽清楚提示再說一次', voiceErrorMessage('no-match').includes('再說一次'))
  ok('連線失敗有提示', voiceErrorMessage('network').includes('連線失敗'))
  ok('取消不報成錯誤', voiceErrorMessage('aborted').includes('取消'))
  ok('未知錯誤帶出原碼', voiceErrorMessage('weird-code').includes('weird-code'))
  ok('空錯誤碼不留空括號', voiceErrorMessage('').includes('unknown'))
  const codes = ['no-asr', 'not-allowed', 'audio-capture', 'no-speech', 'no-match', 'network', 'x']
  ok(
    '除了取消，其餘皆提供打字退路',
    codes.every((c) => voiceErrorMessage(c).includes('打字')),
  )
}

console.log('=== 5y. 五十音圖（表格結構與拗音推導） ===')
{
  // 前提：KANA 前半平假名、後半片假名，同索引＝同一個音（整張圖靠這個配對取字）
  ok('平片假名等量', HALF === 71 && KANA.length === HALF * 2)
  ok(
    '同索引＝同音（羅馬字逐枚相符）',
    KANA.slice(0, HALF).every((h, i) => h.ro === KANA[i + HALF].ro),
  )
  ok(
    '同索引前半平假名／後半片假名',
    KANA.slice(0, HALF).every((h, i) => h.script === 'hiragana' && KANA[i + HALF].script === 'katakana'),
  )

  // 欄標
  ok('清音/濁音五欄、拗音三欄', columnsFor('seion').length === 5 && columnsFor('dakuon').length === 5 && columnsFor('yoon').join() === 'YA,YU,YO')

  // 清音：46 音、や/わ行有空格、ん 單獨一列
  const seion = chartRows('seion')
  const seionCells = cellsOf('seion')
  ok('清音 46 音', seionCells.length === 46)
  ok('清音列標依序', seion.map((r) => r.key).join() === '_,K,S,T,N,H,M,Y,R,W,n')
  ok('あ行第一格＝あ/ア/a', (() => { const c = seion[0].cells[0]!; return c.h === 'あ' && c.k === 'ア' && c.ro === 'a' })())
  ok('や行只有 3 格（い段/え段留空）', seion[7].cells.filter(Boolean).length === 3 && seion[7].cells[1] === null && seion[7].cells[3] === null)
  ok('わ行只有 わ／を', (() => { const r = seion[9].cells; return r.filter(Boolean).length === 2 && r[0]!.ro === 'wa' && r[4]!.ro === 'wo' })())
  ok('ん 自成一列', (() => { const r = seion[10]; return r.key === 'n' && r.cells.filter(Boolean).length === 1 && r.cells[0]!.h === 'ん' && r.cells[0]!.k === 'ン' })())
  ok('清音不含濁點', seionCells.every((c) => !'がざだばぱ'.includes(c.h)))

  // 濁音／半濁音：25 音
  const dakuon = chartRows('dakuon')
  ok('濁音 25 音', cellsOf('dakuon').length === 25)
  ok('濁音列標依序', dakuon.map((r) => r.key).join() === 'G,Z,D,B,P')
  ok('が/ガ/ga 在第一格', (() => { const c = dakuon[0].cells[0]!; return c.h === 'が' && c.k === 'ガ' && c.ro === 'ga' })())
  ok('半濁音 ぱ 行在最後', dakuon[4].cells[0]!.h === 'ぱ' && dakuon[4].cells[0]!.ro === 'pa')

  // 拗音：由規則推導，不手打
  ok('拗音羅馬字規則：ki→kya/kyu/kyo', yoonRomaji('ki', 'a') === 'kya' && yoonRomaji('ki', 'u') === 'kyu' && yoonRomaji('ki', 'o') === 'kyo')
  ok('拗音羅馬字規則：shi→sha/shu/sho', yoonRomaji('shi', 'a') === 'sha' && yoonRomaji('shi', 'u') === 'shu' && yoonRomaji('shi', 'o') === 'sho')
  ok('拗音羅馬字規則：chi→cha/chu/cho', yoonRomaji('chi', 'a') === 'cha' && yoonRomaji('chi', 'o') === 'cho')
  ok('拗音羅馬字規則：ji→ja/ju/jo', yoonRomaji('ji', 'a') === 'ja' && yoonRomaji('ji', 'u') === 'ju' && yoonRomaji('ji', 'o') === 'jo')
  ok('拗音羅馬字規則：ni→nya、hi→hya、ri→rya', yoonRomaji('ni', 'a') === 'nya' && yoonRomaji('hi', 'a') === 'hya' && yoonRomaji('ri', 'a') === 'rya')
  ok('拗音列標由規則推導', yoonRowKey('ki') === 'KY' && yoonRowKey('shi') === 'SH' && yoonRowKey('chi') === 'CH' && yoonRowKey('ji') === 'J')

  const yoon = chartRows('yoon')
  const yoonCells = cellsOf('yoon')
  ok('拗音 11 列 × 3 ＝ 33 音', yoon.length === 11 && yoonCells.length === 33)
  ok('拗音列標依序', yoon.map((r) => r.key).join() === 'KY,SH,CH,NY,HY,MY,RY,GY,J,BY,PY')
  ok('拗音每格＝い段假名＋小假名', yoonCells.every((c) => c.h.length === 2 && c.k.length === 2 && 'ゃゅょ'.includes(c.h[1]) && 'ャュョ'.includes(c.k[1])))
  ok(
    '拗音基底取自已驗證假名（い段）',
    yoonCells.every((c) => KANA.some((k) => k.script === 'hiragana' && k.ch === c.h[0] && k.ro.endsWith('i'))),
  )
  ok('きゃ/しゅ/ちょ/じゃ 逐格正確', (() => {
    const m = Object.fromEntries(yoonCells.map((c) => [c.h, c.ro]))
    return m['きゃ'] === 'kya' && m['しゅ'] === 'shu' && m['ちょ'] === 'cho' && m['じゃ'] === 'ja'
  })())
  ok('拗音片假名同步（キャ/シュ/チョ/ジャ）', (() => {
    const m = Object.fromEntries(yoonCells.map((c) => [c.h, c.k]))
    return m['きゃ'] === 'キャ' && m['しゅ'] === 'シュ' && m['ちょ'] === 'チョ' && m['じゃ'] === 'ジャ'
  })())
  ok('拗音不含 ぢ 行（慣例不入圖）', yoonCells.every((c) => c.h[0] !== 'ぢ'))
  ok('拗音無 SRS 卡片 id（不進卡組）', yoonCells.every((c) => c.id === null))
  ok('清音／濁音每格都對得回卡片 id', [...cellsOf('seion'), ...cellsOf('dakuon')].every((c) => !!c.id && !!KANA_BY_ID[c.id]))

  // 播放順序：依表格由左到右、由上到下，且與顯示的字一致
  ok('播放全部＝表格順序（清音平假名）', (() => {
    const list = charsInOrder('seion', 'hiragana')
    return list.length === 46 && list[0] === 'あ' && list[5] === 'か' && list[45] === 'ん'
  })())
  ok('播放全部：片假名版逐字對應平假名版', (() => {
    const h = charsInOrder('dakuon', 'hiragana')
    const k = charsInOrder('dakuon', 'katakana')
    return h.length === k.length && h.length === 25 && k[0] === 'ガ'
  })())
  ok('charOf 依書寫系統取字', (() => {
    const c = cellsOf('seion')[0]
    return charOf(c, 'hiragana') === 'あ' && charOf(c, 'katakana') === 'ア'
  })())
  ok('三組字皆不重複', (['seion', 'dakuon', 'yoon'] as const).every((s) => {
    const l = charsInOrder(s, 'hiragana')
    return new Set(l).size === l.length
  }))
  ok(
    '清音＋濁音＝KANA 的一半（142 枚卡組未被更動）',
    cellsOf('seion').length + cellsOf('dakuon').length === HALF && KANA.length === 142,
  )
}

console.log('=== 5ad. 分數揭曉（數字滾動／環形進度／等第徽章，純呈現） ===')
{
  const scores = Array.from({ length: 101 }, (_, i) => i)

  // --- 等第：門檻與兩處原本寫死的判斷一致 ---
  ok(
    '書寫等第記號＝handwriting gradeOf（0-100 逐分核對）',
    scores.every((s) => scoreBand(s, WRITE_BANDS).mark === gradeOf(s)),
  )
  ok(
    '書寫門檻 80／60 邊界',
    scoreBand(80, WRITE_BANDS).key === 'great' &&
      scoreBand(79, WRITE_BANDS).key === 'good' &&
      scoreBand(60, WRITE_BANDS).key === 'good' &&
      scoreBand(59, WRITE_BANDS).key === 'work',
  )
  ok(
    '跟讀門檻 80／55 邊界（沿用 SpeakView 原本判斷）',
    scoreBand(80, SPEAK_BANDS).mark === '◎' &&
      scoreBand(79, SPEAK_BANDS).mark === '○' &&
      scoreBand(55, SPEAK_BANDS).mark === '○' &&
      scoreBand(54, SPEAK_BANDS).mark === '△',
  )
  ok(
    '自評三顆鈕（90／65／40）落在 ◎○△',
    scoreBand(90, SPEAK_BANDS).mark === '◎' &&
      scoreBand(65, SPEAK_BANDS).mark === '○' &&
      scoreBand(40, SPEAK_BANDS).mark === '△',
  )
  ok(
    '每個等第都有顏色／標籤／一句話講評',
    scores.every((s) =>
      [WRITE_BANDS, SPEAK_BANDS].every((p) => {
        const b = scoreBand(s, p)
        return !!b.color && !!b.label && !!b.hint
      }),
    ),
  )
  ok(
    '等第標籤三段互異（優秀／良好／再加油）',
    new Set([0, 70, 95].map((s) => scoreBand(s, WRITE_BANDS).label)).size === 3,
  )
  ok(
    '書寫講評文字沿用原本三句',
    scoreBand(95, WRITE_BANDS).hint === '漂亮！' &&
      scoreBand(70, WRITE_BANDS).hint === '不錯，再工整一點' &&
      scoreBand(10, WRITE_BANDS).hint === '再多描幾次',
  )
  ok(
    '不合法／未評分分數 → 未評分等第（—）',
    [NaN, -1, Infinity].every((s) => {
      const b = scoreBand(s as number, WRITE_BANDS)
      return b.key === 'none' && b.mark === '—' && b.hint === ''
    }) && NO_SCORE_BAND.mark === '—',
  )

  // --- 分數夾限 ---
  ok(
    'clampScore 夾在 0..100 並取整',
    clampScore(-5) === 0 &&
      clampScore(0) === 0 &&
      clampScore(62.4) === 62 &&
      clampScore(62.6) === 63 &&
      clampScore(180) === 100 &&
      clampScore(NaN) === 0,
  )

  // --- 緩動與數字滾動 ---
  ok('easeOutCubic 兩端固定 0／1', easeOutCubic(0) === 0 && easeOutCubic(1) === 1 && easeOutCubic(-3) === 0 && easeOutCubic(9) === 1)
  ok(
    'easeOutCubic 單調遞增且落在 0..1',
    (() => {
      let prev = -1
      for (let i = 0; i <= 100; i++) {
        const v = easeOutCubic(i / 100)
        if (!(v >= prev) || v < 0 || v > 1) return false
        prev = v
      }
      return true
    })(),
  )
  ok('數字滾動起點為 0', countUpValue(87, 0, 700) === 0 && countUpValue(87, -50, 700) === 0)
  ok(
    '數字滾動終點剛好落在目標值',
    countUpValue(87, 700, 700) === 87 && countUpValue(87, 5000, 700) === 87,
  )
  ok(
    '數字滾動過程單調不減且不超過目標值',
    (() => {
      let prev = -1
      for (let t = 0; t <= 800; t += 10) {
        const v = countUpValue(87, t, 700)
        if (!(v >= prev) || v > 87) return false
        prev = v
      }
      return prev === 87
    })(),
  )
  ok(
    '中段確實在動（不是一次跳到底也不是卡在 0）',
    (() => {
      const mid = countUpValue(100, 350, 700)
      return mid > 0 && mid < 100
    })(),
  )
  ok(
    'duration ≤0／非數字 → 直接顯示目標值（動畫不可用時不卡在 0）',
    countUpValue(87, 0, 0) === 87 && countUpValue(87, 10, -1) === 87 && countUpValue(87, 10, NaN) === 87,
  )
  ok(
    '目標值超出範圍時同樣被夾限',
    countUpValue(150, 700, 700) === 100 && countUpValue(-20, 700, 700) === 0,
  )

  // --- 環形進度 ---
  ok(
    '環形 dashOffset：0 分＝整圈空、100 分＝填滿',
    Math.abs(ringDashOffset(0, 100) - 100) < 1e-9 && Math.abs(ringDashOffset(100, 100)) < 1e-9,
  )
  ok('環形 dashOffset 隨分數單調遞減', (() => {
    let prev = Infinity
    for (const s of scores) {
      const v = ringDashOffset(s, RING_CIRCUMFERENCE)
      if (!(v <= prev)) return false
      prev = v
    }
    return true
  })())
  ok(
    '環形 dashOffset 永遠落在 0..周長（含超界分數）',
    [-50, 0, 50, 100, 999, NaN].every((s) => {
      const v = ringDashOffset(s as number, RING_CIRCUMFERENCE)
      return v >= 0 && v <= RING_CIRCUMFERENCE
    }),
  )
  ok(
    '周長預設值＝2πr，且非法周長不會產生 NaN',
    Math.abs(RING_CIRCUMFERENCE - 2 * Math.PI * RING_RADIUS) < 1e-9 &&
      ringDashOffset(50, NaN) === 0 &&
      ringDashOffset(50, -10) === 0,
  )
}

console.log('=== 5ae. 單字帳（查詢／篩選／分組，純函式） ===')
{
  const NONE = { learned: new Set<string>(), mastered: new Set<string>(), locked: new Set<string>() }

  // --- 片假名→平假名（純機械位移，不涉讀音判斷） ---
  ok('片假名轉平假名', toHiragana('コーヒー') === 'こーひー')
  ok('小書き片假名也轉（ャュョッ）', toHiragana('ジュース') === 'じゅーす')
  ok('平假名與其他字元原樣保留', toHiragana('みず water 水。') === 'みず water 水。')
  ok('ヶ/ァ 邊界字元都在轉換範圍內', toHiragana('ァヶ') === 'ぁゖ')

  // --- 查詢正規化 ---
  ok('正規化去頭尾空白', normalizeQuery('  みず  ') === 'みず')
  ok('正規化移除內部全形／半形空白', normalizeQuery('こん　に ちは') === 'こんにちは')
  ok('正規化英文轉小寫', normalizeQuery('Water') === 'water')
  ok('正規化片假名轉平假名', normalizeQuery('コーヒー') === 'こーひー')
  ok('空字串正規化後仍為空', normalizeQuery('   ') === '')

  // --- 比對：假名／漢字／中文三種入口 ---
  const mizu = VOCAB.find((v) => v.jp === 'みず')!
  ok('詞庫有「みず」且標了漢字 水', !!mizu && mizu.kanji === '水')
  ok('用假名找得到', matchVocab(mizu, normalizeQuery('みず')))
  ok('用漢字找得到', matchVocab(mizu, normalizeQuery('水')))
  ok('用中文釋義找得到', matchVocab(mizu, normalizeQuery(mizu.zh)))
  ok('部分比對即可（前綴）', matchVocab(mizu, normalizeQuery('み')))
  ok('空查詢一律符合', matchVocab(mizu, ''))
  ok('不相干的字串不誤中', !matchVocab(mizu, normalizeQuery('ぱぴぷぺぽ')))
  const kata = VOCAB.find((v) => v.jp === 'ジュース')!
  ok('片假名詞可用平假名查詢找到', matchVocab(kata, normalizeQuery('じゅーす')))
  ok('沒有 kanji 欄位的詞不會因此出錯', VOCAB.filter((v) => !v.kanji).every((v) => matchVocab(v, normalizeQuery(v.jp))))

  // --- 每個詞都找得回自己（搜尋不會漏詞） ---
  ok(
    '每個詞都能用自己的假名查到（唯一或至少包含自己）',
    VOCAB.every((v) => filterVocab(VOCAB, { q: v.jp }, new Set()).some((r) => r.jp === v.jp)),
  )
  ok(
    '每個詞都能用自己的中文釋義查到',
    VOCAB.every((v) => filterVocab(VOCAB, { q: v.zh }, new Set()).some((r) => r.jp === v.jp)),
  )

  // --- 篩選 ---
  const learnedSet = new Set([VOCAB[0].jp, VOCAB[1].jp])
  ok('無條件＝全部', filterVocab(VOCAB, {}, new Set()).length === VOCAB.length)
  ok(
    '分類篩選只留該分類',
    filterVocab(VOCAB, { cat: '挨拶' }, new Set()).every((v) => v.cat === '挨拶'),
  )
  ok('不存在的分類→空清單', filterVocab(VOCAB, { cat: 'ぜんぜんない' }, new Set()).length === 0)
  ok(
    '已學篩選＝有卡的詞',
    filterVocab(VOCAB, { status: 'learned' }, learnedSet).map((v) => v.jp).join(',') ===
      [VOCAB[0].jp, VOCAB[1].jp].join(','),
  )
  ok(
    '未學篩選＝沒卡的詞，且與已學互補',
    filterVocab(VOCAB, { status: 'new' }, learnedSet).length === VOCAB.length - 2,
  )
  ok(
    '查詢＋分類＋狀態可疊加',
    filterVocab(VOCAB, { q: VOCAB[0].jp, cat: VOCAB[0].cat, status: 'learned' }, learnedSet).every(
      (v) => v.cat === VOCAB[0].cat && learnedSet.has(v.jp),
    ),
  )
  ok('篩選維持原順序', (() => {
    const sub = filterVocab(VOCAB, { cat: '挨拶' }, new Set())
    const orig = VOCAB.filter((v) => v.cat === '挨拶')
    return sub.map((v) => v.jp).join(',') === orig.map((v) => v.jp).join(',')
  })())

  // --- 分組 ---
  const groups = groupByCat(VOCAB)
  ok('分組數＝分類數', groups.length === VOCAB_CATS.length)
  ok('分組順序＝資料出現順序', groups.map((g) => g.cat).join(',') === VOCAB_CATS.join(','))
  ok('分組不漏詞', groups.reduce((n, g) => n + g.words.length, 0) === VOCAB.length)
  ok('每組非空且組內同分類', groups.every((g) => g.words.length > 0 && g.words.every((w) => w.cat === g.cat)))
  ok('空輸入→空分組', groupByCat([]).length === 0)

  // --- 摘要與統計 ---
  const sums = catSummaries(VOCAB, learnedSet)
  ok('分類摘要與分組一一對應', sums.map((s) => s.cat).join(',') === groups.map((g) => g.cat).join(','))
  ok('分類摘要總數加總＝詞庫大小', sums.reduce((n, s) => n + s.total, 0) === VOCAB.length)
  ok('分類摘要已學數加總＝已學詞數', sums.reduce((n, s) => n + s.learned, 0) === 2)
  const st = bookStats(VOCAB, learnedSet, new Set([VOCAB[0].jp]))
  ok('統計：總數／已學／定著', st.total === VOCAB.length && st.learned === 2 && st.mastered === 1)
  ok('統計：空清單全 0', (() => {
    const z = bookStats([], learnedSet, learnedSet)
    return z.total === 0 && z.learned === 0 && z.mastered === 0
  })())

  // --- 標記（定著 > 已學 > 待解鎖 > 無） ---
  const w0 = VOCAB[0]
  ok('定著優先於已學', vocabMark(w0, { learned: new Set([w0.jp]), mastered: new Set([w0.jp]), locked: new Set() }) === 'master')
  ok('已學', vocabMark(w0, { learned: new Set([w0.jp]), mastered: new Set(), locked: new Set() }) === 'learn')
  ok('已學優先於待解鎖', vocabMark(w0, { learned: new Set([w0.jp]), mastered: new Set(), locked: new Set([w0.jp]) }) === 'learn')
  ok('待假名解鎖', vocabMark(w0, { learned: new Set(), mastered: new Set(), locked: new Set([w0.jp]) }) === 'locked')
  ok('都不符合＝無標記', vocabMark(w0, NONE) === 'none')
  ok(
    '三種標記的符號與說明皆非空且互異',
    (() => {
      const signs = Object.values(MARK_LABEL).map((m) => m.sign)
      const texts = Object.values(MARK_LABEL).map((m) => m.text)
      return (
        signs.length === 3 &&
        new Set(signs).size === 3 &&
        new Set(texts).size === 3 &&
        signs.every((s) => s.length > 0) &&
        texts.every((t) => t.length > 0)
      )
    })(),
  )
  ok(
    '待解鎖判定與 vocabGate 一致（未學任何假名時，非純片假名/符號的詞都鎖著）',
    (() => {
      const nothingLearned = new Set<string>()
      const locked = new Set(VOCAB.filter((v) => !isVocabUnlocked(v.jp, nothingLearned)).map((v) => v.jp))
      return locked.size > 0 && VOCAB.every((v) => {
        const m = vocabMark(v, { learned: new Set(), mastered: new Set(), locked })
        return m === (locked.has(v.jp) ? 'locked' : 'none')
      })
    })(),
  )
}

console.log('=== 5af. 拗音ドリル（出題與誘答，純函式） ===')
{
  const pool = yoonPool()

  // ---- 題庫：完全取自五十音圖的拗音格，不新增任何手打假名 ----
  ok('題庫 33 音', pool.length === 33)
  ok('題庫＝五十音圖拗音格（逐枚相同）', (() => {
    const chart = cellsOf('yoon')
    return pool.length === chart.length && pool.every((c, i) => c.h === chart[i].h && c.k === chart[i].k && c.ro === chart[i].ro)
  })())
  ok('每格皆為 2 字（基底＋小假名）', pool.every((c) => c.h.length === 2 && c.k.length === 2))
  ok('小假名只有 ゃ／ゅ／ょ', pool.every((c) => 'ゃゅょ'.includes(yoonSmall(c))))
  ok('基底皆為い段假名（可回查 KANA）', pool.every((c) => KANA.some((k) => k.ch === yoonBase(c) && k.ro.endsWith('i'))))
  ok('羅馬字互異', new Set(pool.map((c) => c.ro)).size === 33)
  ok('拗音不在 SRS 卡組（id 皆 null）', pool.every((c) => c.id === null))
  ok('KANA 仍為 142 枚（卡組未被拗音動到）', KANA.length === 142)

  // ---- 誘答分層 ----
  const kya = pool.find((c) => c.ro === 'kya')!
  const tiers = distractorTiers(kya, pool, seededRng(1))
  ok('第①層＝同列不同母音（きゅ／きょ）', tiers[0].length === 2 && tiers[0].every((c) => yoonBase(c) === 'き') && new Set(tiers[0].map((c) => c.ro)).size === 2)
  ok('第②層＝同欄不同子音（都是 ゃ）', tiers[1].length === 10 && tiers[1].every((c) => yoonSmall(c) === 'ゃ' && yoonBase(c) !== 'き'))
  ok('第③層＝其餘', tiers[2].length === 20 && tiers[2].every((c) => yoonBase(c) !== 'き' && yoonSmall(c) !== 'ゃ'))
  ok('三層互斥且不含正解', (() => {
    const all = tiers.flat().map((c) => c.ro)
    return new Set(all).size === all.length && all.length === 32 && !all.includes('kya')
  })())

  // ---- 單題 ----
  const q = buildYoonQuestion(kya, pool, seededRng(7))
  ok('四個選項', q.options.length === YOON_OPTIONS && YOON_OPTIONS === 4)
  ok('選項互異', new Set(q.options).size === q.options.length)
  ok('正解在選項內且＝該格羅馬字', q.options.includes(q.answer) && q.answer === 'kya' && q.cell.ro === 'kya')
  ok('選項皆為題庫中真實存在的拗音羅馬字', q.options.every((o) => pool.some((c) => c.ro === o)))
  ok('必有 1 個同列誘答（練母音辨別）', q.options.filter((o) => o !== 'kya' && o.startsWith('ky')).length === 1)
  ok('必有 2 個同欄誘答（練子音辨別）', q.options.filter((o) => o !== 'kya' && !o.startsWith('ky')).length === 2)
  ok('同一 seed 可重現', JSON.stringify(buildYoonQuestion(kya, pool, seededRng(7))) === JSON.stringify(q))
  ok('不同 seed 會換誘答／順序', (() => {
    const set = new Set<string>()
    for (let s = 1; s <= 20; s++) set.add(buildYoonQuestion(kya, pool, seededRng(s)).options.join())
    return set.size > 1
  })())
  ok('全 33 音各自出題皆合法', pool.every((c) => {
    const qq = buildYoonQuestion(c, pool, seededRng(3))
    return qq.options.length === 4 && new Set(qq.options).size === 4 && qq.options.includes(c.ro) && qq.answer === c.ro
  }))

  // 小題庫（層不夠時往後補，不會產生重複或少於 size 的選項）
  ok('小題庫仍湊滿選項', (() => {
    const small = pool.slice(0, 5)
    const qq = buildYoonQuestion(small[0], small, seededRng(2))
    return qq.options.length === 4 && new Set(qq.options).size === 4 && qq.options.includes(small[0].ro)
  })())
  ok('題庫比選項數還小時不重複填充', (() => {
    const tiny = pool.slice(0, 3)
    const qq = buildYoonQuestion(tiny[0], tiny, seededRng(2))
    return qq.options.length === 3 && new Set(qq.options).size === 3
  })())

  // ---- 一輪 ----
  const quiz = buildYoonQuiz(seededRng(11))
  ok('一輪 10 題', quiz.length === YOON_QUIZ_LEN && YOON_QUIZ_LEN === 10)
  ok('同一輪題目不重複', new Set(quiz.map((x) => x.answer)).size === quiz.length)
  ok('每題正解都在自己的選項內', quiz.every((x) => x.options.includes(x.answer)))
  ok('題目全部來自題庫', quiz.every((x) => pool.some((c) => c.ro === x.answer)))
  ok('同一 seed 整輪可重現', JSON.stringify(buildYoonQuiz(seededRng(11))) === JSON.stringify(quiz))
  ok('n 超過題庫大小 → 取整個題庫', buildYoonQuiz(seededRng(5), 99).length === 33)
  ok('n = 0 → 空', buildYoonQuiz(seededRng(5), 0).length === 0)
  ok('n 為負 → 空（不炸）', buildYoonQuiz(seededRng(5), -3).length === 0)
  ok('多個 seed 都取得到全部 33 音的不同組合', (() => {
    const seen = new Set<string>()
    for (let s = 1; s <= 30; s++) for (const x of buildYoonQuiz(seededRng(s))) seen.add(x.answer)
    return seen.size === 33
  })())

  // ---- 與学習記録的接線（選配加練、不卡蓋章）----
  ok('yoon 為選配加練', featureGroup('yoon') === 'extra' && (EXTRA_FEATURES as readonly string[]).includes('yoon'))
  ok('yoon 不是核心五修行', !(CORE_FEATURES as readonly string[]).includes('yoon'))
  ok('yoon 有中文標籤且不與他項重複', FEATURE_LABEL['yoon'] === '拗音' && Object.values(FEATURE_LABEL).filter((v) => v === '拗音').length === 1)
  ok('yoon 練了會讓済印變金', hasExtraFeature(['yoon']))
}

console.log('=== 5ag. 文型ドリル 回想テスト 一輪制（純函式） ===')
{
  const empty = new Set<string>()
  const big = itemsFor(PATTERNS[0], empty)
  // 詞池 fallback 只補到 4 個，先自行做一個大題庫來測「取樣不重複／上限」
  const wide = poolFor(PATTERNS[0]).map((w) => buildItem(PATTERNS[0], w, empty))

  // ---- buildRound：隨機不重複取樣 ----
  ok('一輪上限 ROUND_SIZE', ROUND_SIZE === 8)
  ok('題庫夠大時剛好取 ROUND_SIZE 題', buildRound(wide, ROUND_SIZE, seededRng(1)).length === ROUND_SIZE)
  ok('題庫不足時取全部', buildRound(big.slice(0, 3), ROUND_SIZE, seededRng(1)).length === 3)
  ok('一輪內題目不重複', (() => {
    const r = buildRound(wide, ROUND_SIZE, seededRng(7))
    return new Set(r.map((it) => it.word.jp)).size === r.length
  })())
  ok('題目全部來自傳入題庫', buildRound(wide, ROUND_SIZE, seededRng(7)).every((it) => wide.includes(it)))
  ok('同一 seed 整輪可重現', (() => {
    const a = buildRound(wide, ROUND_SIZE, seededRng(3)).map((it) => it.word.jp)
    const b = buildRound(wide, ROUND_SIZE, seededRng(3)).map((it) => it.word.jp)
    return a.join(',') === b.join(',')
  })())
  ok('不同 seed 會換一組題目', (() => {
    const a = buildRound(wide, ROUND_SIZE, seededRng(3)).map((it) => it.word.jp).join(',')
    const b = buildRound(wide, ROUND_SIZE, seededRng(9)).map((it) => it.word.jp).join(',')
    return a !== b
  })())
  ok('多個 seed 掃得到題庫裡的每一個詞', (() => {
    const seen = new Set<string>()
    for (let s2 = 1; s2 <= 60; s2++) for (const it of buildRound(wide, ROUND_SIZE, seededRng(s2))) seen.add(it.word.jp)
    return seen.size === wide.length
  })())
  ok('不修改傳入的陣列', (() => {
    const before = wide.map((it) => it.word.jp).join(',')
    buildRound(wide, ROUND_SIZE, seededRng(5))
    return wide.map((it) => it.word.jp).join(',') === before
  })())
  ok('size = 0 → 空輪', buildRound(wide, 0, seededRng(1)).length === 0)
  ok('size 為負 → 空輪（不炸）', buildRound(wide, -3, seededRng(1)).length === 0)
  ok('空題庫 → 空輪', buildRound([], ROUND_SIZE, seededRng(1)).length === 0)
  ok('rng 永遠回 1（邊界）不越界也不遺漏', (() => {
    const r = buildRound(wide, ROUND_SIZE, () => 1)
    return r.length === ROUND_SIZE && r.every((it) => it !== undefined) && new Set(r).size === r.length
  })())
  ok('rng 永遠回 0（邊界）不越界也不遺漏', (() => {
    const r = buildRound(wide, ROUND_SIZE, () => 0)
    return r.length === ROUND_SIZE && r.every((it) => it !== undefined) && new Set(r).size === r.length
  })())
  ok('每個句型（空進度）都開得出非空的一輪', PATTERNS.every((p) => buildRound(itemsFor(p, empty), ROUND_SIZE, seededRng(2)).length > 0))

  // ---- roundSummary：自評結果統計 ----
  const r4 = buildRound(wide, 4, seededRng(11))
  ok('尚未作答：answered 0、未完成', (() => {
    const s2 = roundSummary(r4, [])
    return s2.total === 4 && s2.answered === 0 && s2.ok === 0 && s2.missed === 0 && s2.pct === 0 && !s2.done
  })())
  ok('答到一半：pct 以整輪為分母', (() => {
    const s2 = roundSummary(r4, [true, false])
    return s2.answered === 2 && s2.ok === 1 && s2.missed === 1 && s2.pct === 25 && !s2.done
  })())
  ok('全對：pct 100、done', (() => {
    const s2 = roundSummary(r4, [true, true, true, true])
    return s2.ok === 4 && s2.missed === 0 && s2.pct === 100 && s2.done
  })())
  ok('全錯：pct 0、done', (() => {
    const s2 = roundSummary(r4, [false, false, false, false])
    return s2.ok === 0 && s2.missed === 4 && s2.pct === 0 && s2.done
  })())
  ok('marks 比題數多時只算到題數為止', (() => {
    const s2 = roundSummary(r4, [true, true, true, true, true, true])
    return s2.answered === 4 && s2.ok === 4 && s2.done
  })())
  ok('空輪：total 0、pct 0、不算完成', (() => {
    const s2 = roundSummary([], [])
    return s2.total === 0 && s2.pct === 0 && !s2.done
  })())
  ok('ok + missed = answered（掃各種組合）', (() => {
    for (const m of [[true], [false], [true, false], [false, true, true], [true, true, false, false]]) {
      const s2 = roundSummary(r4, m)
      if (s2.ok + s2.missed !== s2.answered) return false
    }
    return true
  })())

  // ---- missedItems：只練沒說對的 ----
  ok('取出自評「再一次」的題目', (() => {
    const m = missedItems(r4, [true, false, false, true])
    return m.length === 2 && m[0] === r4[1] && m[1] === r4[2]
  })())
  ok('維持該輪的出現順序', (() => {
    const m = missedItems(r4, [false, false, false, false])
    return m.every((it, i) => it === r4[i])
  })())
  ok('全對 → 沒有要重練的', missedItems(r4, [true, true, true, true]).length === 0)
  ok('還沒作答的不算沒說對', missedItems(r4, [false]).length === 1)
  ok('沒說對的題目可以直接開下一輪', (() => {
    const m = missedItems(r4, [false, true, false, true])
    const next = buildRound(m, ROUND_SIZE, seededRng(4))
    return next.length === m.length && next.every((it) => m.includes(it))
  })())

  // ---- roundNote：結算的一句話（自評語氣，不是評分） ----
  ok('四種情境的提示皆非空', (() => {
    const notes = [
      roundNote(roundSummary([], [])),
      roundNote(roundSummary(r4, [true, true, true, true])),
      roundNote(roundSummary(r4, [false, false, false, false])),
      roundNote(roundSummary(r4, [true, true, true, false])),
    ]
    return notes.every((n) => n.length > 0)
  })())
  ok('四種情境的提示互不相同', (() => {
    const notes = [
      roundNote(roundSummary([], [])),
      roundNote(roundSummary(r4, [true, true, true, true])),
      roundNote(roundSummary(r4, [false, false, false, false])),
      roundNote(roundSummary(r4, [true, true, true, false])),
    ]
    return new Set(notes).size === 4
  })())
  ok('有沒說對的時提示裡帶出句數', roundNote(roundSummary(r4, [true, true, false, false])).includes('2'))
  ok('全對的提示不叫人再練', !roundNote(roundSummary(r4, [true, true, true, true])).includes('只練'))
  ok('自評提示不含「分」字（不與評分等第混淆）', (() => {
    const notes = [
      roundNote(roundSummary([], [])),
      roundNote(roundSummary(r4, [true, true, true, true])),
      roundNote(roundSummary(r4, [false, false, false, false])),
      roundNote(roundSummary(r4, [true, true, true, false])),
    ]
    return notes.every((n) => !n.includes('分'))
  })())
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
