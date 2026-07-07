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
  data/       內容＝唯一事實來源：kana(142)・vocab(~190 N5)・sentences・pairs・pitch・passages
  db/         schema(Dexie v2)・repo（任務計數、蓋章、卡片、發音紀錄、生成句）
  srs/        scheduler：ts-fsrs 封裝（newCard/review/isDue/isMastered）
  audio/      tts（WebSpeech + VOICEVOX 門面，自動偵測）・scorer（相似度 + ASR + whisper 錄音 + mora 型別）
  lib/        date・importV1（v1→v2 遷移 + 備份匯出）・content（生成 client + 持久化審核佇列 + 採用）・articles（NHK Easy 導入 client + 採用）・coverage（覆蓋率檢核，無依賴）・pitch（mora 切分 + 東京式 pattern）・sidecar（base URL 抽象 + probeHealth）・vocabGate（詞彙隨假名解鎖，純函式）
  state/      store（zustand：今日/streak/rate/tts/showKanji）
  views/      Today・Kana・Listen(含 Pitch)・Speak・Read・Progress・Review
  components/ Nav・ui(toast/大印)・VocabCard
sidecar/      FastAPI：/health /tts /speakers /score /content /article/*；article.py（NHK Easy 解析，純函式）；mock_voicevox.py（假 engine）；test_score.py・test_article.py
tests/        integration.ts（npm test）・INTEGRATION_REPORT.md・MANUAL_QA.md
e2e/          Playwright 端到端測試（npm run test:e2e）・helpers.ts（共用步驟）
scripts/      gen-icons.mjs（由 favicon 設計重生成 PWA 圖示）
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

v3.2（初學者體驗修正）：短文「中文對照」整篇切換（初學者預設開）、生成句在未設定 sidecar 時
走客戶端離線示範（修 Android 上相對路徑被 WebView 導回 index.html 造成的 JSON 解析錯誤）、
**詞彙隨假名進度解鎖**（`lib/vocabGate.ts`：只出「假名全學過」的詞；無可解鎖時當日詞彙自動達標
不卡蓋章）。

測試：`npm test` 48/48（對真原始碼）、`npm run test:e2e` 27/27（Playwright 瀏覽器點按，
sidecar API 以 page.route 攔截）、`sidecar/test_score.py` 4/4＋`test_article.py` 13/13、
`npm run build` strict 綠燈。詳見 `tests/INTEGRATION_REPORT.md`。

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

0. **Android 上架（v3）**：以 Capacitor 包裝上 Google Play。完整規劃見
   `docs/ANDROID_RELEASE_PLAN.md`（WebView 無 Web Speech 的 provider 對策、sidecar URL 抽象、
   Dexie v3 TTS 快取、Play 上架合規與 14 天封閉測試門檻）。
1. **真聲學 GOP**（發音評分天花板）：wav2vec2-CTC 日語音素模型 + 強制對齊，逐音素後驗機率。
   `/score_gop` 接口與演算法已在 `sidecar/main.py` 末段註記。前端可疊加到現有 mora 診斷上色。
2. **vocab i+1 生成**：D 項的個人化 known_words。
3. **pitch accent 擴充**：接 OJAD 或字典資料源（標註來源），擴大重音道場詞庫。
4. **漢字模式深化**：短文提供漢字/假名雙版；vocab 加漢字書寫練習。
5. ~~內容審核佇列持久化~~（v3.1 完成：`genQueue`）。
6. **測驗模組**：從已學 FSRS 卡片自動組 N5 模擬題（選擇/聽力/重組），計分與弱項分析。
   題目素材全部來自已驗證資料，天然無正確性風險。
7. **AI 助教**：sidecar 對話端點，grounding 在使用者已學詞彙（repo 取 refId），
   回答標明「AI 說法僅供參考」、永不直接寫入學習資料庫。

## 已知陷阱

- **`npm test` 用 Node 22 `--experimental-strip-types`**，直接跑 `.ts`；被測檔的 import 需能在 Node 解析
  （純函式檔 OK；依賴 Dexie 的檔會炸——這就是覆蓋率邏輯抽成 `lib/coverage.ts` 的原因）。
- **FSRS lapse 語義**：只在 Review 狀態答錯才計 lapse，Learning 不計。寫測試時別誤判。
- **Dexie 版本**：schema 已到 `version(4)`（`userPassages`＋`genQueue`）。再改 schema 要 `version(5)` 並處理升級，勿改動舊版定義；`e2e/db.spec.ts` 斷言的 IDB 版本（version×10，現為 40）要同步改。
- **文章 display HTML 安全性**：`ReadView` 用 `dangerouslySetInnerHTML` 渲染 ruby——只能餵
  sidecar `article.py` token 重建的輸出（全 escape、僅產生 ruby/rt），別直接塞任何原始 HTML。
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

## 提交前檢查

`npm run build`（strict 綠燈）＋ `npm test`（48/48）＋ `npm run test:e2e`（27/27）
＋（動到 sidecar 時）`python sidecar/test_score.py` 與 `python sidecar/test_article.py`。
新功能盡量補測：純邏輯進 `tests/integration.ts`，UI 流程進 `e2e/*.spec.ts`（共用步驟放
`e2e/helpers.ts`），後端進 `test_score.py`。
