# Roadmap ／ 後續接續工作

> 本檔集中記錄「已完成里程碑」與「後續接續工作」，供接手者（人或 AI）快速掌握現況與下一步。
> 版本沿革細節見 `README.md`；開發約定與已知陷阱見 `CLAUDE.md`。
> 設計原則不變：**正確性交給權威來源與程式驗證，AI 生成一律人工審核採用才入庫；
> 使用者只做策展，不當正確性把關者。**

最後更新：v3.28（作答視覺回饋——N5 測驗／聞き取り四型／五十音音→字與複習卡共六處多題流程，
加上共用動畫進度條元件＋選對/選錯的 pop/shake/徽章進場動畫，純呈現層、零正確性風險）。
v3.27（段落聽解細節題，時間/數量/人物）與 v3.28 為同期兩支獨立分支各自延伸自 v3.26，
互不依賴，已依序合併入 main（PR #33、#34）。

---

## 目前狀態

- **程式碼**：Web/PWA 與 Android（Capacitor 殼）皆完成；CI（web 測試＋e2e＋Android `assembleDebug`）綠燈。
- **測試**：`npm test` 199/199、`npm run test:e2e` 51/51、`sidecar/test_score.py` 4/4、`test_article.py` 13/13、`npm run build` strict 綠燈。
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


## 後續接續工作（優先序）

### 1. Android 真機 QA ＋ Google Play 封閉測試 〔上架關鍵路徑〕
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
  並有測試核對）。可續擴到其餘 8 篇有 `quiz` 但尚無 `detailQuiz` 的短文（`p6`／`p13`／`p14` 等
  對話式短文因無明確數字/時間細節、暫不強加）。
- 句子聽解題庫偏日常，可補商業／旅遊情境單句（`data/sentences.ts`／`data/passages.ts`）。
- 素材一律走已驗證資料或「LLM 只生中文題／選項」路線，不讓 LLM 生日文。

### 6. 動畫／視覺輔助續做 〔呈現層，風險最低，可挑一子項〕
- v3.28 只做了「多題作答流程」的進度條與對錯動畫（六處：`QuizView`／`ListenView` 四型／`KanaView`
  兩處）。**尚未涵蓋**：`PatternView`（文型ドリル／回想テスト的「說對了/再一次」按鈕）、
  `DialogueView`（會話引導逐句完成時）、`WriteView`（字形評分結果 0-100 分可加動畫數字滾動或
  分數等第徽章）——可挑一處延伸同一套 `ProgressBar`／pop-in 語彙。
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
