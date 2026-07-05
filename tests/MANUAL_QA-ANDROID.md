# Android 真機 QA 檢查清單（v3）

> 原則：**沒在真機跑過就不打勾**。全部通過才算 Phase 3 完成、才進上架流程。
> 環境：實體 Android 手機（WebView ≥ 90）＋ 5090 工作站 sidecar（Tailscale / Cloudflare Tunnel）。
> 建置：`npm run android:open` → Android Studio 跑到手機上（USB 偵錯）。

## A. 安裝與啟動
- [ ] App 安裝、冷啟動 < 3 秒進到「今日の修行」
- [ ] 啟動畫面與圖示顯示正確（adaptive icon 圓形/方形裁切下「道」字不被切）
- [ ] 飛航模式冷啟動可用（資產在 APK 內，不依賴網路）

## B. 資料持久化（IndexedDB in WebView）
- [ ] 完成各軌一輪後強制關閉 App → 重開進度保留
- [ ] `versionCode` +1 重新安裝（模擬更新）→ 卡片/蓋章/streak 不遺失
- [ ] 設定頁匯出 v2 備份 JSON 可下載/分享

## C. 語音（G1/G2 的原生 provider）
- [ ] sidecar 離線時：假名/詞彙發音走原生 TTS（Google TTS ja-JP），聽感可接受
- [ ] 原生 TTS 語速：0.7 / 0.85 / 1.0 與 web 版聽感對照，必要時在 NativeTTS 加映射
- [ ] 未裝日語 TTS 聲音的裝置：不爆錯、提示引導（設定 → 文字轉語音）
- [ ] 話す：系統 SpeechRecognizer 辨識 ja-JP，分數分佈與 Chrome Web Speech 對照
      （偏差大就調 scorer 閾值）
- [ ] 麥克風權限：首次詢問、拒絕後降級自評不中斷、再次進入可從系統設定開回

## D. Sidecar 連線（G3/G4）
- [ ] 設定頁填 Tailscale／Tunnel 網址 →「儲存並測試連線」三旗標正確
- [ ] VOICEVOX 在線：發音切到 voicevox、說話者切換、試聽正常
- [ ] TTS 快取：聽過的句子斷網重播（Dexie ttsCache 命中，不發請求）
- [ ] whisper 模式：🎤→⏹ MediaRecorder 錄音 → 上傳 → mora 診斷顯示（G7 重點驗證）
- [ ] sidecar 中途離線：功能降級不中斷、無 uncaught error

## E. 習慣引擎
- [ ] 五任務全完成 → 大印動畫、streak +1；跨日（手機時區）重置正確
- [ ] 背景/前景切換不影響計數

## F. 上架前最後檢查
- [ ] release build（Play App Signing 簽章）在真機上與 debug 行為一致
- [ ] 螢幕截圖 ≥2 張、feature graphic 完成（拿三軌畫面）
- [ ] 低階機（或模擬器 API 23）冒煙：可啟動、可完成一輪假名
