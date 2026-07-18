# 整合測試報告 — 日本語の道 v3.17

執行環境：Node 22.22 / Vite 5.4 / TypeScript 5.5（strict）/ Python 3.12 + FastAPI /
Capacitor 7.6（Android 殼）。

## 摘要（v3.17 現況）

| 層級 | 方式 | 結果 |
|------|------|------|
| 建置 | `tsc -b && vite build`（strict） | ✅ 綠燈，PWA sw 生成（`CAP_BUILD=1` 時停用 SW） |
| 前端邏輯 | `npm test`（Node 直跑真實 .ts 原始碼） | ✅ 157 / 157 |
| **瀏覽器 E2E** | `npm run test:e2e`（Playwright + Chromium，真 dev server） | ✅ 46 / 46 |
| 後端評分 | `sidecar/test_score.py`（注入假 whisper） | ✅ 4 / 4 |
| 後端文章解析 | `sidecar/test_article.py`（fixture HTML，NHK 解析） | ✅ 13 / 13 |
| **Android 殼可編譯** | GitHub Actions `android` job（`gradlew assembleDebug` + APK artifact） | ✅ |

真機／真服務項目（原生語音、真 VOICEVOX/whisper、真 Gemini 生成品質、PWA 安裝離線、
Android 裝置），見 `MANUAL_QA.md` 與 `MANUAL_QA-ANDROID.md`——未在真機/真服務跑過的一律不打勾。

## 瀏覽器 E2E（46 項，Playwright 對真 dev server 點按）

`e2e/`，14 個 spec 檔，執行：`npm run test:e2e`（容器/CI 用 `PW_CHROMIUM_PATH` 指定預裝 Chromium）。
sidecar 與 Gemini API 皆以 `page.route` 攔截，不需真服務。

### v2 基線 E2E

- **app.spec** 載入與導覽（5）：今日頁五任務/蓋章卡/統計初始值、五分頁切換、
  任務列「前往」、設定面板（語音來源顯示、漢字モード開關＋重整持久化）、
  匯出 v2 備份實際下載且為合法 JSON（`version:2`）。
- **kana.spec** 假名 SRS（4）：翻面自評推進、「忘了」重排回隊列（10→11）、
  完成整輪後任務達標＋**重整後 IndexedDB 進度保留**＋當日額度用罄提示、
  音→字測驗（門檻 4 枚、四選項、答題推進）。
- **vocab-read.spec** 詞彙與閱讀（4）：詞彙翻面卡一輪 6 新詞、整輪達標＋重整保留、
  短文開篇/點句對照/読了達標、單字帳全數渲染。
- **listen.spec** 聽力（2）：辨音 5 題完整流程（作答標示正解、任務達標）、重音道場切換。
- **speak.spec** 跟讀（4）：**無 ASR 環境正確降級自評**（sidecar 離線＋移除 SpeechRecognition）、
  句子導覽/層級切換、3 次達標＋發音紀錄持久化、生成句審核佇列入口。
- **db.spec** 資料庫（3）：**Dexie v1→v8 schema 升級**（以原生 IDB 版本 10 預埋 v1 佈局資料
  → app 開啟後升級到 80、全部新表建立、舊卡與蓋章不遺失、定著語義保留）、
  **v1 存檔 JSON 匯入**（假名播種 2、蓋章 2、streak 2 不歸零、無效 id 跳過、重整保留）、
  壞 JSON 顯示錯誤且不寫入。
- **stamp.spec** 黃金路徑（1）：單日完成五項修行 → 自動蓋章、大印 overlay（済＋日期、
  點擊關閉）、蓋章卡今日格標記、streak 0→1、重整保留。全程約 50 秒真實點按。

### v3 新增 E2E（v3.0–v3.17）

- **app.spec**：Sidecar 位址儲存/正規化/清除、**Gemini 金鑰儲存/測試連線/持久化/清除**。
- **db.spec**：升級斷言更新到現行 Dexie v8（IDB 版本 80、`userSentences`/`ttsCache`/
  `userPassages`/`genQueue`/`quizResults`/`userListenQ`/`writeScores`/`activityLog` 建立）。
- **vocab-read.spec**：**詞彙隨假名解鎖**——全新使用者無新詞→自動達標並提示；預埋全假名
  （`seedKanaLearned`）後恢復 6 新詞流程；**閱讀中文對照整篇切換**（預設開、可關回點句顯示）。
- **articles.spec**：**NHK 文章導入**（列表→審核預覽→採用→持久化→閱讀→刪除，中文對照走
  Gemini stub）、**生成句審核佇列持久化**（離開再回來仍在、採用/退回出佇列）。
- **speak.spec**：未設 Gemini 金鑰時生成走離線示範（不噴 JSON 錯誤）。
- **listen.spec**：JLPT 四大題型選單（句子聽解/段落對話/即時応答/発話表現）導覽與互動流程。
- **listen-gen.spec**：AI 段落理解題生成（Gemini stub 回傳→解析→審核→採用入庫→併入段落池）。
- **quiz.spec**：N5 模擬測驗完整流程（出題→作答→計分→弱項分析→結果持久化）。
- **tutor.spec**：AI 助教流程（無金鑰提示→設金鑰→多輪對話→回答標記僅供參考）。
- **write.spec**：書寫練習流程（字集切換ひらがな/カタカナ/漢字、描紅/空白默寫模式、Canvas 手寫→
  字形評分→最佳分持久化）、**描紅層級守衛**（範本不被格線蓋住）。
- **activity.spec**：學習活動記錄（練習後 activityLog 寫入、成長頁日曆 heatmap 與項目統計、
  +α 選配不卡蓋章）。

### E2E 抓到並修正的 bug

- `KanaView` 音→字測驗的掛載 effect 非冪等：React 18 StrictMode（dev）下執行兩次，
  導致測驗直接從第 2 題開始（第一題被跳過、發音播兩次）。已用 ref 守衛修正。
- `WriteView` 書寫描紅範本被格線層（`.writeGuide`）蓋住：DOM 層級重排修正。

## 前端邏輯（157 項，直接對原始碼執行）

`tests/integration.ts`，Node 22 `--experimental-strip-types` 直跑 `.ts`。

### v2 基線

- **FSRS 排程**：新卡狀態、good 增 reps、easy 到期晚於 good、連續 good 定著、Review 狀態 forgot 計 lapse、新卡即到期。
- **Pitch pattern**：あめ雨 HL／飴 LH、はし橋 LH、にほんご LHHH、拗音合併、四種型名。
- **發音相似度**：完全一致=100、片假名正規化、多 target 取最高、部分相符介於 0–100。
- **日期 / streak**：連續兩日=2、只今日=1、斷開舊章不計、lastNDays 長度。
- **覆蓋率檢核**：已知詞句高覆蓋且不 flag、超綱句 flagged 且標出未覆蓋段。
- **資料完整性**：假名 142 枚且 id 唯一、KANA_BY_ID 對應、詞彙 jp 唯一、每詞有中文/分類/級別。

### v3.0–v3.3 新增

- **sidecar** base URL 正規化/join、**ttsCacheKey**。
- **vocabGate**：假名解鎖閘門（小書き/長音/標點不計入）。
- **llmParse**：Gemini 回應去圍欄/抽文字。

### v3.4–v3.17 新增

- **quiz**：N5 出題邏輯（意味/語彙/聽力/重組四型、詞卡不足降級、選項互斥）。
- **karaoke**：朗讀逐字對齊索引計算、邊界事件映射。
- **listening**：JLPT 四大題型出題（句子聽解/段落對話/即時応答/発話表現）、選項互斥與題數。
- **furigana**：漢字↔假名注音對齊（全 SENTS/VOCAB 重組還原原字串保證、無 innerHTML）。
- **handwriting**：字形相似度評分（precision/recall→F1、空白/全塗邊界值、膨脹容差）。
- **activity**：學習活動統計（totalsByDay/Feature、calendarCells、heatLevel 門檻、activeDayCount）。
- **資料擴充驗證**：vocab 299 詞唯一性、kaiwa/dialogues 資料完整性、kanjiWrite 字集來自 vocab 驗證。

## 後端 /score mora 診斷（4 項）

用假 whisper 注入模擬各種發音錯誤，驗證回傳的逐拍診斷：

| 目標 | 唸成 | 診斷 |
|------|------|------|
| これをください | （正確） | 全 ok，score 100 |
| きって | きて | **っ[del]**（促音漏發）, score 67 |
| でんき | てんき | **で[sub]**（濁音清化） |
| しゅぎょう | しゅぎょ | しゅ[ok]・**う[del]**（拗音正確合併、尾拍漏發） |

正是中文母語者的三大盲點，被逐拍精準標出。

## 後端文章解析（13 項）

NHK Easy News HTML fixture 解析：token 重建、ruby/rt 安全 HTML、注音繼承。

## 後端端到端

- `/health` → `voicevox:true`（連 mock）、`whisper:false`、`content:false`，旗標正確反映能力。
- `/speakers` → 攤平回 4 個聲線 + default。
- `/tts?speaker=3&rate=0.85` → 合法 WAV 7200 frames（rate 影響音長）。
- `/content`（無 key）→ 3 個示範候選，`demo:true`、`needs_review:true`。

## 重構附帶收穫

覆蓋率檢核從 `content.ts`（依賴 Dexie）抽成獨立無依賴模組 `lib/coverage.ts`，
使其可被 Node 直接測試，生產程式碼也更乾淨（`content.ts` re-export，呼叫端不變）。

## 未由自動化涵蓋

- ~~瀏覽器 IndexedDB 實際讀寫、React 互動~~ → 已由 Playwright E2E 涵蓋。
- MediaRecorder 真麥克風錄音、Web Speech 實際發聲聽感、PWA 安裝／離線 — 見 `MANUAL_QA.md`
  （圖示 icon-192/512.png 已補上，`public/`，可由 `scripts/gen-icons.mjs` 重生成）。
- 真 VOICEVOX 人聲、真 faster-whisper 轉寫、真 LLM 生成 — 需在 5090 上以真服務驗證
  （介面已用 mock／假模型證明相容）。
- Android 真機驗收 — 見 `MANUAL_QA-ANDROID.md`（未通過前勿送審）。
