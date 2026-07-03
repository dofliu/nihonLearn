# 日本語の道 v2 — 本機專案架構規劃

> 前提：v1 Artifact 先跑 2–4 週，驗證「每日蓋章 + SRS + 三軌」學習迴圈是否留得住人。
> v2 只在確認迴圈有效後啟動，並繼承 v1 的資料（export/import JSON）。

## 1. 產品定位

個人化日語學習 PWA，聽說讀三軌，本地優先（local-first）。
差異化：利用你既有的 5090 工作站，把「語音品質」與「發音評分」做到消費級 App 做不到的水準。

## 2. 系統架構

```
┌─ Client: PWA (React + Vite + TypeScript) ─────────────┐
│  UI / SRS 排程 / 進度 / 離線快取 (IndexedDB + Dexie)   │
└──────────────┬────────────────────────────────────────┘
               │ REST / WebSocket（可離線降級）
┌─ Sidecar: FastAPI on 5090 workstation ────────────────┐
│  /tts      VOICEVOX（開源日語 TTS，多說話者、可調語速韻律）│
│  /score    faster-whisper 轉寫 + kana 正規化 + 相似度    │
│            （進階：GOP 音素級評分, wav2vec2-CTC）        │
│  /content  LLM 生成分級句／短文 → 人工審核 → 入庫        │
│  (經 Cloudflare Tunnel / Tailscale 曝露，沿用現有配置)   │
└───────────────────────────────────────────────────────┘
```

離線降級策略：sidecar 不可達時，TTS 退回 Web Speech API、評分退回自評——功能不中斷，品質分層。

## 3. 核心模組

| 模組 | v1（Artifact） | v2 升級 |
|------|----------------|---------|
| SRS | 簡化 SM-2 | **ts-fsrs**（FSRS-4.5，留存率參數可調） |
| TTS | 瀏覽器內建 | VOICEVOX（自然度大幅提升，可多角色） |
| 發音評分 | SpeechRecognition 字串相似度 | faster-whisper + 假名對齊 + 音素級 GOP |
| 聽力 | 12 組 minimal pairs | 生成式 pairs 庫 + pitch accent（OJAD 資料）|
| 閱讀 | 3 篇固定短文 | LLM 生成 i+1 分級文本管線（見 §5） |
| 詞彙 | 56 詞固定池 | JLPT N5→N3 詞庫 + 例句挖空（cloze） |

## 4. 資料模型（Dexie / IndexedDB）

```ts
cards      { id, type: 'kana'|'vocab'|'sentence', front, back, media?,
             fsrs: { due, stability, difficulty, reps, lapses, state } }
sessions   { date, taskCounts, durationSec }
stamps     { date, complete }
attempts   { ts, sentenceId, score, transcript, audioBlob? }   // 發音成長曲線
settings   { rate, dailyNewCards, voiceId }
```

同步：階段一單機即可；階段二若要跨裝置，加一層 SQLite + Litestream 或 Supabase，以 CRDT 心態設計（last-write-wins per key 足夠）。

## 5. 內容生成管線（關鍵差異化）

```
主題種子（日常 / 忍者 / 魔法旅途）
  → LLM 生成候選句（限定詞彙表 = 已學詞 + 每句最多 1 個新詞，i+1 原則）
  → 規則檢核（詞彙覆蓋率、假名/漢字比例、句長）
  → 人工審核佇列（一鍵採用/退回）── 內容進庫前必經人審
  → VOICEVOX 預生成音檔快取
```

原則：AI 生成內容一律標記來源並經人工審核後才進學習庫（與你的資料誠信原則一致）。

## 6. 里程碑

| 週次 | 交付 |
|------|------|
| W1–2 | repo 腳手架、Dexie schema、v1 JSON 匯入器、ts-fsrs 接入 |
| W3–4 | VOICEVOX sidecar + /tts、離線降級 |
| W5–6 | faster-whisper /score、發音成長曲線頁 |
| W7–8 | 內容生成管線 + 審核 UI；N5 詞庫導入 |
| W9+  | pitch accent 訓練、聽力變速精聽（0.6→1.2x）、PWA 安裝與通知 |

## 7. v1 → v2 遷移

v1 在「今日」頁加一顆「匯出進度 JSON」按鈕（v1.1 再補），v2 首次啟動讀入：
kana SRS 狀態映射到 fsrs 初始 stability/difficulty，stamps 與 streak 直接沿用——連續天數不歸零，這是習慣資產。

## 8. 開放問題（下次討論）

1. 發音評分要到音素級（GOP）還是句級相似度就夠？前者工程量 ×3。
2. pitch accent 是否納入 v2（中文母語者長期天花板，但 N5 階段 ROI 低）。
3. 是否做成可給學生用的多使用者版（那就是另一個產品了——先不要）。
