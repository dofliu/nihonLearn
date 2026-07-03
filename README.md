# 日本語の道 v2

個人化日語學習 PWA — 聽說讀三軌，local-first。v1 Artifact 的正式產品化版本。

## 為什麼是 v2

| | v1（Artifact） | v2（本專案） |
|--|--|--|
| SRS | 簡化 SM-2 | **FSRS-4.5**（ts-fsrs，實證留存率排程） |
| 資料 | 單一 JSON blob | **IndexedDB / Dexie**（卡片、每日、蓋章、發音紀錄分表） |
| 語音 | 瀏覽器內建 | 自動偵測 **VOICEVOX** sidecar（可選說話者），離線降級回瀏覽器 |
| 發音評分 | 字串相似度 | **faster-whisper**（5090）三段式降級：whisper → 瀏覽器 ASR → 自評 |
| 安裝 | 開網頁 | **PWA**，可裝到桌面/手機，離線可用 |

連續天數與已學假名可從 v1 一鍵匯入，不歸零。

## 開發

```bash
npm install
npm run dev        # http://localhost:5173
```

其他指令：`npm run build`（型別檢查 + 打包）、`npm run preview`、`npm run typecheck`、`npm test`（邏輯回歸）。

> 已驗證：`npm run build` 綠燈（Node 22 / Vite 5 / TS 5.5，PWA service worker 生成）。
> 整合測試：`npm test` 前端邏輯 31/31；`sidecar/test_score.py` 後端 4/4。詳見 `tests/INTEGRATION_REPORT.md`，瀏覽器手動走查見 `tests/MANUAL_QA.md`。

## 架構

```
src/
  data/        內容（kana 142・vocab ~190 N5・sentences・pairs・pitch・passages）— 唯一事實來源
  db/          Dexie schema + repo（任務計數、蓋章、發音紀錄）
  srs/         FSRS 排程封裝（新卡 / 評級 / 到期 / 定著判定）
  audio/       tts（Web Speech + VOICEVOX 門面）、scorer（ASR + 相似度）
  state/       zustand store（今日進度 / streak / 語速 / TTS provider）
  lib/         date、importV1（v1→v2 遷移 + 備份）、content（生成 client + 採用/讀取）
  views/       五分頁：Today / Kana / Listen / Speak / Read；ProgressView（成長曲線）、ReviewView（生成句審核）
  components/   Nav、ui（toast、蓋章大印）
sidecar/       FastAPI（5090）：/health /tts /score /content
```

設計原則沿用 v2 規劃：**data 是唯一狀態來源，adapter（TTS/評分）皆為無狀態視圖**；
AI 生成內容一律標記且須經人工審核才入學習庫。

## 五項每日修行（習慣引擎）

字（10 枚假名 SRS）・ことば（6 詞 FSRS）・耳（辨音 5 題）・口（跟讀 3 句）・読（短文 1 篇）。
五項全完成 → 蓋下當日朱印「済」。約 10 分鐘／日，低門檻優先於高強度。

## 從 v1 匯入

點頁首標題「日本語の道」→ 設定 → 貼上 v1 存檔 JSON → 匯入。

## sidecar（選配，跑在 5090）

見 `sidecar/README.md`。前端會自動偵測 `/api/health`，在線即升級為 VOICEVOX 語音；
未啟動時前端功能不中斷，只是語音/評分走瀏覽器降級版。

## 已完成

- **VOICEVOX 語音接入**：sidecar `/tts`＋`/speakers`，前端自動偵測、可選說話者、可重新偵測、試聽。已用 mock engine 在容器實測整條 proxy 鏈路（回傳合法 WAV，rate 參數確實改變音長）。
- **發音成長曲線頁**（今日頁 →「📈 發音の成長曲線」）：分數推移折線＋5 次移動平均、趨勢指標、每句最佳分。純 SVG 零新依賴。
- **faster-whisper 發音評分**：前端 MediaRecorder 錄音 → base64 → `/api/score`；三段式降級 whisper → 瀏覽器 ASR → 自評，`SpeakView` 依偵測到的引擎自動切換互動（whisper 手動起停、ASR 自動偵測語尾）。
- **LLM 內容生成 + 審核佇列**（話す頁 →「✨ 生成新練習句」）：`/content` 以 httpx 直呼 Anthropic API，限定已學詞彙、每句最多 1 新詞；**採用後才入庫**（AI 不直接寫入），採用句依主題融入對應跟讀層級。無 API key 時回示範候選，審核 UI 照樣可跑（容器已實測 demo 路徑）。
- **N5 詞庫 + 詞彙 FSRS**：詞庫擴至約 190 個 N5 核心詞（18 類，逐條確認讀音/釋義）；「読む」的詞彙改為 **FSRS 翻面卡**（看日文＋聽發音 → 翻面中文自評），與假名同一套間隔重複排程；每日新詞上限 6，今日頁顯示假名／詞彙雙進度。到期卡不足當日份時，做完整輪即算完成。
- **漢字模式**（設定頁開關）：詞彙卡與單字帳顯示漢字（附假名小字），短文隱藏振り仮名做純漢字挑戰。vocab 的 kanji 欄位已標。
- **生成句詞彙覆蓋率檢核**：審核佇列對每個候選做啟發式覆蓋率分析（貪婪最長匹配 + 功能詞白名單，零依賴），標出未覆蓋成分並在超出「每句 1 新詞」時警示——把關不只靠 prompt。
- **pitch accent 重音道場**（聴く頁 →「重音」）：東京式高低型視覺化（規則式 pattern 生成，無正確性風險）、最小對立組對比（雨／飴、箸／橋）、型別聽辨測驗。明確標註地區/世代差異，僅供辨識訓練。
- **mora 級發音診斷**：`/score` 除總分外，回目標假名與 whisper 轉寫的 mora 對齊結果，前端逐拍上色（綠＝發對、紅＝漏發、黃＝發成別的音）。促音漏發、濁音清化都會被精準標出。已在容器實測對齊邏輯。

## 下一步

- 真聲學 GOP：wav2vec2-CTC 日語音素模型 + 強制對齊，逐音素後驗機率評分（`/score_gop` 接口與演算法已在 sidecar 註記），區分「發對但不標準」與「發成別的音」——發音評分的天花板。
