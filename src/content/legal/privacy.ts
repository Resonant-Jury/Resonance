import type { LegalText } from './types';

/**
 * The privacy policy, written from what the code actually does: keep it in
 * step with `src/lib/account/deletion.ts` (what is purged), `src/lib/ai`
 * (what reaches OpenAI), `src/lib/push` (device records) and the apps'
 * privacy manifest / Play Data safety form.
 */
export const privacy: LegalText = {
  'zh-TW': {
    title: '隱私權政策',
    description: 'Resonance 蒐集哪些資料、為什麼需要、交給誰處理，以及你如何下載或刪除它們。',
    body: `Resonance（共振）是一個用故事卡片彼此交流的平台，包含網站 resonance-world.vercel.app 與 iOS、Android App，由開發者 Nian-Cheng Chen 個人開發與營運（以下稱「我們」）。這份政策說明我們蒐集哪些資料、為什麼需要、交給誰處理，以及你可以怎麼管理或刪除它們。

## 我們不做的事

- 不放廣告，也不把你的資料賣給或分享給廣告商。
- 不使用第三方分析或追蹤工具，不跨 App 或網站追蹤你。
- 不用你的內容訓練 AI 模型。

## 我們蒐集的資料

- **帳號**：你用來登入的電子郵件地址（以 Google 或 Apple 登入時由它們提供，Apple 可能提供轉寄用的隱藏信箱），以及系統產生的帳號 ID。
- **個人檔案**：筆名、自我介紹、地區、偏好語言、頭像。這些會公開顯示在你的個人頁。
- **你寫的內容**：卡片（標題、故事、標籤、圖片）與草稿、共振、卡片之間的連結、寫給作者的紙條、你和連結對象之間的訊息、思想地圖、書籤、封鎖名單，以及你送出的檢舉。
- **互動**：你和誰建立了連結、你收到的通知。
- **裝置（僅 App）**：推播權杖、這次安裝的識別碼、App 版本、作業系統與介面語言，用來把通知送到你的手機、並用你的語言顯示。登出時會移除。
- **技術紀錄**：網站與 API 的主機服務商會保存連線紀錄（例如 IP 位址、瀏覽器類型、時間），用於維運與防止濫用。網站只使用維持登入所需的 Cookie；介面偏好（例如看過哪些提示）存在你的瀏覽器或裝置上。

## 誰看得到你的內容

每張卡片可以設為**公開**、**僅限連結對象**或**只有自己**。公開卡片任何人都看得到，也可能出現在其他人的推薦裡；訊息只有對話雙方看得到；你的筆名、自我介紹與頭像是公開的。我們只在處理檢舉、維護安全或法律要求時查看非公開內容。

## 我們如何使用資料

- **提供服務**：登入、儲存與顯示你的內容、傳送訊息與通知。
- **AI 功能**：為卡片產生英文網址、建議標籤、在發布前整理「核心洞察」、依故事產生插圖，以及建立推薦用的索引。推薦索引也包含你的私人卡片，但只用來推薦卡片給你自己，不會讓別人看到私人內容。
- **安全**：處理檢舉、執行封鎖、防止濫用與垃圾訊息。

## 處理資料的服務商

我們只把提供服務所需的資料交給下列服務商：

- **Google Firebase**（Authentication、Cloud Firestore、Cloud Messaging）：帳號、所有文字內容、推播傳送。
- **Cloudflare R2**：你上傳或產生的圖片。圖片以公開網址提供，拿到網址的人都看得到。
- **OpenAI**：為了上述 AI 功能，卡片的標題與內容會傳給 OpenAI 的 API。依 OpenAI 的 API 政策，這些資料不會被用來訓練它的模型。
- **Vercel**：網站與 API 的主機。
- **Apple、Google**：你選擇以它們登入時，以及把推播送到 iPhone（Apple 推播通知服務）或 Android 手機時。

這些服務商可能在臺灣以外的地區（例如美國、日本）處理資料。

## 保存與刪除

資料會保存到你刪除它，或刪除帳號為止。

你可以隨時在「設定 → 刪除帳號」（網站與 App 都有）刪除帳號。送出後會立刻登出，7 天內重新登入就能取消；7 天後，帳號、個人檔案、卡片與草稿、共振、紙條、你參與的所有對話（包含對方在其中傳的訊息）、連結、通知、思想地圖、推播裝置與上傳的圖片都會永久刪除。

以下資料會保留：別人對你的檢舉（安全與管理紀錄）；其他人回應你的卡片而寫的卡片屬於他們，會保留，但不再連到你的卡片。

刪除前，可以在同一頁按「下載我的資料」，取得你寫過所有內容的 JSON 檔。無法登入時，也可以用註冊的信箱寫信給我們要求刪除，我們確認你是帳號擁有者後處理。

## 你的權利

你可以查閱、更正（在設定中編輯個人檔案、編輯卡片）、下載與刪除你的資料，也可以來信詢問我們如何處理你的資料，或要求我們停止處理。

## 兒童

Resonance 不是為 13 歲以下的兒童設計的，我們也不會在知情的情況下蒐集他們的資料。如果你發現有兒童提供了資料，請來信，我們會刪除。

## 安全

所有連線都經過加密（HTTPS）。資料庫的讀寫由權限規則控制，非公開內容只有你和你允許的人讀得到。

## 政策變更

有重大變更時，我們會在網站與 App 中公告，並更新這一頁的日期。

## 聯絡我們

ncchen99@gmail.com
`,
  },
  en: {
    title: 'Privacy Policy',
    description: 'What Resonance collects, why, who processes it, and how to download or delete it.',
    body: `Resonance is a place to share stories as cards, made up of the website resonance-world.vercel.app and the iOS and Android apps. It is built and run by an independent developer, Nian-Cheng Chen ("we"). This policy explains what we collect, why, who processes it for us, and how you can manage or delete it.

## What we don't do

- We don't show ads, and we don't sell or share your data with advertisers.
- We don't use third-party analytics or tracking tools, and we don't track you across apps or websites.
- We don't use your writing to train AI models.

## What we collect

- **Account**: the email address you sign in with (provided by Google or Apple if you use them; Apple may give us a private relay address) and an account ID the system creates.
- **Profile**: your pen name, bio, region, preferred languages and avatar. These are shown publicly on your profile page.
- **What you write**: cards (title, story, tags, images) and drafts, resonances, links between cards, notes to authors, messages with your connections, your thought map, bookmarks, your block list, and reports you send.
- **Interactions**: who you're connected with and the notifications you receive.
- **Device (apps only)**: a push token, an ID for this installation, the app version, platform and interface language, so notifications reach your phone in your language. They are removed when you sign out.
- **Technical logs**: our hosting provider keeps connection logs (such as IP address, browser type and time) for operations and abuse prevention. The website only uses the cookie that keeps you signed in; interface preferences (such as which tips you've seen) are stored in your browser or on your device.

## Who can see your content

Each card can be **public**, **connections only** or **only me**. Public cards can be seen by anyone and may appear in other people's recommendations; messages are seen only by the people in the conversation; your pen name, bio and avatar are public. We look at non-public content only to handle a report, keep the service safe, or when the law requires it.

## How we use it

- **To run the service**: signing in, storing and showing your content, delivering messages and notifications.
- **AI features**: an English web address for each card, suggested tags, the "core insight" shown before you publish, illustrations drawn from a story, and the index behind recommendations. That index includes your private cards, but only to recommend cards to you; nobody else sees private content through it.
- **Safety**: handling reports, enforcing blocks, preventing abuse and spam.

## Who processes it for us

We share only what each service needs to run Resonance:

- **Google Firebase** (Authentication, Cloud Firestore, Cloud Messaging): your account, all written content, push delivery.
- **Cloudflare R2**: images you upload or generate. Images are served from public addresses; anyone with the address can see them.
- **OpenAI**: for the AI features above, a card's title and text are sent to OpenAI's API. Under OpenAI's API policy this data is not used to train its models.
- **Vercel**: hosting for the website and API.
- **Apple and Google**: if you sign in with them, and to deliver notifications to iPhones (Apple Push Notification service) and Android phones.

These providers may process data outside Taiwan (for example in the United States or Japan).

## Keeping and deleting data

We keep your data until you delete it or delete your account.

You can delete your account at any time under Settings → Delete account (on the website and in the apps). You're signed out right away, and signing back in within 7 days cancels it. After 7 days your account, profile, cards and drafts, resonances, notes, every conversation you took part in (including the other person's messages in it), connections, notifications, thought map, push devices and uploaded images are deleted for good.

We keep reports other people made about you (safety and moderation records). Cards other people wrote in response to yours belong to them and stay, but no longer link to your card.

Before deleting, you can use "Download my data" on the same page to get everything you've written as a JSON file. If you can't sign in, email us from the address you registered with and we'll delete the account once we've confirmed it's yours.

## Your rights

You can see, correct (edit your profile and cards in the app), download and delete your data, and you can email us to ask how we handle it or to ask us to stop.

## Children

Resonance is not meant for children under 13, and we don't knowingly collect their data. If you believe a child has given us data, email us and we'll delete it.

## Security

All connections are encrypted (HTTPS). Database access is governed by permission rules, so non-public content can be read only by you and the people you allow.

## Changes

If we make significant changes, we'll announce them on the website and in the apps and update the date on this page.

## Contact

ncchen99@gmail.com
`,
  },
};
