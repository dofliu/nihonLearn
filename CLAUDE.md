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
  lib/        date・importV1（v1→v2 遷移 + 備份匯出）・content（生成 client + 採用）・coverage（覆蓋率檢核，無依賴）・pitch（mora 切分 + 東京式 pattern）
  state/      store（zustand：今日/streak/rate/tts/showKanji）
  views/      Today・Kana・Listen(含 Pitch)・Speak・Read・Progress・Review
  components/ Nav・ui(toast/大印)・VocabCard
sidecar/      FastAPI：/health /tts /speakers /score /content；mock_voicevox.py（假 engine）；test_score.py
tests/        integration.ts（npm test）・INTEGRATION_REPORT.md・MANUAL_QA.md
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

測試：`npm test` 31/31（對真原始碼）、`sidecar/test_score.py` 4/4（假 whisper 注入）、
`npm run build` strict 綠燈。詳見 `tests/INTEGRATION_REPORT.md`。

---

## ⭐ 本機實測任務（此專案轉到 Claude Code 的主因）

以下在先前的純 chat 環境**無法**執行（無瀏覽器 runtime、無真服務、無 GPU）。
Claude Code 在本機可以真正跑起來、觀察、修正。建議依序進行，每項完成後更新
`tests/INTEGRATION_REPORT.md` 與本節勾選。

### A. 瀏覽器行為（跑 `npm run dev`，用 Chrome DevTools）
- [ ] IndexedDB 實際讀寫：完成各軌一輪後檢查 `nihongo-michi` DB 各表；重整後進度保留；
      Dexie v1→v2 升級在既有資料上不遺失（可先塞 v1 格式資料再升級驗證）。
- [ ] MediaRecorder 錄音：`話す` whisper 模式的 🎤→⏹ 起停、webm blob 產生、base64 上傳。
- [ ] Web Speech：`話す` ASR 模式（Chrome 限定；Firefox/Safari 應正確降級自評）。
- [ ] 蓋章／streak 動畫、toast、大印 overlay 的實際觀感與時序。
- [ ] 用 Playwright/Puppeteer 寫端到端點按測試（目前完全缺，這是最高價值的補洞）。

### B. 真 VOICEVOX（下載官方 engine，取代 mock）
- [ ] 啟動官方 VOICEVOX engine，`/health` 的 `voicevox` 轉 true，前端聽到真人聲。
- [ ] 說話者切換、`speedScale`（rate）對聽感的影響；挑一個適合教學的預設聲線。
- [ ] service worker 對 `/api/tts` 的 CacheFirst 是否真的離線可複習（關網測）。

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
- [ ] 桌面與手機安裝、離線開啟、圖示（目前 manifest 指 icon-192/512.png，**需補上實際圖檔**於 `public/`）。
- [ ] iOS Safari 的語音（Kyoko）與 Android Chrome 的差異。

## Roadmap（本機實測之後）

1. **真聲學 GOP**（發音評分天花板）：wav2vec2-CTC 日語音素模型 + 強制對齊，逐音素後驗機率。
   `/score_gop` 接口與演算法已在 `sidecar/main.py` 末段註記。前端可疊加到現有 mora 診斷上色。
2. **vocab i+1 生成**：D 項的個人化 known_words。
3. **pitch accent 擴充**：接 OJAD 或字典資料源（標註來源），擴大重音道場詞庫。
4. **漢字模式深化**：短文提供漢字/假名雙版；vocab 加漢字書寫練習。
5. **內容審核佇列持久化**：目前生成候選在記憶體，退回即消失；可存 DB 做「稍後再審」。

## 已知陷阱

- **`npm test` 用 Node 22 `--experimental-strip-types`**，直接跑 `.ts`；被測檔的 import 需能在 Node 解析
  （純函式檔 OK；依賴 Dexie 的檔會炸——這就是覆蓋率邏輯抽成 `lib/coverage.ts` 的原因）。
- **FSRS lapse 語義**：只在 Review 狀態答錯才計 lapse，Learning 不計。寫測試時別誤判。
- **Dexie 版本**：schema 已到 `version(2)`。再改 schema 要 `version(3)` 並處理升級，勿改動舊版定義。
- **Web Speech 僅 Chromium 系**；MediaRecorder 產 webm/opus，whisper 端需 ffmpeg 解碼。
- **artifact/沙箱限制**：先前環境麥克風可能被封鎖——本機無此問題，正好補測。
- **pitch accent 正確性**：新增重音資料務必查證來源，別讓 LLM 直接生 accent 數字（Dof 會發現錯誤）。
- **`content.ts` re-export** `analyzeCoverage`/`Coverage` 自 `coverage.ts`；呼叫端 import 路徑不變。

## 提交前檢查

`npm run build`（strict 綠燈）＋ `npm test`（31/31）＋（動到 sidecar 時）`python sidecar/test_score.py`。
新功能盡量補測：純邏輯進 `tests/integration.ts`，UI 流程用 Playwright，後端進 `test_score.py`。
