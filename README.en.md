# 日本語の道 (Nihongo no Michi)

[繁體中文](README.md) ｜ **English**

A personalized Japanese-learning app — three tracks (listening / speaking / reading), local-first, habit-formation first.
Started as a v1 Artifact, productized into a PWA (v2), and wrapped with Capacitor into a Google Play-ready Android app (v3).

> Target user: a Chinese-native adult who has just finished learning the kana.
> Design philosophy: **correctness comes from authoritative sources and program verification;
> AI-generated content always requires human review before it enters the study library. The user only
> "curates" (do I want to learn this?) and is never the correctness gatekeeper.**

## Version history

| Version | Highlights |
|--|--|
| v1 (Artifact) | Proof of concept: simplified SM-2, single-JSON save, browser speech |
| **v2** | Productization: FSRS-4.5 scheduling, IndexedDB/Dexie tables, VOICEVOX/whisper sidecar, PWA, v1 import |
| **v3.0** | **Android release**: Capacitor shell, native TTS/ASR, Dexie TTS cache, signing & store assets, CI |
| **v3.1** | Content flexibility: NHK Easy News article import, persistent review queue for generated sentences |
| **v3.2** | Beginner UX: whole-passage Chinese gloss toggle, vocab unlocked by kana progress, offline fallback |
| **v3.3** | **AI generation via direct Gemini**: in-app API key, generation works on phone without a sidecar |
| **v3.4** | **N5 mock quiz**: auto-generated from learned word cards (meaning / vocab / listening / reordering), scoring + weakness analysis |
| **v3.5** | **Per-character read-along highlighting**: karaoke-style coloring with real timing (Web Speech boundary / native onRangeStart) |
| **v3.6** | **AI tutor** (Gemini chat, grounded in learned words, "for reference only", never written to the study library) + **vocab i+1 personalization** |
| **v3.7** | **Listening comprehension**: new "kikitori" mode — hear a dialogue/situational sentence, pick the Chinese meaning, reveal the Japanese |
| **v3.8** | **Paragraph listening + situational passage categories**: kikitori split into sentence/paragraph (hear a whole dialogue, answer the gist); passages grouped by basic / travel / daily / business |
| **v3.9** | **JLPT listening question types**: kikitori restructured into the N5 four-type menu, adding quick response (pick the right reply) and verbal expression (pick what to say for a situation) |
| **v3.10** | **AI paragraph comprehension questions (LLM writes Chinese only)**: Gemini writes only the Chinese question/options, layered over verified passages; merged into the paragraph pool after review & adoption |
| **v3.11** | **Guided situational dialogues + kanji furigana**: role-play with clerk / family / partner / classmate / friend / vendor (7 scenes); kanji mode now shows kanji **with** kana furigana (auto-aligned, program-verified); quiz listening reveals the Japanese after answering |
| **v3.12** | **Dedicated logo (torii gate)**: an indigo night-sky tile with a vermilion torii and a path leading up to it (echoing "the path of Japanese"); favicon / PWA / Android icons regenerated via `scripts/gen-icons.mjs` |
| **v3.13** | **Kana writing practice + shape scoring**: kana dojo "✍ writing", trace / blank modes, canvas handwriting scored by glyph-shape similarity (shape reference, not stroke-order; pure function, program-verified) |
| **v3.14** | **Vocabulary expansion**: N5 vocab 191→299 (+108, new nature / transport categories), readings & meanings verified per entry, furigana reconstructs |
| **v3.15** | **Fixes**: writing-practice trace template no longer hidden behind the grid layer; Android launcher mipmaps regenerated with the torii directly (no local @capacitor/assets needed) |
| **v3.16** | **Kanji writing practice**: writing practice gains a "kanji" set (60 verified single-kanji words), reusing glyph-shape scoring; trace / blank modes as with kana |
| **v3.17** | **Learning activity log + stats**: every feature’s practice is logged to `activityLog` (Dexie v8); the progress page adds a practice-calendar heatmap + per-feature totals; new features (writing/quiz/pitch) are Today-page "+α" extras that don’t gate the daily seal |
| **v3.18** | **On-device UI polish**: the header respects the system status-bar safe area (and drops the English subtitle); listening no longer auto-advances — the Japanese reveal stays until you tap "next"; the four listening category titles are all in Chinese (the JLPT type name kept as a small tag) |
| **v3.19** | **Chinese topics on the reading menu**: graded-passage buttons on the Read page now show a two-line "Japanese title + Chinese topic" so beginners can tell which scenario each passage is |
| **v3.20** | **Remove sidecar-facing UI**: the app is used mainly on phones, where the sidecar (needs the 5090 + a tunnel) is unreachable and useless — drop the Settings "Voice / Sidecar URL" cards and the Read page "NHK news import"; the backend and graceful-degradation architecture are fully kept (desktop same-origin still auto-detects VOICEVOX) |

Streak days and learned kana can be imported from v1 with one tap — they don't reset.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 (Web/PWA dev)
npm run build        # tsc -b && vite build (strict; must be green before commit)
npm test             # front-end logic regression (Node 22 runs .ts directly)
npm run test:e2e     # Playwright browser E2E (auto-starts the dev server)

# Android (requires Android Studio / SDK)
npm run android:open # bundle web assets (no SW) -> cap sync -> open Android Studio
npm run android:run  # run directly on a connected device/emulator

# sidecar (optional, runs on the user's RTX 5090 workstation)
cd sidecar
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8848
python test_score.py     # /score mora diagnostics (injects a fake whisper)
python test_article.py   # NHK article parsing (fixture HTML)
```

## Five daily practices (the habit engine)

Kana (10-kana SRS) · Words (up to 6 words FSRS, **unlocked by kana progress**) · Ears (5 minimal-pair items) ·
Mouth (3 shadowing sentences) · Reading (1 passage). Complete all five → stamp today's seal "済". About 10 minutes/day,
low barrier over high intensity. When there is no unlockable new word for the day, the vocab task auto-completes so it never blocks the seal.

## Settings entry

**Tap the header title "日本語の道"** to open Settings: voice source, sidecar URL,
**AI generation (Gemini) key**, kanji mode, v1 import / v2 export.

## AI generation (direct Gemini)

Practice-sentence generation and the Chinese gloss for NHK articles call **Google Gemini directly from the app**, so the phone needs no intranet tunneling.

1. Get a free key at `aistudio.google.com/apikey`.
2. App Settings → "AI generation (Gemini)" → paste the key, (optionally) change the model → "Save & test Gemini".
3. "Speak → generate new practice sentences" and the Chinese gloss for NHK news then use the real LLM.

The key is stored only on the device (localStorage) — never in git / the APK / backups. Without a key, built-in offline
demo content is used and nothing breaks. All generated content goes through the review queue and only enters the study library after you adopt it.

> CORS workaround: native (Android) uses Capacitor `CapacitorHttp` (bypasses the WebView's CORS); the web uses `fetch`.

## Architecture

```
src/
  data/        content (kana 142 · vocab ~300 N5 · sentences · pairs · pitch · passages · kaiwa) — single source of truth
  db/          Dexie schema(v8) + repo (task counts, stamps, cards, pronunciation records, generated sentences, articles, TTS cache, quiz results, paragraph questions)
  srs/         FSRS scheduling wrapper (new card / review / due / mastery)
  audio/       tts (VOICEVOX ▸ native ▸ Web Speech facade + Dexie cache), scorer (whisper ▸ native/Web ASR ▸ self-rating)
  lib/         sidecar (base-URL abstraction), llm (direct Gemini + chat), llmParse (pure parsing), content (generation client + i+1 learned words),
               listening (comprehension + JLPT question generation), articles (NHK import), vocabGate (kana-gated unlock), quiz (N5 mock quiz), karaoke (read-along), coverage,
               pitch, date, importV1
  views/       Today / Kana / Listen(incl. Pitch) / Speak / Read / Progress / Review / Quiz / Tutor
  components/  Nav, ui (toast, seal stamp), VocabCard
sidecar/       FastAPI (5090): /health /tts /speakers /score /content /article/*
android/       Capacitor Android project (appId com.dof.nihongomichi)
docs/          ANDROID_RELEASE_PLAN, PRIVACY_POLICY, PLAY_LISTING
```

**Data flow**: `data/` static content → user interaction → `repo` writes IndexedDB → `store.refresh()` re-reads → views subscribe.
**Graceful degradation**: sidecar/Gemini offline → fall back to browser capabilities or built-in offline content; nothing breaks.

## Key features

- **Three-track FSRS**: kana and vocab share ts-fsrs spaced repetition; vocab unlocks with kana progress so unseen characters never appear.
- **Listening: minimal pairs + kikitori (JLPT types) + pitch**: minimal pairs; **kikitori mirrors the JLPT N5 four types** — sentence comprehension (point comprehension), paragraph dialogue (task comprehension), quick response (pick the right reply), verbal expression (pick what to say). All material comes from verified data, no LLM. Pitch (Tokyo-dialect high/low visualization, rule-generated). Paragraph comprehension questions can also be **generated by AI** — Gemini writes only the Chinese question/options, layered over verified passages; adopted into the pool after your review (the Japanese material is not AI-generated).
- **Leveled reading by situation**: passages grouped into basic / travel / daily / business, with Chinese gloss and read-along highlighting.
- **Three-stage shadowing scoring**: whisper (5090) → native/browser ASR → self-rating, with mora-level per-beat diagnostics (dropped geminates, devoiced voiced sounds highlighted).
- **Kana writing practice (trace / blank)**: in the kana dojo "✍ writing", draw with finger or mouse; the system scores by **glyph-shape similarity** (your ink coverage vs. the template, precision/recall → F1). Honestly labeled as a shape reference, not stroke-order grading; best score persisted.
- **Guided situational dialogues (kaiwa)**: role-play with a clerk, family member, partner, classmate, friend, or business vendor — the partner's lines are spoken automatically; on your turn, read your line aloud (model audio available). Counts toward the daily "mouth" task. All textbook-level fixed sentences.
- **Kanji mode = kanji + kana furigana**: vocab cards, shadowing sentences, the word list, and listening reveals show kanji with kana annotated above (auto-aligned from the verified kana field, program-verified) — readable even for beginners.
- **Leveled reading + current events**: static passages + **NHK Easy News import** (furigana inherited from NHK's human annotation; the LLM only adds the Chinese gloss), with a whole-passage gloss toggle.
- **AI content generation + review queue**: Gemini generates candidates from your learned vocab (≤1 new word per sentence) + a programmatic coverage check; the queue persists (candidates survive until you reject them); adopt to enter the library.
- **N5 mock quiz**: auto-generated from learned word cards (meaning / vocab / listening / reordering), scoring + cross-quiz weakness aggregation. All material from verified data, no LLM.
- **Read-along highlighting**: speaking, today's phrase, and pure-kana passage lines highlight the Japanese per character while spoken (real timing: Web Speech boundary / Android onRangeStart).
- **AI tutor** (Today page "🤖 AI tutor"): Gemini chat grounded in the words you've learned, preferring examples with learned words; answers are marked "for reference only" and are **never written to the study library**; requires a Gemini key.
- **Pronunciation growth curve, kanji mode, PWA, VOICEVOX voice, v1 import.**

## Tests

| Layer | Command | Result |
|--|--|--|
| Build (strict) | `npm run build` | ✅ green, PWA SW generated |
| Front-end logic | `npm test` | ✅ 157 / 157 |
| Browser E2E | `npm run test:e2e` | ✅ 46 / 46 |
| Backend scoring | `python sidecar/test_score.py` | ✅ 4 / 4 |
| Backend article parsing | `python sidecar/test_article.py` | ✅ 13 / 13 |
| Android shell compiles | GitHub Actions `android` job (`gradlew assembleDebug`) | ✅ |

See `tests/INTEGRATION_REPORT.md`. The device-acceptance checklist is `tests/MANUAL_QA-ANDROID.md` (do not submit for review before it passes).

## Android release

Full plan, signing, Play Console flow, and closed-testing gate are in `docs/ANDROID_RELEASE_PLAN.md`,
`docs/PLAY_LISTING.md`, `docs/PRIVACY_POLICY.md`. The code and CI compilation are done;
device QA and the Play release (including a personal account's 12 testers × 14-day closed test) must be done on a real device / in the Console.

## Roadmap / follow-up work

See **[`ROADMAP.md`](ROADMAP.md)** for the full follow-up work and hand-off notes. Priority summary:

1. **Android device QA + Google Play closed testing** (critical path to release; checklist in `tests/MANUAL_QA-ANDROID.md`).
2. **Pitch-accent lexicon expansion** (via OJAD / dictionary sources, with attribution; never let the LLM generate accent numbers).
3. **Deeper kanji mode** (kanji/kana dual versions of passages, vocab writing practice).
4. **True acoustic GOP** (wav2vec2-CTC phoneme model + forced alignment, per-phoneme scoring) — the pronunciation-scoring ceiling.
5. **More listening question types** (paragraph detail questions, business/travel single sentences; material still from verified data or "LLM writes Chinese only").

Done: ~~quiz module~~ (v3.4), ~~AI tutor~~ (v3.6), ~~vocab i+1~~ (v3.6), ~~JLPT listening types~~ (v3.9), ~~AI paragraph questions~~ (v3.10), ~~dialogues & kanji furigana~~ (v3.11), ~~dedicated logo & kana writing & vocab expansion~~ (v3.12–v3.14), ~~trace layer & launcher icon fixes~~ (v3.15), ~~kanji writing practice~~ (v3.16), ~~learning activity log & stats~~ (v3.17).


## Doc index

- **[`README.md`](README.md)** — Traditional Chinese version
- **[`ROADMAP.md`](ROADMAP.md)** — roadmap & follow-up work
- `CLAUDE.md` — dev conventions, architecture map, known pitfalls (auto-loaded when Claude Code enters)
- `docs/` — `ANDROID_RELEASE_PLAN`, `PLAY_LISTING`, `PRIVACY_POLICY`
- `tests/` — `INTEGRATION_REPORT`, `MANUAL_QA`, `MANUAL_QA-ANDROID`
