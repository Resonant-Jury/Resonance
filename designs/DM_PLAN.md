# 私訊模組規劃（Direct Messages）

> 狀態：規劃中，尚未實作。本文件是實作前的設計依據。

## 1. 產品定位

Resonance 的回應階梯由輕到重是：收藏（對自己）→ 小紙條（單向、一次性）→ 共振（公開的回應卡）→ 連結（雙方同意的一對一關係）。私訊是階梯的最後一層：**持續的雙向對話**。

核心原則（延續低壓力設計）：

- **只有已連結（connection）的雙方才能對話。** 陌生人想說話，門是小紙條；想持續說話，先建立連結。這讓「能不能私訊」不需要任何隱私設定 UI——連結本身就是同意。
- **不做已讀回條、不做輸入中指示。** 只給自己看未讀數，不讓對方看見「你讀了卻沒回」。
- **不逐則推播。** 通知鈴鐺只在「對話開啟（第一則訊息）」時響一次，其後的未讀量由私訊入口的徽章承擔。

## 2. 資料模型（Firestore）

沿用 connection 的 sorted pair id（`uid1_uid2`）作為對話 id——一段連結對應唯一一個對話，建立操作天然冪等，也不需要額外索引查「我們倆的對話在哪」。

```
conversations/{pairId}                    // pairId = sorted `uid1_uid2`（同 Connection id）
  participants: [uid1, uid2]              // sorted，與 id 一致
  createdAt, updatedAt: Timestamp
  lastMessage: {                          // 反正規化，供列表渲染，免讀子集合
    text: string                          // 截斷至 ~120 字
    senderId: string
    sentAt: Timestamp
  }
  unread: { [uid]: number }               // 每人未讀數；send 時對方 +1，read 時自己歸零
  originCardId?: string                   // 選填：從哪張卡片／紙條開啟的對話

conversations/{pairId}/messages/{messageId}
  senderId: string
  text: string                            // 上限沿用 NOTE_MAX_LENGTH（2000）
  sentAt: Timestamp
  cardRef?: string                        // 選填：分享一張卡片（後期）
  noteRef?: { cardId, noteId }            // 選填：由小紙條「升級」而來的引文
```

### Security rules 要點

- `conversations/{pairId}`：read 限 `request.auth.uid in resource.data.participants`；create 限 uid 出現在 pairId 中 **且** `exists(/connections/$(pairId))`（連結存在才可開對話）；update 限 participants，且用 `diff().affectedKeys()` 限制只能動 `lastMessage / unread / updatedAt`。
- `messages`：create 限 `senderId == request.auth.uid` 且為 parent 的 participant；v1 不開放 update/delete。
- 連結被刪除時對話保留但唯讀（create message 時同樣檢查 connection 存在）。

### TypeScript 型別

`src/lib/db/types.ts` 新增 `Conversation`、`Message`；`src/lib/adapters/` 加對應 UI adapter。

## 3. 讀寫層與即時性

- `src/lib/db/firestore/client/messages.ts`：`openConversation(otherUid)`（setDoc merge、冪等）、`sendMessage`、`listMessages`（分頁，`orderBy sentAt desc, limit 30`）、`markRead`、`listenThread`。
- **對話列表**：SWR（`useConversations`），輪詢 30s——與現有 hooks 模式一致。
- **開啟中的對話串**：`onSnapshot` 即時訂閱（`useThread(pairId)`）。這會是專案第一個 realtime surface，範圍刻意縮小到「當前打開的那一串」；列表與徽章仍走 SWR。
- 未讀數：send 時在 batch 裡對 `unread.<對方>` `increment(1)` 並更新 `lastMessage`；進入對話串時 `markRead` 歸零。
- Server 端無需新 API route（純 client SDK + rules）；通知寫入沿用現有 notifications 模組。

## 4. 路徑設計

```
/[locale]/(app)/messages             對話列表（桌機：左列表＋右對話串雙欄；手機：只有列表）
/[locale]/(app)/messages/[handle]    與某人的對話串（URL 用對方 handle，不暴露 uid pair）
```

- `[handle]` → 由 profile 模組 resolve 成 uid → 組 pairId。URL 乾淨、可分享給自己。
- 手機：thread 頁全螢幕（sticky composer 於底部）；桌機：`/messages/[handle]` 渲染同一個雙欄版面、右欄選中。

## 5. UI 規劃（依 resonance-ui 元件契約）

- **`sections/MessagesPage`**：`PageShell width="wide"` + 雙欄 grid。
  - 左欄：一個 `Panel`，對話列以 `Divider` 分隔（不做卡中卡）。每列：`HandDrawnAvatar` + handle + lastMessage 摘要（muted）+ 未讀徽章（沿用 NotificationBell 的 wobbly badge chip 畫法）。
  - 右欄 thread：訊息用小的手繪氣泡（`wobRect`，小尺寸高 curve，自己的訊息 `--color-terracotta-light` 淡染、對方 cream；`seed` 取 messageId hash 保持 SSR/CSR 一致）。時間戳 muted、只在段落間顯示。
  - Composer：`Textarea variant="subtle"` + `OrganicButton`（模式同 NoteComposer；Enter 送出、Shift+Enter 換行）。
- **手機**：列表列全出血、上下 wavy divider（規則 #13）；thread 頁 edge-to-edge。
- **空狀態**：列表空 →「建立連結後，就能在這裡開始對話」；thread 空 → 顯示 `originCardId` 那張卡的 `EmbedStoryCard` 作為開場上下文。
- 新 icon：`icons/chat.tsx`（手繪對話氣泡，註冊進 registry）。

## 6. 入口設計

1. **AppHeader**：`NotificationBell` 旁加一顆 chat icon（含未讀 wobbly badge）→ `/messages`。手機在 `AppMobileNavModal` 與桌機 `Subnavbar` 各加一項。
2. **`invite_accepted` 通知**：連結成立的通知上加「開始聊天」action（沿用 NotificationConnectAction 的模式）——這是最自然的第一次入口：連結一成立，門就在眼前。
3. **卡片內頁 `CardAuthorAside` / 公開個人頁 `u/[handle]`**：僅當「已連結」時顯示安靜的「傳訊息」文字連結（與「寄一張小紙條給作者」同一視覺層級；未連結者仍然只看得到紙條入口）。
4. **小紙條通知的回覆升級**：作者收到已連結對象的紙條通知時，提供「回覆」→ 開啟對話並以 `noteRef` 引用那張紙條。紙條從一次性單向，自然長成對話。

## 7. 實作階段

- **Phase 1**：types + rules + client 讀寫層、`/messages` 列表與 thread（onSnapshot）、header 入口。單元測試：messages client 模組、useThread hook、MessagesPage 互動。
- **Phase 2**：未讀徽章、`invite_accepted`「開始聊天」、卡片頁／個人頁的已連結入口、對話開啟通知。
- **Phase 3**：紙條回覆升級（noteRef 引文）、在對話中分享卡片（cardRef → EmbedStoryCard）。

## 8. 待確認的決策

| # | 問題 | 建議 |
|---|---|---|
| 1 | 私訊是否只限已連結雙方 | 是（陌生人走小紙條） |
| 2 | URL 用 handle 還是 pairId | handle（不暴露 uid） |
| 3 | 即時性 | thread 用 onSnapshot；列表 SWR 輪詢 |
| 4 | 已讀回條 | 不做（只有自己的未讀數） |
| 5 | 逐則通知 | 不做（只通知對話開啟；未讀交給徽章） |
