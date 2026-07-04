# Tasks — 產品定位落地開發計畫

> 依據 [product-design-principles.md](./product-design-principles.md) 與 [ux-user-flows.md](./ux-user-flows.md)（2026-07）推導的開發順序。
> 每完成一項就勾掉；每一步都保持「上線後卡片頁的視覺焦點仍然只有共振」的檢查。

---

## 核心邏輯變更：關係如何建立（本輪新增的規劃）

舊模型：任何人可以在別人的個人頁按「想和 Ta 連結」發起邀請 → 無脈絡的連結入口，正是準則三要拆掉的東西。

新模型（準則三：關係從故事裡長出來）：

```
[ 你的故事被讀到 ] → [ 對方寫共振卡 / 寄小紙條 ] → [ 你收到通知 ]
        → [ 通知上選擇「邀請 Ta 連結」→ 送出 invite ] → [ 對方接受 ] → [ 連結成立，私訊開啟 ]
```

- **個人頁不再是連結入口**：移除「想和他連結」按鈕。個人頁只剩作品（公開卡片）與已連結狀態。
- **通知變成連結入口**：收到「共振」或（未來的）「小紙條」通知時，通知項目上出現「與 Ta 建立連結」動作 → 開啟現有 `ConnectInviteModal` 送出邀請（帶 `referenceCardId`，開場白永遠有脈絡）。
- **雙方同意不變**：邀請仍走既有 invite / connection 機制（每日 3 次配額、7 天過期、對方在 `/me` 的 InvitesInbox 接受）。
- **迴路閉合**：對方接受邀請時，發起者收到 `invite_accepted` 通知（「你們連上線了」），需要 rules 允許 `actorNotif("invite_accepted")`。

---

## Phase 0 — 連結入口搬家（本輪實作 ✅）

- [x] 個人頁 `u/[handle]`：移除 `ConnectInviteLauncher`（保留「已連結」徽章與本人「編輯個人檔案」）
- [x] 刪除 `ConnectInviteLauncher`（唯一使用處即個人頁）；`ConnectInviteModal` 保留給通知入口
- [x] `useProfileByHandle`：拿掉 `dailyRemaining`（只有舊按鈕在用）
- [x] 通知中心：`resonance` 通知項目加「與 Ta 建立連結」動作（已連結則顯示「已連結」；本人 / 已送出後隱藏）
- [x] `acceptInvite` 交易內補寄 `invite_accepted` 通知給邀請發起者；通知中心渲染該類型
- [x] `firestore.rules`：notifications create 允許 `actorNotif("invite_accepted")`，並部署
- [x] i18n（zh-TW / en）：新增通知動作文案、`invite_accepted` 文案；移除 `initiateConnect`；通知空狀態改為「當有人共振你的卡片、或寄來一張小紙條，會出現在這裡。」（ux §4）
- [x] 測試：更新 hooks / 個人頁相關測試；新增通知連結動作測試

先不做（記錄在案）：
- 對同一人重複送邀請的去重（現靠每日配額 + 對方婉拒擋住；紙條上線時一併做防濫用）
- 通知分頁 / 全部已讀

## Phase 1 — 讀後區重構（ux §1）✅

- [x] `molecules/CardDetail/ReadAfterArea.tsx`：包住 `CardViewerActions`＋紙條入口＋收藏鈕；進 viewport 才淡入（IntersectionObserver）
- [x] 三動作視覺層級：共振＝primary 按鈕（不動）、紙條＝文字連結、收藏＝安靜圖示
- [x] 新圖示：信封（note）、書籤（bookmark），走 `atoms/Icon` registry
- [x] 狀態機（ux §1.3）：未登入導 signin；作者本人全部隱藏
- [ ] （後續）收藏小圖示常駐卡片角落（目前只在讀後區）

## Phase 2 — 收藏（ux §2.1）✅

- [x] `atoms/BookmarkButton/`：切換即存，無確認（樂觀更新）
- [x] 資料模型 `users/{uid}/bookmarks/{cardId}`＋owner-only rules（已部署）
- [x] `me` 頁收藏分頁；空狀態文案（`me.emptyBookmarks`）
- [x] 不計數、不通知、不進推薦訊號（Not-Doing List）

## Phase 3 — 微說明系統（ux §3）✅

- [x] `lib/hints.ts`：`useHint(key)`，localStorage `hint:{name}`＋登入者同步 user doc `hintsSeen`（rules 已加白名單並部署）
- [x] 顯示前 3 次後永久收起；就地行內、永不 modal
- [x] 已接上：`note-privacy`（紙條輸入框下）、`resonance-becomes-card`（共振編輯器上）
- [x] `feed-reason`（home 推薦區）、`anonymous-publish`（發布面板）——Phase 6/7 時接上

## Phase 4 — 小紙條（ux §2.2）✅（兩項後續）

- [x] `molecules/NoteComposer/`：輕量行內 Panel，單一輸入框＋送出
- [x] 資料模型 `notes/{noteId}`＋rules（fromUid 建立、僅 to/from 可讀、≤2000 字、recipient 只能改 readAt）＋部署
- [x] 通知新類型 `note`：內文預覽直接顯示在通知裡，**並接上 Phase 0 的「與 Ta 建立連結」動作**（通知即連結入口）
- [ ] 作者接收端進階：一鍵邀請寫卡（`notifications.note.replyInvite`）— 需要回信（作者→讀者）的紙條方向，留待與私訊整合時做
- [ ] 防濫用：同人同卡頻率上限（目前僅長度上限；封鎖機制沿用 connection 信任模型時一併做）

## Phase 5 — 升降級互通＋AI 起頭（ux §2.2–2.3）✅

- [x] 紙條 > 200 字 → 行內提示升級成共振卡（內容帶入編輯器，`NOTE_UPGRADE_THRESHOLD`）
- [x] 共振編輯器 → 「還不想公開？寄給作者就好」降級路徑（`CardEditor.onStoryChange` 帶出草稿文字）
- [x] AI 起頭：以 `card.signature.coreInsight` 作編輯器引導語（client `mapCard` 補上 signature；分數永不顯示）；編輯器無最低字數，回聲短共振本來就允許

## Phase 6 — 匿名發布（ux §6）✅

- [x] `Card.anonymous: boolean`（client `mapCard`＋server mapper 皆通；rules 免改——create 白名單容許額外欄位、update 只鎖 metrics）
- [x] 發布面板單一畫面 `molecules/PublishPanel`：AI 體悟回顯（`POST /api/cards/insight`，只回 `coreInsight`、永不回分數、失敗不擋發布）→ 可見性（自編輯器本體移入）→ 匿名切換＋卡頭所見即所得預覽 → 發布鈕
- [x] 匿名卡渲染：`cardToStory` 統一匿名化（feed / 相關卡 / 收藏）；`MiniCardGrid`（共振卡）、`CardEmbedLink`（文內嵌卡）、卡片頁卡頭與作者側欄（不掛 handle、不連個人頁）
- [x] 不進公開個人頁：`getPublicCardsByAuthor` 過濾 `anonymous`；`me` 頁自己可見（`deanonymize`）＋「匿名發布」徽章
- [x] `anonymous-publish` 微說明接上（Phase 3 遺留項）
- [x] 洩露 checklist 過一輪：
  - `/api/recommend/feed` 回應只有 `cardId / reason / channel / score`，無作者欄位 ✅
  - 「共振作者加分」（`RESONANCE_AUTHOR_BOOST`）與向量記錄的 `authorId` 只存在 server-side funnel，從不出 API ✅
  - slug 產生：匿名卡撞名時**不再**以作者 handle 消歧（直接進數字後綴）——本輪修補 ✅
  - 共振者頭像列（`useResonators`）跳過匿名共振卡的作者 ✅
  - `/api/cards/resolve` 只回 doc id ✅
  - ⚠️ 已知界線：`authorId` 仍在卡片 doc 上（rules 無法遮欄位），匿名性擋的是 UI 與 API 層；要擋「直接讀 Firestore 原始文件」需改為 server 中介讀取，另立一輪
- 先不做（記錄在案）：inline 共振編輯器的匿名選項（共振以身分回應是設計本意）；發布後在卡片頁切換匿名（可經 `write/[id]` 重發布達成）

## Phase 7 — Onboarding 收尾（ux §5）✅

- [x] 註冊後引導寫第一張卡：signup 完成本就導向 `/write`；新增 `molecules/FirstCardGuide`（3 個引導問題，點選以引言帶入編輯器、引導收起）＋`useHasWrittenCards`，只對「一張卡都沒寫過」的人出現
- [x] 發布前 AI 體悟回顯（鏡子時刻）＝ PublishPanel 第 1 區（與 Phase 6 同件）
- [x] feed 推薦卡顯示 `reason`（前一輪已接）＋`feed-reason` 微說明（Phase 3 遺留項，本輪接上）
- [x] 空狀態文案落地（ux §4）：feed 冷啟動不喊「沒有內容」、改邀請寫第一張卡（home coldStart 區塊）；`me` 已發布空狀態改為「排列的起點」＋寫卡 CTA；公開個人頁本人空狀態同文案＋CTA；通知／收藏空狀態前一輪已落地
