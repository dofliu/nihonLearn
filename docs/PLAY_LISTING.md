# Google Play 上架材料與流程（v3）

> 搭配 `docs/ANDROID_RELEASE_PLAN.md` Phase 4。此檔是「可直接貼進 Play Console 的內容」
> ＋逐步操作清單。截圖與 feature graphic 待真機 QA（`tests/MANUAL_QA-ANDROID.md`）時順手產出。

## 1. 商店文案（zh-TW 主要、可加 en-US）

**App 名稱**（30 字內）：
> 日本語の道 — 日語習慣養成

**簡短說明**（80 字內）：
> 每天 10 分鐘的日語修行：假名與單字記憶卡、辨音與重音道場、跟讀評分、分級閱讀。離線可用、無廣告、資料只留在你手機。

**完整說明**（4000 字內，草稿）：
> 「日本語の道」是為中文母語學習者設計的日語學習 App，從五十音出發，聽、說、讀三軌並進。
>
> ◆ 科學排程：FSRS 間隔重複演算法，該複習的卡片自動出現
> ◆ 每日五項小任務（約 10 分鐘），全完成蓋當日印，連續天數看得見
> ◆ 辨音道場：清濁音、拗音、促音對比訓練＋東京式重音辨識
> ◆ 跟讀評分：句子跟讀即時評分，看見自己的發音成長曲線
> ◆ 分級閱讀：由淺入深的短文，漢字模式進階挑戰
> ◆ 離線可用：所有學習資料只存在你的裝置上，無廣告、無追蹤
>
> 進階：如果你有自己的工作站，可自架語音伺服器獲得高品質日語語音與更精細的發音診斷（選用，不設定也能完整使用）。

**分類**：教育。**標籤**：日語、語言學習。

## 2. 圖像素材

| 素材 | 規格 | 來源 |
|---|---|---|
| App icon | 512×512 PNG | `resources/icon-only.png` 縮出（或 `public/icon-512.png` 去圓角版） |
| Feature graphic | 1024×500 PNG | 待做：品牌色底＋「道」＋標語 |
| 手機截圖 | ≥2 張、16:9 或 9:16 | 真機 QA 時擷取：今日任務、辨音道場、發音曲線 |

## 3. Play Console 逐步（個人帳號）

1. 建立應用程式：預設語言 zh-TW、App、免費。
2. **政策宣告**：
   - 隱私權政策 URL：把 `docs/PRIVACY_POLICY.md` 放上可公開網址
     （建議 GitHub Pages，或 repo 的 raw 連結也可接受）。
   - Data safety 表單：**不收集、不分享任何資料**；「App 收集的資料」全部勾否。
     權限說明：麥克風＝發音練習即時評分，音訊不離開使用者控制範圍。
   - 內容分級問卷：教育類、無 UGC、無廣告 → 預期 3+/Everyone。
   - 目標對象：18+（非兒童導向，避開家庭政策負擔）。
   - 廣告：無。
3. **簽章**：啟用 Play App Signing → 上傳用 `android/keystore.properties`
   （見 `keystore.properties.example`；keystore 檔與密碼離線備份兩份）。
4. **內部測試**：`npm run build:android` → Android Studio `Build > Generate Signed App Bundle`
   （或 `cd android && ./gradlew bundleRelease`）→ 上傳 AAB → 加自己的 Google 帳號測試。
5. **封閉測試（硬門檻）**：2023-11 後註冊的個人帳號須 **≥12 位測試者、連續 14 天**
   才能申請正式發佈。湊齊親友 Google 帳號、建測試者名單、發 opt-in 連結，
   請大家裝著別刪（期間 versionCode 遞增更新不重置天數）。
6. 14 天後：申請正式軌 → 送審 → 發佈。

## 4. 版本策略

- `versionName` 對齊 `package.json`（3.0.0 起）。
- `versionCode`：30000 起跳，每次上傳 Play +1（30001、30002…），只增不減。
- 上傳前檢查 `android/app/build.gradle` 兩值都改了。

## 5. 送審避雷

- 描述不誇大 AI 能力；App 內 AI 生成內容維持「需人工審核採用」流程。
- 錄音權限：Play 審查會對 RECORD_AUDIO 問用途——Data safety 與商店說明保持一致
  （發音評分、不收集）。
- 不要在商店文案放「測試中」「beta」字樣（正式軌）。
