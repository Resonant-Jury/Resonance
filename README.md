# Resonance（共振）

一個以「故事卡片」為核心的多語社交書寫平台。使用者撰寫故事卡片、透過「共振」（撰寫一張回應卡片，而非按讚）與他人連結。視覺識別建立在執行期程序化生成的手繪風 SVG 之上。

## 技術棧

| 領域 | 技術 |
| --- | --- |
| 框架 | Next.js 15（App Router）+ React 19 + TypeScript 5.7（strict） |
| 樣式 | CSS Modules + CSS 自訂屬性（無 Tailwind），OKLCH 色彩空間 |
| i18n | next-intl（`en`、`zh-TW` 路由，卡片內容支援更多語言欄位） |
| 認證 | Firebase Auth（client SDK）+ session cookie（firebase-admin 簽發） |
| 資料庫 | Cloud Firestore（client SDK 直讀 + admin SDK 伺服器端 repository） |
| 物件儲存 | Cloudflare R2（S3 相容 API，`@aws-sdk/client-s3`） |
| AI | OpenAI（LLM：slug 翻譯、標籤建議；Image：故事插圖生成） |
| 編輯器 | Tiptap 3 + tiptap-markdown；閱讀端用 react-markdown + remark-gfm |
| 資料抓取 | SWR（client hooks） |
| 測試 | Vitest 3 + @testing-library/react + jsdom |
| 部署 | Vercel（region `hnd1`）；Firebase CLI 管理 rules/indexes |

## 常用指令

```bash
npm run dev        # 啟動 Next.js dev server
npm run build      # production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest 單次執行（CI 模式）
npm run test:watch # Vitest watch 模式
npm run test:ui    # Vitest browser UI
```

部署 Firestore 規則／索引（修改 `firebase/firestore.rules` 或 `firestore.indexes.json` 後必須執行）：

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## 環境變數

複製 `.env.example` 為 `.env` 並填入：

- `NEXT_PUBLIC_FIREBASE_*` — Firebase client SDK 設定（公開）。
- `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` — firebase-admin 服務帳號（伺服器端）。
- `FIREBASE_SESSION_COOKIE_NAME`（預設 `__session`）、`FIREBASE_SESSION_EXPIRES_IN_DAYS`（預設 7）。
- `R2_*` — Cloudflare R2 帳號、bucket、S3 端點、金鑰；`R2_PUBLIC_BASE` 為公開讀取網域。
- `OPENAI_API_KEY`、`OPENAI_LLM_MODEL`、`OPENAI_IMAGE_MODEL` — AI 功能（slug、標籤、插圖）。
- `NEXT_PUBLIC_ENABLE_PHONE_OTP` — 手機 OTP 登入開關。

## 專案結構

```
src/
├── middleware.ts            # next-intl locale 路由攔截
├── i18n/                    # routing / navigation / request（next-intl）
├── messages/                # en.json, zh-TW.json 介面翻譯
├── styles/                  # tokens.css（design tokens）、globals.css
├── app/
│   ├── [locale]/
│   │   ├── (auth)/          # signin, signup
│   │   ├── (app)/           # home（動態牆）、me、settings、write/[id]（編輯器）、
│   │   │                    # card/[slug]（卡片頁）、u/[handle]（公開個人頁）
│   │   └── page.tsx         # 行銷 landing page（Hero → CardFeed → CTA）
│   └── api/                 # 伺服器端 route handlers（見下）
├── components/
│   ├── atoms/               # 手繪風基礎元件（多為程序化 SVG）
│   ├── molecules/           # 組合元件（StoryCard、CardEditor、Modal…）
│   ├── sections/            # 頁面區塊（AppHeader、HeroSection…）
│   └── providers/           # TweaksPanel 等 context providers
└── lib/
    ├── auth/                # 認證抽象層 + firebase client/server 實作
    ├── db/firestore/        # 伺服器端 repository（admin SDK）+ client/ 直讀寫層
    ├── storage/             # 儲存抽象層 + R2 實作 + AVIF 影像處理
    ├── ai/                  # OpenAI 任務：slugify、tags、story image
    ├── adapters/            # Firestore 資料 → UI 模型轉換
    ├── data/                # SWR hooks
    ├── design/              # prng、wobRect、wavyPath、strokes 等 SVG 工具
    ├── images/              # 客戶端壓縮 + 上傳
    └── hooks/               # useElementSize、useIsMobile
firebase/                    # firebase.json、firestore.rules、firestore.indexes.json
test/                        # 共用測試 infra（setup.ts、render.tsx）
docs/                        # PRD（共振_產品需求書）、開發計畫、TODO
```

路徑別名 `@/*` 對應 `src/*`。

## 架構說明

### 路由與 i18n

`src/middleware.ts` 攔截所有請求並導入 `[locale]` 路由（`localePrefix: 'always'`，即 `/home` 實際存在於 `/en/home` 與 `/zh-TW/home`）。`next-intl` plugin（`next.config.ts` 中以 `./src/i18n/request.ts` 註冊）處理伺服器端翻譯。注意 `next.config.ts` 將 `firebase` / `firebase-admin` 列入 `serverExternalPackages`，避免 Webpack vendor-chunk 對 scoped package 的 require 路徑錯誤。

### 認證流程

1. 瀏覽器用 Firebase client SDK 完成登入（Google / Email，OTP 可由 flag 開啟），取得 ID token。
2. POST `/api/auth/session` — 伺服器以 admin SDK 換發 session cookie（httpOnly、`__session`），DELETE 登出。
3. 伺服器端以 `requireUser()` / `getCurrentUser()`（`src/lib/auth`）驗證 cookie。
4. 客戶端 Firestore 直讀依賴 Firebase Auth 狀態恢復——`useCard` 等 hooks 會等待 auth 完成再查詢，避免匿名規則誤判（公開卡片與個人檔案允許匿名讀取）。

### 資料層（雙軌）

- **伺服器端**：`src/lib/db/firestore/*.ts` 為 repository 類別（`FirestoreCardRepository`、`FirestoreUserRepository`…），透過 admin SDK 操作並在程式中強制可見性（`public` / `connections` / `private`；connections 以 `uid1_uid2` 排序後的 pair id 查 `connections` collection）。
- **客戶端**：`src/lib/db/firestore/client/*` 為直接讀寫層（feed、invites、resonances、notifications、profile…），由 `src/lib/data/hooks.ts` 的 SWR hooks 消費，安全性由 `firebase/firestore.rules` 把關。

主要實體（`src/lib/db/types.ts`）：`Card`（含 `translations`、`tags`、`slug`、計數欄位）、`User`（`handle`/`handleLower`）、`Connection`、`Invite`、`Resonance`、`CardLink`、`Notification`。

### 產品語意：共振與邀請

「共振」不是按讚——它會建立一張帶 `referenceCardId` 的新卡片（回應卡）。卡片之間可互相嵌入：站內 `/card/...` 連結在閱讀時渲染為 `EmbedStoryCard`。留言功能已移除。

### API Routes（`src/app/api/`）

| Route | 用途 |
| --- | --- |
| `POST/DELETE /api/auth/session` | ID token 換 session cookie／登出 |
| `GET /api/cards/resolve?key=` | slug 或舊 doc id → Firestore doc id（只回 id，不洩漏內容） |
| `POST /api/cards/slug` | 發佈後自動產生英文 slug（LLM 翻譯標題 + 防碰撞，冪等） |
| `POST /api/cards/tags` | LLM 建議 2–3 個標籤，參考作者歷史標籤詞彙 |
| `POST /api/generate-image` | 由故事內文生成 doodle 風插圖，轉 AVIF 存入 R2（`maxDuration: 120`） |
| `POST /api/upload` | 圖片上傳代理：伺服器轉送至 R2（繞過部分網路對 R2 的 TLS 問題），限 8 MB |
| `POST /api/revalidate` | 登入後對白名單路徑做 `revalidatePath`（自動展開所有 locale 前綴） |

### 卡片 URL 與 AI

卡片公開網址使用英文 slug（LLM 將標題翻成英文後 slugify，與作者 handle、數字後綴防碰撞）。AI 程式碼集中在 `src/lib/ai/`：`openai.ts` 封裝呼叫、`tasks.ts` 定義任務（slug base、標籤建議、故事插圖）、`slugify.ts` / `tags.ts` 為純邏輯（有測試）。OpenAI 只在伺服器 route 中呼叫，金鑰不落地客戶端。

### 設計系統與程序化 SVG

- 所有 design token 在 `src/styles/tokens.css`（OKLCH）。字體：Playfair Display（標題）+ DM Sans（內文）。
- 手繪邊框線寬統一使用 `src/lib/design/strokes.ts` 的 `INK` / `INK_LIGHT` / `INK_STRONG`「一支筆」tokens，**不可硬編碼 strokeWidth**。
- 形狀生成工具：`wobRect.ts`（seeded bezier 抖動圓角矩形）、`wobCircle.ts`、`wavyPath.ts`、`prng.ts`（seeded PRNG）。所有形狀元件吃 `seed` prop，保證 SSR 與 client hydration 渲染一致。
- `TweaksPanel` provider 可在執行期覆寫 accent 色、卡片密度、grain 強度等 CSS 變數，供設計迭代。
- 建構 UI 時優先重用既有 primitives（`OrganicButton`、`Panel`、`Field`、`Icon`、`TagPill`、`PageShell`），不要寫 inline style 或重複的 SVG。

### 影像管線

客戶端先壓縮（`src/lib/images/compress.ts`），經 `/api/upload` 或 `/api/generate-image` 上傳；伺服器端以 sharp 轉 AVIF（`src/lib/storage/image.ts`）後寫入 R2，回傳 `R2_PUBLIC_BASE` 公開 URL。R2 CORS 設定在根目錄 `r2-cors.json`。

## 測試

整合風格的單元測試：測一整個功能（adapter 規則、hook 組合、元件互動），不測瑣碎函式。無 E2E。

- **位置**：與原始碼共置（`Foo.tsx` → `Foo.test.tsx`）。`test/` 只放共用 infra：`setup.ts`（jest-dom、cleanup、ResizeObserver/matchMedia stubs）與 `render.tsx`（`renderWithIntl()` 載入真實 `en` 翻譯）。
- **環境**：預設 node；渲染 React 的測試需在檔頭加 `// @vitest-environment jsdom`。
- **Mock 邊界**：只 mock 模組邊界（`@/lib/db/firestore/client/*`、`useAuth`、`@/i18n/navigation`），純邏輯不 mock。
- **SWR hooks**：包 `<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>` 隔離快取。
- **確定性**：seeded design utils 測「同 seed 同輸出」，這是 SSR/CSR hydration 一致性的保證。
- `vitest.config.ts` 被排除在 `npm run typecheck` 之外（build tooling 的雙 Vite 型別噪音）。

## 部署

- **Vercel**：`vercel.json` 指定 region `hnd1`（東京）。`vercel` CLI 已登入可直接操作。
- **Firebase**：rules / indexes 在 `firebase/`，改動後需 `firebase deploy --only firestore:rules,firestore:indexes`。
- **Cloudflare**：R2 由 `wrangler` 管理。

## 相關文件

- [CLAUDE.md](CLAUDE.md) — AI 協作指引（指令、慣例摘要）
- [docs/共振_產品需求書_v0.1.md](docs/共振_產品需求書_v0.1.md) — 產品需求書
- [docs/development_plan.md](docs/development_plan.md) — 開發計畫
- [docs/TODO.md](docs/TODO.md) — 待辦清單
