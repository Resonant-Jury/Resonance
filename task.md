# 發布流程修復 task.md

## 背景
寫文章 → 點發布後導到 `/zh-TW/card/{id}` 出現 404。
經 admin SDK 檢查該文件：實際存在、`publishedAt` 已設定、author 存在，
但 `visibility === "connections"`（非 public）。

## 根因與各處遺漏

### 1. 卡片詳情頁只允許 public，且從不驗證 viewer（主因）
`src/app/[locale]/(app)/card/[id]/page.tsx`
- `repos.card.findById(id, null)` 永遠傳 `null` viewer → 連作者本人都被當路人。
- `if (card.visibility !== 'public') notFound()` 直接擋掉 connections / private。
- 結果：作者發布非公開卡片後，自己也看不到 → 404。
- `repos.card.findById` 本身已內建逐 viewer 的權限判斷（作者 / 連結 / 公開），
  頁面卻沒善用它。

### 2. ISR 把 404 快取起來
同檔：`export const revalidate = 86400`。
- 頁面是逐 viewer 的（含 connections/private），不該被靜態快取。
- 一旦第一次 render 走進 `notFound()`，這個 404 會被快取一天，
  即使資料正常之後也一直 404。
- 修法：卡片頁讀 viewer（cookie）→ 改成動態渲染，不快取 404。

### 3. revalidatePath 沒有 locale 前綴（連帶遺漏）
`src/lib/db/firestore/client/cards.ts` 送出 `/card/{id}`、`/home`、`/me`，
但 `localePrefix` 預設為 `always`，真實路徑是 `/en/...`、`/zh-TW/...`。
`src/app/api/revalidate/route.ts` 直接 `revalidatePath('/home')`，
完全對不到 `/zh-TW/home`，導致：
- 首頁 feed 永遠不會刷新出新發布的公開卡片。
- 修法：API 對每個 path 展開所有 locale 前綴再 revalidate。

### 4. 作者預覽未發布草稿也會 404（健壯性）
頁面硬性要求 `card.publishedAt`。作者本人預覽草稿應允許。
- 修法：`!card.publishedAt && card.authorId !== viewerId` 才 404。

## 修復清單
- [x] 卡片詳情頁：取得 viewer、用 findById 權限判斷、允許作者看自己的非公開/草稿卡片
- [x] 卡片詳情頁：改為動態渲染，避免快取 404
- [x] revalidate API：對所有 locale 前綴展開
- [x] （前一輪）Firestore client 開啟 ignoreUndefinedProperties
- [x] （前一輪）R2 forcePathStyle 修 SSL
- [x] （前一輪）發布按鈕狀態與錯誤訊息正確顯示
