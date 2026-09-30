# App Store Connect：App 資訊與審查資料（草稿）

> 依 2026-09-30 的程式實際行為填寫。App Store Connect → Resonance（`com.resonance.stories`，App ID 6817604797）。
> 標 **【你來填】** 的是只能由帳號擁有者輸入的項目（密碼、身分）。

## 1. App 資訊

| 欄位 | 內容 |
| --- | --- |
| 名稱（30） | `Resonance` |
| 副標題（30） | `用故事回應故事` |
| 主要類別 | 社交網路 |
| 次要類別 | 生活風格 |
| 內容版權 | 此 App 包含第三方內容（使用者發布的故事）：**是**，我們擁有使用權（服務條款中的授權） |
| 年齡分級 | 見第 4 節 |

英文在地化：名稱 `Resonance`，副標題 `Answer stories with stories`。

## 2. 版本資訊（2.0.0）

- **宣傳文字**（170，可隨時更新）：

  > 讀到觸動你的故事時，不按讚，而是寫下你自己的故事回應它。讓生命影響生命。

- **描述**：與 Google Play 的完整說明相同（`docs/store/google-play.md` 第 9 節），英文在地化用英文版本。
- **關鍵字**（100，逗號分隔，不必重複名稱）：

  > 故事,寫作,日記,人生,共鳴,回憶,卡片,心情,分享,交流,思考,地圖

  英文：`story,writing,journal,life,memoir,cards,reflection,share,connect,thought map`

- **支援網址**：`https://resonance-world.vercel.app/zh-TW/support`
- **行銷網址**：`https://resonance-world.vercel.app`
- **隱私權政策網址**：`https://resonance-world.vercel.app/zh-TW/privacy`
- **版權**：`© 2026 共振團隊`

### 螢幕截圖

- iPhone 6.9 吋（1320×2868 或 1290×2796）：3–10 張，從 iPhone 17 Pro Max 模擬器拍：動態、卡片頁、寫卡片、共振、私訊、思想地圖。

## 3. App 隱私（營養標籤）

與 `apps/ios/Resonance/PrivacyInfo.xcprivacy` 一致。

- 「你或你的第三方合作夥伴是否從此 App 收集資料？」→ **是**
- 追蹤：**否**（不跨 App／網站追蹤，沒有廣告）

| 資料類型 | 與使用者身分連結 | 用於追蹤 | 用途 |
| --- | --- | --- | --- |
| 聯絡資訊 → 電子郵件地址 | 是 | 否 | App 功能 |
| 識別碼 → 使用者 ID | 是 | 否 | App 功能 |
| 識別碼 → 裝置 ID（推播權杖、安裝 ID） | 是 | 否 | App 功能 |
| 使用者內容 → 照片或影片 | 是 | 否 | App 功能 |
| 使用者內容 → 電子郵件或簡訊（App 內私訊、紙條） | 是 | 否 | App 功能 |
| 使用者內容 → 其他使用者內容（卡片、共振、思想地圖） | 是 | 否 | App 功能 |

不收集：位置、健康、財務、聯絡人、瀏覽紀錄、搜尋紀錄、購買項目、使用資料、診斷資料。

## 4. 年齡分級問卷

| 項目 | 回答 |
| --- | --- |
| 暴力（卡通／寫實）、性、裸露、粗俗、恐怖、菸酒藥物、醫療資訊、賭博、競賽 | 無 |
| 使用者原創內容 | **是** |
| 訊息與聊天 | **是**（連結對象之間的私訊） |
| 廣告 | 否 |
| 不受限制的網頁存取 | 否 |
| 家長監護功能 | 否 |
| 年齡驗證 | 否 |

預期結果：13+（有使用者內容與私訊）。服務條款的最低年齡同樣是 13 歲。

## 5. App 審查資訊

- **登入資訊**：需要登入。**【你來填】** 審查用帳號的電子郵件與密碼（與 Google Play 用同一組即可；請先在網站註冊、設定筆名，並發布一兩張公開卡片）。
- **聯絡資訊**：姓名、電話 **【你來填】**；電子郵件 `assist.resonance@gmail.com`
- **備註**（英文，審查人員讀）：

  > Resonance is a story-sharing app. Sign in with the demo account (email + password on the sign-in screen).
  >
  > User-generated content safeguards (Guideline 1.2):
  > - Terms of Use with a zero-tolerance clause: https://resonance-world.vercel.app/en/terms — users agree to them when they sign in.
  > - Report: the "⋯" menu on every card, profile and conversation.
  > - Block: the same menu; blocked users can no longer contact the blocker and their cards are hidden.
  > - Reports are reviewed within 24 hours; offending content is removed and accounts suspended.
  > - Contact: assist.resonance@gmail.com
  >
  > Account deletion (5.1.1(v)): My Card Box → Edit profile → Delete account. The account is deleted after a 7-day grace period (signing back in cancels it).
  >
  > Push notifications are used for resonances, notes and messages from other users.

## 6. 其他

- 出口合規：`ITSAppUsesNonExemptEncryption = false` 已寫在 Info.plist（只用 HTTPS），上傳時不會再問。
- 內容權利、廣告識別碼：不使用 IDFA。
- 定價：免費，所有國家／地區。
- 上架前還要完成：
  - 登入畫面加上「繼續即表示你同意服務條款與隱私權政策」（1.2 要求使用者同意條款）。
  - App 內的條款連結（正在做）。
  - 推播金鑰上傳到 Firebase。
