"""Mock VOICEVOX engine — 僅用於容器驗證 sidecar proxy 鏈路。
模擬真 engine 的 /version /speakers /audio_query /synthesis，
/synthesis 回傳一段合法（靜音）WAV，證明 sidecar→engine→前端整條路正確。
真部署時換成官方 VOICEVOX engine 即可，介面一致。"""
import math
import struct
import wave
import io
from fastapi import FastAPI, Request
from fastapi.responses import Response, JSONResponse

app = FastAPI()


@app.get("/version")
def version():
    return "mock-0.1"


@app.get("/speakers")
def speakers():
    return [
        {"name": "四国めたん", "styles": [{"id": 2, "name": "ノーマル"}, {"id": 0, "name": "あまあま"}]},
        {"name": "ずんだもん", "styles": [{"id": 3, "name": "ノーマル"}, {"id": 1, "name": "あまあま"}]},
    ]


@app.post("/audio_query")
def audio_query(text: str, speaker: int):
    # 真 engine 回一大包韻律參數；mock 只回我們會改的欄位
    return {"speedScale": 1.0, "pitchScale": 0.0, "text": text, "speaker": speaker}


@app.post("/synthesis")
async def synthesis(request: Request, speaker: int):
    body = await request.json()
    speed = body.get("speedScale", 1.0)
    # 產生 0.3 秒、依 speed 調整長度的正弦波 WAV（440Hz），證明二進位鏈路
    sr = 24000
    dur = 0.3 / max(0.5, speed)
    n = int(sr * dur)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        frames = b"".join(
            struct.pack("<h", int(3000 * math.sin(2 * math.pi * 440 * i / sr)))
            for i in range(n)
        )
        w.writeframes(frames)
    return Response(content=buf.getvalue(), media_type="audio/wav")
