import { useEffect, useState } from 'react'
import { Nav, type Tab } from './components/Nav'
import { Toast, BigStamp, toast } from './components/ui'
import { TodayView } from './views/TodayView'
import { KanaView } from './views/KanaView'
import { ListenView } from './views/ListenView'
import { SpeakView } from './views/SpeakView'
import { ReadView } from './views/ReadView'
import { ProgressView } from './views/ProgressView'
import { ReviewView } from './views/ReviewView'
import { useApp, bootstrap } from './state/store'
import { importV1, exportV2, type V1Save } from './lib/importV1'
import {
  listSpeakers,
  setSpeaker,
  getSpeaker,
  speak,
  ttsProviderName,
  type VoicevoxSpeaker,
} from './audio/tts'
import { getSetting, setSetting } from './db/repo'
import { getSidecarBase, setSidecarBase, probeHealth } from './lib/sidecar'
import {
  getGeminiKey,
  setGeminiKey,
  getGeminiModel,
  setGeminiModel,
  probeGemini,
  DEFAULT_GEMINI_MODEL,
} from './lib/llm'

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const ready = useApp((s) => s.ready)
  const refresh = useApp((s) => s.refresh)
  const showKanji = useApp((s) => s.showKanji)
  const [overlay, setOverlay] = useState<null | 'settings' | 'progress' | 'review'>(null)

  useEffect(() => {
    void bootstrap()
  }, [])

  function nav(t: Tab) {
    setTab(t)
    setOverlay(null)
    window.scrollTo(0, 0)
  }

  return (
    <div className={'app' + (showKanji ? ' kanji-mode' : '')}>
      <header className="appHeader">
        <h1
          onClick={() => setOverlay((v) => (v === 'settings' ? null : 'settings'))}
          style={{ cursor: 'pointer' }}
        >
          日本語の道<span>NIHONGO NO MICHI</span>
        </h1>
        <StreakBadge />
      </header>

      <main>
        {!ready && <div className="card">読み込み中…</div>}
        {ready && overlay === 'settings' && (
          <SettingsPanel onDone={() => { setOverlay(null); void refresh() }} />
        )}
        {ready && overlay === 'progress' && (
          <ProgressView onDone={() => setOverlay(null)} />
        )}
        {ready && overlay === 'review' && (
          <ReviewView onDone={() => setOverlay(null)} />
        )}
        {ready && overlay === null && (
          <>
            {tab === 'today' && (
              <TodayView onNav={nav} onOpenProgress={() => setOverlay('progress')} />
            )}
            {tab === 'kana' && <KanaView />}
            {tab === 'listen' && <ListenView />}
            {tab === 'speak' && <SpeakView onOpenReview={() => setOverlay('review')} />}
            {tab === 'read' && <ReadView />}
          </>
        )}
      </main>

      <Nav tab={tab} onChange={nav} />
      <Toast />
      <BigStamp />
    </div>
  )
}

function StreakBadge() {
  const streak = useApp((s) => s.streak)
  return (
    <div className="streakBadge">
      連続 <b>{streak}</b> 日
    </div>
  )
}

// ---------- 設定 / v1 匯入 / v2 匯出 ----------
function SettingsPanel({ onDone }: { onDone: () => void }) {
  const ttsName = useApp((s) => s.ttsName)
  const reprobe = useApp((s) => s.reprobe)
  const showKanji = useApp((s) => s.showKanji)
  const toggleKanji = useApp((s) => s.toggleKanji)
  const [json, setJson] = useState('')
  const [speakers, setSpeakers] = useState<VoicevoxSpeaker[]>([])
  const [speakerId, setSpeakerIdState] = useState<number | null>(null)
  const [probing, setProbing] = useState(false)
  const [baseInput, setBaseInput] = useState(getSidecarBase())
  const [testing, setTesting] = useState(false)
  const [keyInput, setKeyInput] = useState(getGeminiKey())
  const [modelInput, setModelInput] = useState(getGeminiModel())
  const [geminiTesting, setGeminiTesting] = useState(false)

  const isVoicevox = ttsName === 'voicevox'

  useEffect(() => {
    if (!isVoicevox) return
    void (async () => {
      const list = await listSpeakers()
      setSpeakers(list)
      const saved = await getSetting<number | null>('voicevoxSpeaker', null)
      const cur = saved ?? getSpeaker()
      if (cur != null) {
        setSpeakerIdState(cur)
        setSpeaker(cur)
      }
    })()
  }, [isVoicevox])

  async function chooseSpeaker(id: number) {
    setSpeakerIdState(id)
    setSpeaker(id)
    await setSetting('voicevoxSpeaker', id)
    void speak('こんにちは、これから一緒にがんばりましょう。', 0.85)
  }

  async function saveBaseAndTest() {
    setTesting(true)
    const base = setSidecarBase(baseInput)
    setBaseInput(base)
    const h = await probeHealth()
    if (h.ok) {
      toast(
        `連線成功：語音 ${h.voicevox ? '✓' : '✗'}・評分 ${h.whisper ? '✓' : '✗'}・生成 ${h.content ? '✓' : '✗'}`,
      )
      await reprobe()
      if (ttsProviderName() === 'voicevox') setSpeakers(await listSpeakers())
    } else {
      toast(base ? '連不上 sidecar，請確認網址與服務狀態' : '已清除，改用同源 /api')
      await reprobe()
    }
    setTesting(false)
  }

  async function saveAndTestGemini() {
    setGeminiTesting(true)
    setGeminiKey(keyInput)
    setGeminiModel(modelInput)
    setModelInput(getGeminiModel())
    if (!getGeminiKey()) {
      toast('已清除金鑰 — 生成改用離線示範句')
      setGeminiTesting(false)
      return
    }
    const res = await probeGemini()
    toast(
      res.ok
        ? 'Gemini 連線成功 — 生成句與文章對照改由 Gemini 即時生成'
        : res.error?.startsWith('gemini-http-4')
          ? '金鑰無效或額度用盡，請確認'
          : 'Gemini 連線失敗，請稍後再試',
    )
    setGeminiTesting(false)
  }

  async function redetect() {
    setProbing(true)
    await reprobe()
    if (ttsProviderName() === 'voicevox') {
      const list = await listSpeakers()
      setSpeakers(list)
    }
    setProbing(false)
    toast(ttsProviderName() === 'voicevox' ? 'VOICEVOX 已連線' : '未偵測到 sidecar，使用瀏覽器語音')
  }

  async function doImport() {
    try {
      const data = JSON.parse(json) as V1Save
      const r = await importV1(data)
      toast(`匯入完成：假名 ${r.cards}、蓋章 ${r.stamps}`)
      setJson('')
    } catch {
      toast('JSON 格式錯誤，請確認貼上的是 v1 存檔')
    }
  }

  async function doExport() {
    const blob = new Blob([await exportV2()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nihongo-michi-backup-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="card">
        <div className="eyebrow">語音設定</div>
        <p className="sub">
          目前來源：
          <b>{isVoicevox ? ' VOICEVOX（高品質・sidecar 在線）' : ' 瀏覽器內建'}</b>
        </p>

        {isVoicevox && speakers.length > 0 && (
          <div className="rateRow">
            說話者：
            <select
              value={speakerId ?? ''}
              onChange={(e) => void chooseSpeaker(Number(e.target.value))}
            >
              {speakers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}／{s.style}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn small ghost" onClick={() => void redetect()} disabled={probing}>
            {probing ? '偵測中…' : '重新偵測 sidecar'}
          </button>
          {isVoicevox && (
            <button
              className="btn small ghost"
              onClick={() => void speak('あなたも今日から、ことばの忍者です。', 0.85)}
            >
              🔊 試聽
            </button>
          )}
        </div>

        <div className="hint">
          啟用高品質語音：在 5090 上執行 VOICEVOX engine 與 sidecar（見 sidecar/README），
          回此按「重新偵測」即可。未在線時功能不中斷，只是語音走瀏覽器降級版。
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">Sidecar 位址</div>
        <p className="sub">
          留空＝同源 <code>/api</code>（開發 proxy／同網域部署）。手機 App 或跨網域時填
          Cloudflare Tunnel / Tailscale 網址。
        </p>
        <input
          type="url"
          value={baseInput}
          onChange={(e) => setBaseInput(e.target.value)}
          placeholder="https://sidecar.example.com"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          style={{
            width: '100%',
            marginTop: 8,
            fontFamily: 'monospace',
            fontSize: 13,
            borderRadius: 8,
            border: '1px solid var(--washi2)',
            padding: 8,
          }}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button
            className="btn small"
            onClick={() => void saveBaseAndTest()}
            disabled={testing}
          >
            {testing ? '測試中…' : '儲存並測試連線'}
          </button>
        </div>
        <div className="hint">
          NHK 時事文章的「導入（抓取＋注音）」仍需要 sidecar；中文對照與生成句已改由下方 Gemini 產生。
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">AI 生成（Gemini）</div>
        <p className="sub">
          生成練習句與文章中文對照直接由 App 呼叫 Gemini，<b>手機免 sidecar</b>。
          金鑰只存在本機、不上傳。到 <code>aistudio.google.com/apikey</code> 免費取得。
        </p>
        <input
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="Gemini API Key（AIza…）"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          style={{
            width: '100%',
            marginTop: 8,
            fontFamily: 'monospace',
            fontSize: 13,
            borderRadius: 8,
            border: '1px solid var(--washi2)',
            padding: 8,
          }}
        />
        <div className="rateRow" style={{ marginTop: 8 }}>
          模型：
          <input
            type="text"
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            placeholder={DEFAULT_GEMINI_MODEL}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            style={{
              flex: 1,
              fontFamily: 'monospace',
              fontSize: 13,
              borderRadius: 8,
              border: '1px solid var(--washi2)',
              padding: '6px 8px',
            }}
          />
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button
            className="btn small"
            onClick={() => void saveAndTestGemini()}
            disabled={geminiTesting}
          >
            {geminiTesting ? '測試中…' : '儲存並測試 Gemini'}
          </button>
        </div>
        <div className="hint">
          清空金鑰＝改用內建離線示範句（不需網路）。生成內容一律需你在審核佇列採用後才入庫。
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">顯示設定</div>
        <div className="row between">
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>漢字モード</div>
            <div className="sub">詞彙顯示漢字、短文隱藏振り仮名（進階挑戰）</div>
          </div>
          <button
            className={'btn small' + (showKanji ? '' : ' ghost')}
            onClick={() => void toggleKanji()}
          >
            {showKanji ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">從 v1 匯入進度</div>
        <p className="sub">
          貼上 v1 Artifact 的存檔 JSON（連續天數與已學假名會沿用，不歸零）。
        </p>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder='{"srs":{...},"stamps":{...}}'
          style={{
            width: '100%',
            minHeight: 90,
            marginTop: 8,
            fontFamily: 'monospace',
            fontSize: 12,
            borderRadius: 8,
            border: '1px solid var(--washi2)',
            padding: 8,
          }}
        />
        <div className="spacer" />
        <div className="row between">
          <button className="btn small" onClick={() => void doImport()} disabled={!json.trim()}>
            匯入
          </button>
          <button className="btn small ghost" onClick={() => void doExport()}>
            匯出 v2 備份
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row center">
          <button className="btn ghost" onClick={onDone}>
            返回
          </button>
        </div>
      </div>
    </>
  )
}
