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

## Phase 1 — 讀後區重構（ux §1）

- [ ] `molecules/CardDetail/ReadAfterArea.tsx`：包住 `CardViewerActions`＋紙條入口＋收藏鈕；進 viewport 才淡入（IntersectionObserver）
- [ ] 三動作視覺層級：共振＝primary 按鈕（不動）、紙條＝文字連結、收藏＝安靜圖示
- [ ] 新圖示：信封（note）、書籤（bookmark），走 `atoms/Icon` registry
- [ ] 狀態機（ux §1.3）：未登入導 signin；作者本人全部隱藏

## Phase 2 — 收藏（ux §2.1）

- [ ] `atoms/BookmarkButton/`：切換即存，無確認
- [ ] 資料模型 `users/{uid}/bookmarks/{cardId}`＋owner-only rules（部署）
- [ ] `me` 頁收藏分頁；空狀態文案（`me.bookmarks.empty`）
- [ ] 不計數、不通知、不進推薦訊號（Not-Doing List）

## Phase 3 — 微說明系統（ux §3）

- [ ] `lib/hints.ts`：`useHint(key)`，localStorage `hint:{name}`＋登入者同步 user doc `hintsSeen`
- [ ] 顯示前 3 次後永久收起；就地行內、永不 modal
- [ ] 初始清單：`note-privacy`、`resonance-becomes-card`、`feed-reason`、`anonymous-publish`

## Phase 4 — 小紙條（ux §2.2）

- [ ] `molecules/NoteComposer/`：輕量行內 Panel，單一輸入框＋送出
- [ ] 資料模型 `notes/{noteId}`＋rules（fromUid 建立、僅 to/from 可讀、不可 list 他人）＋部署
- [ ] 通知新類型 `note`：**接上 Phase 0 的「與 Ta 建立連結」動作**（同一元件，通知即連結入口）
- [ ] 作者接收端：顯示紙條內容＋一鍵邀請寫卡（`notifications.note.replyInvite`）
- [ ] 防濫用：同人同卡頻率上限；沿用 connection 信任模型

## Phase 5 — 升降級互通＋AI 起頭（ux §2.2–2.3）

- [ ] 紙條 > 200 字 → 行內提示升級成共振卡（內容帶入編輯器）
- [ ] 共振編輯器 → 「還不想公開？寄給作者就好」降級路徑
- [ ] AI 起頭：以 `card.signature.coreInsight` 作編輯器引導語；允許三五句的「回聲」短共振

## Phase 6 — 匿名發布（ux §6）

- [ ] `Card.anonymous: boolean`；發布面板切換＋卡頭所見即所得預覽
- [ ] 匿名卡渲染：不掛 handle、不進公開個人頁；`me` 頁自己可見＋匿名徽章
- [ ] 洩露 checklist：feed / card API 作者欄位、「共振作者加分」join 路徑
- [ ] 發布面板單一畫面：AI 體悟回顯 → 可見性 → 匿名 → 發布鈕

## Phase 7 — Onboarding 收尾（ux §5）

- [ ] 註冊後引導寫第一張卡（2–3 個引導問題）
- [ ] 發布前 AI 體悟回顯（鏡子時刻；永不顯示分數）
- [ ] feed 推薦卡顯示 `reason`＋`feed-reason` 微說明
- [ ] 空狀態文案全面落地（ux §4）
