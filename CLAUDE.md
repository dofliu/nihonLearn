# CLAUDE.md — 日本語の道 v2 開發指南

> 此檔供 Claude Code 進入專案時自動載入。目標：讓後續開發（尤其是本機才能做的實測）
> 有完整上下文，不必重新摸索。人類擁有者：Dof（劉瑞弘），偏好繁體中文、直接精簡、
> 重視**不把估計值當實測數據**——這條原則已寫入本專案（AI 生成內容一律標記、須人工審核）。

## 這是什麼

個人化日語學習 PWA，聽說讀三軌，local-first。使用者：中文母語、剛學完五十音的成人。
前端 React + Vite + TS + Dexie(IndexedDB)，SRS 用 FSRS。可選 sidecar（跑在使用者的
RTX 5090 工作站）提供高品質語音（VOICEVOX）、發音評分（faster-whisper）、內容生成（Anthropic API）。
sidecar 不在線時前端全部降級為瀏覽器能力，功能不中斷。

## 快速啟動

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build（strict，必須綠燈才提交）
npm test           # 前端邏輯回歸（Node 22 直跑 .ts）
npm run test:e2e   # Playwright 瀏覽器 E2E（自動起 dev server；
                   # 容器/CI 設 PW_CHROMIUM_PATH=/opt/pw-browsers/chromium 用預裝瀏覽器）

# sidecar（選配，本機/5090）
cd sidecar
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8848
python test_score.py   # 後端 mora 診斷測試（注入假 whisper，不需真模型）
```

前端 dev server 把 `/api/*` proxy 到 `SIDECAR_URL`（預設 `http://127.0.0.1:8848`）。
正式對外用使用者現有的 Cloudflare Tunnel / Tailscale。

## 架構地圖

```
src/
  data/       內容＝唯一事實來源：kana(142)・vocab(~300 N5)・sentences・pairs・pitch・passages・kaiwa(即時応答/発話表現)・dialogues(情境會話)・kanjiWrite(漢字書寫字集，取自 vocab)・patterns(句型模板)
  db/         schema(Dexie v8)・repo（任務計數、蓋章、卡片、發音紀錄、生成句）
  srs/        scheduler：ts-fsrs 封裝（newCard/review/isDue/isMastered）
  audio/      tts（VOICEVOX▸原生▸WebSpeech 門面 + 逐字 boundary 回呼）・scorer（相似度 + ASR + whisper 錄音 + mora 型別）
  lib/        date・importV1（v1→v2 遷移 + 備份匯出）・content（生成 client + 持久化審核佇列 + 採用）・listening（聽力理解＋JLPT 題型出題，純函式）・articles（NHK Easy 導入 client + 採用）・llm（Gemini 直連 + 金鑰/模型本機儲存）・llmParse（Gemini 回應純解析）・coverage（覆蓋率檢核，無依賴）・pitch（mora 切分 + 東京式 pattern）・sidecar（base URL 抽象 + probeHealth）・vocabGate（詞彙隨假名解鎖，純函式）・quiz（N5 模擬測驗出題，純函式）・karaoke（朗讀逐字上色對齊，純函式）・furigana（漢字↔假名注音對齊，純函式）・handwriting（手寫字形相似度評分，純函式）・activity（學習活動統計，純函式）・kanaChart（五十音圖表格結構＋拗音規則推導，純函式）・yoonDrill（拗音出題與分層誘答，純函式）・patternDrill（句型×已學單字組句，純函式）・roleplay（自由対話場景/prompt/歷史組裝，純函式）・recentScenes（自由対話最近用過的自訂場景，localStorage、純函式）・scoreReveal（分數等第／數字滾動／環形幾何，純函式）・tutorQuiz（助教「考我」出題＋講評 prompt/解析，純函式）・followUp（跟讀例句／会話腳本的 AI 追問 prompt/解析，純函式）・patternCompose（自由造句句型骨架程式檢核＋講評 prompt，純函式）・voiceInput（語音輸入候選挑選/合併/錯誤訊息，純函式）・vocabBook（單字帳查詢/篩選/分組/狀態標記，純函式）
  state/      store（zustand：今日/streak/rate/tts/showKanji）
  views/      Today・Kana(含 Write 書寫練習・五十音圖一覽表・拗音ドリル)・Listen(含 Pitch)・Speak(含 Dialogue 会話＋Roleplay 自由対話，跟読與会話走完皆可 AI 追問)・Read・Progress・Review・Pattern(文型ドリル，含自由造句)
  components/ Nav・ui(toast/大印/進度條)・KanaChart(五十音圖)・YoonDrill(拗音ドリル)・VocabCard・VocabBook(單字帳：搜尋/收合/狀態標記)・Karaoke・Ruby・StrokeOrder・FollowUp(跟讀追問)・VoiceInput(共用麥克風鈕)・ScoreReveal(分數揭曉：環形進度＋數字滾動＋等第徽章)
sidecar/      FastAPI：/health /tts /speakers /score /content /article/*；article.py（NHK Easy 解析，純函式）；mock_voicevox.py（假 engine）；test_score.py・test_article.py
tests/        integration.ts（npm test）・INTEGRATION_REPORT.md・MANUAL_QA.md
e2e/          Playwright 端到端測試（npm run test:e2e）・helpers.ts（共用步驟）
scripts/      gen-icons.mjs（favicon→PWA 圖示）・gen-android-icons.mjs（鳥居→Android mipmap 各密度）
```

**資料流**：`data/` 靜態內容 → 使用者互動 → `repo` 寫 IndexedDB（卡片 FSRS 狀態、每日計數、蓋章、
發音 attempts、採用的生成句）→ `store.refresh()` 從 DB 重讀 → views 訂閱。

## 設計約定（沿用勿破壞）

1. **data 是唯一事實來源**；TTS / 評分是無狀態 adapter（門面自動選 provider，呼叫端無感）。
2. **AI 生成內容一律 `needs_review`**，經前端審核佇列「採用」才寫入學習庫。sidecar `/content`
   加程式覆蓋率檢核（`lib/coverage.ts`），不只靠 prompt。這對應 Dof 的資料誠信原則。
3. **降級不中斷**：sidecar 離線 → 瀏覽器語音／自評；whisper 未開 → 瀏覽器 ASR → 自評。
4. **pitch accent 資料謹慎**：只放高信度東京式詞，UI 明確標「地區/世代差異、僅供辨識」。
   pattern 由規則生成（`lib/pitch.ts`），無正確性風險；擴充詞庫時只需標一個 accent 整數。
5. **習慣引擎**：每日五項小任務（約 10 分鐘），全完成才蓋當日印。低門檻優先於高強度。
6. **自由互動內容（AI 助教式）不等於「內容庫」內容**：使用者主動觸發、一次性、當下自己看的
   生成式對話／講評（如 AI 助教聊天），標「僅供參考」、**不寫入學習庫、不進 SRS**即可，不需要
   走 `needs_review` 審核佇列（那套是給「會被重複看到、需要策展」的教材用的）。無金鑰時優雅降級。

## ⭐ 下一階段方向：互動深化

Dof 明確指定（2026-08 對話中確認）：接下來的內容方向要**加強與 AI 的互動式練習**（人機互動，
非多人／社群功能——後者需要雲端帳號與後端，與 local-first 核心設計衝突，已明確排除）。
具體子步驟、優先序、安全護欄見 **`ROADMAP.md`** 開頭的「🔴 目前最優先方向：互動深化」章節——
nightly routine 選夜間增量時，優先從那裡挑，而非本檔案下方舊有的「本機實測任務」或
`ROADMAP.md` 後段的一般 backlog。

## 目前狀態（收尾整合回合）

已完成並測試：三軌 FSRS（假名＋詞彙）、辨音＋重音道場、跟讀三段式評分＋mora 診斷、
分級閱讀＋漢字模式、內容生成＋覆蓋率審核、發音成長曲線、VOICEVOX 接入、PWA、v1 匯入。

v3（Android 上架）程式碼全部完成（Phase 0–5）：sidecar base URL 可設定（`lib/sidecar.ts`＋設定頁）、
TTS 快取改 Dexie v3 `ttsCache`、Capacitor 殼（`android/`、appId `com.dof.nihongomichi`）、
原生語音 providers（TTS/ASR）、簽章接線與上架材料（`docs/PRIVACY_POLICY.md`、`docs/PLAY_LISTING.md`）、
CI（web 測試＋assembleDebug＋APK artifact）。**真機驗收未做**——清單在
`tests/MANUAL_QA-ANDROID.md`，未通過前勿送審。詳見 `docs/ANDROID_RELEASE_PLAN.md`。
本機跑 App：`npm run android:open`（需 Android Studio）。

v3.1（內容彈性化）：NHK やさしいニュース文章導入（注音繼承 NHK 人工標註、LLM 只補中文對照、
審核採用後入 Dexie v4 `userPassages`，讀む頁「時事読み物」）＋生成句審核佇列持久化（`genQueue`，
退回前不消失）。品質把關原則：**正確性交給權威來源與程式驗證，人工審核只做策展**
（使用者非日語專業，不當正確性把關者）。

v3.2（初學者體驗修正）：短文「中文對照」整篇切換（初學者預設開）、生成句在未設 AI 金鑰時
走客戶端離線示範、**詞彙隨假名進度解鎖**（`lib/vocabGate.ts`：只出「假名全學過」的詞；
無可解鎖時當日詞彙自動達標不卡蓋章）。

v3.3（AI 生成改 Gemini 直連）：生成句與 NHK 文章中文對照改由 **App 直接呼叫 Gemini**
（`lib/llm.ts`），不再經 sidecar——手機免內網穿透即可用。金鑰/模型存裝置本機 localStorage
（設定頁「AI 生成（Gemini）」卡）。CORS 對策：原生走 Capacitor `CapacitorHttp`（繞 WebView CORS），
web 走 fetch。無金鑰 → 生成走離線示範、文章僅原文＋注音。NHK 文章「抓取＋注音」（`/article/list`
`/article/get`）仍走 sidecar；sidecar 的 `/content`、`/article/annotate` 端點保留但前端不再呼叫。

v3.4（N5 模擬測驗）：從已學詞彙卡自動出題（意味/語彙/聽力/重組四型，`lib/quiz.ts` 純函式），
計分＋弱項分析（答錯詞存 Dexie v5 `quizResults`，跨紀錄聚合最常錯的詞）。題目全來自已驗證資料、
不經 LLM，天然無正確性風險。入口：今日頁「📝 N5 模擬測驗」。

v3.5（朗讀逐字上色）：朗讀時日文逐字卡拉OK上色——TTS 提供 boundary 回呼
（Web Speech `onboundary`／原生 `onRangeStart`），`lib/karaoke.ts` 對齊 cleaned 索引，
`components/Karaoke.tsx` 逐字上色。套用於口說、今日ひとこと、短文純假名行（含 ruby 的漢字
顯示與 VOICEVOX blob 不逐字上色）。中文不逐詞（缺對齊資料）。卡拉OK播放唸假名（與顯示對齊）。

v3.6（AI 助教 + vocab i+1）：**AI 助教**（今日頁「🤖 AI 助教」，`views/TutorView.tsx`）——
Gemini 多輪對話（`lib/llm.ts` `chatGemini`），system prompt grounding 在使用者已學詞彙、
要求用學過的詞舉例、不杜撰重音、每則以「僅供參考」結尾；**永不寫入學習資料庫**（純對話、不持久化）；
無金鑰時提示去設定填。**vocab i+1**：生成句的 known_words 改用 `content.ts personalKnownWords()`
（實際 FSRS 學過的 vocab 卡，太少時補基礎詞），讓「每句 ≤1 新詞」貼合個人進度；覆蓋率檢核
仍用全 N5 詞庫做超綱把關。

v3.7（聽力理解）：耳の修行新增「聞き取り」模式（`lib/listening.ts` 純函式出題）——聽一句
對話／情境句、選中文意思、答後揭曉日文。題庫用已驗證的例句＋情境短文每一行（jp＋zh），
不經 LLM。完成一輪同樣計入每日「耳」任務。

v3.8（段落聽解 + 短文分類）：聞き取り再分「句子（5題）／段落（3題）」——段落聽整段對話
後回答大意/場景（`data/passages.ts` 每篇 `quiz` 題，答案由內容直接支持；`pickParagraphs` 純函式）。
短文加 `cat`（基礎/旅遊/生活/商業），読む頁依情境分組（`PASSAGE_CATS`）。

v3.9（JLPT 聴解題型）：聞き取り重構為貼近 JLPT N5 四大題型選單——句子聽解（ポイント理解）、
段落對話（課題理解）、**即時応答**（聽短問／招呼選恰當回應）、**発話表現**（看情境選該說的日文）。
新增兩型題庫在 `data/kaiwa.ts`（`RESPONSES`／`EXPRESSIONS`，全是最基本固定表現＝挨拶/定型句，
textbook 標準、無 pitch/複雜敬語、零正確性風險；誘答也是真實日文句），出題純函式
`lib/listening.ts` `responseQuestions`／`expressionQuestions`。**即時応答/発話表現照真考試用 3 選項**
（課題理解/ポイント理解才 4 選項）。完成同樣計入每日「耳」任務，不經 LLM。
版權注意：**JLPT 官方考古題不公開釋出且有版權，一律不得抓取／內建**；只能自製「題型」形式、內容用已驗證資料。

v3.10（AI 段落理解題，LLM 只生中文）：聞き取り選單加「🤖 用 AI 出更多段落理解題」——
Gemini **只生「中文問題＋中文選項」**、疊在**已驗證短文**上（日文題材＝`data/passages`，不由 LLM 生／改寫），
純解析 `lib/llmParse.ts` `parseListenQuestions`（容錯：只收問題非空、選項 3~4 互異、正解在選項內），
生成走 `content.ts generateListenQuestions`（system prompt 要求答案由內容直接支持）。**採用才入庫**
（Dexie v6 `userListenQ`，綁短文 id），`ListenView` 的段落池 `buildParaPool(userQs)` 併入採用題
（同段音檔可對多題）。這是 Dof 選的責任分工：正確性由使用者能自審的**中文**把關，日文交給已驗證來源。
無金鑰 → toast 提示去設定。

v3.11（情境會話＋漢字注音）：使用回饋四項。①**情境對話引導**（話す分頁「会話」，
`data/dialogues.ts` 7 段×8 句：店員×2/家人/情人/同學/朋友/廠商，全假名 textbook 基本句、
`views/DialogueView.tsx` 逐句引導——對方句自動朗讀、輪到你唸完按下一句，計入「口」任務）。
②N5 測驗聽力題**答完顯示日文對照**（QuizView，漢字モード附注音）。③④**漢字モード語義反轉**：
原「隱藏振り仮名的進階挑戰」改為「漢字＋假名注音並列」（初學者也能唸）——新純函式
`lib/furigana.ts` `alignFurigana(display, reading)` 用 regex 回溯把已驗證的 `alt`/`kanji`（漢字正寫）
與 `jp`（假名）自動對齊成 ruby 分段（比對忽略標點；不經 LLM、不人工標，正確性由
「重組必須還原原字串」的測試對全 SENTS/VOCAB 保證），`components/Ruby.tsx` 渲染（純 React 元素，
無 innerHTML）。套用：詞彙卡正面、読む單字帳、跟讀句、今日ひとこと、聞き取り揭曉、測驗聽力揭曉。

v3.12（專屬 Logo）：App 圖示為鳥居設計——藍夜空圓角方章＋朱紅明神鳥居＋通往鳥居的參道
（呼應 App 名「日本語の道」）。`public/favicon.svg` 為設計源，`scripts/gen-icons.mjs` 重生成 PWA／
Android 圖示；Android adaptive 背景色為藍（光柵 mipmap 前景需本機跑 `@capacitor/assets`）。

v3.13（假名書寫練習＋字形評分）：かな道場加「✍ 書寫練習」——Canvas 手寫，描紅（照範本）／
空白默寫兩模式，按評分算**字形相似度**（`lib/handwriting.ts` 純函式：範本 grid 與筆跡 grid 各膨脹後
算 precision/recall→F1×100，塗滿整格會被 precision 壓分、不能作弊）。**誠實標示「形狀參考、非筆順評分」**
（無筆順資料）。範本與筆跡由 `WriteView` 光柵化到 32×32 grid（離屏 canvas 讀 alpha）。
最佳分存 Dexie v7 `writeScores`（每字元 best/attempts）。不併入每日五修行（獨立練習）。

v3.14（詞庫擴充）：`data/vocab.ts` 191→299 詞（+108 常用 N5，逐條確認讀音/釋義、furigana 可還原），
新增分類 `自然`／`交通`。純內容擴充，天然餵養 vocab FSRS 解鎖、N5 測驗出題、聞き取り題庫、
漢字注音——不動邏輯。

v3.15（實機修正）：①書寫描紅範本被格線層（`.writeGuide`，不透明和紙底）蓋住——`WriteView`
把格線層排到範本層 `.writeGhost` 之前（DOM 順序＝繪製順序），e2e 加層級守衛。②Android 桌面
mipmap 圖示直接以 `scripts/gen-android-icons.mjs`（Chromium 渲染鳥居）產出各密度
`ic_launcher*.png` 並提交，**不再依賴本機 `@capacitor/assets`**；adaptive 前景為朱鳥居、背景藍。
`npm run gen:android-icons` 可重生成。

v3.16（漢字書寫練習）：`WriteView` 加第三字集「漢字」——字集 `data/kanjiWrite.ts WRITE_KANJI`
取自**已驗證的 VOCAB 單漢字詞**（60 個，讀音/釋義沿用 vocab，不新增未驗證資料），沿用
`lib/handwriting.ts` 字形相似度評分與描紅/空白默寫；eyebrow 顯示「讀音・釋義」、🔊 唸 vocab 讀音。
（原想做筆順動畫，但無筆順資料、且此環境查證受限——維持「字形參考、非筆順」誠實定位。）

v3.17（學習活動記錄＋統計）：每次練習記進 Dexie v8 `activityLog`（每日×每功能累計 count）——
五核心在 `repo.bumpTask` 自動記，選配（write/quiz/pitch）在各 view 直接 `logActivity`。
`lib/activity.ts` 純函式聚合（totalsByDay/Feature、calendarCells、heatLevel）。`ProgressView`
加「学習記録」：連續天數＋練習日曆 heatmap（近 70 日、`.heatGrid`）＋各項目累計條。
每日修行維持 5 核心（會話→口、聞き取り→耳 早已計入）；書寫/測驗/重音為**今日頁「+α 選配」、不卡蓋章**
（`todayActivityFeatures` 顯示今日已練打勾）。時間追蹤刻意不做（習慣型 App 用「有沒有練/幾次」更實）。

v3.18（實機 UI 微調，使用回饋三項）：①**標題安全區**——`.appHeader` 頂端 padding 併入
`env(safe-area-inset-top)`，避免主畫面標題被手機系統狀態列（時間/電量/瀏海）蓋住；同時移除
英文副標「NIHONGO NO MICHI」（避免窄機換行）。②**聞き取り不再自動跳題**——四型題（句子/段落/
即時応答/発話表現）答完不再用 setTimeout 自動前進，改由答後出現「下一題 →／完成 ✓」按鈕，
**日文對照停留到使用者確認**（回饋「日文一下子就跳掉」）；辨音道場維持快速自動重播（無日文釋義可讀）。
③**聽力分類主題中文化**——`LISTEN_MENU` 四型標題全改中文可讀（即時応答→即時應答、発話表現→情境表達；
句子聽解/段落對話原即中文），JLPT 官方題型名保留為右上小 tag（供考試對照）。純 UI／文案調整，不動題庫與正確性。

v3.19（読む短文選單中文主題）：延續 v3.18 ③——読む頁「読み物」的分級短文按鈕原本只顯示
日文標題（`p.title` 去掉 `（中文）`），初學者看不懂是哪個情境。改為**日文標題＋中文主題兩行**
（`ReadView` `passageLabel()` 解析 `壱 ─ じこしょうかい（自我介紹・全假名）`→ jp/zh/note，
`.passBtn`/`.passJp`/`.passZh` 兩行樣式）。純 UI，短文資料與 id 不動。

v3.20（移除 sidecar 相關前端 UI）：手機為主要使用場景、sidecar 需 5090＋內網穿透才連得到，
對手機使用者無用。**移除前端三塊 sidecar UI**：設定頁「語音設定（重新偵測 sidecar＋VOICEVOX 說話者）」、
「Sidecar 位址」卡，以及読む頁「時事読み物（NHK やさしいニュース 導入／審核／わたしの読み物）」。
設定頁只剩「AI 生成（Gemini）／顯示設定（漢字モード）／v1 匯入・v2 匯出」。**後端與降級架構全部保留**：
`lib/sidecar.ts`、`lib/articles.ts`、VOICEVOX/whisper provider、`store` 的 `reprobe`/`ttsName`、Dexie
`userPassages` 表都不動（桌機同源 `/api` 仍會自動偵測 VOICEVOX；跟讀評分仍走降級鏈）——只是前端不再
提供設定入口。刪 `e2e/articles.spec.ts`、拿掉 `app.spec.ts` 的「Sidecar 位址」與「語音來源顯示」斷言。

v3.21（文型ドリル・句型練習）：新增「一句多用」句型練習——固定 N5 教科書句型模板
（`data/patterns.ts` `PATTERNS`：〜をください／〜はいくらですか／〜はどこですか／〜がほしいです／
〜がすきです／〜へいきます）× **已學過的 vocab 詞**組成完整例句，每天重複、換不同單字
（「請給我咖啡・請給我飯糰・請給我果汁」）。組合器 `lib/patternDrill.ts` 純函式
（`candidatesFor`／`buildItem`／`itemsFor`／`dailyPattern`）：優先出 FSRS 學過的詞，太少時補該分類
基礎詞（初學者 fallback，畫面不空，同 `personalKnownWords` 精神）。句型與詞皆來自已驗證來源、
pre/post 純假名（故帶漢字的詞組出的 alt 必能 furigana 對齊，漢字モード安全，測試對全
PATTERNS×VOCAB 保證）——**不經 LLM，零正確性風險**。`cats` 只放「整類任一詞填入語意皆通」的句型
（不放需辨可吃/可喝的たべます/のみます，避免錯配）。UI：`views/PatternView.tsx` overlay——選句型、
換單字、TTS 慢/常速（逐字上色）、💡 用法提示；今日頁加「今日の文型」卡（每天輪替一個句型）＋
「+α 選配」🧩 文型ドリル 鈕。屬**選配練習、不卡蓋章**，練了 `logActivity('pattern')` 記入学習記録
（`activity.ts` EXTRA_FEATURES/FEATURE_LABEL 加 `pattern`＝句型）。

v3.22（文型ドリル強化：回想テスト＋更多句型/單字）：①**回想テスト模式**（PatternView 加
「🎯 回想テスト」切換）——只看中文題目、日文答案先隱藏，使用者先自己說出日文再「看答案」自評
（🔁 再一次／✅ 說對了）。**主動產出＝加深印象**（active recall 比被動複習記得更牢），同樣
`logActivity('pattern')`、不卡蓋章。②句型 6→12（新增 〜をおねがいします／〜はありますか／
〜があります／〜までおねがいします／〜にいきたいです／〜はたかいです，皆整類語意皆通、pre/post
純假名）。③`data/vocab.ts` 299→321（+22 常用 N5：食べ物 ジュース/おにぎり/すし/ラーメン等、
物 めがね/さいふ/けいたい等、場所 コンビニ/えいがかん等；含使用者點名的**果汁・飯糰**）——
逐條確認讀音/釋義、furigana 可還原，天然餵養句型池與各既有功能。純資料＋UI，不動組句/驗證邏輯。

v3.23（每日任務結構調整：加練輪替＋金印）：功能越來越多後的收斂——**守住 5 核心/10 分鐘門檻不變**
（低門檻優先），只在呈現與獎勵上做文章。①**今日の加練 每日輪替**（`TodayView` `EXTRAS` 陣列
＋`dayIndex % n` 輪替）：原本一排越長的 +α 按鈕改為每天主推一項（書寫→測驗→重音→文型），
「全部加練 ▾」可展開看全部（`showAllExtras`）——畫面清爽、每個選配都輪得到曝光。
②**金印**：核心五項蓋章日**又做了任一選配加練**→「済」印變金（`repo.extraActiveDays()` 回傳有加練的日子，
`TodayView` 與蓋章日取交集算 `goldenDates`，`.hanko.gold` 金色樣式）。純獎勵、**不動門檻**——沒加練照常蓋章、不扣分。
`repo` import `activity.ts EXTRA_FEATURES`（activity 為純函式、無循環）。e2e：`stamp.spec` 延伸驗證
「核心完成非金 → 做一項加練變金 → 重整保留」；`e2e/helpers.ts` 加 `openExtra`（展開全部加練再點），
`pattern`/`activity` spec 改用之。純 UI／獎勵，不動核心任務定義與蓋章判定邏輯。

v3.23.1（金印大印同步）：延續 v3.23 的金印——蓋章卡格子已會升金，但**完成核心五項當下的「大印
overlay 動畫」**（`components/ui.tsx BigStamp`）原本一律朱印。改為：`store.bump` 在蓋章當下若
`todayActivityFeatures()` ∩ `EXTRA_FEATURES` 非空即設 `lastStampGold`，`BigStamp` 據此上
`.bigStamp .inner.gold`（與 `.hanko.gold` 同一套金色）並顯示「金印」字樣。純呈現層、與蓋章格金印
判定同源。e2e `stamp.spec` 加：既有黃金路徑斷言大印非金；新增「蓋章前先加練 → 大印同步金印」。

v3.24（漢字筆順動画）：漢字書寫練習加「▶ 看筆順動画」——依**權威資料源 KanjiVG**（CC BY-SA 3.0）
逐畫描繪動畫，補上 v3.16 當時「想做筆順動畫、但無筆順資料」的缺口。新增 `data/kanjiStrokes.ts`
（只擷取本 app 60 個 `WRITE_KANJI` 用到的字之筆畫 SVG path，依官方筆順編號排序，附來源與授權註記；
**不經 LLM、不自行標註**——筆順正確性完全交給此資料源，符合「正確性交給權威來源」原則）；資料由
npm 套件 `@madcat/kanjivg`（KanjiVG 的 CC BY-SA 3.0 打包版）本機一次性擷取產生，**未加入專案相依性**
（`package.json` 不變，`kanjiStrokes.ts` 為純資料）。新增 `components/StrokeOrder.tsx`——SVG
`stroke-dashoffset` 逐畫動畫（純 CSS transition＋setTimeout 排程，無額外套件），有重播按鈕；
`WriteView` 漢字模式下顯示切換鈕與 KanjiVG 來源標註，未涵蓋到筆順資料的字（例如未來 VOCAB 擴充
新增的單漢字詞）會自動不顯示按鈕（降級不中斷）。純呈現層動畫＋一份可驗證的權威資料，不動書寫評分邏輯。

測試：`npm test` 176/176（對真原始碼，含新增 5p 漢字筆順資料完整性檢核：60 字皆有筆順、
每畫皆為合法 SVG path 且互不重複）、`npm run test:e2e` 49/49（Playwright 瀏覽器點按，
新增 write.spec 筆順動画展開/收起／SVG 出現一項；sidecar 與 Gemini API 以 page.route 攔截）、
`sidecar/test_score.py` 4/4＋`test_article.py` 13/13、`npm run build` strict 綠燈。
詳見 `tests/INTEGRATION_REPORT.md`。

v3.25（漢字筆順「順序」粗略比對，ROADMAP #3 續做）：v3.24 的筆順動畫只是示範播放，這次
接著把已下筆的內容也拿來對照——新增 `lib/strokeOrder.ts` 純函式：從 KanjiVG 每一畫的 path
取「起筆點」座標（`strokeStart`／`refStrokeStarts`，正規化到 0..1），與使用者 `WriteView` 本來
就會依畫記錄的 `strokesRef`（每一筆畫獨立陣列，先前只用來光柵化，這次順便拿來比對）逐筆做最近點
配對，再用最長遞增子序列（LIS）判斷「下筆順序」是否符合官方筆畫編號（`judgeStrokeOrder`）。
**誠實定位維持不變**：只比對起筆點順序，不比對筆畫方向／彎曲路徑，所以評分後另外顯示一行獨立的
「筆順」提示（✓ 符合官方筆順／△ 順序不同／筆畫數不同），與既有「字形相似度」分數並列但不混為一談
（呼應 ROADMAP 提醒的「文案需誠實區分筆順評分 vs. 字形參考」）。只在漢字模式且該字有 `KANJI_STROKES`
資料時計算；**不寫入 Dexie**（單純即時回饋，不動 schema／`writeScores`，維持小增量）。
不經 LLM、零正確性風險（比對邏輯是幾何運算，資料仍全部來自 KanjiVG）。

測試：`npm test` 187/187（新增 5q 筆順順序比對：正向/反向/筆畫數不符/未下筆四種情境＋全部
`KANJI_STROKES` 起筆點可解析無 NaN 的資料完整性檢核）、`npm run test:e2e` 50/50（write.spec 新增
「只畫一筆評分 → 顯示筆順筆畫數不符提示」）、`npm run build` strict 綠燈。

v3.26（漢字筆順「行筆方向」粗略比對，ROADMAP #3 續做）：v3.25 只比對起筆點順序，這次接著補上
ROADMAP 點名的「筆畫方向」——`lib/strokeOrder.ts` 新增 `pathEnd`（解析 KanjiVG path 的 M/C/S/c/s
命令走到收筆的絕對座標）與 `strokeVector`（該畫「起筆→收筆」向量），`judgeStrokeOrder` 對每個已配對
的使用者筆畫，用向量 cosine 相似度和範本畫比對，回傳 `directionScore`（0-100）與
`directionVerdict`（match／rough／mismatch／unscored）。**誠實定位延續 v3.25**：只比對起訖點連線
方向，不比對彎曲路徑本身，所以 `WriteView` 在既有「筆順」提示下方**另開一行**「方向」提示
（✓ 大致相符／△ 有落差／✗ 明顯不同，可能寫反方向），與「筆順」「字形相似度」三者並列但不混為一談，
提示文案皆標「僅供參考、非精確路徑評分」。不寫入 Dexie（沿用 v3.25 即時回饋、不動 schema）；
不經 LLM、零正確性風險（純幾何運算，資料仍全部來自 KanjiVG）。

測試：`npm test` 199/199（新增 5r 行筆方向比對：`pathEnd` 相對/絕對命令解析、依範本方向下筆→match、
反方向下筆→mismatch、單點下筆/未下筆→unscored 四種情境＋全部 `KANJI_STROKES` 方向向量可解析無 NaN
的資料完整性檢核）、`npm run test:e2e` 51/51（write.spec 新增「畫筆畫後評分 → 顯示行筆方向粗略提示」）、
`npm run build` strict 綠燈。

v3.27（段落聽解細節題，ROADMAP #5 續做）：聞き取り「段落對話」原本每篇短文只有一題大意／場景理解題，
這次加細節題（時間／數量／人物）補足 JLPT 課題理解常考的細節提問——`data/passages.ts` `Passage` 加
`detailQuiz?: PassageQuiz[]`（與既有 `quiz` 互補，可有多題），為 6 篇短文（じこしょうかい／まいにちの
しゅうかん／コンビニで かいもの／たのしい しゅうまつ／みちを きく／でんわで よやく）各加 1～2 題，
問法皆是「幾個／多少錢／幾點／第幾個」這類短文本身就直接寫明的細節（例如買了幾個飯糰、預約明天幾點）。
**正確性用程式驗證而非人工聲稱**：新增測試逐條核對每題的 `answer` 文字必須逐字出現在該篇 `lines` 的
`zh` 台詞拼接字串中，確保「答案由短文內容直接支持」不是空話。`views/ListenView.tsx` 的 `buildParaPool`
把 `detailQuiz` 的每一題攤平併入既有段落理解題池（與 `quiz`／AI 採用題同池），不新增 UI 分頁、沿用
「段落對話」既有畫面與隨機出題邏輯。不經 LLM、零正確性風險（純既有資料延伸＋程式驗證）。

測試：`npm test` 190/190（新增 5h 細節理解題結構＋逐字答案支持性檢核）、`npm run test:e2e` 50/50
（既有段落聽解測試涵蓋新題池、無需新增流程）、`npm run build` strict 綠燈。

v3.28（作答視覺回饋：進度條＋正解/錯解動畫）：使用者方向「動畫與視覺輔助」的小增量——App 內所有
「多題連續作答」流程（N5 模擬測驗、聞き取り四型、五十音音→字、五十音複習卡）過去只用文字
「第 n / total 題」呈現進度，這次加上共用的**動畫進度條**元件（`components/ui.tsx ProgressBar`，
純呈現、`role="progressbar"`＋`aria-value*`，寬度隨題號 `transition` 平滑過渡）套用到六處作答畫面
（`QuizView`、`ListenView` 的即時応答／発話表現／聞き取り／段落聽解、`KanaView` 的音→字挑戰與複習卡）。
另外選對/選錯選項（`.qopt.ok`/`.qopt.ng`，本來就用在同六處）加上**進場動畫**——答對輕微 pop-in、
答錯 shake 抖動、右上角動畫淡入 ✓／✗ 徽章，讓對錯回饋更直覺（純 CSS `@keyframes`，沿用既有全域
`prefers-reduced-motion: reduce` 一律停用動畫的無障礙開關，不需另外處理）。**純呈現層**：無新邏輯、
無新資料、不動 Dexie schema、零正確性風險——只加了共用元件與 CSS，六處呼叫端各一行改動。

測試：`npm test` 199/199（不受影響，純 UI 元件與 CSS，無純函式邏輯變動）、`npm run test:e2e`
（quiz.spec 新增進度條 `aria-valuenow` 隨題號更新、以及作答後 `.qopt.ok`/`.qopt.ng` 徽章出現的斷言）、
`npm run build` strict 綠燈。

v3.29（自由対話：AI 角色扮演，文字輸入版）：ROADMAP「🔴 互動深化」第 1 步——話す▸会話分頁
新增「🗣 自由対話（AI 角色扮演）」入口（`views/RoleplayView.tsx`）。**場景沿用已驗證的
`data/dialogues.ts`**（對象／情境／開場白皆取自固定腳本的第一句，所以對話第一句永遠是教科書等級
正確日文），但**沒有稿子**：你自己打日文 → Gemini 扮演對方即時回一句，並附一行中文小提示
（用詞恰不恰當、有沒有更道地的說法）。純邏輯抽 `lib/roleplay.ts`（`ROLEPLAY_SCENES` 由 DIALOGUES
推導、`buildRoleplaySystem` 組 system prompt 並 grounding 在 `personalKnownWords()` 已學詞、
`roleplayHistory` 把氣泡轉成 Gemini 多輪 contents、`MAX_TURNS`＝8 回合上限），回應解析放
`lib/llmParse.ts` `parseRoleplayTurn`（容錯：物件／含 ``` 圍欄的 JSON 字串／陣列取首，缺 zh/hint 補空，
解析不出回 null → toast 提示重說、輸入保留、對話不被污染）；`lib/llm.ts` 加 `chatGeminiJSON`
（多輪＋`responseMimeType: application/json`）。**定位比照 AI 助教 v3.6**：使用者主動觸發的一次性
互動，AI 生成日文**僅供參考、不寫入學習庫、不進 SRS、不計入每日蓋章**（純加練），故不走
`needs_review` 審核佇列。**無金鑰優雅降級**：只顯示「請去設定填金鑰」，固定腳本会話照常可用。
UI 沿用既有 `.dlgBox/.dlgBubble` 氣泡樣式，只加一個 `.dlgHint`（中文小提示）樣式。

測試：`npm test` 230/230（新增 5s 自由対話純邏輯：開場白逐字取自已驗證腳本、system prompt 帶入
場景/對象/已學詞且含「只輸出 JSON」「不要杜撰重音」紅線、歷史角色對映與 JSON 回填、回合上限、
`parseRoleplayTurn` 六種容錯情境）、`npm run test:e2e` 54/54（新增 `roleplay.spec.ts` 三項：無金鑰降級、
選場景→打字→AI 回話＋小提示＋回合數遞增、AI 格式壞掉時提示重試且輸入保留；Gemini 以 page.route 攔截）、
`npm run build` strict 綠燈。

v3.30（AI 助教「考我」模式）：ROADMAP「🔴 互動深化」第 2 步——`TutorView` 由單一聊天畫面改成
兩個分頁（`.lvTabs`）：**💬 問問題**（原有自由聊天，行為不變）與**🎯 考我**（新的主動產出練習）。
考我流程：助教給一個**中文情境題**（例「請給我這個」）→ 你自己用日文打一句 → 揭曉**教材參考答案**
並附 AI 中文講評。**責任分工是本次的重點**（延續 v3.10「LLM 只生中文」）：題目與參考答案
**全部來自已驗證資料**——`data/sentences` 的壱／弐級例句，加上 `data/patterns` × 已學 VOCAB 由
`lib/patternDrill` 組出的句型例句（每句型最多 3 題）——**日文一律不由 LLM 生成**；LLM 只負責用
**中文**講評你寫的那句（哪裡好、助詞可怎麼調），是使用者自己能判讀的語言。純邏輯抽
`lib/tutorQuiz.ts`（`sentencePrompts`／`patternPrompts`／`tutorPrompts` 出題、`pickPrompt` 抽題
不重複上一題、`buildQuizSystem`／`buildQuizUser` 組 prompt、`parseCritique` 解析開頭評價記號
✅／△／❌ → 徽章，沒照格式只是少徽章、講評照樣顯示）。
**降級不中斷**：無 Gemini 金鑰時「考我」照樣能練（出題 → 自己想 → 「看參考答案」自評），
只是少了 AI 講評——這也讓沒設金鑰的人第一次在助教頁有東西可練。**AI 講評僅供參考、不寫入學習庫、
不進 SRS、不計入每日蓋章**（比照 AI 助教 v3.6 的定位，故不走 `needs_review` 審核佇列）。
漢字モード開啟且參考答案有 `alt` 時用既有 `RubyText` 顯示注音。不動 Dexie schema、不動蓋章判定。
（與 v3.29「自由対話」為同期兩支獨立分支、各自延伸自 v3.28，互不依賴；v3.29 先合併，本版於分支上併入 main 後重跑全測。）

測試：`npm test` 262/262（新增 5t 考我出題與講評解析共 35 項：例句題只取壱／弐級且中文題目與
參考答案逐字對照 `data/sentences`、句型題可由「句型模板×已驗證詞」還原、每句型上限 3 題、
抽題不重複上一題／邊界 rng／空題庫、prompt 含已學詞與「不要杜撰重音」紅線、`parseCritique`
八種容錯情境）、`npm run test:e2e` 56/56（tutor.spec 新增兩項：無金鑰也能出題→看參考答案→換一題；
有金鑰作答→中文講評＋✅ 徽章＋參考答案揭曉）、`npm run build` strict 綠燈。

v3.31（跟讀＋即時追問）：ROADMAP「🔴 互動深化」第 3 步——`SpeakView` 跟読分頁在例句卡下方新增
「追問 ─ AI に聞かれる」卡（`components/FollowUp.tsx`）：跟讀完一句**已驗證教材例句**後按
「🤖 追問一句」，Gemini 針對**那句的情境**追問一句簡單日文（N5、15 字內、以平假名為主），
你必須**臨場自己組句**打日文回答（沒有稿子），再拿到一段**中文**講評（沿用
`lib/tutorQuiz parseCritique` 的 ✅／△／❌ 徽章）。純邏輯抽 `lib/followUp.ts`
（`buildAskSystem`／`buildAskUser` 追問 prompt、`parseFollowUpQuestion` 容錯解析——物件／含 ```
圍欄的 JSON 字串／陣列取首，缺 `zh` 補空、缺 `jp` 回 null → toast 提示再按一次；
`buildReplySystem`／`buildReplyUser` 講評 prompt，明說「這題沒有標準答案」故評的是通不通、
不與某個參考答案比對；`MAX_FOLLOWUPS`＝同一句最多追問 3 次）。**定位比照 v3.6／v3.29／v3.30**：
使用者主動觸發的一次性互動，AI 生成的日文問句與講評**僅供參考、不寫入學習庫、不進 SRS、
不計入「口」任務與每日蓋章**（純選配加練，故不走 `needs_review` 審核佇列），卡片上有顯眼免責提示
並點明「上方教材例句才是已驗證的說法」。**無金鑰優雅降級**：整塊只顯示一行說明（去設定填金鑰），
跟讀、評分、自評降級鏈完全不受影響。換下一句例句時追問區自動重置（追問綁在當下那句的情境）。
不動 Dexie schema、不動蓋章判定、不新增 CSS（沿用既有 `.card/.sent/.hint/.chip` 樣式）。

測試：`npm test` 289/289（新增 5u 追問純邏輯 27 項：prompt 帶入例句與已學詞、含「只問一句」
「不要換話題」「不要杜撰重音」「只輸出 JSON」紅線、`parseFollowUpQuestion` 十種容錯情境、
講評 prompt 說明沒有標準答案且記號格式接得上 `parseCritique`、user 訊息 trim 與無中文翻譯時
不產生空括號）、`npm run test:e2e` 58/58（speak.spec 新增兩項：無金鑰只顯示說明且自評照常可用；
有金鑰追問→作答→中文講評＋徽章→再追問次數累計→換句子後重置；Gemini 以 page.route 依呼叫序
分別回 JSON 追問句與純文字講評）、`npm run build` strict 綠燈。

v3.32（文型ドリル「自由造句」：程式檢核＋AI 中文講評）：ROADMAP「🔴 互動深化」第 4 步——
`PatternView` 由兩模式加為三模式（`.modeRow` 加「✍ 自由造句」）：練習／回想テスト都是「填給定的詞」，
自由造句則是**自己挑一個詞**、用該句型打出完整日文句子。責任分工是本次重點（延續 v3.10／v3.30）：
**句型骨架與填空詞由程式檢核**（新純函式 `lib/patternCompose.ts`）——`normJa` 正規化（去空白與句讀，
讓「みずをください。」與「みず を ください」等價）、`checkShape` 判斷句型接續 `pre`/`post` 是否落在
正確位置並抽出中間填入的部分、`lookupVocab` 以**假名或漢字正寫**查已驗證 `data/vocab`（故「水を ください」
也認得出是「みず」）、再標記該詞是否已 FSRS 學過與是否落在此句型允許的分類；`shapeSummary` 產出一句話
中文摘要。**純字串比對、零正確性風險，且無 Gemini 金鑰時照樣有回饋**（降級不中斷——這是刻意的設計，
讓沒設金鑰的人也真的能練「自由產出」）。LLM 只負責用**中文**講評自然度與助詞（`buildComposeSystem`／
`buildComposeUser`，講評沿用 `tutorQuiz parseCritique` 的 ✅／△／❌ 徽章），且 user 訊息會把程式檢核結果
一併帶入。定位比照 v3.6／v3.29／v3.30／v3.31：**僅供參考、不寫入學習庫、不進 SRS、不計入蓋章**
（選配加練，練了 `logActivity('pattern')`），故不走 `needs_review` 審核佇列；講評卡有顯眼免責提示。
連線失敗時 toast 明說「上面的句型檢核仍然有效」。不動 Dexie schema、不動蓋章判定；CSS 只加 `.composeCk`。

測試：`npm test` 331/331（新增 5v 自由造句共 42 項：`normJa` 三種正規化、骨架正確／缺接續／接續位置錯／
只有接續沒填空／空作答／用錯句型六種情境、漢字作答可對回詞庫、詞庫外的詞「句型仍算對但不宣稱該詞」、
分類外的詞可偵測、**全 PATTERNS×詞池組出的每一句（含漢字寫法）送回 `checkShape` 皆須通過自我檢核**
的一致性驗證、摘要四情境皆非空、prompt 含已學詞與「不要杜撰重音」「允許自由挑詞」紅線與例句上限 3 句）、
`npm run test:e2e` 60/60（pattern.spec 新增兩項：無金鑰時用錯句型→接續檢核標紅、再造一句→清空、
正確造句→兩行皆綠且認出填入的詞＋記入学習記録；有金鑰時額外出現中文講評＋✅ 徽章＋免責提示）、
`npm run build` strict 綠燈。

v3.33（自由対話「用說的」：語音輸入）：ROADMAP「🔴 互動深化」第 5 步（語音來回對話）的**第一個子步驟**——
自由対話（`RoleplayView`）原本只能打字，這次補上麥克風輸入，湊成「聽 AI 說（TTS 早已有）→ 自己說回去」
的口語來回。純邏輯抽 `lib/voiceInput.ts`（`cleanSpoken` 空白正規化含全形空白／換行、`pickBestAlternative`
從 ASR 候選取第一個非空者——自由對話沒有目標句可比對，故不像跟讀那樣用 `similarity` 挑最像的、
`mergeSpoken` 把辨識結果併進輸入框既有內容以支援「先打一半再用說的補／連說兩次」、`voiceErrorMessage`
把 ASR 錯誤碼轉成繁中提示且一律附「可以改用打字」退路）；`audio/scorer.ts` 新增
**只轉寫不評分**的 `recognizeSpeech()`（web SpeechRecognition ▸ 原生 Capacitor ASR，沿用既有降級鏈）
與 `speechInputAvailable()`；共用元件 `components/VoiceInput.tsx`（麥克風鈕，之後助教「考我」／跟讀追問
要接語音回答時可直接複用，一行搞定）。
**誠實定位是本次重點**：語音辨識**會聽錯**（尤其初學者發音），所以辨識結果**只填進輸入框、不自動送出**，
使用者確認／修改後才按「送る」——避免辨識失誤污染對話紀錄，也讓使用者看得到系統「聽成什麼」。
**降級不中斷**：偵測不到語音辨識能力（`speechInputAvailable()` false）時整顆麥克風鈕不顯示，打字路徑完全不變。
不動 Dexie schema、不動蓋章判定、不新增 CSS（沿用既有 `.btn small ghost`／`.row`／`.sub`）。

測試：`npm test` 354/354（新增 5w 語音輸入純邏輯 23 項：三種空白正規化、候選挑選跳過空值／全空／無候選、
併入輸入框五情境、錯誤訊息八種錯誤碼皆有中文且未知碼帶出原碼、「除取消外一律提供打字退路」的全碼掃描）、
`npm run test:e2e` 63/63（`helpers.ts` 新增 `fakeSpeechRecognition` 注入假 `window.SpeechRecognition`；
roleplay.spec 新增三項：說兩次→併進輸入框且未自動送出→確認後才送出、沒聽到聲音→toast 提示且輸入不被清掉、
無語音辨識環境→不顯示麥克風鈕且打字照常）、`npm run build` strict 綠燈。

v3.34（口說作答擴散到三處 AI 練習）：ROADMAP「🔴 互動深化」第 5 步的**第二個子步驟**（也一併結掉
第 2 步的①與第 3 步的①「口說作答」）——v3.33 抽好的共用元件 `components/VoiceInput.tsx` 複用到另外
**三處作答輸入**：AI 助教「🎯 考我」（`views/TutorView.tsx` `TutorQuiz`）、跟讀後的即時追問
（`components/FollowUp.tsx`）、文型ドリル「✍ 自由造句」（`views/PatternView.tsx`）。這三處本來都只能
打字，但它們的練習目的**本來就是「自己產出日文」**（看中文情境題自己說、被追問後臨場回答、自己挑詞造句），
用說的比打字更貼近真實口語場景，也省去初學者在手機上切日文輸入法的門檻。
**刻意沿用 v3.33 立下的規矩，不另創新行為**：①辨識結果**只 `mergeSpoken` 併進輸入框、不自動送出**
（ASR 會聽錯，讓使用者看得到系統聽成什麼並可改）；②送出／揭曉答案後麥克風鈕退場（三處一致：
考我 `!revealed`、自由造句 `!check`、追問則跟著問句在時顯示）；③`speechInputAvailable()` false 時
整顆鈕不顯示，打字路徑完全不變（**降級不中斷**）。
**純呈現層複用**：無新純函式、無新 CSS、不動 Dexie schema、不動蓋章判定、不動任何 AI prompt 與
既有降級鏈——每處只是 import `VoiceInput` + `mergeSpoken` 各一行掛上去。

測試：`npm test` 354/354（不受影響，本次無新純函式邏輯——`lib/voiceInput.ts` 的 23 項於 v3.33 已涵蓋）、
`npm run test:e2e` 67/67（新增 4 項：tutor.spec「考我用說的，說兩次→併進輸入框→未自動揭曉答案→
確認後才送出、送出後麥克風退場」與「無語音辨識環境不顯示麥克風鈕、打字作答照常」；speak.spec
「追問可以用說的，填進輸入框後未自動送出→確認後才有講評」；pattern.spec「自由造句用說的，
說兩次→未自動檢核→送出後程式檢核通過（無金鑰也有回饋）」）、`npm run build` strict 綠燈。

v3.35（AI 互動練習記入学習記録＋金印）：v3.29–v3.32 四項 AI 互動練習（自由対話／助教「考我」／
跟讀追問／文型自由造句）都各自留了同一個「可續做」——**練了不算數**：`activityLog` 沒記、成長頁
看不到、也不影響金印。這次一次結掉：`lib/activity.ts` `EXTRA_FEATURES` 由 4 項擴為 7 項，新增
`roleplay`（自由対話）／`tutor`（助教考我）／`followup`（跟讀追問）三個 feature key
（自由造句早已併在 `pattern` 底下計數，維持不動），三處在使用者**產出一句日文**的當下
`logActivity`——`RoleplayView` AI 成功回話後、`TutorView TutorQuiz.submit()` 揭曉答案時
（**無金鑰也記**，因為沒金鑰照樣是「自己造句 → 對參考答案」的完整練習）、`components/FollowUp.tsx`
送出回答時（在呼叫 Gemini 之前——講評連線失敗不該抹掉「你已經練過了」）。
**順手把金印判定抽成純函式**（原本 `repo.ts` 與 `store.ts` 各寫一次 EXTRA_FEATURES 比對）：
`activity.ts` 新增 `featureGroup()`（core／extra／other）、`hasExtraFeature()`（大印升金用）、
`extraDays()`（蓋章格金印用，`repo.extraActiveDays` 改為薄包裝）、`groupTotals()`（核心／加練／
其中 AI 互動的累計），`store.ts`／`repo.ts` 改呼叫之——**判定行為不變，但變成可被 Node 測試**。
UI：①今日頁「今日の加練」輪替由 4 項增為 6 項（加 🗣 自由対話、🎯 助教考我；追問綁在跟読流程內、
無獨立入口，故不進輪替但照樣記錄）；②「🗣 自由対話」是唯一需要繞路的入口，故 `App` 加 `speakTab`
狀態、`SpeakView` 加 `initialTab` prop，讓今日頁點下去**直接落在話す▸会話分頁**（一般 nav 切換
仍一律回「跟読」）；③`ProgressView`「学習記録」加「核心 n・加練 m」與「AI 互動練習 k」統計 chip
（`groupTotals`），各項目累計條自動長出三個新項目。
**刻意不動的部分**：每日 5 核心／10 分鐘蓋章門檻不變（新增的都是選配加練、不卡蓋章）；AI 生成的
日文與講評仍**僅供參考、不寫入學習庫、不進 SRS**——這次記的是「你練了幾次」這個行為統計，
不是 AI 的產出內容。不動 Dexie schema（沿用 v8 `activityLog`，新 feature 只是新的字串值）。

測試：`npm test` 379/379（新增 5x 分組與金印判定共 25 項：核心/選配不重疊與 key 不重複、三個
AI feature 都在 `EXTRA_FEATURES` 內、每個 feature 都有**不重複**的中文標籤、`featureGroup` 三種
分組含未知 feature 不誤判、`hasExtraFeature` 五情境、`extraDays` 四情境（count 0 與未知 feature
不入列）、`groupTotals` 六情境（AI ⊆ 加練、空輸入全 0））、`npm run test:e2e` 69/69（activity.spec
新增兩項：「今日頁→🗣 自由対話直接落在会話分頁→聊一回合→記入 activityLog→今日加練打勾→
統計頁出現『自由対話』累計條與 AI 互動練習 chip」、「助教考我作答（無金鑰）→記入 activityLog→
口の修行仍 0/3、今日未蓋章」；speak.spec 追問測試延伸驗證 `followup` 有記錄且「口」任務不受影響；
`e2e/helpers.ts` 抽出共用的 `activityCount()`）、`npm run build` strict 綠燈。

v3.36（五十音圖一覽表）：使用者指定——かな頁加「📋 五十音圖」查閱表（`components/KanaChart.tsx`），
**平假名／片假名 × 清音／濁音／拗音**六種組合，每格假名下方附羅馬字，有欄標（A I U E O，
拗音為 YA YU YO）與列標（`_` K S T N H M Y R W／`n`；濁音 G Z D B P；拗音 KY SH CH NY HY MY RY
GY J BY PY），點一格唸一次、「▶ 播放全部」依序朗讀可中途「■ 停止」，另有「📇 用單字卡練習」
直接開始 FSRS 一輪。
**正確性策略是本次重點：整張表不手打任何假名或讀音**——純函式 `lib/kanaChart.ts` 全部從已驗證的
`data/kana.ts` 推導：①清音／濁音格由索引取出（`KANA` 前半平假名、後半片假名，**同索引＝同一個音**，
測試逐枚驗證這個配對；注意 `ro` 不唯一——じ/ぢ 同為 ji、ず/づ 同為 zu，所以必須用索引配對而非
羅馬字查表）；②**拗音由規則推導**（い段假名＋小寫 ゃ/ゅ/ょ；羅馬字＝基底去掉字尾 i 的詞幹，詞幹為
sh/ch/j 時直接接母音成 sha/cha/ja，其餘接 y＋母音成 kya/nya/hya），`yoonRomaji`／`yoonRowKey`
兩個純函式各自有測試釘住規則（開發中這組測試就抓到一個真 bug：`hi` 的詞幹是 `h`，原本的
`endsWith('h')` 判斷會誤推成 `ha`，改為明列 `['sh','ch','j']`）。ぢ 行拗音依慣例不入圖。
**刻意不動 SRS 卡組**：`data/kana.ts` 的 `KANA` 維持 142 枚（拗音只在這張查閱表出現、`id` 為 null、
不進 FSRS，UI 也明說「不列入每日修行」）——不改動每日修行範圍，也不影響 `vocabGate` 的解鎖判定。
清音／濁音格會用底線顏色標你的修行進度（藍＝已學、綠＝定著），拗音格因無卡片故不標記。
CSS 新增 `.kanaChart` 系列（沿用既有 `--washi2`／`--ai`／`--take`／`--shu` 色票與 `.lvTabs` 分頁樣式）。

測試：`npm test` 414/414（新增 5y 共 35 項：平片假名同索引同音的逐枚配對、清音 46／濁音 25／
拗音 33 的格數與列標順序、や行わ行空格與 ん 單獨一列、拗音羅馬字五組規則、拗音每格＝い段＋小假名
且基底可回查 `KANA`、不含 ぢ 行、拗音 id 為 null 而清音濁音每格都對得回卡片 id、播放順序與
`charOf` 取字、三組字皆不重複、「清音＋濁音＝KANA 一半且總數仍 142」的卡組未被更動守衛）、
`npm run test:e2e` 72/72（新增 `kana-chart.spec.ts` 三項：清音表欄列標與平↔片切換、濁音／拗音分頁
格數與內容含拗音三欄、點格子唸一次＋播放全部可停止＋用單字卡練習進入 FSRS——TTS 攔在
`window.speechSynthesis` 層記錄唸過的字）、`npm run build` strict 綠燈。

v3.37（考我題源擴充：固定表現＋題源分頁）：ROADMAP「🔴 互動深化」第 2 步的③——AI 助教
「🎯 考我」的題庫原本只有 `data/sentences` 壱／弐級例句與 `data/patterns`×已學詞組出的句型題，
這次把 **`data/kaiwa` 的発話表現／即時応答也接成考我題源**（`lib/tutorQuiz.ts` 新增
`kaiwaPrompts()`）：発話表現直接以既有中文情境當題目（「吃飯前，要開動了。這時候說：」→
いただきます），即時応答則把已驗證的日文原句與中文對照包成題目（「對方說「ありがとう ございます。」
（謝謝您）你要怎麼回？」）。這兩份本來就是最基本的挨拶・定型句，**答案唯一、textbook 標準**，
比開放式造句更適合初學者練「主動說出來」。
**刻意排除答案依個人情況而異的四題**（名字／時間／價格／出身地——`data/kaiwa.ts` `ResponseItem`
新增 `openEnded?: boolean` 標記，資料層說清楚原因）：當四選一聽解題沒問題（誘答是答非所問），
但當造句考題會逼學習者去猜資料裡的範例答案。**這是資料層的欄位、不是程式裡的黑名單**，
測試逐條核對「標了 openEnded 的都不在考我題庫、沒標的都在，且題目與答案逐字取自 `data/kaiwa`」。
另加**題源分頁**（`SOURCE_TABS`＋純函式 `filterPrompts`，`TutorView` 的考我卡上方 `.lvTabs`
四鍵「全部／例句／句型／固定表現」）：預設「全部」＝維持原本混著出的行為，想專練招呼語就切過去；
切題源會立刻換到該題源的題目並重置作答狀態（不會停在上一個題源的題上）。講評 prompt 也跟著分工——
`buildQuizUser` 對固定表現題多加一行「這類說法基本上只有一種，請直接指出對不對、不必鼓勵他另創說法」
（否則 system 第 (4) 條「別種說法只要正確也算對」會讓 AI 對挨拶語亂鼓勵）。
**定位不變**：題目與參考答案全部來自已驗證資料、日文不經 LLM；AI 只用中文講評，僅供參考、
不寫入學習庫、不進 SRS、不卡蓋章；無金鑰照樣能「出題→自己說→看參考答案自評」。
不動 Dexie schema、不動蓋章判定、不新增 CSS（沿用 `.lvTabs`）。

測試：`npm test` 429/429（新增 5t 延伸 15 項：固定表現題逐字對照 `EXPRESSIONS`／`RESPONSES`、
`openEnded` 四題確實被排除、題庫＝例句＋句型＋固定表現、`SOURCE_TABS` key 唯一且三個題源
「加總＝全部」無漏無重、篩出的題目 source 一致、固定表現題的講評 prompt 有額外註記而例句題沒有）、
`npm run test:e2e` 73/73（tutor.spec 新增一項：切到「固定表現」連換四題 chip 都是情境表達／即時應答、
無金鑰看參考答案照常、切回「句型」題源換掉且作答狀態重置）、`npm run build` strict 綠燈。

v3.38（会話走完一段後的追問）：ROADMAP「🔴 互動深化」第 3 步的④——原本只有跟読分頁的例句
才有「追問」，這次把同一塊搬到**会話（情境對話引導）走完一整段之後**：AI **扮演對話中的那個對象**、
在同一個場景再問你一句，你臨場自己組句回答（沒有稿子），再拿到中文講評。
`components/FollowUp.tsx` 由「吃一句例句」改成吃一個 `FollowUpTopic`（純函式 `lib/followUp.ts` 新增
`FollowUpKind`＝`sentence`／`dialogue`、`buildDialogueAskUser`（把場景／對象／整段已驗證腳本的每句
jp＋zh 組成 user 訊息）、`sentenceTopic`／`dialogueTopic` 兩個包裝器，`topic.id` 帶題材前綴供換題材時
重置），`buildAskSystem(known, kind)` 只換掉「情境從哪來」的兩句描述——**共用紅線一字不動**
（只問一句／N5 15 字內／不要換話題／不要杜撰重音／只輸出 JSON），講評 prompt 兩種題材完全共用。
`SpeakView` 改傳 `sentenceTopic(sent)`（行為不變），`DialogueView` 的 `DialoguePlay` 在 `done` 時
於卡片下方掛上 `<FollowUp topic={dialogueTopic(dlg)} />`。文案依題材切換（免責提示指向
「上方的對話腳本才是已驗證的說法」）。
**定位比照 v3.31 完全不變**：AI 追問句與講評**僅供參考、不寫入學習庫、不進 SRS、不計入「口」任務
與每日蓋章**（純選配加練，記 `logActivity('followup')`——沿用既有 feature key，`EXTRA_FEATURES`
不變）；**無金鑰優雅降級**（只顯示一行說明，固定腳本対話流程完全不受影響）。不動 Dexie schema、
不動蓋章判定、不新增 CSS。

測試：`npm test` 450/450（新增 5z 對話題材追問 21 項：user 訊息帶入標題／場景／對象與**每一句**
jp＋zh 且標示誰說的、全部 `DIALOGUES` 都組得出含自己腳本的非空 prompt、對話版 system 有「扮演
對話中的那個對象」「延續那段對話的場景」且共用紅線齊全、不給 kind 時與例句版**完全相同**（舊行為
不變）、topic 包裝的 kind／askUser／id 前綴不互撞且同一題材重複組出一致）、`npm run test:e2e` 75/75
（helpers 新增 `completeDialogue`；speak.spec 新增兩項：無金鑰走完対話只顯示說明且完成畫面照常、
有金鑰走完対話→追問→回答→中文講評＋△ 徽章，並驗證 `followup` 有記錄而 `speak` 計數不因追問增加、
換場景後追問區收起）、`npm run build` strict 綠燈。

v3.39（追問接續多輪）：ROADMAP「🔴 互動深化」第 3 步的③——v3.31／v3.38 的追問**每次都是獨立的
一問一答**（AI 看不到前一輪，等於同一個情境被重新問三次）。這次改成**接續多輪的小型對話**：
純函式 `lib/followUp.ts` 新增 `followUpHistory(askUser, rounds)`（比照 `roleplay.ts roleplayHistory`）
把「題材＋已問答過的輪次」組成 Gemini 多輪 contents——第一則永遠是**已驗證素材**組成的
`topic.askUser`，之後每輪 model（追問句 JSON，與要求的輸出格式一致）＋user（`buildAnswerUser` 帶入
你的回答並要求「接著這個回答再問一句、不要重複問過的問題」）嚴格交替；沒回答就再按追問時，
以固定的 `FOLLOWUP_SKIPPED` 訊息維持交替（**不謊稱他回答了什麼**）。`buildAskSystem` 只加一條
「前面若已經有問答，請接著學習者剛剛的回答繼續問下去」，**共用紅線與講評 prompt 一字不動**；
沒有前輪時 history ＝只有第一則，與多輪化之前的行為完全相同（兩種題材共用）。
UI：`components/FollowUp.tsx` 由「只顯示當下那一題」改成**整串問答留在畫面上**（`Round[]` 狀態：
問句＋你的回答＋講評，輪與輪之間虛線分隔），回答送出時**先進畫面再呼叫 Gemini**（講評連線失敗也
留著——你確實已經自己組句回答過了），已回答的輪次收起輸入框與麥克風鈕（要往下走就按「再追問一句 →」）。
**定位比照 v3.31／v3.38 完全不變**：AI 追問句與講評僅供參考、不寫入學習庫、不進 SRS、不計入「口」
任務與蓋章（沿用 `followup` feature key，記錄時機也不變）；無金鑰照樣只顯示一行說明。
不動 Dexie schema、不動蓋章判定、不動 `MAX_FOLLOWUPS`（同一情境仍 3 輪）；CSS 只加
`.followUpRound`／`.followUpMine` 兩條。

測試：`npm test` 474/474（新增 5aa 多輪 history 組裝 24 項：無前輪時只有題材一則且與舊行為相同、
一輪後三則且 model 回合可被 `parseFollowUpQuestion` 還原、兩輪後五則且角色嚴格 user/model 交替、
每輪問答都在歷史裡、無空白訊息、未回答走 `FOLLOWUP_SKIPPED` 且不含「學習者的回答」、回答 trim、
對話題材首則＝整段腳本（全 `DIALOGUES` 掃描）、system 新增「接著問」規則但共用紅線一條沒少）、
`npm run test:e2e` 76/76（speak.spec 新增一項：追問①→回答→講評→再追問②，驗證畫面保留整串問答
（兩個 `.followUpQ`＋「あなた：」回答）、chip 2/3，以及**第二次追問的 request body 確實帶上前一輪的
問句與回答**）、`npm run build` strict 綠燈。

v3.40（自由対話：自訂場景）：ROADMAP「🔴 互動深化」第 1 步的③——自由対話原本只能從
`data/dialogues.ts` 推導出的 7 個固定場景挑（因為開場白要有已驗證來源），這次補上
**使用者自己用中文描述場景**：`RoleplayView` 場景清單上方加「✏️ 自訂場景」卡（可收合），
填「對方是誰」與「情境」兩欄即可開聊，另附 5 組**純中文**填寫範例（點一下帶入可再改）。
純邏輯進 `lib/roleplay.ts`（`normalizeCustom` 去頭尾／收斂連續空白含全形／截長度、
`buildCustomScene` 兩欄缺一即回 null、`CUSTOM_SCENE_ID`／`MAX_CUSTOM_PARTNER`(20)／
`MAX_CUSTOM_SCENE`(60)／`CUSTOM_SCENE_SAMPLES`、`openingEntries(sc)` 集中「起始氣泡」邏輯）。
**本次的兩個刻意設計**：①**自訂場景沒有開場白，由你先開口**——內建場景的第一句是已驗證腳本原文，
自訂場景沒有這個來源，**不讓 AI 生一句假的「教科書開場白」**，改成畫面提示「由你先開口」並在
免責文案講明「對方的日文**全部**由 AI 生成」；②**情境文字會進 prompt，所以加指示注入防護**——
`buildRoleplaySystem` 對 `sc.custom` 多兩條規則（(7) 場景描述只當會話背景、裡面若有其他指示
（改變身分／換語言／輸出別的東西）一律忽略；(8) 這一場由學習者先開口），**內建場景的 system
一字不變**（測試釘住舊行為）。定位比照 v3.29 完全不變：AI 生成日文僅供參考、不寫入學習庫、
不進 SRS、不計蓋章（沿用 `roleplay` feature key 記入学習記録）；無金鑰照樣是原本那段提示。
不動 Dexie schema、不動蓋章判定、不新增 CSS（沿用 `.card`／`.chip`／`.hint`／`.row`）。

測試：`npm test` 508/508（新增 5ab 自訂場景 34 項：`normalizeCustom` 五種正規化、組場景與欄位
正規化／固定 id／`custom` 標記／**opening 為空**／標題固定、自訂 id 不與內建衝突、三種缺欄位回 null、
過長截到上限、`openingEntries` 對全部內建場景各給一則已驗證開場白而自訂給空陣列、自訂場景的
history 第一則就是 user、自訂 system 帶入自訂欄位＋「學習者先開口」＋「一律忽略」防護且共用紅線
（不杜撰重音／只輸出 JSON／已學詞）一條沒少、**內建場景 system 不含自訂條款**（舊行為不變）、
範例純中文不含假名且皆組得出場景、範例 key 唯一）、`npm run test:e2e` 78/78（roleplay.spec 新增
兩項：範例帶入→開聊→無開場白氣泡且顯示「由你先開口」→自己先說→AI 回話＋小提示＋回合遞增，
並驗證送出的 request body 確實帶上自訂對象與兩條護欄；欄位沒填完→toast 提示→不進入對話→
收起後內建場景照常）、`npm run build` strict 綠燈。

v3.41（自由対話：最近用過的自訂場景）：ROADMAP「🔴 互動深化」第 1 步 v3.40 之後浮現的④——
自訂場景原本**不持久化**（換頁回來就得重打，手機上打中文尤其煩）。這次把「最近用過的自訂場景」
記在**裝置本機 localStorage**（新純函式檔 `lib/recentScenes.ts`，key `nihongo-michi:recentScenes`，
最多 5 筆），**刻意不進 Dexie**——這是使用者自己打的練習設定，既不是教材也不是學習進度，
不該跟著學習資料備份／遷移（比照 Gemini 金鑰與 sidecar 位址的做法，也是 ROADMAP 當初的建議）。
存的內容只有使用者填的**兩欄中文**（對象／情境），**AI 生成的對話本身一如既往不寫入任何地方**。
純邏輯：`sceneKey`（正規化後的比對鍵——只差空白不算新的一筆）／`parseRecent`（容錯解析：壞 JSON／
非陣列／欄位缺漏或型別不對／空白欄位一律過濾，並去重、截長度與筆數）／`serializeRecent`／
`addRecent`（最新在前、重複移到最前、超過上限丟最舊）／`removeRecent`，欄位一律走 `roleplay.ts`
的 `normalizeCustom` 與同一組長度上限，所以**記下來的每一筆都必然還原得出一個可用的自訂場景**
（有測試對全清單保證）。UI：`RoleplayView` 的 `CustomSceneForm` 卡片上顯示「最近用過」清單
（**收合狀態下也看得到**，一眼就能重用），每筆三個動作——「再聊一次 ▶」直接開聊、
「✎」帶回欄位修改（自動展開表單）、「✕」刪除該筆；成功開始一個自訂場景時 `rememberScene`。
定位與 v3.40 完全不變：自訂場景仍**沒有開場白、由你先開口**，AI 生成日文僅供參考、不入庫、
不進 SRS、不計蓋章；system prompt 一字未動（含指示注入護欄）。不動 Dexie schema、不動蓋章判定；
CSS 只加 `.recentScene` 一條。localStorage 不可用（私密模式／配額滿）時靜默略過，對話練習照常。

測試：`npm test` 532/532（新增 5ac 最近場景 24 項：`sceneKey` 兩欄比對與空白正規化、`addRecent`
排序／去重／正規化／空欄位不記／超過上限丟最舊、`removeRecent` 三情境、序列化↔解析 round trip
與「只存 partner/scene 兩個欄位」、`parseRecent` 七種容錯（無記錄／壞 JSON／非陣列／欄位缺漏／
空白欄位／重複／超量／過長截斷）、**記錄可還原成自訂場景且欄位一字不差**）、`npm run test:e2e`
79/79（roleplay.spec 新增一項：用過一次自訂場景→回清單出現「最近用過」→**重整後仍在**→
點「再聊一次 ▶」直接開聊且仍是「由你先開口」→✎ 帶回欄位→✕ 刪除且重整不復活→內建場景不受影響）、
`npm run build` strict 綠燈。

v3.42（分數揭曉動畫：環形進度＋數字滾動＋等第徽章）：ROADMAP「動畫／視覺輔助續做」點名的
延伸——v3.28 只做了「多題作答流程」的進度條與對錯動畫，**分數型的回饋（0-100 分）還是一行靜態
大字**。這次把書寫的「字形相似度」與跟讀的「發音相似度」兩處分數改為共用的揭曉元件
`components/ScoreReveal.tsx`：環形進度圈（SVG `stroke-dashoffset` CSS transition 從 0 填到分數）＋
數字由 0 滾到最終分（`requestAnimationFrame`）＋分數下方彈入**等第徽章**（◎ 優秀／○ 良好／
△ 再加油，附原有的一句話講評）。
**純呈現層、零正確性風險**：不動任何評分演算法（字形分數仍由 `lib/handwriting.ts` 算、跟讀分數
仍由 `audio/scorer.ts` 走既有降級鏈），也不動 Dexie schema、蓋章判定與各處任務計數。純函式抽
`lib/scoreReveal.ts`（`scoreBand` 等第判定＋`WRITE_BANDS`(80/60)／`SPEAK_BANDS`(80/55) 兩組門檻
**沿用兩處原本各自寫死的判斷**、`clampScore`／`easeOutCubic`／`countUpValue` 數字滾動、
`ringDashOffset`／`RING_CIRCUMFERENCE` 環形幾何），所以「同一個分數呈現成什麼」變成可被 Node
測試的東西——測試逐分核對 `scoreBand(s, WRITE_BANDS).mark === handwriting gradeOf(s)`，等第行為
與改動前一致。順手把 `SpeakView` 的分數狀態由「已組好的字串」改成 `number | null`（`selfMark`
不再需要傳記號，由等第推導）。無障礙：環圈外層 `role="img"` 帶 `aria-label`（分數＋等第），
`prefers-reduced-motion: reduce` 時直接顯示最終值不跑動畫（全域 CSS 早已停用 transition）。

測試：`npm test` 553/553（新增 5ad 共 21 項：兩組門檻邊界與自評三顆鈕落點、書寫等第逐分對照
`gradeOf`、等第標籤三段互異、講評沿用原文字、不合法分數→未評分等第、`clampScore` 夾限取整、
`easeOutCubic` 兩端與單調性、數字滾動起點 0／終點剛好落在目標值／過程單調不減不超標／中段確實在動／
duration 非法時直接顯示目標值（動畫不可用不卡在 0）、環形 dashOffset 0 分空滿分滿・隨分數單調遞減・
永遠落在 0..周長・非法周長不產生 NaN）、`npm run test:e2e` 81/81（write.spec 新增「評分揭曉：
環圈＋等第徽章＋數字最後停在 aria-label 宣告的分數＋換字後整組收起」，speak.spec 新增「跟讀分數
同樣以環圈＋徽章揭曉，自評 ◎＝90 点，換句後收起」）、`npm run build` strict 綠燈。

v3.44（段落聽解題庫擴充＋同輪不重複同一篇）：ROADMAP #5「聽力題型續強化」點名的續做——v3.27 只給
6 篇短文加了 `detailQuiz`，段落聽解的題池一直只有 22 題（12 篇大意題＋10 題細節題），一輪抽 3 題，
每天練的人很快就把題目背起來。這次把 **`data/passages.ts` 全部 14 篇短文補齊**：①原本完全沒有 `quiz`、
因此**從來沒進過段落聽解池**的兩篇文學短文（`p3` ことばの にんじゃ／`p6` たびびと）補上大意題，
②其餘 8 篇有大意題但沒有細節題的短文（`p3`／`p6`／`p7` 機場／`p8` 飯店／`p10` 餐廳／`p11` 生病／
`p13` 初次見面／`p14` 在公司）各補 2～3 題細節題。**題池 22 → 43 題（近乎翻倍）**。
**正確性走既有的程式驗證路線、不新增任何日文**：細節題只用**中文**問「短文自己就寫明的事」
（護照／只有這些／有預約／禁菸／早餐／菜單／一個／結帳／頭痛／發燒／藥／敝姓 Dof／彼此彼此／
早安／我先走一步了 等），既有測試會逐條核對每題的 `answer` 必須逐字出現在該篇 `lines` 的 `zh` 拼接字串中，
本次再加上「每篇短文都有大意題與細節題」「選項互異」「題目以問號結尾」「同篇不重複問同一題」
「題池 ≥ 35 題」等結構檢核。日文台詞與其中文對照一字未動。
**順手修掉題庫變大後才會浮現的問題**：一篇短文現在可能有 1 題大意＋3 題細節，`pickParagraphs` 原本
只是把攤平的題池洗牌，一輪三題**很可能連聽三次同一段音檔**。新增純函式 `lib/listening.ts`
`spreadByGroup(items, groupOf)`（依組 round-robin 攤開，組的先後與組內順序都沿用傳入順序，
不遺漏也不重複），`pickParagraphs` 加**可選**第四參數 `groupOf`——不給時行為與舊版完全相同（有測試釘住），
`ListenView` 給的是 `it.id.split(':')[0]`（題目 id 形如 `p4`／`p4:d0`／`p4:u7`，後兩者分別是細節題與
採用的 AI 題），所以**大意題／細節題／AI 採用題都算同一篇**、一輪必來自三篇不同短文。
純資料＋純函式，不經 LLM、不動 Dexie schema、不動蓋章判定與「耳」任務計數、不新增 CSS。

測試：`npm test` 616/616（本版新增 5h 延伸 7 項結構檢核＋5h2 選材分散 12 項：攤開不遺漏不重複／前 3 個
來自 3 篇／組內與組間順序、空陣列、全同組、組數不足時先攤完不同組才回頭、`pickParagraphs` 給 groupOf
後 30 個 seed 都取到 3 篇不同短文、不給 groupOf 時與舊版逐字相同、seed 可重現、對**真實題庫**同樣掃 30 個
seed）、`npm run test:e2e` 84/84（listen.spec 新增「一輪三題來自三篇不同短文」——用揭曉的「對話內容」
第一行辨識是哪一篇）、`npm run build` strict 綠燈。
（與 v3.43「單字帳」為同期兩支獨立分支、各自延伸自 v3.42、改動檔案不重疊；v3.43 先合併入 main，
本版於分支上併入 main 後重跑全測——上列數字為合併後的總數。）
v3.43（單字帳：查得到、看得到進度）：這次是**收斂／整合**而非加功能——読む頁底部的「單字帳」
原本把 321 個詞一次攤平列出（分類標題＋全部詞列），手機上是一面滾不完的牆，而且**沒辦法查一個詞**：
初學者在短文／聞き取り／文型ドリル遇到不認得的詞，想回來查「水怎麼說」只能自己滾。這次改成
`components/VocabBook.tsx`：①**搜尋**（假名／漢字／中文三種入口都行，有查詢時攤平顯示跨分類結果並附
分類 tag）；②**分類收合**（預設全收，標題上就看得到「n 詞・已學 m」，點開才列）；③**學習狀態篩選**
（全部／已學／未學）；④每列**標記** ◎ 已定著／● 學習中／🔒 待假名解鎖——最後這個讓詞彙修行卡上
「待假名解鎖 N 詞」那個數字**看得到究竟是哪些詞**（沿用 `lib/vocabGate.ts` 的同一套解鎖判定）。
純邏輯抽 `lib/vocabBook.ts`（`toHiragana` 片假名→平假名的純機械 Unicode 位移、`normalizeQuery`、
`matchVocab`、`filterVocab`、`groupByCat`、`catSummaries`、`bookStats`、`vocabMark`＋`MARK_LABEL`）。
**刻意不做羅馬字搜尋**：詞彙層級沒有已驗證的羅馬字，靠假名逐字推導會在拗音／促音／長音出錯＝
等於自行杜撰讀音，寧可只支援使用者自己看得懂的三種輸入。順手把 `learnedKanaChars()` 從
`VocabCard.tsx` 移進 `db/repo.ts` 共用（詞彙修行與單字帳同一套解鎖判定，不再各寫一次）。
**零正確性風險**：不新增任何日文內容，只是把已驗證的 `data/vocab.ts` 重新組織；純查閱、
不寫入任何資料、不計入每日修行、不動 Dexie schema 與蓋章判定。

測試：`npm test` 597/597（新增 5ae 單字帳共 44 項：片假名轉換四種邊界、查詢正規化五種、
假名／漢字／中文三種比對入口與不誤中、**每個詞都查得回自己的假名與中文釋義**的全詞庫掃描、
分類／狀態／查詢三種篩選可疊加且維持原順序、分組數與順序＝資料出現順序且不漏詞、
分類摘要與統計加總一致、標記四種優先序與「待解鎖判定與 `vocabGate` 一致」的全詞庫核對）、
`npm run test:e2e` 83/83（vocab-read.spec 由原本「列出全部詞彙」一項擴為三項：預設收合／展開一類／
再收合、中文＋假名＋平假名查片假名詞＋查無結果提示、未學假名標 🔒 → 學一輪後標 ● 且「已學」
篩選只剩學過的）、`npm run build` strict 綠燈。

v3.45（拗音ドリル：33 音看字選音）：使用者是「剛學完五十音的成人」，而五十音卡組（`data/kana.ts`
142 枚）**只有清音與濁音**——拗音（きゃ／しゃ／ちょ… 33 音）刻意不在其中（加進去會讓卡組膨脹到
208 枚、影響每日修行範圍與 `lib/vocabGate.ts` 的解鎖判定）。v3.36 的五十音圖把拗音**列出來可以查、
可以點來聽**，但**沒有任何地方能練**；更明確的破口是：拗音分頁上那顆「📇 用單字卡練習」按鈕
其實會去開清音／濁音的 FSRS 一輪（拗音根本沒有卡片），等於一個對不上的入口。這次補上練習本身。
**題目與選項全部由 `lib/yoonDrill.ts` 從 `lib/kanaChart.ts` 推導**（＝一路回到已驗證的
`data/kana.ts`：拗音格是「い段假名＋小さい ゃ／ゅ／ょ」、羅馬字由 `yoonRomaji` 規則生成），
**本檔一個假名／羅馬字都沒有手打**，只負責挑選與洗牌——不經 LLM、零正確性風險。
題型是**看拗音 → 選羅馬字**（一輪 10 題）：初學者真正的卡點是「きょう 被唸成 ki-yo-u 而不是
kyo-u」，所以練的是「兩個字合起來只唸一拍」的認讀；不依賴 TTS 品質，離線／降級時照樣能練
（作答後才朗讀該音，朗讀不到也不影響流程）。誘答**依混淆程度分三層**（`distractorTiers`）：
①同列不同母音（きゃ↔きゅ↔きょ）②同欄不同子音（きゃ↔しゃ↔ちゃ）③其餘，每題固定取
1 個①＋2 個②，所以**每一題都同時考母音與子音的辨別**（層不足時往後補，小題庫也湊得滿）。
UI `components/YoonDrill.tsx` 沿用既有語彙：`ProgressBar`（v3.28）＋`.qopt.ok`／`.ng` 對錯動畫＋
`.kanaFace` 大字，答完**不自動跳題**（比照 v3.18 聞き取り，答案停留到自己按「下一題 →」），
可在練習中切平／片假名（片假名拗音 キャ 同樣要練）。入口兩處：かな頁主畫面「🔡 拗音ドリル」，
以及五十音圖**拗音分頁上那顆按鈕改成拗音ドリル**（清音／濁音分頁維持「📇 用單字卡練習」不變，
`KanaChart` 新增 `onYoonDrill(script)` prop 並帶著當下的平／片假名選擇）。
**定位：選配加練**——`lib/activity.ts` `EXTRA_FEATURES` 由 7 項增為 8 項（新 feature key `yoon`／
標籤「拗音」），練完一輪 `logActivity('yoon')`，會出現在成長頁「学習記録」並讓當日済印變金；
**不卡蓋章、不進 SRS、`KANA` 維持 142 枚一枚不動**（有測試守衛）。今日頁「今日の加練」輪替
6→7 項（🔡 拗音ドリル，點了導到かな頁，該按鈕就在主畫面上）。不動 Dexie schema（沿用 v8
`activityLog`，新 feature 只是新的字串值）、不動蓋章判定、不新增 CSS。

測試：`npm test` 652/652（新增 5af 拗音ドリル共 36 項：題庫逐枚等同五十音圖拗音格、每格皆
「い段假名＋小假名」且基底可回查 `KANA`、id 皆 null 且 `KANA` 仍 142 枚的卡組守衛、三層誘答
互斥不含正解且分層條件逐項成立、單題四選項互異／正解在內／必有 1 同列＋2 同欄誘答、同 seed
可重現而不同 seed 會換、全 33 音各自出題皆合法、小題庫與「題庫比選項還小」不重複填充、
一輪 10 題不重複／n 超量取全庫／n=0 與負數回空、30 個 seed 掃得到全部 33 音、
`yoon` 為選配加練且有不重複的中文標籤、練了會讓済印變金）、`npm run test:e2e` 86/86
（新增 `yoon.spec.ts` 兩項：一輪 10 題逐題驗證進度條 `aria-valuenow`、作答後必有一格 `.qopt.ok`、
**答完不自動跳題**、結算後 `activityCount('yoon')`＝1 而 `kana`＝0 且「字の修行」仍 0/10、
今日加練清單打勾；五十音圖拗音分頁不再有「用單字卡練習」而是拗音ドリル入口、片假名選擇帶進練習、
練習內可切回平假名。kana-chart.spec 的拗音分頁說明文案斷言同步更新）、`npm run build` strict 綠燈。

---

## ⭐ 本機實測任務（此專案轉到 Claude Code 的主因）

以下在先前的純 chat 環境**無法**執行（無瀏覽器 runtime、無真服務、無 GPU）。
Claude Code 在本機可以真正跑起來、觀察、修正。建議依序進行，每項完成後更新
`tests/INTEGRATION_REPORT.md` 與本節勾選。

### A. 瀏覽器行為（跑 `npm run dev`，用 Chrome DevTools）
- [x] IndexedDB 實際讀寫：完成各軌一輪後檢查 `nihongo-michi` DB 各表；重整後進度保留；
      Dexie v1→v2 升級在既有資料上不遺失（可先塞 v1 格式資料再升級驗證）。
      → `e2e/kana.spec.ts`、`e2e/db.spec.ts`（含原生 IDB 預埋 v1 佈局 → 升級到 20 驗證）。
- [ ] MediaRecorder 錄音：`話す` whisper 模式的 🎤→⏹ 起停、webm blob 產生、base64 上傳。
      （需真麥克風＋whisper sidecar，留在 5090 本機驗證）
- [x] Web Speech 降級鏈：無 ASR 環境正確降級自評（`e2e/speak.spec.ts`）。
      真 Chrome ASR 辨識與發聲聽感仍需本機人工確認。
- [x] 蓋章／streak、toast、大印 overlay 的時序（`e2e/stamp.spec.ts` 黃金路徑）；
      動畫「觀感」仍建議本機看一眼。
- [x] 用 Playwright 寫端到端點按測試 → `e2e/` 共 23 項全綠（`npm run test:e2e`），
      並順手抓到 StrictMode 下音→字測驗跳題的 bug（已修）。

### B. 真 VOICEVOX（下載官方 engine，取代 mock）
- [ ] 啟動官方 VOICEVOX engine，`/health` 的 `voicevox` 轉 true，前端聽到真人聲。
- [ ] 說話者切換、`speedScale`（rate）對聽感的影響；挑一個適合教學的預設聲線。
- [ ] TTS 離線複習（v3 起改 Dexie `ttsCache` cache-first，不再走 service worker）：關網測聽過的句子仍可播。

### C. 真 faster-whisper 發音評分（需 CUDA + ffmpeg）
- [ ] `pip install faster-whisper`、`ENABLE_WHISPER=1`、`WHISPER_MODEL=large-v3`，5090 上啟用。
- [ ] 確認 webm/opus 能被 PyAV 解碼（系統要有 ffmpeg）——這是最可能踩雷處。
- [ ] 用真人錄音驗證 mora 診斷準確度：故意漏促音、清化濁音、拉長短音，看 っ[del]/で[sub] 是否命中。
- [ ] 校準 `similarity` 分數與 mora 對齊，必要時調整正規化（長音ー、ん 的處理）。

### D. 真 LLM 內容生成（Anthropic API）
- [ ] `export ANTHROPIC_API_KEY=...`（可選 `ANTHROPIC_MODEL`），`/content` 走真 API。
- [ ] 檢視生成品質：是否守住「每句 ≤1 新詞」；`lib/coverage.ts` 的 flag 是否與實際超綱一致。
- [ ] 調 system prompt 與 `known_words` 傳法（目前傳整個 VOCAB；可改成只傳「已 FSRS 學過」的詞，
      讓 i+1 真正貼合個人進度——需從 `repo` 取 vocab 卡的 refId）。

### E. PWA / 跨裝置
- [ ] 桌面與手機安裝、離線開啟。圖示已補：`public/icon-192.png`、`icon-512.png`
      （`scripts/gen-icons.mjs` 由 favicon 設計生成，已進 sw precache）。
- [ ] iOS Safari 的語音（Kyoko）與 Android Chrome 的差異。

## Roadmap（本機實測之後）

> 後續接續工作與接手須知已集中到 **`ROADMAP.md`**（優先序：真機 QA＋Play 封閉測試 →
> pitch 詞庫擴充 → 漢字模式深化 → 真聲學 GOP → 聽力題型續強化）。以下保留脈絡細節。

0. **Android 上架（v3）**：以 Capacitor 包裝上 Google Play。完整規劃見
   `docs/ANDROID_RELEASE_PLAN.md`（WebView 無 Web Speech 的 provider 對策、sidecar URL 抽象、
   Dexie v3 TTS 快取、Play 上架合規與 14 天封閉測試門檻）。
1. **真聲學 GOP**（發音評分天花板）：wav2vec2-CTC 日語音素模型 + 強制對齊，逐音素後驗機率。
   `/score_gop` 接口與演算法已在 `sidecar/main.py` 末段註記。前端可疊加到現有 mora 診斷上色。
2. ~~vocab i+1 生成~~（v3.6 完成：`personalKnownWords`）。
3. **pitch accent 擴充**：接 OJAD 或字典資料源（標註來源），擴大重音道場詞庫。
4. **漢字模式深化**：短文提供漢字/假名雙版；vocab 加漢字書寫練習。
5. ~~內容審核佇列持久化~~（v3.1 完成：`genQueue`）。
6. ~~測驗模組~~（v3.4 完成：`lib/quiz.ts`＋`quizResults`，今日頁「📝 N5 模擬測驗」）。
7. ~~AI 助教~~（v3.6 完成：`views/TutorView.tsx`＋`lib/llm.ts chatGemini`，Gemini 直連、
   grounding 已學詞、標明僅供參考、不寫入學習庫）。
8. ~~JLPT 聴解題型（即時応答／発話表現）~~（v3.9 完成：`data/kaiwa.ts`＋`lib/listening.ts`）。
9. ~~AI 段落理解題（LLM 只生中文）~~（v3.10 完成：`content.ts generateListenQuestions`＋
   `llmParse.ts parseListenQuestions`＋Dexie v6 `userListenQ`）。

## 已知陷阱

- **`npm test` 用 Node 22 `--experimental-strip-types`**，直接跑 `.ts`；被測檔的 import 需能在 Node 解析
  （純函式檔 OK；依賴 Dexie 的檔會炸——這就是覆蓋率邏輯抽成 `lib/coverage.ts` 的原因）。
- **FSRS lapse 語義**：只在 Review 狀態答錯才計 lapse，Learning 不計。寫測試時別誤判。
- **Dexie 版本**：schema 已到 `version(8)`（`activityLog`）。再改 schema 要 `version(9)` 並處理升級，勿改動舊版定義；`e2e/db.spec.ts` 斷言的 IDB 版本（version×10，現為 80）與新表清單要同步改。
- **文章 display HTML 安全性**：`ReadView` 用 `dangerouslySetInnerHTML` 渲染 ruby——只能餵
  sidecar `article.py` token 重建的輸出（全 escape、僅產生 ruby/rt），別直接塞任何原始 HTML。
- **AI 生成走 Gemini 直連（`lib/llm.ts`）**：金鑰/模型存 localStorage（裝置層，不進備份/git）。
  原生務必用 `CapacitorHttp`（繞 WebView CORS），web 用 fetch。純解析放 `lib/llmParse.ts`
  （無 Capacitor 依賴，供 Node 測試）；`llm.ts` 本身 import `@capacitor/core`，勿被 Node 測試 import。
  e2e 攔截 `**/generativelanguage.googleapis.com/**` 並設 localStorage `nihongo-michi:geminiKey`。
- **sidecar 呼叫一律走 `lib/sidecar.ts` 的 `apiUrl()`**，勿再寫死 `fetch('/api/…')`——Android App 的 origin 是 `https://localhost`，相對路徑打不到 sidecar。`sidecar.ts` 被 Node 測試 import，模組層不得碰 window/localStorage。
- **Web Speech 僅 Chromium 系**；MediaRecorder 產 webm/opus，whisper 端需 ffmpeg 解碼。
- **artifact/沙箱限制**：先前環境麥克風可能被封鎖——本機無此問題，正好補測。
- **pitch accent 正確性**：新增重音資料務必查證來源，別讓 LLM 直接生 accent 數字（Dof 會發現錯誤）。
- **`content.ts` re-export** `analyzeCoverage`/`Coverage` 自 `coverage.ts`；呼叫端 import 路徑不變。
- **Capacitor plugin 版本配對**：`@capacitor-community/text-to-speech` 的 Cap 7 版是 **6.1.0**
  （8.x 需 Cap 8）；`speech-recognition` 用 7.0.1。升 Capacitor 大版前先查兩者 peerDependencies。
- **`CAP_BUILD=1`（`npm run build:android`）會停用 service worker**——原生殼資產在 APK 內。
  web 版一律用 `npm run build`。`scorer.ts` 內的 Capacitor import 必須維持動態 import（Node 測試）。
- **android/ 簽章**：`keystore.properties` 與 `*.jks` 已 gitignore，絕不提交；
  versionCode 每次上傳 Play 手動 +1（`android/app/build.gradle`）。
- **AGP 9 + community plugin proguard**：`@capacitor-community/{speech-recognition,text-to-speech}`
  的 `android/build.gradle` 用了 `getDefaultProguardFile('proguard-android.txt')`，AGP 9 已把它
  變成硬性錯誤。因在 node_modules 內（npm 裝、不可提交），用 `scripts/patch-plugins.mjs`
  在 **postinstall** 就地補成 optimize 版（idempotent）。升這兩個 plugin 版本後若上游修好可移除。
  androidの AGP/Gradle 版本由本機 Android Studio 維護（目前 AGP 9.2.1 / Gradle 9.4.1）。

## 提交前檢查

`npm run build`（strict 綠燈）＋ `npm test`（652/652）＋ `npm run test:e2e`（86/86）
＋（動到 sidecar 時）`python sidecar/test_score.py` 與 `python sidecar/test_article.py`。
新功能盡量補測：純邏輯進 `tests/integration.ts`，UI 流程進 `e2e/*.spec.ts`（共用步驟放
`e2e/helpers.ts`），後端進 `test_score.py`。
