"""
日本語の道 — sidecar (5090 workstation)

前端會自動偵測 /api/health 的 voicevox 旗標決定要不要用高品質語音。
本檔提供四個端點的可運行骨架：
  GET  /health            -> 回報各能力是否在線
  GET  /tts?text=&rate=   -> VOICEVOX 合成 wav（未接時回 501）
  POST /score             -> faster-whisper 發音評分（未接時回 501）
  POST /content           -> LLM 生成分級句/短文候選（需人工審核後才入庫）

依賴分層安裝：先跑得起來（fastapi+uvicorn），再逐一補 voicevox / whisper。
啟動：
  cd sidecar
  python -m venv .venv && source .venv/bin/activate   # Windows: .venv\\Scripts\\activate
  pip install -r requirements.txt
  uvicorn main:app --host 0.0.0.0 --port 8848
沿用你現有的 Cloudflare Tunnel / Tailscale 對外曝露。
"""
from __future__ import annotations

import io
import os
import re
import json
import httpx
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from article import NEWS_LIST_URL, article_url, parse_news_list, parse_article

app = FastAPI(title="nihongo-michi-sidecar", version="2.0.0")

# 開發時前端跑在 vite(5173)，正式走 tunnel；寬鬆 CORS，實際部署請收斂白名單。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

VOICEVOX_URL = os.environ.get("VOICEVOX_URL", "http://127.0.0.1:50021")
VOICEVOX_SPEAKER = int(os.environ.get("VOICEVOX_SPEAKER", "3"))  # ずんだもん等
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "large-v3")

# whisper 模型延遲載入（避免無 GPU 環境啟動即失敗）
_whisper = None


def get_whisper():
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel  # type: ignore

        _whisper = WhisperModel(WHISPER_MODEL, device="cuda", compute_type="float16")
    return _whisper


async def voicevox_online() -> bool:
    try:
        async with httpx.AsyncClient(timeout=1.5) as c:
            r = await c.get(f"{VOICEVOX_URL}/version")
            return r.status_code == 200
    except Exception:
        return False


@app.get("/health")
async def health():
    vv = await voicevox_online()
    return {
        "ok": True,
        "voicevox": vv,
        "whisper": bool(os.environ.get("ENABLE_WHISPER")),
        "content": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "article": True,  # NHK Easy 文章導入（翻譯另需 content=true）
    }


@app.get("/speakers")
async def speakers():
    """列出 VOICEVOX 可用說話者（攤平成 style 層級供前端下拉選）。"""
    if not await voicevox_online():
        return Response(status_code=501, content="voicevox offline")
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{VOICEVOX_URL}/speakers")
        raw = r.json()
    out = []
    for sp in raw:
        for st in sp.get("styles", []):
            out.append(
                {"id": st["id"], "name": sp["name"], "style": st["name"]}
            )
    return {"speakers": out, "default": VOICEVOX_SPEAKER}


@app.get("/tts")
async def tts(text: str, rate: float = 0.85, speaker: int | None = None):
    """VOICEVOX 兩段式合成：audio_query -> synthesis。回 audio/wav。"""
    spk = speaker if speaker is not None else VOICEVOX_SPEAKER
    if not await voicevox_online():
        return Response(status_code=501, content="voicevox offline")
    async with httpx.AsyncClient(timeout=30) as c:
        q = await c.post(
            f"{VOICEVOX_URL}/audio_query",
            params={"text": text, "speaker": spk},
        )
        query = q.json()
        # rate → 語速（VOICEVOX speedScale）。慢速練聽力、常速練跟讀。
        query["speedScale"] = max(0.5, min(2.0, rate + 0.15))
        syn = await c.post(
            f"{VOICEVOX_URL}/synthesis",
            params={"speaker": spk},
            json=query,
        )
        return Response(content=syn.content, media_type="audio/wav")


class ScoreReq(BaseModel):
    audio_base64: str
    targets: list[str]  # 假名版 + 漢字版


def kata_to_hira(s: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def norm_kana(s: str) -> str:
    return kata_to_hira("".join(ch for ch in s if ch not in "。、！？!?.,「」 \t\n"))


def levenshtein(a: str, b: str) -> int:
    m, n = len(a), len(b)
    if not m:
        return n
    if not n:
        return m
    prev = list(range(n + 1))
    for i in range(1, m + 1):
        cur = [i] + [0] * n
        for j in range(1, n + 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] != b[j - 1]))
        prev = cur
    return prev[n]


def similarity(heard: str, targets: list[str]) -> int:
    h = norm_kana(heard)
    if not h:
        return 0
    best = 0.0
    for t in targets:
        nt = norm_kana(t)
        if not nt:
            continue
        best = max(best, 1 - levenshtein(h, nt) / max(len(h), len(nt)))
    return round(best * 100)


_SMALL = "ゃゅょぁぃぅぇぉゎ"


def split_mora(kana: str) -> list[str]:
    out: list[str] = []
    for ch in kana:
        if ch in _SMALL and out:
            out[-1] += ch
        else:
            out.append(ch)
    return out


def align_mora(target: list[str], heard: list[str]) -> list[dict]:
    """
    target 每個 mora 對 heard 的對齊狀態：ok（發對）/ sub（發成別的）/ del（漏發）。
    這是 mora 級發音診斷——比單一分數更能指出「哪個音沒發對」。
    真聲學 GOP（每音素後驗機率）需 wav2vec2-CTC 音素模型，見下方註記。
    """
    n, m = len(target), len(heard)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        dp[i][0] = i
    for j in range(m + 1):
        dp[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            c = 0 if target[i - 1] == heard[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + c)
    i, j = n, m
    res: list[dict] = []
    while i > 0:
        diag = dp[i - 1][j - 1] + (0 if (j > 0 and target[i - 1] == heard[j - 1]) else 1)
        if j > 0 and dp[i][j] == diag:
            ok = target[i - 1] == heard[j - 1]
            res.append({"mora": target[i - 1], "status": "ok" if ok else "sub"})
            i -= 1
            j -= 1
        elif dp[i][j] == dp[i - 1][j] + 1:
            res.append({"mora": target[i - 1], "status": "del"})
            i -= 1
        else:
            j -= 1  # heard 多發的音，略過
    res.reverse()
    return res


@app.post("/score")
async def score(req: ScoreReq):
    """
    faster-whisper 轉寫 → 假名正規化 → 相似度。
    進階（未實作）：wav2vec2-CTC 音素對齊做 GOP 音素級評分。
    """
    if not os.environ.get("ENABLE_WHISPER"):
        return Response(status_code=501, content="whisper disabled (set ENABLE_WHISPER=1)")
    import base64

    audio_bytes = base64.b64decode(req.audio_base64.split(",")[-1])
    model = get_whisper()
    segments, _ = model.transcribe(io.BytesIO(audio_bytes), language="ja")
    transcript = "".join(s.text for s in segments).strip()
    # mora 級診斷：以第一個 target（通常為假名版）為對齊基準
    target_kana = norm_kana(req.targets[0]) if req.targets else ""
    mora_diff = align_mora(split_mora(target_kana), split_mora(norm_kana(transcript)))
    return {
        "transcript": transcript,
        "score": similarity(transcript, req.targets),
        "mora_diff": mora_diff,
    }


class ContentReq(BaseModel):
    theme: str  # 'daily' | 'ninja' | 'quest'
    known_words: list[str]
    n: int = 5


ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")

THEME_DESC = {
    "daily": "日常生活情境（買東西、問路、打招呼、點餐）",
    "ninja": "熱血忍者冒險（修行、夥伴、成長、不放棄）",
    "quest": "奇幻魔法旅途（旅行、回憶、時間、溫柔的告別）",
}

# 無 API key 時的示範候選，讓審核 UI 可先跑通（一樣進人工審核佇列）
DEMO = {
    "daily": [
        {"jp": "みずを ください。", "zh": "請給我水。", "read": "みずをください", "new_words": []},
        {"jp": "えきは どこですか。", "zh": "車站在哪裡？", "read": "えきはどこですか", "new_words": []},
        {"jp": "これは いくらですか。", "zh": "這個多少錢？", "read": "これはいくらですか", "new_words": []},
    ],
    "ninja": [
        {"jp": "まいにち しゅぎょうする。", "zh": "每天修行。", "read": "まいにちしゅぎょうする",
         "new_words": [{"jp": "しゅぎょう", "zh": "修行"}]},
        {"jp": "なかまを まもる。", "zh": "守護夥伴。", "read": "なかまをまもる",
         "new_words": [{"jp": "まもる", "zh": "守護"}]},
        {"jp": "あきらめない。", "zh": "不放棄。", "read": "あきらめない",
         "new_words": [{"jp": "あきらめる", "zh": "放棄"}]},
    ],
    "quest": [
        {"jp": "たびは つづく。", "zh": "旅途繼續。", "read": "たびはつづく",
         "new_words": [{"jp": "たび", "zh": "旅途"}]},
        {"jp": "きみを おぼえている。", "zh": "我記得你。", "read": "きみをおぼえている",
         "new_words": [{"jp": "おぼえる", "zh": "記得"}]},
        {"jp": "また あいましょう。", "zh": "再相見吧。", "read": "またあいましょう",
         "new_words": [{"jp": "あう", "zh": "見面"}]},
    ],
}


def _strip_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[-1]
        if s.endswith("```"):
            s = s.rsplit("```", 1)[0]
    return s.strip()


@app.post("/content")
async def content(req: ContentReq):
    """
    i+1 內容生成：限定詞彙表（已學詞 + 每句最多 1 個新詞）產出候選句。
    產物一律 needs_review=True，須經前端審核佇列人工採用後才入學習庫。
    無 ANTHROPIC_API_KEY 時回示範候選（同樣進審核）。
    """
    key = os.environ.get("ANTHROPIC_API_KEY")
    theme_desc = THEME_DESC.get(req.theme, req.theme)

    if not key:
        return {
            "generated": True,
            "needs_review": True,
            "demo": True,
            "theme": req.theme,
            "candidates": DEMO.get(req.theme, DEMO["daily"])[: req.n],
            "note": "示範候選（未設 ANTHROPIC_API_KEY）。設 key 後改由 LLM 生成。",
        }

    known = "、".join(req.known_words[:120])
    system = (
        "你是日語初級教學內容設計者，服務對象是中文母語、剛學完五十音的成人。"
        "嚴格遵守：(1) 主要使用提供的『已知詞彙』；(2) 每句最多引入 1 個新詞，"
        "新詞要在 new_words 標出中文；(3) 句子以平假名為主、簡短、實用；"
        "(4) 只輸出 JSON，不要任何解說或 markdown。"
    )
    user = (
        f"主題：{theme_desc}\n已知詞彙：{known}\n"
        f"請產出 {req.n} 個句子。JSON 格式：\n"
        '{"candidates":[{"jp":"平假名句子","zh":"中文","read":"純假名讀音",'
        '"new_words":[{"jp":"新詞","zh":"中文"}]}]}'
    )

    try:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": ANTHROPIC_MODEL,
                    "max_tokens": 1024,
                    "system": system,
                    "messages": [{"role": "user", "content": user}],
                },
            )
        data = r.json()
        text = "".join(b.get("text", "") for b in data.get("content", []))
        parsed = json.loads(_strip_fences(text))
        cands = parsed.get("candidates", [])[: req.n]
        return {
            "generated": True,
            "needs_review": True,  # 人工審核前不得進庫
            "theme": req.theme,
            "candidates": cands,
        }
    except Exception as e:
        return Response(status_code=502, content=f"content generation failed: {e}")


# ── NHK やさしいニュース 文章導入 ───────────────────────────
# 設計：注音（ruby）繼承 NHK 人工標註；LLM 只做中文對照與生詞解說，
# 且一律 needs_review。解析純函式在 article.py（test_article.py 驗證）。

NHK_HEADERS = {"User-Agent": "Mozilla/5.0 (nihongo-michi sidecar; personal learning app)"}
_NEWS_ID_RE = re.compile(r"^[A-Za-z0-9_]+$")


@app.get("/article/list")
async def article_list():
    """最新 NHK Easy 文章列表。"""
    try:
        async with httpx.AsyncClient(timeout=15, headers=NHK_HEADERS) as c:
            r = await c.get(NEWS_LIST_URL)
        if r.status_code != 200:
            return Response(status_code=502, content=f"nhk list http {r.status_code}")
        return {"articles": parse_news_list(r.content)}
    except Exception as e:
        return Response(status_code=502, content=f"nhk list failed: {e}")


@app.get("/article/get")
async def article_get(id: str):
    """單篇文章：標題與逐句（jp 含 ruby 的安全 HTML、read 純讀音）。"""
    if not _NEWS_ID_RE.match(id):
        return Response(status_code=400, content="bad article id")
    try:
        async with httpx.AsyncClient(timeout=20, headers=NHK_HEADERS, follow_redirects=True) as c:
            r = await c.get(article_url(id))
        if r.status_code != 200:
            return Response(status_code=502, content=f"nhk article http {r.status_code}")
        parsed = parse_article(r.text)
        if not parsed["lines"]:
            return Response(status_code=502, content="article body not found (NHK 版型可能變了)")
        return {"id": id, "source": "nhk", "needs_review": True, **parsed}
    except Exception as e:
        return Response(status_code=502, content=f"nhk article failed: {e}")


class AnnotateReq(BaseModel):
    title_read: str
    lines: list[str]  # 每句讀音
    known_words: list[str] = []


@app.post("/article/annotate")
async def article_annotate(req: AnnotateReq):
    """
    LLM 補中文對照與生詞解說。無 ANTHROPIC_API_KEY 時回空翻譯（demo），
    文章本體（NHK 原文＋注音）仍可用。
    """
    key = os.environ.get("ANTHROPIC_API_KEY")
    n = len(req.lines)
    if not key:
        return {
            "demo": True,
            "needs_review": True,
            "title_zh": "",
            "zh": [""] * n,
            "new_words": [],
            "note": "未設 ANTHROPIC_API_KEY——僅原文＋注音，無中文對照。",
        }

    known = "、".join(req.known_words[:120])
    numbered = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(req.lines))
    system = (
        "你是日語教學助理，服務對象是中文母語的日語初學者。"
        "對 NHK やさしいニュース 的句子提供繁體中文翻譯，並挑出對初學者重要的生詞。"
        "生詞的假名讀音必須取自句子本身既有的讀音，不得自行標音。"
        "只輸出 JSON，不要任何解說或 markdown。"
    )
    user = (
        f"標題（讀音）：{req.title_read}\n句子：\n{numbered}\n"
        f"學習者已知詞彙：{known}\n"
        f"輸出 JSON：{{\"title_zh\":\"標題中文\",\"zh\":[依序 {n} 句的繁體中文],"
        "\"new_words\":[{\"jp\":\"生詞（句中原形）\",\"read\":\"讀音（取自句子）\",\"zh\":\"中文\"}]}"
        "（new_words 最多 8 個，選最影響理解的）"
    )
    try:
        async with httpx.AsyncClient(timeout=90) as c:
            r = await c.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": ANTHROPIC_MODEL,
                    "max_tokens": 2048,
                    "system": system,
                    "messages": [{"role": "user", "content": user}],
                },
            )
        data = r.json()
        text = "".join(b.get("text", "") for b in data.get("content", []))
        parsed = json.loads(_strip_fences(text))
        zh = list(parsed.get("zh", []))[:n] + [""] * max(0, n - len(parsed.get("zh", [])))
        return {
            "needs_review": True,
            "title_zh": str(parsed.get("title_zh", "")),
            "zh": [str(s) for s in zh],
            "new_words": parsed.get("new_words", [])[:8],
        }
    except Exception as e:
        return Response(status_code=502, content=f"annotate failed: {e}")


# ── 真聲學 GOP（進階，未實作）──────────────────────────────
# 目前 /score 回的是「mora 級對齊診斷」（whisper 轉寫 vs 目標假名的編輯對齊），
# 能指出哪個 mora 漏發或發成別的音，但不看聲學品質。
# 真正的 GOP（Goodness of Pronunciation）需音素級聲學模型：
#   1. 載入日語 wav2vec2-CTC（如 phoneme-level 模型），取每幀音素後驗機率
#   2. 用目標音素序列對錄音做強制對齊（forced alignment）
#   3. GOP(p) = log P(p|frames_p) - max_q log P(q|frames_p)，逐音素評分
# 這能區分「發對但不標準」與「發成別的音」，是發音評分的天花板。
# 接法：另開 /score_gop 端點，回 [{phoneme, gop_score}]，前端疊加到 mora 診斷上。
