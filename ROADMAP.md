# Roadmap ／ 後續接續工作

> 本檔集中記錄「已完成里程碑」與「後續接續工作」，供接手者（人或 AI）快速掌握現況與下一步。
> 版本沿革細節見 `README.md`；開發約定與已知陷阱見 `CLAUDE.md`。
> 設計原則不變：**正確性交給權威來源與程式驗證，AI 生成一律人工審核採用才入庫；
> 使用者只做策展，不當正確性把關者。**

最後更新：v3.44（段落聽解題庫擴充＋同輪不重複同一篇——ROADMAP #5「聽力題型續強化」的續做。
v3.27 只給 6 篇短文加了 `detailQuiz`，段落聽解題池一直只有 22 題（12 大意＋10 細節），一輪 3 題，
每天練的人很快就把題目背起來。這次把 `data/passages.ts` **全部 14 篇補齊**：原本沒有 `quiz`、
**從沒進過段落聽解池**的兩篇文學短文（`p3` ことばの にんじゃ／`p6` たびびと）補上大意題，
另外 8 篇補上 2～3 題細節題——**題池 22 → 43 題**。細節題只用中文問「短文自己就寫明的事」，
答案逐字出現在該篇 `zh` 台詞裡（既有測試逐條核對），**日文台詞與中文對照一字未動、不經 LLM**。
順手修掉題庫變大才浮現的問題：一篇短文現在可能有 1 大意＋3 細節，原本 `pickParagraphs` 只是洗牌，
一輪三題可能連聽三次同一段音檔——新增純函式 `spreadByGroup(items, groupOf)`（依組 round-robin 攤開，
不遺漏不重複、順序沿用傳入），`pickParagraphs` 加**可選**第四參數 `groupOf`（不給時與舊版逐字相同、
有測試釘住），`ListenView` 傳 `it.id.split(':')[0]`，故大意題／細節題／採用的 AI 題都算同一篇，
一輪必來自三篇不同短文。純資料＋純函式，不動 Dexie schema／蓋章判定／「耳」任務計數／CSS。
與 v3.43「單字帳」為同期兩支獨立分支、改動檔案不重疊；v3.43 先合併入 main，本版於分支上併入
main 後重跑全測）。
前一版 v3.43（單字帳：查得到、看得到進度——這一版刻意是**收斂／整合**而非加功能。
読む頁底部的「單字帳」原本把 321 個詞一次攤平列出，手機上是一面滾不完的牆，而且沒辦法查一個詞；
初學者在短文／聞き取り／文型ドリル遇到不認得的詞，想回頭查只能自己滾。改成
`components/VocabBook.tsx`：搜尋（假名／漢字／中文）＋分類收合（預設全收，標題就顯示
「n 詞・已學 m」）＋狀態篩選（全部／已學／未學）＋每列標記 ◎ 已定著／● 學習中／🔒 待假名解鎖
——最後這個讓詞彙修行卡上「待假名解鎖 N 詞」的數字**看得到是哪些詞**（沿用 `lib/vocabGate.ts`
同一套判定）。純邏輯抽 `lib/vocabBook.ts`（`toHiragana`／`normalizeQuery`／`matchVocab`／
`filterVocab`／`groupByCat`／`catSummaries`／`bookStats`／`vocabMark`）。**刻意不做羅馬字搜尋**
——詞彙層級沒有已驗證的羅馬字，靠假名逐字推導會在拗音／促音／長音出錯＝自行杜撰讀音。
順手把 `learnedKanaChars()` 從 `VocabCard.tsx` 移進 `db/repo.ts` 共用。零正確性風險：不新增任何
日文內容，只是重新組織已驗證的 `data/vocab.ts`；純查閱、不寫入資料、不計入每日修行、
不動 Dexie schema 與蓋章判定）。
前一版 v3.42（分數揭曉動畫：環形進度＋數字滾動＋等第徽章——「動畫／視覺輔助續做」的延伸。
v3.28 只做了「多題作答流程」的進度條與對錯動畫，分數型回饋（0-100 分）仍是一行靜態大字；這次把
**書寫的字形相似度**與**跟讀的發音相似度**兩處改用共用元件 `components/ScoreReveal.tsx`：
環形進度圈（SVG `stroke-dashoffset` transition）＋數字由 0 滾到最終分（`requestAnimationFrame`）＋
等第徽章彈入（◎ 優秀／○ 良好／△ 再加油，附原有的一句話講評）。**純呈現層、不動任何評分演算法**
（字形分數仍出自 `lib/handwriting.ts`、跟讀分數仍走既有降級鏈），也不動 Dexie schema／蓋章判定／
任務計數。純函式抽 `lib/scoreReveal.ts`（`scoreBand`＋`WRITE_BANDS`(80/60)／`SPEAK_BANDS`(80/55)
沿用兩處原本各自寫死的門檻、`countUpValue`／`easeOutCubic`／`clampScore`／`ringDashOffset`），
測試逐分核對 `scoreBand(s, WRITE_BANDS).mark === gradeOf(s)`，等第行為與改動前一致；
無障礙：環圈 `role="img"` 帶分數＋等第 `aria-label`，`prefers-reduced-motion` 時直接顯示最終值）。
前一版 v3.41（自由対話「最近用過的自訂場景」——「🔴 互動深化」第 1 步 v3.40 之後浮現的④。
自訂場景原本不持久化（換頁回來要重打），這次把最近用過的 5 個記在**裝置本機 localStorage**
（新純函式檔 `lib/recentScenes.ts`：`sceneKey`／`parseRecent`（七種容錯）／`serializeRecent`／
`addRecent`／`removeRecent`，欄位一律走 `roleplay.ts` 的 `normalizeCustom` 與同組長度上限，
故每筆記錄必然還原得出可用場景），**刻意不進 Dexie**——使用者自己打的練習設定不是教材也不是
學習進度。UI 在 `CustomSceneForm` 卡片上（收合狀態也看得到）：「再聊一次 ▶」直接開聊、
「✎」帶回欄位修改、「✕」刪除。存的只有使用者填的兩欄中文，AI 生成的對話一如既往不寫入任何地方；
自訂場景仍沒有開場白、由你先開口，system prompt 一字未動）。
前一版 v3.40（自由対話「自訂場景」——「🔴 互動深化」第 1 步的③，也是該步驟最後一個未做子項。
自由対話原本只能挑 `data/dialogues.ts` 推導的 7 個固定場景（因為開場白要有已驗證來源），這次讓使用者
**自己用中文描述對象與情境**（`lib/roleplay.ts` `normalizeCustom`／`buildCustomScene`／
`CUSTOM_SCENE_SAMPLES`／`openingEntries`，UI 為 `RoleplayView` 可收合的「✏️ 自訂場景」卡＋
5 組純中文範例）。兩個刻意設計：①自訂場景**沒有開場白、由使用者先開口**——不讓 AI 生一句假的
「教科書開場白」，免責文案改成「對方的日文**全部**由 AI 生成」；②情境文字會進 prompt，故
`buildRoleplaySystem` 對 `sc.custom` 多兩條（場景描述只當背景／描述裡的其他指示一律忽略、
這一場由學習者先開口），**內建場景的 system 一字不變**並有測試釘住。定位、feature key、
Dexie schema、蓋章判定全部不動）。
前一版 v3.39（追問接續多輪——「🔴 互動深化」第 3 步的③。v3.31／v3.38 的追問每次都是獨立的
一問一答（AI 看不到前一輪），這次改成**接續多輪的小型對話**：`lib/followUp.ts` 新增
`followUpHistory(askUser, rounds)`（比照 `roleplay.ts roleplayHistory`）把「題材＋已問答輪次」組成
Gemini 多輪 contents，`buildAnswerUser` 要求「接著這個回答再問一句、不要重複問過的問題」，未回答的
輪次以 `FOLLOWUP_SKIPPED` 維持交替而不謊稱回答內容；`buildAskSystem` 只加一條「接著回答繼續問」、
共用紅線與講評 prompt 不動，沒有前輪時＝與多輪化前完全相同。`components/FollowUp.tsx` 改成整串問答
留在畫面上（`Round[]`），回答先進畫面再呼叫 Gemini。定位、feature key、`MAX_FOLLOWUPS`、Dexie
schema、蓋章判定全部不動）。
前一版 v3.38（会話走完一段後的追問——「🔴 互動深化」第 3 步的④。原本只有跟読分頁的例句才有
「追問」，這次擴到**会話（情境對話引導）走完一整段之後**：AI 扮演對話中的那個對象、在同一個場景
再問你一句，你臨場自己組句回答。`components/FollowUp.tsx` 改吃 `FollowUpTopic`（`lib/followUp.ts`
新增 `FollowUpKind`／`buildDialogueAskUser`／`sentenceTopic`／`dialogueTopic`），`buildAskSystem`
只換「情境從哪來」的描述、共用紅線與講評 prompt 一字不動，不給 kind 時與舊版完全相同。
定位比照 v3.31 不變：僅供參考、不入庫、不進 SRS、不計「口」任務與蓋章，沿用既有 `followup`
feature key；無金鑰時固定腳本対話流程完全不受影響）。
前一版 v3.37（考我題源擴充：固定表現＋題源分頁——「🔴 互動深化」第 2 步的③。AI 助教
「🎯 考我」的題庫接上 `data/kaiwa` 的発話表現／即時応答（`kaiwaPrompts()`），這兩份是最基本的
挨拶・定型句、答案唯一，很適合初學者練「主動說出來」；答案依個人情況而異的四題（名字／時間／
價格／出身地）以資料層新欄位 `ResponseItem.openEnded` 標記並排除，不當造句考題。另加題源分頁
「全部／例句／句型／固定表現」（`SOURCE_TABS`＋`filterPrompts`），預設「全部」維持原行為；
固定表現題的講評 prompt 多一行「說法基本上只有一種、不必鼓勵他另創說法」。日文仍全部來自
已驗證資料、LLM 只生中文講評，無金鑰照樣能自評。順手修好一個日期相依的 e2e 測試——
`activity.spec` 直接點「🗣 自由対話」，在輪替到該項的那幾天會同時匹配主推鈕與展開清單而 strict
mode 失敗，改用既有 `openExtra` helper）。
前一版 v3.36（五十音圖一覽表——**使用者直接指定的功能**：かな頁加「📋 五十音圖」查閱表，
平假名／片假名 × 清音／濁音／拗音，每格附羅馬字，點格朗讀、可「播放全部」並中途停止，另有
「用單字卡練習」直接開 FSRS 一輪。純函式 `lib/kanaChart.ts` **把整張表從已驗證的 `data/kana.ts`
推導出來、不手打任何讀音**：清音／濁音靠「前半平假名、後半片假名同索引＝同音」的配對取字，
拗音靠「い段假名＋小 ゃ/ゅ/ょ」與羅馬字規則（sh/ch/j 直接接母音、其餘接 y＋母音）推導；
`KANA` 維持 142 枚不動，拗音只在這張查閱表出現、不進 SRS）。
前一版 v3.35（AI 互動練習記入学習記録＋金印——一次結掉 v3.29–v3.32 各自留下的同一個
「可續做②：不記入学習記録」。`lib/activity.ts` `EXTRA_FEATURES` 加 `roleplay`／`tutor`／`followup`
三個 feature key，三處在「使用者產出一句日文」的當下 `logActivity`（助教考我無金鑰時照樣記）；
金印判定邏輯抽成純函式 `featureGroup`／`hasExtraFeature`／`extraDays`／`groupTotals`（行為不變、
變成可被 Node 測試），`repo.ts`／`store.ts` 改呼叫之；今日頁加練輪替 4→6 項（加 🗣 自由対話、
🎯 助教考我，後者直接落在話す▸会話分頁——`SpeakView` 新增 `initialTab` prop），成長頁加
「核心・加練」與「AI 互動練習」統計 chip。不動蓋章門檻、不動 Dexie schema）。
前一版 v3.34（口說作答擴散到三處 AI 練習——「🔴 互動深化」第 5 步的第二個子步驟，同時結掉第 2 步①
與第 3 步①的「口說作答」。v3.33 抽好的 `components/VoiceInput.tsx` 複用到助教「🎯 考我」、跟讀「追問」、
文型ドリル「✍ 自由造句」三處作答輸入；沿用同一套規矩——辨識結果只填進輸入框不自動送出、送出後麥克風退場、
無 ASR 時整顆鈕不顯示。純呈現層複用：無新純函式、無新 CSS、不動 schema／蓋章／prompt）。
前一版 v3.33（自由対話「用說的」——「🔴 互動深化」第 5 步的第一個子步驟。`RoleplayView` 補上麥克風輸入
（`lib/voiceInput.ts` 純函式＋`audio/scorer.ts` 只轉寫不評分的 `recognizeSpeech()`＋共用元件
`components/VoiceInput.tsx`），與早已有的 TTS 湊成「聽 AI 說 → 自己說回去」；辨識結果**只填進輸入框、
不自動送出**（ASR 會聽錯，讓使用者確認／修改），無語音辨識能力時整顆鈕不顯示、打字照常）。
前一版 v3.32（文型ドリル「自由造句」——「🔴 互動深化」第 4 步。文型ドリル加第三個模式「✍ 自由造句」：
自己挑詞用該句型造一句完整日文，**句型骨架與填空詞由程式檢核**（`lib/patternCompose.ts`，純字串比對＋
已驗證詞庫查詢，**無金鑰照樣有回饋**），有 Gemini 金鑰時再加一段**中文**講評；僅供參考、不入庫、不卡蓋章）。
前一版 v3.31（跟讀＋即時追問——第 3 步。跟読分頁例句卡下方「追問 ─ AI に聞かれる」：AI 針對當下那句
**已驗證教材例句**的情境追問一句日文，你臨場自己組句打字回答，再拿到**中文**講評；同一句最多 3 次、
換句自動重置；選配加練不計蓋章，無金鑰時整塊只顯示說明、跟讀評分照常）。
v3.30（AI 助教「考我」模式——「🔴 互動深化」第 2 步。助教出**中文情境題**、你自己用日文
作答，題目與參考答案全部來自已驗證資料（`data/sentences` 壱／弐級例句＋`data/patterns`×已學詞），
LLM 只用**中文**講評你寫的句子；無金鑰時退回「看參考答案自評」照樣能練）。
v3.29（自由対話：AI 角色扮演文字輸入版，第 1 步，PR #37）與 v3.30 為同期兩支獨立分支、各自延伸自
v3.28，互不依賴，已依序合併入 main。

---

## ✅ 已完成的方向：互動深化（v3.29–v3.41，Dof 2026-08 指定）

> Dof 的原話：「要加強互動，不是只有自己再練習」。經對話核對方向：指的是**深化與 AI 的
> 互動式練習**（人機互動），**不是**多人／社群功能（好友對戰、排行榜、分享）——後者需要
> 雲端帳號與後端伺服器，正面衝突現有「local-first、單人、無伺服器」核心設計，**明確排除**。
> 這條排除仍然有效，日後不要重提。

**這個方向原本規劃的五個步驟已全部完成**，成果散在四個入口（各自的細節見 `CLAUDE.md` 版本註記
與下方「已完成里程碑」表）：

| 入口 | 檔案 | 版本 |
|--|--|--|
| AI 助教：自由聊天／🎯 考我 | `views/TutorView.tsx`＋`lib/tutorQuiz.ts` | v3.6・v3.30・v3.37 |
| 自由対話（AI 角色扮演，含自訂場景與語音輸入） | `views/RoleplayView.tsx`＋`lib/roleplay.ts`／`recentScenes.ts` | v3.29・v3.33・v3.40・v3.41 |
| 跟読／会話後的即時追問（多輪） | `components/FollowUp.tsx`＋`lib/followUp.ts` | v3.31・v3.38・v3.39 |
| 文型ドリル「✍ 自由造句」 | `views/PatternView.tsx`＋`lib/patternCompose.ts` | v3.32 |

四處都已記入学習記録並讓當日済印變金（`roleplay`／`tutor`／`followup` 三個 feature key，
自由造句併在 `pattern` 底下，v3.35）——記的是「你練了幾次」這個行為，
AI 的產出內容仍然不入庫、不進 SRS。口說作答（`components/VoiceInput.tsx`）已擴散到四處（v3.33／v3.34）。

**⚠ 這個清單已經見底**：以下是各步驟做完後殘留的邊際小項，**沒有優先權**，
挑 nightly 增量時**不必**優先看這裡。只有在你能具體說出「這一項確實會讓人多練一次」時才挑，
否則跳過——不要為了消化清單而做功能。

- **自由対話**：①「對象」目前只是自由文字、沒有 `partnerTag`（一律顯示「自訂」）；
  若要讓使用者挑敬語程度（朋友／店員／商務），需要的是**選項**而不是自由文字，
  且要留意別讓 AI 去生沒把握的敬語（現有紅線已禁止艱深敬語）。
  ②最近用過的自訂場景只有 5 筆、沒有「釘選」；先確定 5 筆真的不夠用再說。
  ③AI 回話目前自動朗讀一次（全域 rate），可加「🔊 再聽一次／慢速」。
- **助教考我**：④答錯的題目沒有記錄，若要比照 `quizResults` 做弱項追蹤需 Dexie v9。
  ⑤題源分頁不記住選擇（換頁回到「全部」）；要記住可存 localStorage，
  但要留意別讓使用者忘了自己鎖在某個題源。
- **追問**：⑥兩種題材共用 `MAX_FOLLOWUPS`＝3；v3.39 多輪化後有理由依 kind 放寬，但要留意 API 用量。
  ⑦追問只在**走完整段**対話後出現（刻意——追問要有完整情境）；若要「練到一半也能問」
  需重新想清楚要餵哪幾句進 prompt。⑧講評只看當輪，不看前幾輪；帶上下文會增加 token 且讓講評變長。
  ⑨整串問答換題材就消失、不持久化（刻意——AI 產出不入庫）。
- **自由造句**：⑩只檢核「一個句型 × 一個詞」的單句，寫較長的句子（加場所／時間修飾）會判骨架不符；
  可考慮放寬成「post 在句尾即可」，但過寬會讓檢核失去意義。⑪檢核結果不持久化（需 Dexie v9 才能統計）。
- **口說**：⑫「說完自動送出」的免持模式——需想清楚辨識錯誤的補救（送出前倒數可取消），不要預設開啟。
  ⑬真機驗證：容器內只能用假的 `SpeechRecognition`，Android 原生權限流程與日語辨識品質
  需真機確認，可併入 `tests/MANUAL_QA-ANDROID.md`。
- **今日頁**：⑭加練輪替已 6 項，`dayIndex % 6` 代表每項六天才被主推一次；
  可改成「優先推今天**還沒練過**的那一項」（`activity.ts` 已有 `featuresOnDay`），
  但要留意別讓「✓ 今日已練」的成就回饋在練完後立刻消失——不是純機械改動。

**安全護欄（仍然有效，任何新的 AI 互動一律沿用，勿另創新規則）**：
- 自由生成的日文對話／回饋內容**僅供參考、不寫入學習庫、不進 SRS**——這類是使用者主動觸發的
  一次性互動輸出，不同於短文/句型等「要被記入內容庫」的教材，所以不走 `needs_review` 審核佇列
  （那套是給「會被別人重複看到、需要策展」的內容用的；這裡是一次性、當下自己看的對話）。
- 一律走 Gemini 直連（`lib/llm.ts`），原生要用 `CapacitorHttp` 繞 WebView CORS；純解析邏輯
  放 `lib/llmParse.ts`（供 Node 測試、不依賴 Capacitor）。
- **無 Gemini 金鑰時必須優雅降級**：不能因為做新互動而讓沒設金鑰的人失去現有功能——
  角色扮演退回現有固定腳本 `DialogueView`；助教「考我」無金鑰時退回「看參考答案自評」，不崩潰。
- 不要動搖每日 5 核心／10 分鐘蓋章門檻；新互動一律當「+α 選配」或既有任務的「加強版分頁」，
  不強制、不卡蓋章（除非刻意為之且補上對應測試與說明）。
- 純函式（system prompt 組裝、回應後處理等）盡量抽到 `lib/`，可被 Node 測試；UI 進對應 view；
  e2e 測攔截 `**/generativelanguage.googleapis.com/**` 並預設 localStorage 金鑰（比照現有
  `tutor.spec.ts` 寫法）。

## 目前狀態

- **程式碼**：Web/PWA 與 Android（Capacitor 殼）皆完成；CI（web 測試＋e2e＋Android `assembleDebug`）綠燈。
- **測試**：`npm test` 616/616、`npm run test:e2e` 84/84、`sidecar/test_score.py` 4/4、`test_article.py` 13/13、`npm run build` strict 綠燈。
- **尚未做**：Android 真機驗收（清單 `tests/MANUAL_QA-ANDROID.md`）與 Google Play 封閉測試——**未通過前勿送審**。

## 已完成里程碑（摘要）

| 里程碑 | 版本 |
|--|--|
| 三軌 FSRS（假名＋詞彙）、辨音＋重音道場、跟讀三段式評分＋mora 診斷、分級閱讀、PWA、v1 匯入 | v2 |
| Android 上架程式碼（Capacitor 殼、原生 TTS/ASR、Dexie TTS 快取、簽章接線、上架材料、CI） | v3.0 |
| NHK 文章導入、審核佇列持久化、初學者體驗修正、Gemini 直連生成 | v3.1–v3.3 |
| N5 模擬測驗、朗讀逐字上色、AI 助教、vocab i+1 | v3.4–v3.6 |
| 聽力理解（聞き取り）、段落聽解＋短文情境分類 | v3.7–v3.8 |
| JLPT N5 聴解四大題型（含即時応答／発話表現）、AI 段落理解題（LLM 只生中文） | v3.9–v3.10 |
| 情境對話引導（店員/家人/情人/同學/朋友/廠商）、漢字モード改「漢字＋假名注音」（程式驗證對齊）、測驗聽力日文對照 | v3.11 |
| 專屬 Logo（鳥居）、假名書寫練習＋字形相似度評分（描紅/空白默寫、Dexie v7）、詞庫擴充（N5 191→299） | v3.12–v3.14 |
| 修正書寫描紅層級（不被格線蓋住）＋Android adaptive 圖示（鳥居 mipmap 直接生成） | v3.15 |
| 漢字書寫練習（取自已驗證 60 個單漢字詞，沿用字形相似度評分） | v3.16 |
| 學習活動記錄＋統計（Dexie v8 activityLog，成長頁日曆 heatmap 與統計，+α 選配不卡蓋章） | v3.17 |
| 實機修正（書寫描紅層級、Android 桌面 mipmap 圖示）；漢字書寫練習擴充；標題安全區／聞き取り手動下一題／聽力分類中文化；読む短文選單中文主題化 | v3.15–v3.19 |
| 移除前端 sidecar 相關 UI（手機為主場景）；詞庫擴充（N5 299→321） | v3.20 |
| 文型ドリル（句型×已學單字組句，含回想テスト模式）；每日任務「加練輪替＋金印」獎勵與大印同步 | v3.21–v3.23.1 |
| 漢字筆順動画（KanjiVG 權威資料逐畫描繪，`components/StrokeOrder.tsx`） | v3.24 |
| 漢字筆順「順序」粗略比對（起筆點＋LIS 判斷下筆順序，`lib/strokeOrder.ts`，即時提示不寫入 Dexie） | v3.25 |
| 漢字筆順「行筆方向」粗略比對（`pathEnd`／`strokeVector` cosine 相似度，與筆順/字形提示並列） | v3.26 |
| 段落聽解細節題（時間/數量/人物，6 篇短文 `detailQuiz`，答案逐字對照原文） | v3.27 |
| 作答視覺回饋：共用動畫進度條（`ProgressBar`）＋選對/選錯 pop/shake/徽章動畫，套用六處多題流程 | v3.28 |
| 自由対話（AI 角色扮演，文字輸入版）：沿用已驗證場景／開場白，Gemini 即時回話＋中文小提示，僅供參考不入庫 | v3.29 |
| AI 助教「考我」模式（`lib/tutorQuiz.ts`）：已驗證資料出中文情境題、你自己造句，LLM 只生中文講評；無金鑰可自評 | v3.30 |
| 跟讀＋即時追問（`lib/followUp.ts`＋`components/FollowUp.tsx`）：AI 順著已驗證例句情境追問一句，你臨場組句回答＋中文講評 | v3.31 |
| 文型ドリル「自由造句」（`lib/patternCompose.ts`）：自己挑詞造句，句型骨架與填空詞由程式檢核（無金鑰亦可），LLM 只生中文講評 | v3.32 |
| 自由対話「用說的」（`lib/voiceInput.ts`＋`components/VoiceInput.tsx`）：麥克風輸入，辨識結果先填輸入框可改再送；無 ASR 時鈕不顯示 | v3.33 |
| 口說作答擴散到三處（助教「考我」／跟讀追問／文型自由造句共用 `VoiceInput`，規矩一致：只填輸入框、送出後鈕退場、無 ASR 不顯示） | v3.34 |
| 五十音圖一覽表（`lib/kanaChart.ts`＋`components/KanaChart.tsx`：平/片 × 清/濁/拗音、附羅馬字、點格朗讀與播放全部；全表由已驗證 `data/kana` 推導，拗音走規則、不進 SRS 卡組） | v3.36 |
| 考我題源擴充：`data/kaiwa` 発話表現／即時応答接成考我題源（`kaiwaPrompts`，`openEnded` 排除答案因人而異者）＋題源分頁（`SOURCE_TABS`／`filterPrompts`） | v3.37 |
| 会話走完一段後的追問（`FollowUpTopic`＝`sentenceTopic`／`dialogueTopic`，AI 扮演對話中的對象在同一場景再問一句；共用紅線與講評 prompt 不動、沿用 `followup` feature key） | v3.38 |
| 自由対話「自訂場景」（`buildCustomScene`／`openingEntries`：使用者用中文描述對象與情境，無已驗證開場白故由你先開口；system 對自訂場景加指示注入護欄，內建場景不變） | v3.40 |
| 自由対話「最近用過的自訂場景」（`lib/recentScenes.ts`：最多 5 筆存裝置本機 localStorage、不進 Dexie，容錯解析＋去重＋長度上限共用 `normalizeCustom`；卡片上可再聊／帶回欄位／刪除） | v3.41 |
| 分數揭曉動畫（`lib/scoreReveal.ts`＋`components/ScoreReveal.tsx`：環形進度＋數字滾動＋等第徽章，書寫字形評分與跟讀發音評分共用；純呈現、門檻沿用原判斷） | v3.42 |
| 單字帳查詞與進度（`lib/vocabBook.ts`＋`components/VocabBook.tsx`：搜尋假名/漢字/中文、分類收合、狀態篩選、◎/●/🔒 標記；由 321 列的牆收斂成可查閱的工具，零新內容） | v3.43 |
| 段落聽解題庫擴充（全 14 篇短文都有大意題＋細節題，題池 22→43）＋同輪不重複同一篇（`spreadByGroup`＋`pickParagraphs` 可選 `groupOf`） | v3.44 |
| AI 互動練習記入学習記録＋金印（`roleplay`／`tutor`／`followup` 三個 feature key；金印判定抽成純函式 `featureGroup`／`hasExtraFeature`／`extraDays`／`groupTotals`；今日頁加練輪替 4→6、成長頁加分組 chip） | v3.35 |


## 後續接續工作（優先序）

> ⚠ **這是一份可挑選的清單，不是固定優先序**。「互動深化」已於 v3.41 全部做完（見上方章節），
> 目前**沒有欽定的最優先方向**——挑 nightly 增量時，一律依「這個增量對每天只練 10 分鐘、
> 剛學完五十音的成人有沒有實際差別」判斷；答不出來就換題目，全部答不出來就交維護型增量
> 或誠實回報今晚不做（硬做邊際功能比不做更糟）。下列各項標了本雲端環境**做得了／做不了**。

### 1. Android 真機 QA ＋ Google Play 封閉測試 〔上架關鍵路徑，需人在真機/Play Console 執行、nightly 無法做〕
- 依 `tests/MANUAL_QA-ANDROID.md` 在真機逐項驗收（原生 TTS/ASR、離線、TTS 快取、深色模式、返回鍵、權限流程）。
- Play Console：個人開發者帳號需 **12 名測試者 × 14 天封閉測試** 才能升正式；流程見 `docs/ANDROID_RELEASE_PLAN.md`、`docs/PLAY_LISTING.md`。
- 每次上傳 `versionCode` 手動 +1（`android/app/build.gradle`）；`keystore.properties`／`*.jks` 已 gitignore，**絕不提交**。

### 2. pitch accent 詞庫擴充 〔內容深化〕　**❌ nightly 做不了**（需 Dof 提供素材，見下）
- 現況：`data/pitch.ts` 只放高信度東京式詞，pattern 由 `lib/pitch.ts` 規則生成（無正確性風險）。
- 目標：接 **OJAD** 或字典資料源、**標註來源**後擴大重音道場詞庫。
- 原則：**不可讓 LLM 直接生 accent 數字**（Dof 會發現錯誤）；每筆新詞查證來源、只標一個 accent 整數。
- ⚠ 此雲端環境的 egress proxy 擋掉 OJAD／Wiktionary／字典等一般網站（403），**無法在此查證**；需本機或提供資料才做。
- 💡 v3.24 發現：egress proxy 對 `registry.npmjs.org`（`npm view`/`npm pack`）放行，一般 HTTPS（含
  `unpkg.com`）則否。若有 npm 套件形式打包的重音／字典資料（仿 v3.24 用 `@madcat/kanjivg` 取得
  KanjiVG 的做法），可比照：`npm pack` 下載、本機解包擷取所需子集成純資料檔，**不加入 package.json
  相依性**。下次可先 `npm view`/`npm search` 找看看有無這類 OJAD／字典衍生封裝。

### 2.5 五十音圖續做 〔呈現層〕　**✅ nightly 做得了**
- ~~五十音圖一覽表~~（v3.36：`lib/kanaChart.ts`＋`components/KanaChart.tsx`）。可續做：
  ①**拗音目前不進 SRS**（刻意——加進去會讓 `KANA` 從 142 變 208、影響每日修行範圍與
  `lib/vocabGate.ts` 的解鎖判定）。若日後要練拗音，建議做成**獨立的選配練習**（比照書寫／測驗），
  而不是塞進核心卡組；②圖上的格子目前用底線標已學／定著，可考慮加「只看還沒學的」篩選；
  ③長音・促音（ー／っ）與外來語專用音（ファ／ティ 等）未收——這些不是五十音圖的一部分，
  要做應另開一張「特殊音」對照表，且同樣不可讓 LLM 生讀音。

### 2.6 單字帳續做 〔收斂／查閱工具〕　**✅ nightly 做得了**（③羅馬字搜尋除外：需權威素材）
- ~~單字帳由「321 列的牆」收斂成可查閱的工具~~（v3.43：`lib/vocabBook.ts`＋`components/VocabBook.tsx`）。
  **v3.43 之後新浮現的可續做**：
  ①**分類展開狀態不記憶**（換頁回來全部收合）。若使用者常查同一類，可存 localStorage（裝置層、
  不進 Dexie，比照 `lib/recentScenes.ts`）；但要先確定「每次都得點一下」真的造成困擾，別為了功能而功能。
  ②**只能從単語帳查，不能從閱讀處查**——短文／会話腳本裡遇到生詞，仍得自己記住再回單字帳搜。
  若要做「點短文裡的詞就查」需要斷詞（`data/passages` 的 `jp` 是連續假名，沒有詞界資料），
  **不可讓 LLM 斷詞**（會杜撰）；比較務實的做法是先做「已驗證詞庫的最長比對」標出短文中出現的詞，
  但要留意假名同形異義會誤標，需先想清楚誤標的代價。
  ③**沒有羅馬字搜尋**（v3.43 刻意排除：詞彙層級無已驗證羅馬字，逐字推導會在拗音／促音／長音出錯）。
  若日後要做，唯一合法路徑是取得**權威來源的羅馬字資料**（比照 v3.24 的 KanjiVG：npm 套件 → 擷取子集
  → 附來源授權 → 不加相依性），不可自行推導。
  ④單字帳目前純查閱、不與 SRS 互動。可考慮加「把這個詞排進今天的複習」，但要留意這會繞過
  `lib/vocabGate.ts` 的假名解鎖閘門（初學者可能塞進一堆還沒學到假名的詞），需先想清楚要不要擋。

### 3. 漢字模式深化 〔內容深化〕　**✅ 部分做得了**（筆畫比對是純幾何＋KanjiVG；新增漢字資料則需素材）
- 短文提供漢字／假名雙版切換（目前部分短文已有 ruby）。
- ~~假名書寫練習＋字形評分~~（v3.13）、~~漢字書寫練習~~（v3.16：`data/kanjiWrite.ts`，字集取自已驗證單漢字詞）、
  ~~筆順動畫~~（v3.24：`data/kanjiStrokes.ts`＋`components/StrokeOrder.tsx`，資料來自 KanjiVG CC BY-SA 3.0）、
  ~~筆順「順序」粗略比對~~（v3.25：`lib/strokeOrder.ts`，起筆點最近配對＋LIS，判斷下筆先後順序是否符合
  官方筆順；只看順序不看路徑方向，文案已誠實區分「筆順」vs.「字形相似度」兩行提示）。
- ~~筆畫方向比對~~（v3.26：`pathEnd`／`strokeVector` 取每畫「起筆→收筆」向量，cosine 相似度比對
  行筆方向，`WriteView` 另開一行「方向」提示，與「筆順」「字形相似度」並列不混為一談）。
- 可續做：**筆畫路徑比對**（v3.26 仍只比對起訖點連線方向，未比對彎曲路徑本身——可用 `strokesRef`
  完整折線與 KanjiVG path 的中段取樣點做更細緻比對，但要留意過度嚴格會打擊初學者信心，且仍須維持
  「方向參考，非精確路徑評分」的誠實文案）；筆順/方向比對結果目前不持久化，若要在成長頁呈現
  「筆順正確率」歷史趨勢，需另開 Dexie schema（version 9）並補 `e2e/db.spec.ts` 版本斷言。
- 若未來 `data/vocab.ts` 擴充新增的單漢字詞不在目前 60 字的 KanjiVG 擷取範圍內，需要重新用
  `@madcat/kanjivg` 補擷取（`WriteView` 已對缺資料的字自動隱藏筆順按鈕與順序比對，不會壞，但體驗會少一塊）。

### 4. 真聲學 GOP（發音評分天花板）〔進階〕　**❌ nightly 做不了**（需 GPU 與真音檔）
- wav2vec2-CTC 日語音素模型＋強制對齊，逐音素後驗機率。
- `/score_gop` 接口與演算法已在 `sidecar/main.py` 末段註記；前端可疊加到現有 mora 診斷上色。

### 5. 聽力題型續強化 〔內容深化〕　**✅ 重組既有資料做得了**／**❌ 新寫日文做不了**
- ~~段落理解題細節題~~（v3.27：6 篇短文加 `detailQuiz`，時間／數量／人物，答案逐字對照 zh 台詞
  並有測試核對）。~~可續擴到其餘 8 篇~~（v3.44 完成：**全部 14 篇短文都有大意題＋細節題**，
  題池 22 → 43 題。原本擔心「`p6`／`p13`／`p14` 無明確數字/時間細節」——改問**短文自己寫明的
  事物與說法**（星星／不停下腳步／敝姓 Dof／彼此彼此／早安／我先走一步了）就成立了，
  一樣通過「答案逐字出現在 zh 台詞」的檢核。另外 `p3`／`p6` 原本連 `quiz` 都沒有、**從沒進過
  段落聽解池**，這次一併補上大意題）。
- ~~一輪三題可能重複同一篇短文~~（v3.44 完成：純函式 `lib/listening.ts` `spreadByGroup`＋
  `pickParagraphs` 可選第四參數 `groupOf`；`ListenView` 以 `id.split(':')[0]` 分組，
  故大意題／細節題／採用的 AI 題都算同一篇。不給 `groupOf` 時行為與舊版逐字相同）。
- **v3.44 之後新浮現的可續做**：①`spreadByGroup` 目前只用在段落聽解，`ListenView` 的
  **句子聽解**（`listeningQuestions`）取材自例句＋短文每一行，同一篇短文的相鄰句子也可能連著出——
  可考慮沿用同一個分散函式，但要先確認句子題的重複感是否真的困擾（每題只播一句、成本比段落低）；
  ②細節題目前一律 4 選項，JLPT 課題理解確實是 4 選項，維持不變即可；
  ③題池變大後，**同一輪不重複**已解決，但**跨輪**仍可能連兩天抽到同幾題——若要做「最近出過的
  先不出」需要持久化（Dexie 或 localStorage），先觀察 43 題夠不夠用再說，別為了功能而功能。
- 句子聽解題庫偏日常，可補商業／旅遊情境單句（`data/sentences.ts`／`data/passages.ts`）。
  ⚠ 這一項需要**新寫日文**，本雲端環境無法查證日文正確性（proxy 擋外部字典），需本機或提供素材才做。
- 素材一律走已驗證資料或「LLM 只生中文題／選項」路線，不讓 LLM 生日文。

### 6. 動畫／視覺輔助續做 〔呈現層，風險最低〕　**✅ nightly 做得了**
- v3.28 只做了「多題作答流程」的進度條與對錯動畫（六處：`QuizView`／`ListenView` 四型／`KanaView`
  兩處）。~~`WriteView`（字形評分結果 0-100 分的數字滾動／等第徽章）~~（v3.42 完成，並一併套用到
  `SpeakView` 的跟讀發音分數：共用元件 `components/ScoreReveal.tsx`＋純函式 `lib/scoreReveal.ts`，
  環形進度＋數字滾動＋等第徽章；門檻沿用兩處原本的判斷，有逐分對照 `gradeOf` 的測試釘住）。
  **仍未涵蓋**：`PatternView`（文型ドリル／回想テスト的「說對了/再一次」按鈕）、`DialogueView`
  （會話引導逐句完成時）——可挑一處延伸同一套 `ProgressBar`／pop-in／`ScoreReveal` 語彙。
- **v3.42 之後新浮現的可續做**：①`ScoreReveal` 目前只用在兩處分數，`lib/quiz` 的 N5 測驗結算分數
  （答對題數／百分比）與 `ProgressView` 的發音成長曲線也可共用同一套等第語彙，但要先想清楚
  「測驗的百分比」與「相似度分數」語意不同，別讓同一個徽章在不同語境代表不同意思；
  ②書寫的「筆順」「方向」兩行提示仍是純文字，可比照徽章化（✓／△／✗ 三態），但務必維持
  v3.25／v3.26 立下的誠實文案（起筆點順序／行筆方向的粗略比對，非精確路徑評分）。
- 測驗/聽力答對達成滿分（100%）或連續答對時，可考慮加一次性慶祝動畫（呼應既有 `BigStamp`／金印
  的視覺語言），但注意不要過度打斷學習節奏、且需可被 `prefers-reduced-motion` 關閉（沿用既有全域
  規則即可，不需額外處理）。
- 情境對話／短文可考慮加簡單情境 emoji／圖示提升可讀性（不需外部圖片資源，維持零依賴）。

## 接手須知（給下一位開發者／AI）

- **分支/PR**：功能開發走一功能一 PR（draft），綠燈後由 Dof 合併；合併後從最新 `main` 重開同名分支再做下一項。
- **提交前檢查**：`npm run build`（strict）＋`npm test`＋`npm run test:e2e`＋（動到 sidecar 時）`python sidecar/test_*.py`。
- **補測慣例**：純邏輯進 `tests/integration.ts`（Node 直跑 `.ts`，import 要帶副檔名、不得依賴 Dexie/Capacitor/window）；UI 流程進 `e2e/*.spec.ts`（共用步驟放 `e2e/helpers.ts`）；後端進 `sidecar/test_*.py`。
- **改 Dexie schema**：加 `version(n+1)`、勿改舊版定義，並同步改 `e2e/db.spec.ts` 的 IDB 版本斷言（version×10）與新表清單。
- **AI 生成**：走 Gemini 直連（`lib/llm.ts`，原生用 `CapacitorHttp` 繞 CORS）；純解析放 `lib/llmParse.ts`（無 Capacitor 依賴、供 Node 測試）；產物一律 `needs_review`，採用才入庫。
- **正確性紅線**：日文內容一律來自已驗證資料或權威來源；LLM 只允許生成使用者能自審的**中文**；pitch/複雜敬語不得由 LLM 生成。

詳細開發約定與踩雷清單見 `CLAUDE.md`。
