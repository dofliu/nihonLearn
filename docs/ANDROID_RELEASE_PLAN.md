# 日本語の道 v3 — Android 可上架 App 轉換規劃

> 目標：把現有 local-first PWA 包裝成可在 Google Play 上架的 Android App，
> **不重寫、不分叉**——同一套 React 程式碼同時產出 Web PWA 與 Android App。
> 本文件是 v3 的實作藍圖；各階段完成後回填勾選，並同步更新
> `tests/INTEGRATION_REPORT.md`。

---

## 0. 方案選型

| 方案 | 做法 | 優點 | 致命傷 / 風險 |
|---|---|---|---|
| **TWA**（Bubblewrap / PWABuilder） | 把公開 HTTPS 上的 PWA 包成 Chrome 殼 | 幾乎零程式碼改動；Web Speech / MediaRecorder / SW 全部原生 Chrome 行為 | 必須把 PWA 公開部署（目前純本機）；Play 對「純網頁殼」品質審查趨嚴，個人低流量站有被拒風險；依賴裝置上的 Chrome |
| **Capacitor**（建議 ✅） | web 資產打包進 APK，跑在 System WebView，缺的能力用原生 plugin 補 | 免公開部署、真離線（資產在本機）、可用原生 TTS/ASR/通知，上架審查是正規 App | Android WebView **沒有 Web Speech API**（`speechSynthesis` 與 `SpeechRecognition` 皆無）→ 語音鏈要補原生 provider；`/api` 相對路徑要改成可設定 |
| React Native / Flutter 重寫 | 全部重來 | — | 工作量不成比例，放棄 |

**決定：Capacitor 7。** 理由：
1. 本專案的門面架構（TTS / 評分都是無狀態 adapter，設計約定 #1）本來就為「換 provider」而生，補一個原生 provider 是順著現有設計走，不是繞路。
2. local-first 哲學與「資產打包進 App」天然吻合；TWA 反而強迫上雲。
3. Capacitor 7 預設 compile/target SDK 35（Android 15），直接滿足 Play 2025-08 之後的 target API 政策，minSdk 23 覆蓋面足夠。
4. Web 版 PWA 照常存在：providers 依 `Capacitor.isNativePlatform()` 自動選擇，一份程式碼兩種產物。

---

## 1. 現況缺口盤點（已對真程式碼確認）

| # | 現況 | Android WebView 下的問題 | 對策 |
|---|---|---|---|
| G1 | `src/audio/tts.ts` fallback 是 `WebSpeechTTS`（`speechSynthesis`） | WebView 無 `speechSynthesis` → 假名/詞彙完全無聲 | 新增 `NativeTTS` provider（`@capacitor-community/text-to-speech`，走系統 Google TTS 的 ja-JP 聲音）；優先序：VOICEVOX > Native > WebSpeech |
| G2 | `src/audio/scorer.ts` ASR 降級鏈用 `SpeechRecognition` | WebView 無此 API → 跟讀只剩自評 | 新增原生 ASR provider（`@capacitor-community/speech-recognition`，Android `SpeechRecognizer` 支援 ja-JP）；鏈變成 whisper sidecar > 原生 ASR > Web ASR > 自評 |
| G3 | 前端一律 `fetch('/api/…')` 相對路徑（tts/scorer/content 共 5 處），靠 dev proxy / 同源部署 | App 的 origin 是 `https://localhost`（Capacitor 內建 scheme），相對路徑打不到 5090 sidecar | 抽 `src/lib/sidecar.ts`：`apiUrl(path)` 讀使用者設定的 base URL（Cloudflare Tunnel / Tailscale 網址），預設空字串＝維持相對路徑（web 版行為不變）；加設定 UI ＋連線測試 |
| G4 | sidecar 靠 vite proxy 避開 CORS | App 直連 sidecar 是跨源 | `sidecar/main.py` 加 `CORSMiddleware`（allow_origins 含 `https://localhost`、`capacitor://localhost`） |
| G5 | 離線 TTS 複習靠 service worker 對 `/api/tts` 的 CacheFirst | SW 在 Capacitor 自訂 scheme 上不可靠，且 base URL 變成絕對路徑後 workbox pattern 也對不上 | TTS 音檔快取搬進 Dexie：**schema 升 `version(3)`** 新增 `ttsCache` 表（key：text+speaker+rate，存 wav blob），`VoicevoxTTS` 先查快取再打 API。Web 版同樣受益（比 SW 快取可控） |
| G6 | `vite-plugin-pwa` autoUpdate 註冊 SW | 原生 App 內不需要（資產已在本機），還可能干擾 | 原生 build 不註冊 SW（runtime guard 或 build flag），web build 照舊 |
| G7 | whisper 錄音用 `MediaRecorder`（webm/opus） | WebView 其實**支援**，但要 `RECORD_AUDIO` 權限 + WebView 權限橋接 | Manifest 加權限；Capacitor 對 `getUserMedia` 的權限轉發需在真機驗證（列入 Phase 3） |
| G8 | 進度存 IndexedDB（Dexie） | 可用，且在 App 沙箱內比瀏覽器更不易被回收 | 照舊；補 `navigator.storage.persist()` 請求。**注意已知陷阱：改 schema 一律開新版本號** |

---

## 2. 分階段實作

### Phase 0 — 前置重構（純 web 可完成、可先測）✅ 完成
- [x] `src/lib/sidecar.ts`：`getSidecarBase()` / `setSidecarBase()`（存 localStorage）＋ `apiUrl(path)`＋
      `probeHealth()`；全站 `fetch('/api/…')`（tts/scorer/content）全部改走它。預設空字串 → web 版行為不變。
- [x] 設定 UI：設定面板新增「Sidecar 位址」卡（輸入框＋「儲存並測試連線」，打 `/health`
      顯示語音/評分/生成三旗標，成功後自動 reprobe TTS）。
- [x] Dexie `version(3)`：新增 `ttsCache` 表（`src/audio/ttsCache.ts`，500 筆 LRU）；
      `VoicevoxTTS.speak()` 改 cache-first；`vite.config.ts` 移除 workbox 對 `/api/tts` 的 CacheFirst。
- [x] `sidecar/main.py` CORSMiddleware——本來就有（`allow_origins=["*"]`），免改。
- [x] provider 偵測共用 `probeHealth()`，Phase 2 插原生 provider 只動 `tts.ts`/`scorer.ts` 的門面。
- [x] 測試：`npm test` 40/40（新增 5b 節 9 項：normalizeBase/joinApi/ttsCacheKey）；
      `npm run test:e2e` 24/24（`db.spec.ts` 升級斷言改 IDB 30＋ttsCache；`app.spec.ts` 新增
      sidecar 位址儲存/正規化/清除流程）；`sidecar/test_score.py` 4/4；build strict 綠燈。

### Phase 1 — Capacitor 殼（程式碼完成；真機驗收待做）
- [x] Capacitor 7.6（core/cli/android）安裝。
- [x] `capacitor.config.ts`：appId **`com.dof.nihongomichi`**（已定案，上架後不可改）、
      appName `日本語の道`、webDir `dist`。
- [x] `npx cap add android`，`android/` 進 git（gradle wrapper 一併提交）；
      versionCode 30000 / versionName 3.0.0。
- [x] npm scripts：`build:android`（`CAP_BUILD=1` build ＋ `cap sync`）、`android:open`、`android:run`。
- [x] 圖示與啟動畫面：`scripts/gen-icons.mjs` 擴充為同時產 PWA 與 Android 資源
      （`resources/icon-*.png`、splash 亮/暗），`@capacitor/assets generate --android` 已生成入 res。
- [x] G6：`CAP_BUILD=1` 時 VitePWA `disable` → dist 無 sw.js（已驗證；web build 仍有）。
- [ ] 驗收（**真機/模擬器，本機做**）：開得起來、五十音一輪可完成、重啟進度還在。
      → 清單見 `tests/MANUAL_QA-ANDROID.md`；殼「可編譯」由 CI `android` job 驗證。

### Phase 2 — 原生語音 providers（程式碼完成；真機驗收待做）
- [x] `@capacitor-community/text-to-speech@6.1.0` → `NativeTTS`（`tts.ts` 門面新成員，
      偵測 ja-JP 聲音才啟用）；優先序 VOICEVOX > native > web-speech。
      ⚠️ 版本配對：TTS plugin **6.1.0** 才是 Cap 7 版（peer `>=7.0.0`；8.x 需 Cap 8）。
- [x] `@capacitor-community/speech-recognition@7.0.1` → `scorer.ts` 原生 ASR
      （**動態 import**——本檔被 Node 測試載入）；引擎序 whisper > web ASR > 原生 ASR > 自評。
- [x] `AndroidManifest.xml`：`RECORD_AUDIO`、`MODIFY_AUDIO_SETTINGS`、
      Android 11+ `<queries>`（RecognitionService / TTS_SERVICE）。
- [x] `bootstrap()` 加 `navigator.storage.persist()`（G8）。
- [ ] rate 聽感校準（真機）：原生 TTS 0.7/0.85/1.0 對照 web 版。
- [ ] G7 真機驗證：🎤→⏹ 錄音、webm blob、base64 上傳到 whisper sidecar 全流程。
- [ ] 驗收（真機）：飛航模式下聽/說兩軌仍可用＝「降級不中斷」在 App 上成立。

### Phase 3 — 裝置實測（清單就緒；實測本機做）
- [x] `tests/MANUAL_QA-ANDROID.md` 檢查清單建立（安裝、離線、三軌、權限、
      sidecar 連線、更新後資料保留、上架前最後檢查）。
- [ ] 依清單逐項真機驗證（**全部通過才進 Phase 4 送審**）。
- [ ] 手機 ↔ 5090 sidecar 實連：Tailscale 或 Cloudflare Tunnel 網址填進設定頁；
      若走 LAN `http://` 需 network security config 放行 cleartext（僅 debug build，release 不放行）。
- [ ] 效能：低階機 WebView 上 FSRS 排程與 500 筆音檔快取的體感。

### Phase 4 — Play 上架合規（材料就緒；Console 操作本人做）
- [x] **簽章接線**：`android/app/build.gradle` release 讀 `android/keystore.properties`
      （已 gitignore；範本見 `keystore.properties.example`，含 keytool 指令）。
      → 剩：實際產 keystore＋離線備份、Play App Signing 啟用。
- [x] **版本策略**：versionCode 30000 起、每次上傳 +1；versionName 對齊 package.json（3.0.0）。
- [x] **隱私權政策**：`docs/PRIVACY_POLICY.md`（中英，local-first、不收集、麥克風用途）
      → 剩：放上公開 URL（GitHub Pages）填進 Console。
- [x] **商店文案與流程**：`docs/PLAY_LISTING.md`（名稱/簡短/完整說明草稿、Data safety 填法、
      內容分級、逐步操作、送審避雷）。
- [ ] 商店圖像：feature graphic 1024×500、真機截圖 ≥2 張（QA 時順手擷取）。
- [ ] **⚠️ 個人開發者帳號硬門檻**：封閉測試 **≥12 位測試者、連續 14 天**——Phase 3 一開始
      就先建內部測試軌湊人，讓等待期並行。
- [ ] 內部測試軌 → 封閉測試軌 → 正式發佈。

### Phase 5 — 發佈自動化
- [x] GitHub Actions `.github/workflows/ci.yml`：PR/main 跑 web job（build＋`npm test`＋
      Playwright e2e）與 android job（`build:android`＋`gradlew assembleDebug`＋上傳
      debug APK artifact——可直接下載側載到手機測）。
- [ ] （選配）tag 時用 secrets 裡的 keystore 產簽章 AAB；再進一步 fastlane supply 上傳內測軌。

---

## 3. 風險與陷阱（先寫下來，別踩）

1. **appId 定了就不能改**——Play 用它識別 App。上傳第一個 AAB 前想清楚。
2. **upload keystore 遺失＝災難**。啟用 Play App Signing 可補救，但 keystore 與密碼仍要離線備份兩份。
3. **Dexie schema**：ttsCache 開 `version(3)`，勿動 v1/v2 定義（既有陷阱清單已載明）。
4. **WebView 版本碎片化**：System WebView 太舊的裝置 MediaRecorder / IndexedDB 行為可能異常；minSdk 23 但實務上以 WebView ≥ 90 的裝置為支援目標，QA 清單註明。
5. **原生 ASR 品質**：Android `SpeechRecognizer` 的 ja-JP 辨識與 Chrome Web Speech 不同源，相似度評分閾值可能要重校（`scorer.ts` 的分數分佈先在真機收樣本再調）。
6. **rate 刻度不一致**：Web Speech `rate=1.0` ≠ 原生 TTS `rate=1.0` 聽感，設定頁的語速滑桿要對三個 provider 各自映射。
7. **不要讓 e2e 假設原生環境**：Playwright 繼續只測 web 版（23/23 不能破）；原生行為走 MANUAL_QA-ANDROID.md 人工清單——這符合「不把估計值當實測數據」原則，原生功能沒在真機跑過就不打勾。
8. **審查文案**：商店描述避免「AI 生成內容」誇大；App 內 AI 生成句子維持 `needs_review` 流程，隱私政策提及使用者自架 Anthropic API 的資料流向。

## 4. 驗收定義（v3 出貨線）

- `npm run build` strict 綠燈、`npm test` 全綠、`npm run test:e2e` 全綠、`sidecar/test_score.py` 全綠（既有四關不變）。
- 真機（至少一台實體 Android）：MANUAL_QA-ANDROID.md 全項人工打勾。
- 飛航模式冷啟動可完成當日五任務並蓋章。
- 封閉測試 14 天門檻達成，Play 正式軌上架。

## 5. 粗估工作量

| 階段 | 估計 |
|---|---|
| Phase 0 前置重構 | 1–2 個工作天（可立即開始，web 環境即可） |
| Phase 1 Capacitor 殼 | 0.5–1 天（需本機 Android Studio/SDK） |
| Phase 2 原生語音 | 1–2 天（含真機調參） |
| Phase 3 裝置實測 | 1 天＋日常使用觀察 |
| Phase 4 上架 | 材料準備 1 天＋**封閉測試強制 14 天等待期** |

> 關鍵路徑是 Phase 4 的 14 天封閉測試——建議 Phase 1 一完成就先把內部測試軌建起來、
> 早點湊齊 12 位測試者，讓等待期與 Phase 2/3 並行。
