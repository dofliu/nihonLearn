# Roadmap ／ 後續接續工作

> 本檔集中記錄「已完成里程碑」與「後續接續工作」，供接手者（人或 AI）快速掌握現況與下一步。
> 版本沿革細節見 `README.md`；開發約定與已知陷阱見 `CLAUDE.md`。
> 設計原則不變：**正確性交給權威來源與程式驗證，AI 生成一律人工審核採用才入庫；
> 使用者只做策展，不當正確性把關者。**

最後更新：v3.13 合併後（專屬 Logo ＋ 假名書寫練習）。

---

## 目前狀態

- **程式碼**：Web/PWA 與 Android（Capacitor 殼）皆完成；CI（web 測試＋e2e＋Android `assembleDebug`）綠燈。
- **測試**：`npm test` 144/144、`npm run test:e2e` 43/43、`sidecar/test_score.py` 4/4、`test_article.py` 13/13、`npm run build` strict 綠燈。
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
| 專屬 Logo（朱印「道」）、假名書寫練習＋字形相似度評分（描紅/空白默寫、Dexie v7） | v3.12–v3.13 |

## 後續接續工作（優先序）

### 1. Android 真機 QA ＋ Google Play 封閉測試 〔上架關鍵路徑〕
- 依 `tests/MANUAL_QA-ANDROID.md` 在真機逐項驗收（原生 TTS/ASR、離線、TTS 快取、深色模式、返回鍵、權限流程）。
- Play Console：個人開發者帳號需 **12 名測試者 × 14 天封閉測試** 才能升正式；流程見 `docs/ANDROID_RELEASE_PLAN.md`、`docs/PLAY_LISTING.md`。
- 每次上傳 `versionCode` 手動 +1（`android/app/build.gradle`）；`keystore.properties`／`*.jks` 已 gitignore，**絕不提交**。

### 2. pitch accent 詞庫擴充 〔內容深化〕
- 現況：`data/pitch.ts` 只放高信度東京式詞，pattern 由 `lib/pitch.ts` 規則生成（無正確性風險）。
- 目標：接 **OJAD** 或字典資料源、**標註來源**後擴大重音道場詞庫。
- 原則：**不可讓 LLM 直接生 accent 數字**（Dof 會發現錯誤）；每筆新詞查證來源、只標一個 accent 整數。

### 3. 漢字模式深化 〔內容深化〕
- 短文提供漢字／假名雙版切換（目前部分短文已有 ruby）。
- ~~假名書寫練習＋字形評分~~（v3.13：`lib/handwriting.ts`＋WriteView）；可續做**漢字**書寫與筆順動畫。

### 4. 真聲學 GOP（發音評分天花板）〔進階、需 GPU〕
- wav2vec2-CTC 日語音素模型＋強制對齊，逐音素後驗機率。
- `/score_gop` 接口與演算法已在 `sidecar/main.py` 末段註記；前端可疊加到現有 mora 診斷上色。

### 5. 聽力題型續強化 〔內容深化，可選〕
- 段落理解題目前為「大意／場景」型（最穩健）；可加**細節題**（時間／數量／人物）。
- 句子聽解題庫偏日常，可補商業／旅遊情境單句（`data/sentences.ts`／`data/passages.ts`）。
- 素材一律走已驗證資料或「LLM 只生中文題／選項」路線，不讓 LLM 生日文。

## 接手須知（給下一位開發者／AI）

- **分支/PR**：功能開發走一功能一 PR（draft），綠燈後由 Dof 合併；合併後從最新 `main` 重開同名分支再做下一項。
- **提交前檢查**：`npm run build`（strict）＋`npm test`＋`npm run test:e2e`＋（動到 sidecar 時）`python sidecar/test_*.py`。
- **補測慣例**：純邏輯進 `tests/integration.ts`（Node 直跑 `.ts`，import 要帶副檔名、不得依賴 Dexie/Capacitor/window）；UI 流程進 `e2e/*.spec.ts`（共用步驟放 `e2e/helpers.ts`）；後端進 `sidecar/test_*.py`。
- **改 Dexie schema**：加 `version(n+1)`、勿改舊版定義，並同步改 `e2e/db.spec.ts` 的 IDB 版本斷言（version×10）與新表清單。
- **AI 生成**：走 Gemini 直連（`lib/llm.ts`，原生用 `CapacitorHttp` 繞 CORS）；純解析放 `lib/llmParse.ts`（無 Capacitor 依賴、供 Node 測試）；產物一律 `needs_review`，採用才入庫。
- **正確性紅線**：日文內容一律來自已驗證資料或權威來源；LLM 只允許生成使用者能自審的**中文**；pitch/複雜敬語不得由 LLM 生成。

詳細開發約定與踩雷清單見 `CLAUDE.md`。
