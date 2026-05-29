# Resonance — Task Breakdown

> 來源文件：[Development Plan](./development_plan.md)
> 分階段目標：先完成可用的基礎社群媒體與 Firebase / R2 串接，再加入 AI、Vector Index 與推薦系統。

---

## 執行方向（2026-05-29 修訂）

**少寫 Next.js function，盡量讓 client 直連 Firebase。** 多繞一層 Next.js 不只是延遲與 Function 費用，安全邊界還要在 server action 與 Firestore rules 兩處同步維護，容易漂移。

Server 端只承擔以下三類事情：

1. **Firebase Admin SDK 才能做** — RSC / ISR 渲染時讀作者私有欄位、`revalidatePath`。
2. **Secret 不能進前端 bundle** — R2 presigned upload、第二階段的 LLM API。
3. **httpOnly cookie / middleware** — sign-in 完成後換 session cookie 給 SSR middleware 用。

實際保留的 server endpoint 只有：

| 端點 | 用途 |
|------|------|
| `/api/upload` | R2 presigned upload (R2 secret 不出前端) |
| `/api/auth/session` | Firebase ID token → httpOnly session cookie |
| `/api/revalidate` | 客戶端寫完 Firestore 後 ping，觸發 ISR；path allowlist |

**文章卡片走 ISR：** `/[locale]/card/[id]` 設 `revalidate = 86400`、`generateStaticParams` 回空，首次訪問動態產出，之後直接吃靜態檔；作者編輯或發布後 client-direct 寫 Firestore + ping `/api/revalidate` 重新生成。

**互動寫入（卡片 CRUD、共振 toggle、通知已讀、profile、邀請＋每日配額）：** Web SDK 直寫，邊界由 `firebase/firestore.rules` 守。

---

## 進度標記說明

- `[x]` 已完成
- `[~]` 部分完成 / 需補強
- `[ ]` 尚未開始
- `[-]` 已調整路線，不再執行（請看備註）

---

## 目標切分

### 第一階段：基礎社群媒體與 Firebase 串接

目標是把目前 mock-driven 的產品變成一個可登入、可發文、可瀏覽、可共振、可連結的簡單社群媒體。首頁先採「最新公開文章」feed，不做 AI 推薦、不做向量索引、不做每日個人化精選。

### 第二階段：AI 功能整合

目標是在第一階段穩定資料與使用者流程之後，加入 AI 寫作輔助、翻譯、embedding、Vector Index、每日推薦 feed、思想地圖與進階推薦。AI 端因為 LLM API key 與配額簿記不能放在 client，仍會以 server route handler 形式存在。

---

## 架構原則

- [x] 所有外部服務都必須經過專案內的 adapter / service interface，UI 不直接依賴 vendor SDK。  
  Auth / DB / Storage 已封裝；AI、Vector、Jobs 屬於第二階段。
- [x] Firebase Auth 透過 `src/lib/auth` 封裝；client SDK 在 `firebase/client.ts`，server admin SDK 在 `firebase/server.ts`。
- [x] Firestore 透過 `src/lib/db` 雙軌：admin SDK repositories (server / ISR) + Web SDK helpers (`db/firestore/client/*` 給 client 互動)。
- [x] Cloudflare R2 透過 `src/lib/storage` StorageProvider 封裝，server only。
- [ ] AI 服務透過 `src/lib/ai` AIProvider 封裝，Route Handler 只呼叫專案內 service，不直接呼叫 OpenAI / Claude SDK。（第二階段）
- [ ] Vector Index 透過 `src/lib/vector` VectorIndexProvider 封裝，第二階段可先用 Firestore embedding fallback，再切換 pgvector / Pinecone。
- [ ] 排程任務透過 `src/lib/jobs` 的純函式流程封裝，Firebase Scheduled Functions / Vercel Cron 只負責觸發。
- [x] **互動一律 client-direct + rules，不再寫 server action 多繞一層。**

---

## 第一階段：基礎社群媒體與 Firebase 串接

### 1. 專案基礎盤點與 mock 收斂

- [x] 確認現有 route 是否完整：`signin`、`signup`、`home`、`card/[id]`、`write`、`write/[id]`、`me`、`u/[handle]`、`settings`。
- [x] 確認 `src/lib/db/interfaces.ts` 的 Repository method 足以支撐第一階段 CRUD。
- [-] 補齊 mock repositories 的行為。  
  mock 已整批移除，client/server 都直接走 Firestore。
- [x] 補上「最新文章 feed」`findLatestPublishedFeed(limit, cursor?)`。
- [x] `findDailyFeed` 暫時保留為第二階段推薦 feed，不作為第一階段首頁主要資料源。

### 2. Auth 抽象層與 Firebase Auth

- [x] 建立 `src/lib/auth/types.ts`：`AuthUser`、`AuthSession`、`SignInInput`、`SignUpInput`、`PhoneVerificationInput`。
- [x] 建立 `src/lib/auth/interfaces.ts`：`IAuthProvider`。
- [x] `src/lib/auth/firebase/client.ts`：email / Google sign-in、sign-up、sign-out、phone OTP stub、current user。
- [x] `src/lib/auth/firebase/server.ts`：Admin ID token 驗證、session cookie。
- [~] `src/lib/auth/index.ts` 統一輸出。  
  目前只匯出 `getCurrentUser` / `requireUser`；`authProvider` 仍直接從 `firebase/client.ts` 取，可考慮補一個 client-only barrel。
- [x] `AuthProvider` React provider，client components 只依賴專案 auth context。
- [x] 串接 `signin` / `signup` UI 到 auth abstraction。
- [x] 註冊成功後建立 User profile document（`createCurrentUserProfile` 在 `db/firestore/client/profile.ts`，client-direct）。
- [~] 手機驗證狀態。`NEXT_PUBLIC_ENABLE_PHONE_OTP=false` flag 已存在，OTP 流程本身尚未完整接。
- [x] middleware / route guard：未登入者進入 `(app)` 導向 `signin?next=...`。

### 3. Firestore Repository 實作

#### 3.1 Server (admin SDK，供 RSC / ISR)

- [x] `src/lib/db/firestore/` admin SDK 初始化。
- [x] `FirestoreUserRepository`。
- [x] `FirestoreCardRepository`：create draft、update、publish、findById、findByAuthor、findLatestPublishedFeed。
- [x] `FirestoreConnectionRepository`。
- [x] `FirestoreInviteRepository`。
- [x] `FirestoreResonanceRepository`。
- [x] `FirestoreNotificationRepository`。
- [x] Timestamp ↔ `Date` mapper (`firestore/mapper.ts`)。
- [x] Repository 錯誤型別 (`db/errors.ts`)。
- [-] `DATA_PROVIDER=mock|firestore` 切換。  
  mock 已刪除，`repos` hard-wired 到 Firestore。

#### 3.2 Client (Web SDK helpers，供互動)

- [x] `db/firestore/client/init.ts`：共用 AuthProvider 的 Firebase app，取 Firestore singleton。
- [x] `db/firestore/client/cards.ts`：`createCardDraft` / `updateCardDraft` / `publishCard` / `deleteCardDraft`，publish/delete 後自動 ping `/api/revalidate`。
- [x] `db/firestore/client/resonances.ts`：`toggleResonance` / `hasResonated`，doc id 固定 `{cardId}_{userId}`。
- [x] `db/firestore/client/notifications.ts`：`markNotificationRead`。
- [x] `db/firestore/client/profile.ts`：`checkHandleAvailable` / `updateProfile` / `createCurrentUserProfile`。
- [x] `db/firestore/client/invites.ts`：`sendInvite` transaction 同時寫 invite + `quotas/{uid}_{yyyy-mm-dd}` 計數。
- [x] `db/firestore/client/revalidate.ts`：`requestRevalidate(paths)` helper。
- [ ] Connection 相關 client helpers（accept / withdraw / sever；目前 invite accept 流程是否完整待補）。

### 4. Firestore 資料模型與安全規則

- [x] 設計 collections：`users`、`cards`、`connections`、`invites`、`resonances`、`notifications`、`quotas`。
- [~] Firestore security rules (`firebase/firestore.rules`)：
  - [x] `users.create` 要求 `handleLower == handle.lower()` 且 `phoneHash == ""`。
  - [x] `cards.create` metrics 三欄必為 0；`authorId == auth.uid`；`update` 不可動 metrics。
  - [x] 卡片可見性 `cardVisible(data)`：`public` 對已登入者、`connections` 對連結者、`private` 對作者。
  - [x] `resonances.create` 要求 doc id 等於 `{cardId}_{auth.uid}`；read 限本人。
  - [x] `quotas` 由本人寫，`inviteCount <= 3` 且只能遞增。
  - [x] `notifications.update` 只能改 `readAt`，且 `userId == auth.uid`；`create` 限 invite-sender 路徑。
  - [x] `connections.create` 限雙方 uid 之一，doc id == sortedConnectionId(a, b)。
  - [ ] vanity metrics：`readCount` / `resonanceCount` / `inviteCount` 仍存於 card doc。若要對非作者 client 隱藏，需移到 aggregate doc（目前已透過 `CardAuthorMetrics` UI 控制可見性，但 client 仍可讀取）。
- [x] 必要 indexes (`firebase/firestore.indexes.json`)：cards by `visibility + publishedAt`、cards by `authorId + publishedAt`、invites by `toUserId + status + createdAt`、notifications by `userId + createdAt`、resonances by `userId + createdAt`、resonances by `cardId + createdAt`。
- [ ] 加入 rules 測試 / 本地 emulator 驗證 checklist。

### 5. Media Storage 抽象層與 Cloudflare R2

- [x] `src/lib/storage/types.ts`：`StorageObject`、`UploadIntent`、`PresignedUpload`。
- [x] `src/lib/storage/interfaces.ts`：`IStorageProvider`：`createPresignedUpload`、`getPublicUrl`、`deleteObject`。
- [x] `src/lib/storage/r2.ts`：R2 S3-compatible client。
- [~] `src/lib/storage/index.ts` provider 切換：`getStorageProvider()` 永遠回傳 R2，沒有依環境變數切換；mock provider 已刪除。可後續視需要再加 S3 / GCS adapter。
- [x] `/api/upload`：驗登入、檢查 MIME / size、產生 presigned URL。
- [x] CardEditor 圖片上傳並把 media metadata 寫入 Card：`uploadImage()` → `/api/upload` → R2 PUT → `setMedia()` → `updateCardDraft({ media })` 隨下次 saveDraft/publish 一起寫回。
- [x] 第一階段限定圖片即可；影片可保留型別但不開 UI。
- [ ] 圖片刪除或替換流程，避免孤兒檔案。

### 6. 基礎社群媒體功能

- [x] 首頁 `/home` 改為最新公開文章 feed，依 `publishedAt desc`。
- [~] Feed 分頁或「載入更多」（避免無限滑動）。目前 `findLatestPublishedFeed(12)` 一把抓，cursor / 載入更多 UI 尚未做。
- [x] Card detail 改成 ISR（`revalidate = 86400`、`generateStaticParams = []`、`dynamicParams = true`），只快取 public + published；其它類型 404，後續用 client-direct read 處理。
- [x] Card detail 互動拆成 `CardAuthorMetrics`（作者私有指標）、`CardViewerActions`（共振 / 邀請 / 回應，client-direct）。
- [x] Write flow 草稿 / 新增 / 編輯 / 發布 / 公開範圍：CardEditor → `createCardDraft` / `updateCardDraft` / `publishCard`；publish 後 `router.push('/card/[id]')`。
- [x] My Card Box published / private / draft / resonated tabs（`findByAuthor(authorId, tab)`），並在頂部新增 `InvitesInbox`。
- [x] Other Profile (`/u/[handle]`) 顯示公開卡片、連結狀態、邀請入口（透過 `ConnectInviteLauncher`，open 時即時 fetch 配額）。
- [x] Connect Invite Modal：`sendInvite` transaction（invite + quota + notification），UI 顯示剩餘配額；送出後自動 -1。
- [x] NotificationBell：client-direct `listNotifications` / `unread badge` / `markNotificationRead`，不再依賴 server-passed props。
- [x] Settings：handle / bio / region / primaryLocale 走 `updateProfile`（locale 改動同步 router 切 locale 前綴）；Account section 新增 Sign out 按鈕。

### 7. 互動寫入（取代原本 Server Actions）

> **方向已切換為 client-direct。** 原本「整理 `src/lib/actions/mutations.ts`」整段廢除。

- [x] 刪除 `src/lib/actions/mutations.ts`。
- [x] Card 互動改 client-direct：`createCardDraft` / `updateCardDraft` / `publishCard` / `deleteCardDraft`，publish/delete 後 ping `/api/revalidate`。
- [x] Resonance 互動改 client-direct：`toggleResonance` / `hasResonated`。
- [x] Invite 互動改 client-direct：`sendInvite` / `acceptInvite` / `withdrawInvite` / `listIncomingPendingInvites` / `listOutgoingInvites` / `remainingDailyQuota`。
- [x] Notification 互動改 client-direct：`listNotifications` / `unreadNotificationCount` / `markNotificationRead`。
- [x] Profile 改 client-direct：`updateProfile` / `checkHandleAvailable` / `createCurrentUserProfile` / `getCurrentUserHandle`。
- [x] `/api/revalidate` route：驗 session cookie + path allowlist (`/home` / `/me` / `/card/*` / `/u/*` / `/settings`)。
- [ ] client helper 統一錯誤包裝（把 Firebase 原始 error message 轉成 UI 友善文字）。

### 8. Quota 與基礎排程

- [x] 邀請每日 3 次配額：用 `quotas/{uid}_{yyyy-mm-dd}` doc + transaction + rules 卡 `inviteCount <= 3`（不再需要 `src/lib/quota` middleware）。
- [ ] 過期邀請 job：把超過 7 天的 pending invite 標記為 expired（需要 server cron，因為要繞過個別使用者 token）。
- [ ] 通知摘要 job：第一階段先做基本 resonance summary，不做 AI。
- [ ] 排程觸發器先保持可替換：Firebase Scheduled Functions 或 Vercel Cron 皆只呼叫 `src/lib/jobs`。

### 9. 環境變數與部署設定

- [x] `.env.example` 列出 Firebase、R2、provider selection 所需變數。
- [ ] 更新 README / docs，說明 client-direct 架構、ISR 流程與三個 server endpoint 的職責。
- [x] 設定 Firebase project、Firestore、Auth、Admin credentials。
- [~] Cloudflare R2 bucket / CORS / public URL。`r2-cors.json` 已 commit，bucket 是否實際套用請再確認。
- [ ] 確認 Vercel 環境變數與 server-only secrets 沒有暴露到 client bundle（特別注意 R2 / Firebase Admin private key）。

### 10. 第一階段驗收標準

- [x] 使用者可註冊 / 登入 / 登出（signup → profile step → me；Settings → Sign out → 回 signin）。
- [x] 使用者可建立草稿、編輯、發布含圖片的卡片（CardEditor client-direct + R2 upload + 發布後 revalidate）。
- [x] 首頁可看到所有最新公開卡片（`/home` admin SDK 讀 `findLatestPublishedFeed(12)`）。
- [x] 使用者可進入卡片詳情、共振、取消共振（卡片詳情 ISR `revalidate = 86400`；`CardViewerActions` + ResonateButton 走 client-direct toggleResonance）。
- [x] 使用者可查看自己的卡片盒與他人的 profile（`/me` + `/u/[handle]`）。
- [x] 使用者可送出、接受、撤回連結邀請。
  - 送出：`sendInvite` transaction 寫 invite + quota + 接收方 notification（rules 限 invite-sender 類型）。
  - 接受：`acceptInvite` transaction 寫 invite accepted + sorted-id `connections/{a_b}` doc（rules 限雙方 uid）。
  - 撤回：`withdrawInvite`。
  - `InvitesInbox` 元件在 `/me` 顯示 pending 邀請，提供 accept / decline 按鈕。
  - 過期化（7 天後標 expired）需要 cron — Phase 1 後段未做，已記錄在 §8。
- [~] 私人卡與 connections-only 卡片符合可見性規則。
  - 卡片詳情 ISR 只渲染 public + published；連結卡 / 私人卡的詳情需待後續走 client-direct render 或另開 dynamic route。
  - Firestore rules 已限制 `cardVisible`、resonance 自讀、quota 上限、notification 寫入；vanity metrics 與更細的可見性測試仍可再緊縮。
- [x] 圖片經由 storage abstraction 上傳，不直接依賴 R2 SDK。
- [x] Firestore 存取都經過 repository 或 client helper，不在 React components 直接 `getFirestore().collection(...)`。
- [x] Auth 存取都經過 `src/lib/auth`，不在 UI 散落 Firebase Auth SDK 呼叫。
- [x] **Next.js 只有 `/api/upload`、`/api/auth/session`、`/api/revalidate` 三個 server endpoint。**
- [-] `npm run lint`（Next 15 已 deprecate `next lint`，專案無 eslint config，Phase 1 暫不阻塞）。
- [x] `npm run typecheck` 通過。
- [x] `npm run build` 通過（20/20 static pages；`card/[id]` 走 ISR）。

---

## 第二階段：AI 功能整合

> 第二階段整段都尚未開始。AI 端因為 LLM key 與配額簿記必須留在 server，會以 route handler 形式存在；client 仍可直連 Firestore 讀取結果（例如翻譯完成的 `card.translations`）。

### 1. AI Provider 抽象層

- [ ] `src/lib/ai/types.ts`：`PolishInput`、`PolishResult`、`TitleSuggestionResult`、`TagSuggestionResult`、`TranslationResult`、`EmbeddingResult`。
- [ ] `src/lib/ai/interfaces.ts`：`IAIProvider`。
- [ ] `src/lib/ai/providers/openai.ts`。
- [ ] 視需求 `src/lib/ai/providers/anthropic.ts`。
- [ ] `src/lib/ai/index.ts`，支援 `AI_PROVIDER=openai|anthropic|mock`。
- [ ] 所有 AI Route Handler 僅呼叫 `AIProvider`，不直接碰 vendor SDK。
- [ ] AI audit log：userId / operation / token usage / latency / status（直接寫 Firestore，client 不可讀）。
- [ ] AI quota：免費每日 5 次潤稿，Premium 後續擴充。

### 2. AI 寫作輔助

- [ ] `/api/ai/polish`：回傳 diff chunks。
- [ ] `/api/ai/title`：產生 3 個思維核心候選。
- [ ] `/api/ai/tags`：產生 3-5 個概念型標籤。
- [ ] CardEditor 加入 AiAssistPanel，支援逐段採用 / 保留。
- [ ] prompt templates，強制保留作者語氣。
- [ ] 內容安全檢查。
- [ ] 錯誤與 fallback UI。

### 3. 翻譯功能

- [ ] `/api/ai/translate`：支援 zh-TW ↔ en。
- [ ] 發布後非同步翻譯並寫回 `card.translations`，再 ping `/api/revalidate` 刷新 ISR。
- [ ] 翻譯完成建立 `translation_done` notification（client 讀）。
- [ ] Card detail 加語言切換與 fallback。
- [ ] Settings `autoTranslateTo` 串翻譯偏好。
- [ ] 後續擴充 ja / ko / es。

### 4. Vector Index 抽象層

- [ ] `src/lib/vector/types.ts`：`VectorDocument`、`VectorQuery`、`VectorSearchResult`。
- [ ] `src/lib/vector/interfaces.ts`：`IVectorIndexProvider`。
- [ ] Firestore vector fallback：embedding 存 card document 或獨立 `cardEmbeddings`。
- [ ] 外部 provider adapter：pgvector 或 Pinecone 擇一。
- [ ] `src/lib/vector/index.ts`，支援 `VECTOR_PROVIDER=firestore|pgvector|pinecone|mock`。
- [ ] 發布卡片 → 產生 embedding → upsert。
- [ ] 更新 / 刪除卡片 → 同步 Vector Index（cron 或 trigger）。

### 5. 推薦系統與每日 Feed

- [ ] 第一階段「最新文章 feed」保留為 fallback。
- [ ] 推薦 job：依 user 最近卡片、共振紀錄、標籤建立 user profile vector。
- [ ] 每日 feed 預產：固定時間產 12 張寫到 `dailyFeeds/{userId}/days/{yyyy-mm-dd}`。
- [ ] 推薦候選排除自己 / 已看過 / 已共振 / 已連結作者。
- [ ] diversity noise。
- [ ] 「再給我 3 張」每日最多 30 張。
- [ ] UI 保留「每日一批」產品感，不加熱門排序或無限滑動。
- [ ] client 直接從 `dailyFeeds/{userId}/days/{yyyy-mm-dd}` 讀，rules 限本人可讀。

### 6. 思想地圖與進階探索

- [ ] ThoughtMap data service：從 cards、tags、resonances、embeddings 產生節點與邊。
- [ ] My Card Box 加 ThoughtMap tab。
- [ ] 第一版用 force-directed graph，視覺維持手繪風格。
- [ ] 支援以 tag / 時間 / visibility 篩選。
- [ ] 後續支援 AI 產生個人思想摘要。

### 7. 進階通知與內容審核

- [ ] AI 翻譯完成通知。
- [ ] 每日推薦 feed ready 通知或輕量提示。
- [ ] 內容審核 provider 抽象。
- [ ] 檢舉資料模型與基本處理狀態。

### 8. 第二階段驗收標準

- [ ] AI 潤稿、下標、標籤可在 CardEditor 使用。
- [ ] AI 結果不會自動覆蓋作者原文，必須由使用者採用。
- [ ] 發布卡片後會產生 embedding。
- [ ] Vector Index 可透過 provider 切換。
- [ ] 每日推薦 feed 可預產並顯示。
- [ ] 最新文章 feed 可作為推薦失敗 fallback。
- [ ] 翻譯完成後卡片詳情可切換語言。
- [ ] 所有 AI / Vector 呼叫都在 server 端，不暴露 API key。
- [ ] `npm run lint` 通過。
- [ ] `npm run typecheck` 通過。
- [ ] `npm run build` 通過。

---

## Development Plan 建議調整（已套用）

- [x] 將原本 Phase 3 的「Firebase 接入 & 真 AI」拆成兩段。
- [x] 將首頁 MVP 從「每日 AI 精選 feed」改成「最新公開文章 feed」。
- [x] 將 `findDailyFeed` 定位為第二階段；第一階段新增 `findLatestPublishedFeed`。
- [x] 將 `src/lib/auth/firebase-*` 包進 AuthProvider interface 後面。
- [x] **新增決策 11.6：互動改 client-direct Firestore + rules + ISR，不再寫 server action 多繞一層。**
- [x] **新增決策：`/card/[id]` 走 ISR (`revalidate = 86400`)，by client `/api/revalidate` 觸發 on-demand。**
- [~] `src/lib/storage/r2.ts` 已介面化但 `index.ts` 仍 hard-wire R2（未來如要加 provider switching 再說）。
- [ ] `src/lib/ai/client.ts` AIProvider interface + provider adapters（Phase 2）。
- [ ] `src/lib/vector`（Phase 2）。
- [ ] `src/lib/jobs`（Phase 2，含過期邀請與通知摘要）。
- [ ] 待確認：手機驗證地區覆蓋、Vector provider 首選、第一階段是否先允許 email-only 測試帳號。
