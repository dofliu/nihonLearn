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
與 v3.43「單字帳」為同期兩支獨立分支、改動檔案不重疊）。
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

## 🔴 目前最優先方向：互動深化（Dof 明確指定，2026-08 對話中確認）

> Dof 的原話：「要加強互動，不是只有自己再練習」。經對話核對方向：指的是**深化與 AI 的
> 互動式練習**（人機互動），**不是**多人／社群功能（好友對戰、排行榜、分享）——後者需要
> 雲端帳號與後端伺服器，正面衝突現有「local-first、單人、無伺服器」核心設計，**明確排除**。
>
> 現況：聞き取り／N5 測驗本質上都是「選擇題」或「跟讀固定稿」，屬被動接收；
> 生成式／主動產出的來回互動目前有五處——AI 助教的自由聊天與「考我」主動造句（`TutorView`，v3.30）、
> 自由対話（`RoleplayView`，v3.29 情境角色扮演）、跟讀後的即時追問（`components/FollowUp.tsx`，
> v3.31），以及文型ドリル的「自由造句」（`PatternView`＋`lib/patternCompose.ts`，v3.32——注意這一處的
> 回饋是**程式檢核優先、AI 講評加值**，無金鑰也能練）。這個方向要把「來回互動」的模式擴散到更多練習場景。
>
> v3.35 起，這幾處 AI 互動練習**都會記入学習記録並讓當日済印變金**（`roleplay`／`tutor`／
> `followup` 三個 feature key；自由造句併在 `pattern` 底下）——記的是「你練了幾次」這個行為，
> AI 的產出內容仍然不入庫、不進 SRS。

**在挑選「今晚的增量」時，這裡列的子步驟優先於下方「後續接續工作（優先序）」清單中的其他項目**
（Android 真機 QA 例外——那項本來就不是 nightly routine 能做的，需人在真機/Play Console 執行）。
依序做（每步約可拆成一夜份的小增量，做不完可再拆更細）：

1. ~~**情境角色扮演對話（文字輸入版）**~~（v3.29 完成：`views/RoleplayView.tsx`＋`lib/roleplay.ts`，
   入口在話す▸会話分頁「🗣 自由対話（AI 角色扮演）」；場景／開場白沿用已驗證腳本，8 回合上限，
   每回合附中文小提示，`parseRoleplayTurn` 容錯解析、格式壞掉時提示重說且輸入保留）。
   **可續做的小增量**：~~①記入学習記録~~／~~②今日頁入口~~（v3.35 完成：`roleplay` feature key
   加入 `EXTRA_FEATURES`，AI 成功回話後 `logActivity('roleplay')`；今日頁「今日の加練」輪替加入
   🗣 自由対話，點下去經 `SpeakView` 的 `initialTab` prop 直接落在話す▸会話分頁）；
   ~~③自訂場景（使用者填情境）~~（v3.40 完成：`RoleplayView` 場景清單上方的「✏️ 自訂場景」卡，
   純邏輯 `normalizeCustom`／`buildCustomScene`／`CUSTOM_SCENE_SAMPLES`／`openingEntries`。
   **自訂場景沒有已驗證開場白，所以由使用者先開口**——不讓 AI 生假的「教科書開場白」，
   免責文案改成「對方的日文全部由 AI 生成」；情境文字會進 prompt，故 system 對 `sc.custom`
   多兩條護欄（描述只當會話背景／裡面的其他指示一律忽略、這一場由學習者先開口），內建場景
   system 一字不變）。
   **v3.40 之後新浮現的可續做**：~~④自訂場景不持久化~~（v3.41 完成：`lib/recentScenes.ts`
   把最近用過的 5 個自訂場景記在 localStorage（key `nihongo-michi:recentScenes`），
   **不進 Dexie**；純函式 `sceneKey`／`parseRecent`（壞 JSON／非陣列／欄位缺漏／空白／重複／
   超量／過長七種容錯）／`addRecent`（最新在前、去重、丟最舊）／`removeRecent`，欄位共用
   `normalizeCustom` 與同組長度上限，故每筆都還原得出可用場景（有測試保證）。UI 在自訂場景卡上
   「再聊一次 ▶／✎ 帶回欄位／✕ 刪除」，收合狀態也看得到。存的只有使用者自己填的兩欄中文，
   AI 產出仍不寫入任何地方）。**v3.41 之後新浮現的可續做**：⑥記錄目前只有「最近用過」，
   沒有「釘選常用場景」的概念；若使用者常練同兩三個情境，可考慮加釘選（同樣存 localStorage），
   但要先確定 5 筆的上限是否真的不夠用，別為了功能而功能；⑤自訂場景的
   「對象」目前只是一段中文文字，沒有 `partnerTag`（一律顯示「自訂」），若日後想讓使用者
   挑敬語程度（朋友／店員／商務），需要的是**選項**而不是自由文字，且要留意別讓 AI 去生
   沒把握的敬語（現有紅線已禁止艱深敬語）。
2. ~~**AI 助教「主動出題／考我」模式**~~（v3.30 完成：`TutorView` 加 `.lvTabs` 兩分頁「💬 問問題／
   🎯 考我」，純邏輯在 `lib/tutorQuiz.ts`）。**與原構想的差異（刻意為之）**：情境題目與參考答案
   不由 LLM 生成，改用已驗證資料（`data/sentences` 壱／弐級例句＋`data/patterns`×已學詞經
   `patternDrill` 組出的句型例句），LLM 只負責**中文講評**——正確性交給權威資料，AI 只出使用者
   能自審的中文，也因此無金鑰時仍可「出題→自己想→看參考答案自評」（降級不中斷）。
   **可續做的小增量**：~~①口說作答~~（v3.34 完成：作答輸入下方掛上共用的 `VoiceInput` 麥克風鈕，
   辨識結果只填進輸入框、確認後才送出；無 ASR 時整顆鈕不顯示、打字照常）；~~②記入学習記録~~
   （v3.35 完成：`tutor` feature key，`submit()` 揭曉答案時記——**無金鑰也記**，因為沒金鑰照樣是
   「自己造句→對參考答案」的完整練習；今日頁加練輪替加入 🎯 助教考我）；
   ~~③題目池含 `data/kaiwa` 的即時応答／発話表現~~（v3.37 完成：`kaiwaPrompts()` 把発話表現的中文
   情境與即時応答（題目附上已驗證日文原句＋中文對照）接成考我題源；`ResponseItem.openEnded` 標記
   答案依個人情況而異的四題並排除；另加題源分頁 `SOURCE_TABS`／`filterPrompts`，固定表現題的講評
   prompt 多一行「說法基本上只有一種」）；④答錯的題目沒有記錄，未來可考慮比照 `quizResults` 做弱項
   追蹤（需 Dexie v9）；⑤題源分頁目前不記住選擇（換頁回來回到「全部」），若要記住可存 localStorage
   （裝置層、不進 Dexie），但要留意別讓使用者忘了自己鎖在某個題源。
3. ~~**跟讀＋即時追問**~~（v3.31 完成：`components/FollowUp.tsx`＋`lib/followUp.ts`，跟読分頁例句卡
   下方「追問 ─ AI に聞かれる」。AI 針對當下那句已驗證例句追問一句日文，你臨場打字回答，拿到中文
   講評＋✅／△／❌ 徽章（沿用 `tutorQuiz parseCritique`）；同一句最多追問 3 次，換句自動重置。
   選配加練——不計「口」任務、不影響蓋章、不入庫；無金鑰只顯示一行說明，跟讀評分不受影響）。
   **可續做的小增量**：~~①口說回答~~（v3.34 完成，與第 2 項的①一併做：`components/FollowUp.tsx`
   的回答輸入掛上共用 `VoiceInput`，辨識結果只填進輸入框、確認後才送出）；~~②記入学習記録~~
   （v3.35 完成：`followup` feature key，送出回答時記——**在呼叫 Gemini 之前**，講評連線失敗不該
   抹掉「你已經練過了」；追問綁在跟読流程內、無獨立入口，故不進今日頁加練輪替）；~~③追問接續多輪~~
   （v3.39 完成：`followUpHistory(askUser, rounds)` 沿用 `roleplay.ts roleplayHistory` 模式把題材與
   已問答輪次組成多輪 contents，AI 接著你的回答繼續問；未回答的輪次以 `FOLLOWUP_SKIPPED` 維持
   user/model 交替、不謊稱回答內容；UI 整串問答留在畫面上，回答先進畫面再呼叫 Gemini。
   共用紅線／講評 prompt／feature key／`MAX_FOLLOWUPS` 全部不動）；~~④会話（`DialogueView`）走完一段後也比照追問~~（v3.38 完成：
   `FollowUp` 改吃 `FollowUpTopic`＝`sentenceTopic`／`dialogueTopic` 兩種題材，`buildDialogueAskUser`
   把場景／對象／整段腳本組進 user 訊息，system prompt 只換「情境從哪來」的描述、共用紅線不動；
   AI 扮演對話中的那個對象接著問，走完整段才出現，換場景即收起）。
   **v3.38 之後新浮現的可續做**：⑤同一段対話目前也是 3 輪上限（`MAX_FOLLOWUPS` 兩種題材共用），
   v3.39 讓這 3 輪變成**接續的對話**後更有理由放寬（依 kind 給不同上限），但要留意 API 用量；
   ⑥追問只在**走完整段**後出現，中途離開（返回）就沒有——這是刻意的（追問要有完整情境），
   若要改成「練到一半也能問」需重新想清楚要餵哪幾句進 prompt。
   **v3.39 之後新浮現的可續做**：⑦講評（`buildReplyUser`）目前仍只看「這一輪的問句＋回答」，
   不看前幾輪——多輪化之後可考慮讓講評也帶上下文（例如指出「你這句和前面說的不一致」），
   但會增加 token 用量、也要小心別讓講評變長；⑧整串問答換題材就消失、不持久化（刻意——
   AI 產出不入庫），若要「回顧今天練過的追問」需另開 Dexie schema（version 9），
   且要先想清楚這與「AI 產出不寫入學習庫」的界線怎麼說明（存的是你自己的作答與當下的對話紀錄，
   不是教材）。
4. ~~**文型ドリル「自由造句」評分**~~（v3.32 完成：`PatternView` 第三模式「✍ 自由造句」＋純函式
   `lib/patternCompose.ts`）。**與原構想的差異（刻意為之）**：不是只靠 Gemini 判斷——句型接續與填入的詞
   先由**程式**檢核（`checkShape`：正規化去空白句讀後比對 `pre`/`post` 位置、抽出填空、以假名或漢字正寫
   查已驗證 `data/vocab`、標記是否已學過／是否在此句型分類內），所以**沒有 Gemini 金鑰也有真回饋**；
   LLM 只負責中文講評自然度與助詞（沿用 `parseCritique` 徽章）。僅供參考、不入庫、不計蓋章。
   **可續做的小增量**：（自由造句的作答輸入已於 v3.34 加上「🎤 用說的」麥克風鈕。）
   ①目前只檢核「一個句型 × 一個詞」的單句，若使用者寫了較長的句子（加上場所、
   時間等修飾）會判定骨架不符——可考慮改用「post 出現在句尾即可、pre 之前允許其他內容」的較寬鬆規則，
   但要留意過寬會讓檢核失去意義；②仍併在 `pattern` 這個 key 底下計數，未拆成獨立 feature
   （v3.35 給了 roleplay/tutor/followup 各自的 key，自由造句刻意維持併記——它與練習／回想テスト
   同屬文型ドリル，拆開反而讓「句型練了幾次」被切碎；若日後想分開看正確率再拆）；
   ③無金鑰時的檢核結果目前不持久化，
   若要在成長頁看「造句練習次數／句型正確率」需另開 Dexie schema（version 9）並同步 `e2e/db.spec.ts`。
5. **（較長期）語音來回對話**：把步驟 1 的角色扮演接上麥克風＋TTS（沿用既有 ASR/TTS pipeline），
   做成真正口語互動。範圍較大，拆成多夜進行。
   - ~~**第一子步：自由対話語音輸入**~~（v3.33 完成：`lib/voiceInput.ts`＋`audio/scorer.ts`
     `recognizeSpeech()`／`speechInputAvailable()`＋共用元件 `components/VoiceInput.tsx`；
     AI 回話的 TTS 朗讀 v3.29 就有，所以現在已是「聽 → 說」的來回）。
     **刻意保留的設計**：辨識結果**只填進輸入框、不自動送出**——ASR 會聽錯（初學者發音尤其），
     讓使用者看得到系統聽成什麼並可修改，避免污染對話紀錄。無 ASR 時麥克風鈕不顯示（打字照常）。
   - ~~**第二子步：口說作答擴散到三處**~~（v3.34 完成：`VoiceInput` 複用到助教「🎯 考我」
     （`TutorView` `TutorQuiz`）、跟讀追問（`components/FollowUp.tsx`）、文型ドリル「✍ 自由造句」
     （`PatternView`）。**這同時結掉上方第 2 步的①與第 3 步的①「口說作答」**——三處的降級鏈
     與「辨識結果只填進輸入框、不自動送出」規矩都與自由対話一致；送出／揭曉答案後麥克風鈕退場。
     純呈現層複用，無新純函式／CSS／schema 變動）。
   - **可續做的小增量**（依建議順序）：
     ①**「說完自動送出」選項**：目前一律要按送る。若要做成可切換的免持模式，需想清楚辨識錯誤
     時的補救（例如送出前倒數 2 秒可取消），不要預設開啟。
     ②**真機驗證**：容器內只能用假的 `SpeechRecognition`；Android 原生走 Capacitor
     `speech-recognition`（`recognizeSpeech()` 已接、與跟讀共用同一條降級鏈），權限流程與
     日語辨識品質需真機確認，可併入 `tests/MANUAL_QA-ANDROID.md`。
     ③**AI 回話的朗讀速度／重播**：目前自動朗讀一次（用全域 rate），可加「🔊 再聽一次／慢速」。

6. **（v3.35 之後新浮現的小增量）今日頁加練輪替的曝光問題**：選配加練已增為 6 項，
   `dayIndex % 6` 代表每項六天才被主推一次。可考慮改成「優先推今天**還沒練過**的那一項」
   （`activity.ts` 已有 `featuresOnDay`，加一個純函式即可測），但要留意別讓「✓ 今日已練」
   的成就回饋在練完後立刻消失——需要先想清楚呈現方式再動，不是純機械改動。

**這些步驟共同的安全護欄**（沿用 AI 助教 v3.6 已立下的先例，勿另創新規則）：
- 自由生成的日文對話／回饋內容**僅供參考、不寫入學習庫、不進 SRS**——這類是使用者主動觸發的
  一次性互動輸出，不同於短文/句型等「要被記入內容庫」的教材，所以不走 `needs_review` 審核佇列
  （那套是給「會被別人重複看到、需要策展」的內容用的；這裡是一次性、當下自己看的對話）。
- 一律走 Gemini 直連（`lib/llm.ts`），原生要用 `CapacitorHttp` 繞 WebView CORS；純解析邏輯
  （如果需要）放 `lib/llmParse.ts`（供 Node 測試、不依賴 Capacitor）。
- **無 Gemini 金鑰時必須優雅降級**：不能因為做這些新互動而讓沒設金鑰的人失去現有功能——
  角色扮演退回現有固定腳本 `DialogueView`；助教「考我」無金鑰時提示去設定，不崩潰。
- 不要動搖每日 5 核心／10 分鐘蓋章門檻；新互動一律當「+α 選配」或既有任務的「加強版分頁」，
  不強制、不卡蓋章（除非刻意為之且補上對應測試與說明）。
- 純函式（system prompt 組裝、回應後處理等）盡量抽到 `lib/`，可被 Node 測試；UI 進對應 view；
  e2e 測攔截 `**/generativelanguage.googleapis.com/**` 並預設 localStorage 金鑰（比照現有
  `tutor.spec.ts` 寫法）。

## 目前狀態

- **程式碼**：Web/PWA 與 Android（Capacitor 殼）皆完成；CI（web 測試＋e2e＋Android `assembleDebug`）綠燈。
- **測試**：`npm test` 572/572、`npm run test:e2e` 82/82、`sidecar/test_score.py` 4/4、`test_article.py` 13/13、`npm run build` strict 綠燈。
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
| 段落聽解題庫擴充（全 14 篇短文都有大意題＋細節題，題池 22→43）＋同輪不重複同一篇（`spreadByGroup`＋`pickParagraphs` 可選 `groupOf`） | v3.44 |
| 分數揭曉動畫（`lib/scoreReveal.ts`＋`components/ScoreReveal.tsx`：環形進度＋數字滾動＋等第徽章，書寫字形評分與跟讀發音評分共用；純呈現、門檻沿用原判斷） | v3.42 |
| AI 互動練習記入学習記録＋金印（`roleplay`／`tutor`／`followup` 三個 feature key；金印判定抽成純函式 `featureGroup`／`hasExtraFeature`／`extraDays`／`groupTotals`；今日頁加練輪替 4→6、成長頁加分組 chip） | v3.35 |


## 後續接續工作（優先序）

> ⚠ 挑選 nightly 增量時，先看上方「🔴 目前最優先方向：互動深化」的子步驟；做完/卡關才落到下列清單。

### 1. Android 真機 QA ＋ Google Play 封閉測試 〔上架關鍵路徑，需人在真機/Play Console 執行、nightly 無法做〕
- 依 `tests/MANUAL_QA-ANDROID.md` 在真機逐項驗收（原生 TTS/ASR、離線、TTS 快取、深色模式、返回鍵、權限流程）。
- Play Console：個人開發者帳號需 **12 名測試者 × 14 天封閉測試** 才能升正式；流程見 `docs/ANDROID_RELEASE_PLAN.md`、`docs/PLAY_LISTING.md`。
- 每次上傳 `versionCode` 手動 +1（`android/app/build.gradle`）；`keystore.properties`／`*.jks` 已 gitignore，**絕不提交**。

### 2. pitch accent 詞庫擴充 〔內容深化〕
- 現況：`data/pitch.ts` 只放高信度東京式詞，pattern 由 `lib/pitch.ts` 規則生成（無正確性風險）。
- 目標：接 **OJAD** 或字典資料源、**標註來源**後擴大重音道場詞庫。
- 原則：**不可讓 LLM 直接生 accent 數字**（Dof 會發現錯誤）；每筆新詞查證來源、只標一個 accent 整數。
- ⚠ 此雲端環境的 egress proxy 擋掉 OJAD／Wiktionary／字典等一般網站（403），**無法在此查證**；需本機或提供資料才做。
- 💡 v3.24 發現：egress proxy 對 `registry.npmjs.org`（`npm view`/`npm pack`）放行，一般 HTTPS（含
  `unpkg.com`）則否。若有 npm 套件形式打包的重音／字典資料（仿 v3.24 用 `@madcat/kanjivg` 取得
  KanjiVG 的做法），可比照：`npm pack` 下載、本機解包擷取所需子集成純資料檔，**不加入 package.json
  相依性**。下次可先 `npm view`/`npm search` 找看看有無這類 OJAD／字典衍生封裝。

### 2.5 五十音圖續做 〔v3.36 之後，呈現層為主〕
- ~~五十音圖一覽表~~（v3.36：`lib/kanaChart.ts`＋`components/KanaChart.tsx`）。可續做：
  ①**拗音目前不進 SRS**（刻意——加進去會讓 `KANA` 從 142 變 208、影響每日修行範圍與
  `lib/vocabGate.ts` 的解鎖判定）。若日後要練拗音，建議做成**獨立的選配練習**（比照書寫／測驗），
  而不是塞進核心卡組；②圖上的格子目前用底線標已學／定著，可考慮加「只看還沒學的」篩選；
  ③長音・促音（ー／っ）與外來語專用音（ファ／ティ 等）未收——這些不是五十音圖的一部分，
  要做應另開一張「特殊音」對照表，且同樣不可讓 LLM 生讀音。

### 3. 漢字模式深化 〔內容深化〕
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

### 4. 真聲學 GOP（發音評分天花板）〔進階、需 GPU〕
- wav2vec2-CTC 日語音素模型＋強制對齊，逐音素後驗機率。
- `/score_gop` 接口與演算法已在 `sidecar/main.py` 末段註記；前端可疊加到現有 mora 診斷上色。

### 5. 聽力題型續強化 〔內容深化，可選〕
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

### 6. 動畫／視覺輔助續做 〔呈現層，風險最低，可挑一子項〕
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
