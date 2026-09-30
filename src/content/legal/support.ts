import type { LegalText } from './types';

/**
 * The support page: the store listings' support URL and the Play "delete
 * account" URL. The steps name the real labels (settings.sections.delete,
 * me.editProfile, settings.delete.export in src/messages).
 */
export const support: LegalText = {
  'zh-TW': {
    title: '支援',
    description: '聯絡 Resonance、刪除帳號、下載資料、檢舉與封鎖的說明。',
    body: `有問題、建議，或需要協助，歡迎寫信到 **ncchen99@gmail.com**，我們會盡快回覆。

## 如何刪除帳號？

- **網站**：登入後到「設定」，選「刪除帳號」。
- **iOS 與 Android App**：到「我的卡片盒」，點「編輯個人檔案」，選「刪除帳號」。

送出後會立刻登出。7 天內重新登入就能取消；7 天後，帳號、卡片、訊息與上傳的圖片會永久刪除，無法復原。會刪除與保留哪些資料，請見[隱私權政策](/privacy)。

**無法登入時**：用你註冊的電子郵件寫信到 ncchen99@gmail.com，主旨寫「刪除帳號」。我們確認你是帳號擁有者後，會在 7 天內刪除。

## 如何下載我的資料？

在「刪除帳號」同一頁按「下載我的資料」，會得到一份你寫過所有內容的 JSON 檔。

## 如何檢舉或封鎖？

卡片、個人頁與對話都有「⋯」選單，可以檢舉或封鎖。封鎖後對方無法再聯絡你，你也不會看到對方的卡片。我們會在收到檢舉後 24 小時內處理。

## 收不到通知？

請確認已經登入，並在手機的系統設定中允許 Resonance 傳送通知。

## 相關條款

- [隱私權政策](/privacy)
- [服務條款](/terms)
`,
  },
  en: {
    title: 'Support',
    description: 'Contacting Resonance, deleting your account, downloading your data, reporting and blocking.',
    body: `Questions, ideas or need a hand? Email **ncchen99@gmail.com** and we'll get back to you as soon as we can.

## How do I delete my account?

- **Website**: sign in, open Settings and choose "Delete account".
- **iOS and Android apps**: go to "My Card Box", tap "Edit profile", then choose "Delete account".

You're signed out right away. Signing back in within 7 days cancels it; after 7 days your account, cards, messages and uploaded images are deleted for good and can't be recovered. The [Privacy Policy](/privacy) lists exactly what is deleted and what is kept.

**Can't sign in?** Email ncchen99@gmail.com from the address you registered with, with "Delete account" as the subject. Once we've confirmed the account is yours, we'll delete it within 7 days.

## How do I download my data?

On the same "Delete account" page, tap "Download my data" to get everything you've written as a JSON file.

## How do I report or block someone?

Cards, profiles and conversations each have a "⋯" menu with Report and Block. Once you block someone they can't reach you and you won't see their cards. We handle reports within 24 hours.

## Not getting notifications?

Make sure you're signed in and that Resonance is allowed to send notifications in your phone's settings.

## Policies

- [Privacy Policy](/privacy)
- [Terms of Use](/terms)
`,
  },
};
