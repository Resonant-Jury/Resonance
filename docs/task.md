# Resonance — Task Breakdown

> 來源文件：[Development Plan](./development_plan.md)
> 分階段目標：先完成可用的基礎社群媒體與 Firebase / R2 串接，再加入 AI、Vector Index 與推薦系統。

---

## 目標切分

### 第一階段：基礎社群媒體與 Firebase 串接

目標是把目前 mock-driven 的產品變成一個可登入、可發文、可瀏覽、可共振、可連結的簡單社群媒體。首頁先採「最新公開文章」feed，不做 AI 推薦、不做向量索引、不做每日個人化精選。

### 第二階段：AI 功能整合

目標是在第一階段穩定資料與使用者流程之後，加入 AI 寫作輔助、翻譯、embedding、Vector Index、每日推薦 feed、思想地圖與進階推薦。

---

## 架構原則

- [ ] 所有外部服務都必須經過專案內的 adapter / service interface，不讓頁面、元件或 server action 直接依賴 vendor SDK。
- [ ] Firebase Auth 透過 `src/lib/auth` 封裝 client / server auth 行為，UI 只讀取抽象後的 session 與 auth action。
- [ ] Firestore 透過 `src/lib/db` Repository interface 封裝，目前已存在 `interfaces.ts` / `types.ts` / `mock`，第一階段補上 Firestore implementation。
- [ ] Cloudflare R2 透過 `src/lib/storage` StorageProvider 封裝，未來可換 S3、GCS 或其他 object storage。
- [ ] AI 服務透過 `src/lib/ai` AIProvider 封裝，Route Handler 只呼叫專案內 service，不直接呼叫 OpenAI / Claude SDK。
- [ ] Vector Index 透過 `src/lib/vector` VectorIndexProvider 封裝，第二階段可先用 Firestore embedding fallback，再切換 pgvector / Pinecone / 其他向量資料庫。
- [ ] 排程任務透過 `src/lib/jobs` 的純函式流程封裝，Firebase Scheduled Functions / Vercel Cron 只負責觸發。

---

## 第一階段：基礎社群媒體與 Firebase 串接

### 1. 專案基礎盤點與 mock 收斂

- [ ] 確認現有 route 是否完整：`signin`、`signup`、`home`、`card/[id]`、`write`、`write/[id]`、`me`、`u/[handle]`、`settings`。
- [ ] 確認 `src/lib/db/interfaces.ts` 的 Repository method 足以支撐第一階段 CRUD。
- [ ] 補齊 mock repositories 的行為，讓所有第一階段頁面在 `NEXT_PUBLIC_USE_MOCK=true` 時可完整點通。
- [ ] 補上「最新文章 feed」所需方法，例如 `findLatestPublishedFeed(limit, cursor?)` 或等價設計。
- [ ] 將原本 `findDailyFeed` 暫時保留為第二階段推薦 feed，不作為第一階段首頁主要資料源。

### 2. Auth 抽象層與 Firebase Auth

- [ ] 建立 `src/lib/auth/types.ts`，定義 `AuthUser`、`AuthSession`、`SignInInput`、`SignUpInput`、`PhoneVerificationInput` 等型別。
- [ ] 建立 `src/lib/auth/interfaces.ts`，定義 `IAuthProvider`。
- [ ] 建立 `src/lib/auth/firebase/client.ts`，封裝 Firebase client SDK：email sign-in、sign-up、sign-out、phone OTP、current user。
- [ ] 建立 `src/lib/auth/firebase/server.ts`，封裝 Firebase Admin：ID token 驗證、session cookie、custom claims。
- [ ] 建立 `src/lib/auth/index.ts`，統一輸出 `authProvider`、`getCurrentUser`、`requireUser`。
- [ ] 建立 `AuthProvider` React provider，讓 client components 只依賴專案 auth context。
- [ ] 串接 `signin` / `signup` UI 到 auth abstraction。
- [ ] 註冊成功後建立對應 User profile document。
- [ ] 設計手機驗證狀態：第一階段可支援 Email + Phone OTP；若成本要控管，可加 feature flag 暫時允許測試環境跳過 OTP。
- [ ] middleware / route guard：未登入者進入 `(app)` route 時導向 `signin?next=...`。

### 3. Firestore Repository 實作

- [ ] 建立 `src/lib/db/firestore` 目錄。
- [ ] 建立 Firestore client / admin 初始化模組，不讓其他層直接初始化 Firebase SDK。
- [ ] 實作 `FirestoreUserRepository`。
- [ ] 實作 `FirestoreCardRepository`：create draft、update draft、publish、findById、findByAuthor、findLatestPublishedFeed。
- [ ] 實作 `FirestoreConnectionRepository`：isConnected、list、listMutuals、sever。
- [ ] 實作 `FirestoreInviteRepository`：send、accept、withdraw、expire、listPending、remainingDailyQuota。
- [ ] 實作 `FirestoreResonanceRepository`：mark、unmark、hasResonated、listResonated。
- [ ] 實作 `FirestoreNotificationRepository`：list、unreadCount、markRead。
- [ ] 更新 `src/lib/db/index.ts`，支援 `mock` / `firestore` provider 切換，例如 `DATA_PROVIDER=mock|firestore`。
- [ ] 建立 Firestore timestamp 與 domain `Date` 的 mapper，避免 mapper 邏輯散落在 repository。
- [ ] 建立 repository 層錯誤型別，例如 `NotFoundError`、`ForbiddenError`、`QuotaExceededError`。

### 4. Firestore 資料模型與安全規則

- [ ] 設計 collections：`users`、`cards`、`connections`、`invites`、`resonances`、`notifications`、`quotas`。
- [ ] 設計必要 indexes：cards by `publishedAt`、cards by `authorId` + `publishedAt`、invites by `toUserId` + `status`、notifications by `userId` + `createdAt`。
- [ ] 撰寫 Firestore security rules。
- [ ] 規則必須保護私人資料：`phoneHash` 不可公開讀取。
- [ ] 規則必須保護卡片可見性：`private` 只給作者，`connections` 只給作者與連結者，`public` 給已登入者。
- [ ] 規則必須避免讀者看見 vanity metrics：`readCount`、`resonanceCount`、`inviteCount` 僅作者可讀，或移到作者專用 aggregate document。
- [ ] 規則必須保護 `resonances`：只有建立者本人可讀，公開頁面只能讀 aggregate。
- [ ] 加入 rules 測試或至少建立本地 emulator 驗證 checklist。

### 5. Media Storage 抽象層與 Cloudflare R2

- [ ] 建立 `src/lib/storage/types.ts`，定義 `StorageObject`、`UploadIntent`、`PresignedUpload`。
- [ ] 建立 `src/lib/storage/interfaces.ts`，定義 `IStorageProvider`：`createPresignedUpload`、`getPublicUrl`、`deleteObject`。
- [ ] 建立 `src/lib/storage/r2.ts`，封裝 R2 S3-compatible client。
- [ ] 建立 `src/lib/storage/index.ts`，支援 `STORAGE_PROVIDER=r2|mock`。
- [ ] 建立 `/api/upload` route，驗證登入、檢查 MIME type / size、產生 presigned URL。
- [ ] CardEditor 支援上傳圖片並把 media metadata 寫入 Card。
- [ ] 第一階段限定圖片即可；影片可保留型別但不開 UI。
- [ ] 補上圖片刪除或替換流程，避免孤兒檔案長期累積。

### 6. 基礎社群媒體功能

- [ ] 首頁 `/home` 改為最新公開文章 feed，依 `publishedAt desc` 排序。
- [ ] Feed 支援分頁或「載入更多」，但避免無限滑動。
- [ ] Card detail 支援 visibility 檢查、作者資訊、共振按鈕、引用回應入口。
- [ ] Write flow 支援草稿、新增、編輯、發布、公開範圍。
- [ ] My Card Box 支援 published / private / draft / resonated tabs。
- [ ] Other Profile 支援公開卡片、連結狀態、邀請入口。
- [ ] Connect Invite Modal 串接真資料與每日配額。
- [ ] NotificationBell 串接 invite / resonance summary / invite expired 基礎通知。
- [ ] Settings 支援 handle、bio、語言、翻譯偏好、登出。

### 7. Server Actions / Route Handlers

- [ ] 整理目前 `src/lib/actions/mutations.ts`，將資料寫入統一走 repository。
- [ ] 新增 card actions：create draft、update draft、publish、delete draft。
- [ ] 新增 resonance actions：mark / unmark。
- [ ] 新增 invite actions：send / accept / withdraw。
- [ ] 新增 profile actions：update handle / bio / locale。
- [ ] 每個 action 都必須透過 `requireUser` 驗證登入。
- [ ] 每個 action 都必須回傳 UI 可用的錯誤狀態，不把 Firebase 原始錯誤直接顯示給使用者。

### 8. Quota 與基礎排程

- [ ] 建立 `src/lib/quota`，封裝每日邀請上限。
- [ ] Invite send 時檢查每日 3 次上限。
- [ ] 建立過期邀請 job：把超過 7 天的 pending invite 標記為 expired。
- [ ] 建立通知摘要 job：第一階段可先做基本 resonance summary，不做 AI。
- [ ] 排程觸發器先保持可替換：Firebase Scheduled Functions 或 Vercel Cron 皆只呼叫 `src/lib/jobs`。

### 9. 環境變數與部署設定

- [ ] 建立 `.env.example`，列出 Firebase、R2、provider selection 所需變數。
- [ ] 更新 README 或 docs，說明本地 mock / Firebase provider 切換方式。
- [ ] 設定 Firebase project、Firestore、Auth、Admin credentials。
- [ ] 設定 Cloudflare R2 bucket、CORS、public URL 或 signed read policy。
- [ ] 確認 Vercel 環境變數與 server-only secrets 沒有暴露到 client bundle。

### 10. 第一階段驗收標準

- [ ] 使用者可註冊 / 登入 / 登出。
- [ ] 使用者可建立草稿、編輯、發布含圖片的卡片。
- [ ] 首頁可看到所有最新公開卡片。
- [ ] 使用者可進入卡片詳情、共振、取消共振。
- [ ] 使用者可查看自己的卡片盒與他人的 profile。
- [ ] 使用者可送出、接受、撤回或看到過期連結邀請。
- [ ] 私人卡與 connections-only 卡片符合可見性規則。
- [ ] 圖片經由 storage abstraction 上傳，不直接依賴 R2 SDK。
- [ ] Firestore 存取都經過 repository，不在 React components 直接呼叫 Firestore。
- [ ] Auth 存取都經過 `src/lib/auth`，不在 UI 散落 Firebase Auth SDK 呼叫。
- [ ] `npm run lint` 通過。
- [ ] `npm run typecheck` 通過。
- [ ] `npm run build` 通過。

---

## 第二階段：AI 功能整合

### 1. AI Provider 抽象層

- [ ] 建立 `src/lib/ai/types.ts`，定義 `PolishInput`、`PolishResult`、`TitleSuggestionResult`、`TagSuggestionResult`、`TranslationResult`、`EmbeddingResult`。
- [ ] 建立 `src/lib/ai/interfaces.ts`，定義 `IAIProvider`。
- [ ] 建立 `src/lib/ai/providers/openai.ts`。
- [ ] 視需求建立 `src/lib/ai/providers/anthropic.ts`。
- [ ] 建立 `src/lib/ai/index.ts`，支援 `AI_PROVIDER=openai|anthropic|mock`。
- [ ] 所有 AI Route Handler 僅呼叫 `AIProvider`，不直接碰 vendor SDK。
- [ ] 建立 AI audit log repository，記錄 userId、operation、token usage、latency、status。
- [ ] 建立 AI quota：免費每日 5 次潤稿，Premium 後續擴充。

### 2. AI 寫作輔助

- [ ] `/api/ai/polish`：回傳 diff chunks，不覆蓋原文。
- [ ] `/api/ai/title`：產生 3 個思維核心候選。
- [ ] `/api/ai/tags`：產生 3-5 個概念型標籤。
- [ ] CardEditor 加入 AiAssistPanel，支援逐段採用 / 保留。
- [ ] 加入 prompt templates，強制保留作者語氣、節奏與用字。
- [ ] 加入內容安全檢查，至少阻擋明顯違規或高風險內容。
- [ ] 加入錯誤與 fallback UI，例如 AI 暫時不可用時不阻塞發布。

### 3. 翻譯功能

- [ ] `/api/ai/translate`：支援 zh-TW ↔ en。
- [ ] 發布後非同步產生翻譯並寫回 `card.translations`。
- [ ] 翻譯完成後建立 `translation_done` notification。
- [ ] Card detail 加入語言切換與 fallback。
- [ ] Settings 的 `autoTranslateTo` 串接翻譯偏好。
- [ ] 後續再擴充 ja / ko / es。

### 4. Vector Index 抽象層

- [ ] 建立 `src/lib/vector/types.ts`，定義 `VectorDocument`、`VectorQuery`、`VectorSearchResult`。
- [ ] 建立 `src/lib/vector/interfaces.ts`，定義 `IVectorIndexProvider`：`upsert`、`delete`、`querySimilar`。
- [ ] 建立 Firestore vector fallback：embedding 存在 card document 或獨立 `cardEmbeddings` collection。
- [ ] 建立外部 provider adapter：pgvector 或 Pinecone 擇一。
- [ ] 建立 `src/lib/vector/index.ts`，支援 `VECTOR_PROVIDER=firestore|pgvector|pinecone|mock`。
- [ ] 發布卡片時產生 embedding 並 upsert 到 Vector Index。
- [ ] 更新 / 刪除卡片時同步更新 Vector Index。

### 5. 推薦系統與每日 Feed

- [ ] 將第一階段「最新文章 feed」保留為 fallback。
- [ ] 建立推薦 job：依使用者最近卡片、共振紀錄、標籤建立 user profile vector。
- [ ] 建立每日 feed 預產流程：每天固定時間產生 12 張卡片。
- [ ] 推薦候選需排除：自己的卡、已看過卡、已共振卡、已連結作者的卡。
- [ ] 加入 diversity noise，避免推薦只集中在單一主題。
- [ ] 「再給我 3 張」每日最多增加到 30 張。
- [ ] Feed repository 新增 daily feed storage，例如 `dailyFeeds/{userId}/days/{yyyy-mm-dd}`。
- [ ] UI 保留「每日一批」產品感，不加入熱門排序或無限滑動。

### 6. 思想地圖與進階探索

- [ ] 建立 ThoughtMap data service，從 cards、tags、resonances、embeddings 產生節點與邊。
- [ ] My Card Box 加入 ThoughtMap tab。
- [ ] 第一版可用 force-directed graph，視覺維持手繪風格。
- [ ] 支援以 tag / 時間 / visibility 篩選。
- [ ] 後續支援 AI 產生個人思想摘要。

### 7. 進階通知與內容審核

- [ ] AI 翻譯完成通知。
- [ ] 每日推薦 feed ready 通知或輕量提示。
- [ ] 內容審核 provider 抽象，支援 LLM moderation 或其他 moderation API。
- [ ] 新增檢舉資料模型與基本處理狀態，後台可留到後續階段。

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

## Development Plan 建議調整

- [ ] 將原本 Phase 3 的「Firebase 接入 & 真 AI」拆成兩段：第一階段只做 Firebase / R2 / 最新文章 feed，第二階段才做 AI / embedding / 推薦。
- [ ] 將首頁 MVP 從「每日 AI 精選 feed」改成「最新公開文章 feed」，降低第一階段複雜度。
- [ ] 將 `findDailyFeed` 定位為第二階段推薦 feed；第一階段新增 `findLatestPublishedFeed` 或同等 repository method。
- [ ] 將 `src/lib/storage/r2.ts` 調整為 `src/lib/storage` provider 架構，不讓 R2 成為硬依賴。
- [ ] 將 `src/lib/auth/firebase-client.ts` / `firebase-admin.ts` 包在 AuthProvider interface 後面。
- [ ] 將 `src/lib/ai/client.ts` 調整為 AIProvider interface + provider adapters。
- [ ] 新增 `src/lib/vector`，避免推薦系統直接依賴 Firestore embedding 或特定 vector DB。
- [ ] 新增 `src/lib/jobs`，將 cron 實作和任務邏輯拆開。
- [ ] 待確認事項中新增「第一階段是否先允許 email-only 測試帳號」與「Vector provider 首選」。
