"""後端 /score mora 級診斷測試（不需真 whisper，注入假模型）。
執行：
  cd sidecar && pip install -r requirements.txt
  python test_score.py
"""
import os
import base64

os.environ['ENABLE_WHISPER'] = '1'
import main
from fastapi.testclient import TestClient


class _Seg:
    def __init__(self, t):
        self.text = t


def _fake(transcript):
    class W:
        def transcribe(self, audio, language):
            return ([_Seg(transcript)], None)
    return lambda: W()


client = TestClient(main.app)
AUDIO = 'data:audio/webm;base64,' + base64.b64encode(b'fake').decode()


def score(target, heard):
    main.get_whisper = _fake(heard)
    r = client.post('/score', json={'audio_base64': AUDIO, 'targets': [target]})
    assert r.status_code == 200, r.status_code
    return r.json()


def diff_map(j):
    return {m['mora']: m['status'] for m in j['mora_diff']}


def test_perfect():
    j = score('これをください', 'これをください')
    assert j['score'] == 100
    assert all(m['status'] == 'ok' for m in j['mora_diff'])


def test_sokuon_dropped():
    j = score('きって', 'きて')  # 促音漏發
    assert j['score'] < 100
    assert diff_map(j)['っ'] == 'del'


def test_dakuon_devoiced():
    j = score('でんき', 'てんき')  # 濁音清化
    assert diff_map(j)['で'] == 'sub'


def test_youon_mora():
    j = score('しゅぎょう', 'しゅぎょ')  # 拗音合併 + 尾拍漏發
    assert diff_map(j)['う'] == 'del'
    assert diff_map(j)['しゅ'] == 'ok'


if __name__ == '__main__':
    for fn in [test_perfect, test_sokuon_dropped, test_dakuon_devoiced, test_youon_mora]:
        fn()
        print('✓', fn.__name__)
    print('\n後端 /score 測試全部通過')
