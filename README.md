# 日本語の道（Nihongo no Michi）

**繁體中文** ｜ [English](README.en.md)

個人化日語學習 App — 聽說讀三軌、local-first、習慣養成優先。
從 v1 Artifact 起步，經 v2 產品化（PWA），到 v3 以 Capacitor 包裝為可上架 Google Play 的 Android App。

> 使用者設定：中文母語、剛學完五十音的成人。設計哲學：**正確性交給權威來源與程式驗證，
> AI 生成內容一律需人工審核採用才入庫；使用者只做「策展」（想不想學），不當正確性把關者。**

## 版本沿革

| 版本 | 重點 |
|--|--|
| v1（Artifact） | 概念驗證：簡化 SM-2、單一 JSON 存檔、瀏覽器語音 |
| **v2** | 產品化：FSRS-4.5 排程、IndexedDB/Dexie 分表、VOICEVOX/whisper sidecar、PWA、v1 匯入 |
| **v3.0** | **Android 上架**：Capacitor 殼、原生 TTS/ASR、Dexie TTS 快取、簽章與上架材料、CI |
| **v3.1** | 內容彈性化：NHK やさしいニュース 文章導入、生成句審核佇列持久化 |
| **v3.2** | 初學者體驗：短文中文對照整篇切換、詞彙隨假名進度解鎖、離線降級 |
| **v3.3** | **AI 生成改 Gemini 直連**：App 內設金鑰，手機免 sidecar 即可生成 |
| **v3.4** | **N5 模擬測驗**：從已學詞卡自動出題（意味/語彙/聽力/重組），計分＋弱項分析 |
| **v3.5** | **朗讀逐字上色**：朗讀時日文逐字卡拉OK上色（真實 timing：Web Speech boundary／原生 onRangeStart） |
| **v3.6** | **AI 助教**（Gemini 對話、grounding 已學詞、僅供參考、不寫入學習庫）＋ **vocab i+1 個人化** |
| **v3.7** | **聽力理解**：耳の修行新增「聞き取り」——聽對話／情境句選中文意思、答後揭曉日文 |
| **v3.8** | **段落聽解 + 短文情境分類**：聞き取り分句子/段落（聽整段對話答大意）；短文依基礎/旅遊/生活/商業分組 |
| **v3.9** | **JLPT 聴解題型**：聞き取り重構為 N5 四大題型選單，新增即時応答（聽短問選回應）、発話表現（看情境選說法） |
| **v3.10** | **AI 段落理解題（LLM 只生中文）**：Gemini 只寫中文問題/選項、疊在已驗證短文上，審核採用後併入段落題庫 |

連續天數與已學假名可從 v1 一鍵匯入，不歸零。

## 快速啟動

```bash
npm install
npm run dev          # http://localhost:5173（Web/PWA 開發）
npm run build        # tsc -b && vite build（strict，必須綠燈才提交）
npm test             # 前端邏輯回歸（Node 22 直跑 .ts）
npm run test:e2e     # Playwright 瀏覽器 E2E（自動起 dev server）

# Android（需 Android Studio / SDK）
npm run android:open # 打包 web 資產（無 SW）→ cap sync → 開 Android Studio
npm run android:run  # 直接跑到連線的裝置/模擬器

# sidecar（選配，跑在使用者的 5090 工作站）
cd sidecar
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8848
python test_score.py     # /score mora 診斷（注入假 whisper）
python test_article.py   # NHK 文章解析（fixture HTML）
```

## 五項每日修行（習慣引擎）

字（10 枚假名 SRS）・ことば（至多 6 詞 FSRS，**隨假名進度解鎖**）・耳（辨音 5 題）・
口（跟讀 3 句）・読（短文 1 篇）。五項全完成 → 蓋下當日朱印「済」。約 10 分鐘／日，
低門檻優先於高強度。當日沒有可解鎖的新詞時，詞彙任務自動達標、不卡蓋章。

## 設定入口

**點頁首標題「日本語の道」** 打開設定頁，內含：語音來源、Sidecar 位址、
**AI 生成（Gemini）金鑰**、漢字模式、v1 匯入／v2 匯出。

## AI 生成（Gemini 直連）

生成練習句與 NHK 文章中文對照由 **App 直接呼叫 Google Gemini**，手機不需內網穿透。

1. 到 `aistudio.google.com/apikey` 免費申請金鑰。
2. App 設定頁 →「AI 生成（Gemini）」→ 貼上金鑰、（可選）改模型 → 「儲存並測試 Gemini」。
3. 「話す → 生成新練習句」與 NHK 時事文章的中文對照即走真 LLM。

金鑰只存裝置本機（localStorage），不進 git／APK／備份。未設金鑰時走內建離線示範內容，
功能不中斷。生成內容一律經審核佇列，你採用後才入學習庫。

> CORS 對策：原生（Android）走 Capacitor `CapacitorHttp`（繞過 WebView 的 CORS），
> web 走 fetch。

## 架構

```
src/
  data/        內容（kana 142・vocab ~190 N5・sentences・pairs・pitch・passages）— 唯一事實來源
  db/          Dexie schema(v6) + repo（任務計數、蓋章、卡片、發音紀錄、生成句、文章、TTS 快取、測驗結果、段落理解題）
  srs/         FSRS 排程封裝（新卡 / 評級 / 到期 / 定著判定）
  audio/       tts（VOICEVOX ▸ 原生 ▸ Web Speech 門面 + Dexie 快取）、scorer（whisper ▸ 原生/Web ASR ▸ 自評）
  lib/         sidecar（base URL 抽象）、llm（Gemini 直連 + 對話）、llmParse（純解析）、content（生成 client + i+1 已學詞）、
               articles（NHK 導入）、vocabGate（詞彙隨假名解鎖）、quiz（N5 模擬測驗出題）、karaoke（朗讀逐字上色）、coverage（覆蓋率檢核）、
               pitch、date、importV1
  views/       Today / Kana / Listen(含 Pitch) / Speak / Read / Progress / Review / Quiz / Tutor
  components/  Nav、ui（toast、蓋章大印）、VocabCard
sidecar/       FastAPI（5090）：/health /tts /speakers /score /content /article/*
android/       Capacitor Android 專案（appId com.dof.nihongomichi）
docs/          ANDROID_RELEASE_PLAN、PRIVACY_POLICY、PLAY_LISTING
```

**資料流**：`data/` 靜態內容 → 使用者互動 → `repo` 寫 IndexedDB → `store.refresh()` 重讀 → views 訂閱。
**降級不中斷**：sidecar/Gemini 離線 → 走瀏覽器能力或內建離線內容，功能都不中斷。

## 主要功能

- **三軌 FSRS**：假名與詞彙共用 ts-fsrs 間隔重複；詞彙隨假名進度解鎖，不冒出還沒學到的字。
- **聴く：辨音＋聞き取り（JLPT 題型）＋重音**：辨音（最小對立組）；**聞き取り貼近 JLPT N5 四大題型**——句子聽解（ポイント理解）、段落對話（課題理解）、即時応答（聽短問選回應）、発話表現（看情境選說法），題材全來自已驗證資料、不經 LLM；重音（東京式高低型視覺化，規則生成）。段落理解題還可用 **AI 自製更多**——Gemini 只寫中文問題/選項、疊在已驗證短文上，你採用後併入題庫（日文題材不由 AI 生）。
- **分級閱讀依情境分類**：短文分基礎／旅遊／生活／商業四類，含中文對照與逐字上色。
- **跟讀三段式評分**：whisper（5090）→ 原生/瀏覽器 ASR → 自評，附 mora 級逐拍診斷（促音漏發、濁音清化上色）。
- **分級閱讀 + 時事**：靜態短文＋**NHK やさしいニュース 導入**（注音繼承 NHK 人工標註，LLM 只補中文對照），中文對照可整篇切換。
- **AI 內容生成 + 審核佇列**：Gemini 依已學詞彙生成候選（每句 ≤1 新詞）＋程式覆蓋率檢核；持久化佇列，退回前不消失；採用才入庫。
- **N5 模擬測驗**：從已學詞卡自動出題（意味/語彙/聽力/重組四型），計分＋跨測驗弱項分析。素材全來自已驗證資料、不經 LLM。
- **朗讀逐字上色**：口說・今日ひとこと・短文純假名行，朗讀時日文逐字高亮（真實 timing：Web Speech boundary／Android onRangeStart）。
- **AI 助教**（今日頁「🤖 AI 助教」）：Gemini 對話，grounding 在你已學過的詞、盡量用學過的詞舉例；回答標明僅供參考、**永不寫入學習資料庫**；需 Gemini 金鑰。
- **發音成長曲線、漢字模式、PWA、VOICEVOX 語音、v1 匯入**。

## 測試

| 層級 | 指令 | 結果 |
|--|--|--|
| 建置（strict） | `npm run build` | ✅ 綠燈，PWA SW 生成 |
| 前端邏輯 | `npm test` | ✅ 113 / 113 |
| 瀏覽器 E2E | `npm run test:e2e` | ✅ 39 / 39 |
| 後端評分 | `python sidecar/test_score.py` | ✅ 4 / 4 |
| 後端文章解析 | `python sidecar/test_article.py` | ✅ 13 / 13 |
| Android 殼可編譯 | GitHub Actions `android` job（`gradlew assembleDebug`） | ✅ |

詳見 `tests/INTEGRATION_REPORT.md`。真機驗收清單見 `tests/MANUAL_QA-ANDROID.md`（未通過前勿送審）。

## Android 上架

完整規劃、簽章、Play Console 流程與封閉測試門檻見 `docs/ANDROID_RELEASE_PLAN.md`、
`docs/PLAY_LISTING.md`、`docs/PRIVACY_POLICY.md`。程式碼與 CI 編譯已完成；
真機 QA 與 Play 上架（含個人帳號 12 測試者 × 14 天封閉測試）需在本機/Console 進行。

## Roadmap ／ 後續接續工作

完整的後續工作與接手須知見 **[`ROADMAP.md`](ROADMAP.md)**。優先序摘要：

1. **Android 真機 QA ＋ Google Play 封閉測試**（上架關鍵路徑；清單見 `tests/MANUAL_QA-ANDROID.md`）。
2. **pitch accent 詞庫擴充**（接 OJAD／字典來源、標註出處；不讓 LLM 生 accent 數字）。
3. **漢字模式深化**（短文漢字/假名雙版、vocab 書寫練習）。
4. **真聲學 GOP**（wav2vec2-CTC 音素模型＋強制對齊，逐音素評分）— 發音評分天花板。
5. **聽力題型續強化**（段落細節題、商業/旅遊單句；素材仍走已驗證資料或「LLM 只生中文」）。

已完成：~~測驗模組~~（v3.4）、~~AI 助教~~（v3.6）、~~vocab i+1~~（v3.6）、
~~JLPT 聴解題型~~（v3.9）、~~AI 段落理解題~~（v3.10）。

## 文件索引

- **[`README.en.md`](README.en.md)** — English version
- **[`ROADMAP.md`](ROADMAP.md)** — roadmap 與後續接續工作
- `CLAUDE.md` — 開發約定、架構地圖、已知陷阱（Claude Code 進場自動載入）
- `docs/` — `ANDROID_RELEASE_PLAN`、`PLAY_LISTING`、`PRIVACY_POLICY`
- `tests/` — `INTEGRATION_REPORT`、`MANUAL_QA`、`MANUAL_QA-ANDROID`
