# sidecar — 5090 workstation

前端（PWA）預設用瀏覽器語音；本 sidecar 在線時自動升級為 VOICEVOX 語音與 whisper 發音評分。

## 快速啟動（基礎能力）
```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8848
```
啟動後 `GET /health` 應回 `{"ok":true,...}`。前端 vite dev server 會把 `/api/*` 代理到此。

## 升級：VOICEVOX 語音
1. 下載並執行 VOICEVOX engine（預設 `http://127.0.0.1:50021`）。
2. 可用環境變數覆寫：`VOICEVOX_URL`、`VOICEVOX_SPEAKER`。
3. `/health` 的 `voicevox` 會變 `true`，前端自動改用。

## 升級：發音評分（faster-whisper）
```bash
pip install faster-whisper
export ENABLE_WHISPER=1
export WHISPER_MODEL=large-v3
```
需要 CUDA。跑在你的 5090 上，離線、不送雲端。

## 對外曝露
沿用現有的 Cloudflare Tunnel / Tailscale，把前端的 `SIDECAR_URL` 指到 tunnel 網址即可。

## 先用 mock 試前端（未裝 VOICEVOX 時）

`mock_voicevox.py` 是一個假的 engine，回傳合法（正弦波）WAV，用來先驗證前端的
說話者選擇／試聽／語音切換整條流程：
```bash
# 終端 1：假 engine
uvicorn mock_voicevox:app --port 50021
# 終端 2：sidecar
VOICEVOX_URL=http://127.0.0.1:50021 uvicorn main:app --port 8848
# 終端 3：前端
cd .. && npm run dev
```
到設定頁按「重新偵測」，即可看到說話者下拉與試聽（聲音是嗶聲，換真 engine 後就是人聲）。

## 升級：發音評分（faster-whisper）補充
- 前端錄的是 webm/opus，faster-whisper 經 PyAV 解碼需系統有 **ffmpeg**。
- 設 `ENABLE_WHISPER=1` 後 `/health` 的 `whisper` 轉 true，前端 SpeakView 自動改用「錄音→上傳評分」。

## 升級：內容生成（LLM）
```bash
export ANTHROPIC_API_KEY=sk-ant-...
export ANTHROPIC_MODEL=claude-sonnet-4-5   # 可選，覆寫預設
```
`/health` 的 `content` 會轉 true。未設 key 時 `/content` 回示範候選，前端審核佇列仍可操作。
生成句一律 `needs_review=true`，須在前端「話す →✨ 生成新練習句」採用後才進學習庫。
