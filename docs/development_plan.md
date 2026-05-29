# Resonance — 開發計畫 (Development Plan)

> 版本：v0.3 · 2026-05-28
> 對齊文件：[共振產品需求書 v0.1](./共振_產品需求書_v0.1.md) · [Wireframes](../designs/wireframes/00-overview.md) · [DESIGN.md](../designs/DESIGN.md)
> 技術決策：Next.js 15 (App Router) + CSS Modules + provider abstraction + Firebase + Cloudflare R2 + LLM API

---

## 一、產品定位與本計畫範圍

共振的最小單位是**卡片** (一個故事 + 一個思維)，不是文章。因此系統設計必須同時滿足：

1. **寫作流 (M1, M2)** — 極簡模板 + AI 寫作夥伴 (潤稿、下標、生成標籤、翻譯)
2. **共振流 (M4, M5)** — 以思維同頻為主的每日精選 feed + 共振標記
3. **連結流 (M6)** — 雙向連結取代單向追蹤
4. **身份流 (M9)** — 筆名 + 真人 (手機) 驗證混合制
5. **卡片盒 (M7, M8)** — 個人思想地圖 + 私人卡片

本開發計畫以 **MVP 範圍 (M1, M2 基礎版, M4, M5, M6, M9)** 為第一戰場，其餘依 PRD §五 的 Phase 規劃漸進展開。

---

## 二、Tech Stack 總覽

| 層次 | 技術 | 說明 |
|------|------|------|
| **框架** | Next.js 15 (App Router) | RSC / ISR / Route Handlers |
| **語言** | TypeScript 5.7 (strict) | 搭配 Repository 抽象層 |
| **CSS** | CSS Modules + CSS Custom Properties | OKLCH、`clamp()`、動態 SVG mask，零依賴 |
| **字體** | Playfair Display + DM Sans | 透過 `next/font` |
| **國際化** | next-intl | `[locale]` segment，支援 `zh-TW` / `en` (日/韓/西 Phase 2) |
| **認證** | Firebase Auth behind Auth Provider | 手機驗證是真人驗證的關鍵 (M9)，但 UI / app logic 不直接依賴 Firebase SDK |
| **資料庫** | Firestore behind Repository Pattern | 第一實作為 Firestore，未來可替換 MongoDB / 其他 NoSQL |
| **媒體儲存** | Cloudflare R2 behind Storage Provider | Presigned URL 直傳；未來可替換 S3 / GCS |
| **AI 服務** | OpenAI / Claude behind AI Provider | 潤稿、標籤、翻譯；不直接暴露 key 至 client |
| **向量索引** | Vector Index Provider (Firestore fallback / pgvector / Pinecone) | 同頻匹配的思維嵌入，Phase 2 啟用 |
| **排程** | Jobs abstraction + Firebase Scheduled Functions / Cron | 任務邏輯與觸發平台分離 |
| **部署** | Vercel (app) + Firebase (backend) + R2 (assets) | — |

---

## 三、資訊架構 (IA) 與路由

依 wireframes `00-overview.md` 的畫面地圖：

```
/[locale]/                      ← 01 Landing (SSG, 已實作)
/[locale]/signin                ← 08 Sign in
/[locale]/signup                ← 08 Sign up (3-step)
/[locale]/home                  ← 02 Resonance Feed (每日精選)
/[locale]/card/[id]             ← 03 Card Detail
/[locale]/write                 ← 04 新卡片
/[locale]/write/[id]            ← 04 編輯草稿
/[locale]/me                    ← 05 我的卡片盒 (self)
/[locale]/u/[handle]            ← 06 他人 profile
/[locale]/settings              ← 09 Settings
/[locale]/messages/[threadId]   ← (Phase 2) 私訊

/api/upload                     ← R2 presigned URL (R2 secret 不能出前端)
/api/auth/session               ← Firebase ID token → httpOnly session cookie (middleware SSR 用)
/api/revalidate                 ← On-demand ISR (allowlist path，client 寫完後 ping)

# 第二階段才會加：
/api/ai/polish                  ← M2 潤稿 (LLM key 不能出前端)
/api/ai/title                   ← M2 下標建議
/api/ai/tags                    ← M2 標籤生成
/api/ai/translate               ← M3 翻譯
/api/ai/match                   ← M4 同頻匹配 (每日 cron)
```

> **路由原則：** Next.js 只承擔三類工作 — (a) RSC / ISR 渲染，(b) middleware 路由守衛，(c) 必須 server 才能做的事（R2 / LLM secret、httpOnly cookie、`revalidatePath`）。其餘讀寫一律 client-direct Firestore + security rules，不額外開 endpoint。

**全域 Shell** (wireframes `00-overview.md`)：
- 已登入：`SiteHeader` 顯示 `共振 Feed / 我的卡片盒 / +寫卡片 / 🔔 / 頭像`
- Mobile：nav 收進 hamburger + 右下角 floating `+寫卡片` OrganicButton

---

## 四、資料夾結構

```
resonance/
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx              ← 01 Landing (SSG, 已實作)
│   │   │   ├── (auth)/
│   │   │   │   ├── signin/page.tsx   ← 08
│   │   │   │   └── signup/page.tsx   ← 08 (stepper)
│   │   │   ├── (app)/                ← logged-in shell (共用 header)
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── home/page.tsx     ← 02
│   │   │   │   ├── card/[id]/page.tsx ← 03
│   │   │   │   ├── write/
│   │   │   │   │   ├── page.tsx      ← 04 新卡片
│   │   │   │   │   └── [id]/page.tsx ← 04 編輯
│   │   │   │   ├── me/page.tsx       ← 05
│   │   │   │   ├── u/[handle]/page.tsx ← 06
│   │   │   │   └── settings/page.tsx ← 09
│   │   │   └── _modals/              ← Parallel Route slots for 07 invite
│   │   └── api/
│   │       ├── ai/
│   │       │   ├── polish/route.ts
│   │       │   ├── title/route.ts
│   │       │   ├── tags/route.ts
│   │       │   ├── translate/route.ts
│   │       │   └── match/route.ts
│   │       ├── upload/route.ts
│   │       └── revalidate/route.ts
│   │
│   ├── components/
│   │   ├── atoms/                    ← 已建：HandDrawnBorder, OrganicButton, OrganiBlob, ShapeGrain, TagPill, SectionEdge, HandDrawnAvatar
│   │   │   └── HandDrawnCheckmark/   ← 新：M9 驗證勾
│   │   ├── molecules/
│   │   │   ├── StoryCard/            ← 已建；需擴充 variant: ghost (私人卡)、tag chip、accent hue seed
│   │   │   ├── AuthorRow/            ← 已規劃
│   │   │   ├── Modal/                ← 已規劃
│   │   │   ├── CardEditor/           ← M1 思維核心 + 故事本體 + 標籤 + 媒體
│   │   │   ├── AiAssistPanel/        ← M2 三個 action + diff view
│   │   │   ├── ResonateButton/       ← M5 主按鈕 (含已共振態)
│   │   │   ├── ConnectInviteModal/   ← 07 邀請 modal
│   │   │   ├── NotificationBell/     ← 🔔 含連結邀請 / 共振 / 翻譯完成
│   │   │   ├── TagCluster/           ← 05 依 tag 聚落
│   │   │   └── ThoughtMap/           ← 05 Tab E (Phase 2)
│   │   ├── sections/                 ← Landing sections (已實作)
│   │   └── providers/
│   │       ├── TweaksPanel.tsx       ← 已建
│   │       ├── AuthProvider.tsx      ← Firebase Auth + user claims
│   │       └── I18nProvider.tsx      ← next-intl client boundary
│   │
│   ├── lib/
│   │   ├── design/                   ← 已建：wobRect, wavyPath, prng
│   │   ├── db/
│   │   │   ├── types.ts              ← Entity: Card, User, Connection, Resonance, Invite, Notification
│   │   │   ├── interfaces.ts         ← I*Repository 集合 (server 端 RSC/ISR 讀取用)
│   │   │   ├── errors.ts             ← NotFoundError / ForbiddenError / QuotaExceededError
│   │   │   ├── firestore/            ← Admin SDK 實作 (server 端 RSC/ISR 用)
│   │   │   │   ├── client/           ← Web SDK helpers (client 元件直連 Firestore)
│   │   │   │   │   ├── init.ts       ← 共用 AuthProvider 的 Firebase app + Firestore singleton
│   │   │   │   │   ├── cards.ts      ← create / update / publish / delete + 自動 ping /api/revalidate
│   │   │   │   │   ├── resonances.ts ← toggleResonance / hasResonated
│   │   │   │   │   ├── notifications.ts
│   │   │   │   │   ├── profile.ts
│   │   │   │   │   ├── invites.ts    ← transaction 同時寫 invite + quotas counter
│   │   │   │   │   └── revalidate.ts ← requestRevalidate(paths) helper
│   │   │   │   └── *.ts              ← admin SDK 版的各 Repository
│   │   │   └── index.ts              ← 匯出 server 端 `repos`
│   │   ├── ai/
│   │   │   ├── client.ts             ← 統一 LLM client (provider-agnostic)
│   │   │   ├── prompts/              ← 潤稿/下標/標籤/翻譯 的 system prompt
│   │   │   ├── matching.ts           ← 嵌入 + 同頻挑選演算法
│   │   │   └── safety.ts             ← 內容審核
│   │   ├── storage/                  ← StorageProvider + R2 adapter (server-only)
│   │   ├── auth/
│   │   │   ├── types.ts
│   │   │   ├── interfaces.ts         ← IAuthProvider
│   │   │   ├── firebase/
│   │   │   │   ├── client.ts         ← Web SDK：email/Google sign-in、phone OTP
│   │   │   │   └── server.ts         ← Admin SDK：ID token 驗證、session cookie
│   │   │   └── index.ts              ← getCurrentUser / requireUser
│   │   ├── vector/                   ← VectorIndexProvider (Phase 2)
│   │   └── jobs/                     ← 排程任務純函式 (Phase 2，配額 / 過期 / 摘要)
│   │
│   ├── i18n/
│   │   ├── routing.ts
│   │   ├── request.ts
│   │   └── navigation.ts             ← 已建 (`next-intl` Link wrapper)
│   ├── messages/
│   │   ├── zh-TW.json                ← 繁中為主 (PRD §五)
│   │   ├── en.json
│   │   └── (ja.json / ko.json / es.json Phase 2)
│   └── styles/
│       ├── tokens.css                ← OKLCH tokens (已建)
│       └── globals.css
│
├── middleware.ts                     ← next-intl + auth guard (已登入才進 /(app))
├── CLAUDE.md
└── next.config.ts
```

---

## 五、Domain Model (核心 Entity)

> 所有欄位僅列關鍵；`createdAt / updatedAt` 省略。

```typescript
type Locale = 'zh-TW' | 'en' | 'ja' | 'ko' | 'es';
type Visibility = 'public' | 'connections' | 'private';

// M1 Card
interface Card {
  id: string;
  authorId: string;
  thoughtCore: string;              // 思維核心, ≤ 60 字
  story: string;                    // 故事本體, 300–1200 字
  tags: string[];                   // AI + 人工
  media?: { type: 'image' | 'video'; url: string };
  originalLocale: Locale;
  translations: Partial<Record<Locale, { title: string; thoughtCore: string; story: string; aiGenerated: true }>>;
  visibility: Visibility;
  embedding?: number[];             // M4 同頻匹配向量
  referenceCardId?: string;         // 引用回應 (03 → 04)
  publishedAt: Date | null;
  // 以下欄位僅作者可讀 (Firestore security rule)
  readCount: number;
  resonanceCount: number;
  inviteCount: number;
}

// M9 User
interface User {
  id: string;
  handle: string;                   // 筆名 (2–20 字, 每 30 天可改)
  bio?: string;                     // ≤ 80 字
  region: string;                   // ISO-3166
  primaryLocale: Locale;
  autoTranslateTo: Locale[];
  verified: boolean;                // 手機驗證
  phoneHash: string;                // never exposed
  avatarSeed: string;               // initials + accent hue
  joinedAt: Date;
  handleChangedAt: Date;
}

// M6 Connection (雙向, 單一 doc)
interface Connection {
  id: string;                        // sorted(uidA, uidB).join('_')
  userIds: [string, string];
  establishedAt: Date;
  muted?: { by: string }[];
}

// M6 Invite (7 天過期, 每人每日 3 次)
interface Invite {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string;                   // 14–140 字, 必填
  referenceCardId?: string;
  status: 'pending' | 'accepted' | 'expired' | 'withdrawn';
  expiresAt: Date;                   // +7d
}

// M5 Resonance (作者看不到是誰, 除非已連結)
interface Resonance {
  id: string;
  cardId: string;
  userId: string;                    // 私密, 僅 server 用
  note?: string;                     // 「當時為什麼共振」(僅自己可見)
}

interface Notification {
  id: string;
  userId: string;
  type: 'invite' | 'resonance_summary' | 'translation_done' | 'invite_expired';
  payload: Record<string, unknown>;
  readAt: Date | null;
}
```

**Firestore 安全規則重點 (MVP 必做)：**
- `resonanceCount`, `readCount`, `inviteCount` → 只有 `authorId == request.auth.uid` 可讀
- `Resonance` doc → 只有 `userId` 自己可讀；`cardId` 的 aggregate 由 Cloud Function 維護
- `connections` → 僅 `userIds.hasAny([request.auth.uid])` 可讀
- `cards.private` 只對 author，`connections` 對連結雙方，`public` 對所有已登入者

---

## 六、渲染策略

| 頁面 | 策略 | 說明 |
|------|------|------|
| `/` Landing | **SSG** | 訪客頁，build-time (已實作) |
| `/home` 共振 Feed | **RSC, dynamic** | 第一階段：admin SDK 讀最新公開卡片；第二階段：每人不同的每日推薦 feed |
| `/card/[id]` | **ISR (`revalidate = 86400`)** | 公開卡片走靜態；`generateStaticParams` 回空 → 第一次訪問動態產生並快取；客戶端發布/更新後 ping `/api/revalidate` 重新生成。私人/連結卡固定 404，需要看的人改走 client-direct read |
| `/u/[handle]` | **RSC, dynamic** | 包含是否已連結的條件顯示 |
| `/me`, `/settings`, `/write` | **CSR heavy** | 完全互動；內殼是 RSC；寫入全部 client-direct |
| `/signin`, `/signup` | **CSR** | Firebase Auth client flow |

> **登入後頁面 = RSC 殼 + client-direct 互動。** Server 端只負責「初次渲染需要的快照」與 ISR；按鈕、表單、即時資料皆走 Web SDK 直連 Firestore，由 security rules 守邊界。Landing 仍 SSG。

### 6.1 卡片 ISR 流程

```
首次造訪 /[locale]/card/[id]
  → Next 動態產生 RSC HTML（含 admin SDK 抓的公開卡片快照）
  → 寫入 ISR cache，TTL 86400s

使用者編輯/發布卡片
  → client-direct 寫 Firestore（rules 守 ownership）
  → client 呼叫 /api/revalidate?path=/[locale]/card/[id]
  → /api/revalidate 驗 session cookie + allowlist 後 revalidatePath
  → 下一次造訪重新產生
```

`/api/revalidate` 接受的 path 範圍鎖在 `/home`、`/me`、`/card/*`、`/u/*`、`/settings`，避免 token 外洩時被任意 invalidate。

---

## 七、Repository Pattern (維持原計畫精神)

核心理念不變：**Application 只呼叫 interface，未來可抽換後端。** 但讀寫分工：

- **Server (`src/lib/db/index.ts` → admin SDK repositories)：** 供 RSC / ISR 使用，繞過 rules，能讀作者私有欄位 (`readCount` / `resonanceCount` / `inviteCount`) 做作者自視摘要。
- **Client (`src/lib/db/firestore/client/*` → Web SDK helpers)：** 互動寫入與即時讀取走這條，rules 守邊界，不再經 server action。Mock 已捨棄。

```typescript
// lib/db/index.ts —— server 端固定走 Firestore，不再依 USE_MOCK 切換
export const repos: Repos = {
  card:         new FirestoreCardRepository(),
  user:         new FirestoreUserRepository(),
  connection:   new FirestoreConnectionRepository(),
  invite:       new FirestoreInviteRepository(),
  resonance:    new FirestoreResonanceRepository(),
  notification: new FirestoreNotificationRepository(),
};
```

```typescript
// lib/db/firestore/client/cards.ts —— client 互動範例
export async function publishCard(cardId: string, locale: Locale) {
  const db = getFirestore();                                  // 共用 AuthProvider 的 app
  await updateDoc(doc(db, 'cards', cardId), { publishedAt: serverTimestamp() });
  await requestRevalidate([`/${locale}/card/${cardId}`, `/${locale}/home`]);
}
```

**每個 interface 的關鍵方法** (MVP)：

```typescript
interface ICardRepository {
  findById(id: string, viewerId: string | null): Promise<Card | null>; // 含可見性判斷
  findDailyFeed(userId: string, date: Date): Promise<Card[]>;          // M4
  findRelated(cardId: string, limit: number): Promise<Card[]>;         // 03 延伸
  findByAuthor(authorId: string, tab: 'published' | 'private' | 'draft' | 'resonated'): Promise<Card[]>;
  create(data: NewCard): Promise<Card>;
  update(id: string, patch: Partial<Card>): Promise<Card>;
  publish(id: string): Promise<Card>;                                  // trigger embed + translate
}

interface IConnectionRepository {
  isConnected(a: string, b: string): Promise<boolean>;
  list(userId: string): Promise<Connection[]>;
  sever(a: string, b: string): Promise<void>;
}

interface IInviteRepository {
  send(input: NewInvite): Promise<Invite>;   // 檢查每日配額
  accept(id: string, userId: string): Promise<Connection>;
  expire(id: string): Promise<void>;
  listPending(userId: string): Promise<Invite[]>;
}

interface IResonanceRepository {
  mark(cardId: string, userId: string, note?: string): Promise<void>;
  unmark(cardId: string, userId: string): Promise<void>;
  hasResonated(cardId: string, userId: string): Promise<boolean>;
  listResonated(userId: string): Promise<Card[]>;                      // 05 Tab D
}
```

### 7.1 Provider Abstraction (避免單一服務綁定)

除 `Repository Pattern` 之外，所有外部服務都應以 provider interface 作為中介，Application / UI 不直接依賴 vendor SDK。

| 能力 | 封裝位置 | 第一實作 | 替換目標 |
|------|----------|----------|----------|
| Auth | `src/lib/auth` | Firebase Auth | Supabase Auth / Auth0 / custom auth |
| Database | `src/lib/db` | Firestore repositories | MongoDB / DynamoDB / 其他 NoSQL |
| Storage | `src/lib/storage` | Cloudflare R2 adapter | S3 / GCS / 其他 object storage |
| AI | `src/lib/ai` | OpenAI / Claude adapter | 其他 LLM provider |
| Vector Index | `src/lib/vector` | Firestore fallback (Phase 2) | pgvector / Pinecone / Qdrant |
| Jobs | `src/lib/jobs` | Firebase Scheduled Functions trigger | Vercel Cron / Cloudflare Workers Cron |

第一階段只實作 Auth / Database / Storage 的真實 adapter；AI / Vector Index 先保留 mock 或 stub，第二階段再接入真服務。

---

## 八、AI 子系統 (M2, M3, M4)

### 8.1 共用架構

```
client  ──POST──►  /api/ai/*  ──►  lib/ai/client.ts  ──►  LLM Provider
                       │                                      │
                       ├──► 配額檢查 (free vs premium)         │
                       ├──► 內容審核 (safety.ts)               │
                       └──► 記錄 audit log (Firestore)         │
```

所有 AI 呼叫**都在 server** (Route Handler)，client 只送用戶輸入 + auth token。

### 8.2 M2 寫作輔助 (MVP)

| 端點 | Input | Output | Prompt 重點 |
|------|-------|--------|-------------|
| `/api/ai/polish` | `{ story: string, locale }` | `{ diff: Array<{ original, polished, kind }> }` | **保留作者語氣、節奏、用字**；只修通順 |
| `/api/ai/title` | `{ story }` | `{ candidates: string[3] }` | 回傳 3 句候選思維核心 |
| `/api/ai/tags` | `{ thoughtCore, story }` | `{ tags: string[3-5] }` | 偏**思維概念**，非關鍵字 (ex. `脆弱性` not `阿嬤`) |

UX：潤稿使用 **diff mode，逐段 [採用] / [保留]**，不是整段蓋掉 (wireframe §M2)。

### 8.3 M3 翻譯 (Phase 2)

- 發布時觸發 `/api/ai/translate`，非同步 (Firebase Function) 寫回 `card.translations`
- 完成後寫 notification `translation_done`
- MVP **只做 zh-TW ↔ en**，其餘 Phase 2

### 8.4 M4 同頻匹配

**MVP 簡化版：**
- 發布時產 embedding (OpenAI `text-embedding-3-small`)，存至 `card.embedding`
- 每日 05:30 cron (Firebase Scheduled Function)：
  1. 取使用者近 30 張卡的 mean embedding
  2. 對最近 24h 公開卡 cosine similarity top-N
  3. 加多樣性噪聲 (避免同溫層) + 去除已看過 + 去除已連結者
  4. 寫入 `dailyFeeds/{userId}/{yyyy-mm-dd}` 共 12 張
- 使用者點「再給我 3 張」→ 當日 +3，上限 30

**Phase 2：** 換 pgvector / Pinecone，加入 reranking。

### 8.5 配額 (`lib/quota/`)
- 連結邀請：每人 3 次 / 日
- Feed 展開：每人 30 張 / 日
- AI 潤稿：免費 5 次 / 日，Premium 無限 (M11 vs M12 分界)

---

## 九、Not-Doing List (技術層面的強約束)

對齊 PRD §四與 wireframes 的「Not doing」—— 這些**刻意不實作**，避免技術上意外引入：

- ❌ 公開按讚數 / 粉絲數 / 瀏覽數 API (即使 server 有，也禁止暴露給 client)
- ❌ 單向追蹤 endpoint / follow collection
- ❌ 排序選項 (`?sort=hot|new`) — API 只接受 system-defined 每日清單
- ❌ 公開留言 collection / schema — 回應只能是「新卡片 with `referenceCardId`」或私訊
- ❌ 第三方 OAuth (Google/FB/X/Line) — 會破壞真人驗證獨立性 (wireframe 08)
- ❌ 無限滾動 API — `findDailyFeed` 的 limit 是硬編碼
- ❌ Rich text 格式 (Markdown / HTML) — `story` 欄位 plain text only
- ❌ Follow / Follower 列表 endpoint
- ❌ 公開分享 OG rich preview (保留複製連結)

---

## 十、開發 Phase 規劃

### Phase 1 — 前端骨架 & 登入外殼 (進行中)

> **目標：** 訪客 landing 完成，登入後框架 + 路由跑起來，全部用 mock data。

- [x] Next.js 15 + TS strict + CSS Modules 專案
- [x] `tokens.css` + `globals.css` + `TweaksPanel`
- [x] Landing atoms (HandDrawnBorder, OrganicButton, OrganiBlob, ShapeGrain, TagPill, SectionEdge, HandDrawnAvatar)
- [x] Landing sections (Header, Hero, CardFeed, CTA, Footer)
- [x] next-intl routing (`zh-TW`, `en`)，Landing 文案上線
- [ ] `HandDrawnCheckmark` atom (M9 驗證勾)
- [ ] `(app)` route group + logged-in `SiteHeader` 變體 (含 🔔、+寫卡片)
- [ ] Mock repos 齊備 (Card / User / Connection / Invite / Resonance)
- [ ] `NEXT_PUBLIC_USE_MOCK=true` 一鍵切換

### Phase 2 — MVP 核心畫面 (Mock Data 階段)

> **目標：** 跑通 wireframes 02–09 的 UI，串 mock，AI 先 stub。

| # | 畫面 | 關鍵元件 | 對應 module |
|---|------|----------|-------------|
| 08 | Sign in / Sign up (3-step) | Stepper, OTP input, handle 可用性檢查 (mock) | M9 |
| 02 | Resonance Feed | StoryCard grid, 「再給我 3 張」, 空狀態 | M4 |
| 03 | Card Detail | 作者列, pull-quote, ResonateButton, 翻譯切換, 延伸卡, 作者自視摘要 | M5 |
| 04 | Card Create / Edit | CardEditor, AiAssistPanel (stub), 字數警示, 發布範圍 | M1, M2 |
| 05 | My Card Box | 五個 tab, TagCluster, ghost variant (私人), 時間軸 | M7, M8 |
| 06 | Other Profile | 未連結 / 已連結兩態, ⋯ menu | M6 |
| 07 | Connect Invite Modal | 必填一句話, 每日配額提示 | M6 |
| 09 | Settings | 左右分欄 / Mobile accordion | 全部 |

里程碑：整條 user journey (login → write → publish (mock) → 出現在他人 feed (mock) → 共振 → 邀請 → 接受 → 私訊 shell) 可點通。

### Phase 3 — 第一階段：基礎社群媒體與 Firebase 串接

> **目標：** 先做成可用的簡單社群媒體。首頁顯示所有最新公開卡片，不做 AI 推薦、不做向量索引。
> **執行方向（2026-05 修訂）：** 互動走 client-direct Firestore + rules + ISR，Next.js function 只留 `/api/upload`、`/api/auth/session`、`/api/revalidate` 三個。

- [x] Auth Provider abstraction + Firebase Auth：Email 註冊 / 登入 / Google（Phone OTP flag 仍 stub）
- [x] 各 Repository 的 Firestore (admin SDK) 實作，供 RSC / ISR 讀取
- [x] Client-direct Firestore helpers (`src/lib/db/firestore/client/*`)：cards / resonances / notifications / profile / invites
- [x] Storage Provider abstraction + `/api/upload` → R2 presigned URL
- [x] `/api/auth/session` + `/api/revalidate` 兩個必要 server endpoint
- [x] `/card/[id]` 改成 ISR (`revalidate = 86400`)，client 寫完後 ping `/api/revalidate`
- [x] `/home` 使用 latest published feed：公開卡片依 `publishedAt desc` 顯示
- [x] 砍掉 `src/lib/actions/mutations.ts`，所有互動走 client-direct
- [~] Firestore security rules (`firebase/firestore.rules`)：users / cards / resonances / quotas 已有；indexes / 完整 emulator 驗證待補
- [ ] CardEditor 圖片上傳 → media metadata 寫回 Card 的端到端驗收
- [ ] Notification pipeline：invite / resonance summary / invite expired（產生端待寫，client 已能標已讀）
- [ ] Jobs abstraction：邀請過期、通知摘要等基礎排程

### Phase 4 — 第二階段：AI、向量索引與推薦系統

> **目標：** 在社群媒體底座穩定後，加入 AI 寫作輔助、翻譯、embedding、Vector Index、每日推薦 feed 與思想地圖。

- [ ] AI Provider abstraction + `/api/ai/polish | title | tags` 串真 LLM，diff-mode 打磨
- [ ] M3 多語翻譯 (MVP: zh-TW ↔ en)，UI 切換與 fallback
- [ ] Vector Index Provider：Firestore fallback / pgvector / Pinecone adapter
- [ ] 發布時 embedding pipeline：產生 card embedding 並 upsert vector index
- [ ] 每日推薦 feed cron：依 user profile vector 產生個人化清單
- [ ] 推薦 feed fallback：推薦失敗時回到 latest published feed
- [ ] 私訊 threads (MVP 版：純文字 + 引用卡，無已讀)
- [ ] M7 思想地圖 (force-directed graph，手繪風格)
- [ ] 反同溫層：刻意注入 n% 低相似度卡

### Phase 5 — Premium (對應 PRD 第三波)

- [ ] 匯出 (Markdown / PDF / 個人網站)
- [ ] 卡片盒重整 (多卡 → 長文)
- [ ] 進階思想地圖分析
- [ ] 付費金流 (Stripe) + subscription claims

### Phase 6 — 後台 (Admin，獨立規劃)

- [ ] `/admin` 路由 + role-based access
- [ ] 檢舉審核、使用者管理、手動觸發 revalidation
- [ ] 社群守則違規的 AI 預審介面

---

## 十一、關鍵設計決策

### 11.1 為什麼不用 ISR 快取登入後頁面？
登入後幾乎所有頁面都是**個人化** (feed 是每人不同、詳情頁可見性與 viewer 相關)。用 RSC + 細粒度 `revalidateTag` 比 ISR 更適合。Landing 仍 SSG。

### 11.2 為什麼第一階段先用最新文章 Feed，第二階段才用 cron 預產？
第一階段的目標是先驗證社群媒體底座：登入、發文、媒體上傳、可見性、共振、連結與通知。因此 `/home` 先顯示最新公開卡片，降低 AI / embedding / 排程帶來的複雜度。第二階段回到 M4 的「每日一批、刻意不無限滑動」：cron 預算 embedding + top-N，讀取時 O(1)。Client 永遠看到固定的 12 張 + 最多三次加 3。

### 11.3 為什麼手機驗證而非 OAuth？
PRD M9 強調真人驗證但保護筆名。OAuth (Google/FB) 會洩漏身份並破壞「人人平等、無階級」的定位 (wireframe 08 Not doing)。手機號做最低限度的真人，且不公開。

### 11.4 為什麼 Resonance 記數不給讀者看？
PRD §四與 wireframe 02/03 明確禁止 vanity metrics。作者自己看得到 (03 作者自視摘要)，但 Firestore security rule 保證 `resonanceCount` 只有 `authorId` 可讀，從資料層杜絕「未來 UI 想加就加」。

### 11.5 為什麼 AI 不直接代寫？
M2 prompt 強調「保留作者語氣」，UI 強制 **diff mode 逐段採用**。AI 是夥伴不是代筆，從產品哲學到介面都一致。

### 11.6 為什麼互動走 client-direct Firestore，不再開 Next.js server action？
增加一層 Next.js server action 等同於：
1. 多一次跳板（client → Vercel function → Firestore），延遲、Function 計費、冷啟動都疊上來；
2. 安全邊界要在 server action 與 Firestore rules 兩處同步維護，容易漂移。

凡是「一個登入者寫一份自己擁有的文件」（卡片 CRUD、共振 toggle、通知已讀、profile 更新、邀請送出與配額計數），都改成 Web SDK 直寫，**rules 就是唯一的邊界**：

- `cards.create` 只允許 `authorId == auth.uid`，且 `metrics.*` 必為 0；
- `resonances/{cardId}_{uid}` 的 doc id 強制等於 `{cardId}_{auth.uid}`，避免代寫他人共振；
- `notifications.update` 只能改 `readAt`，且 `userId == auth.uid`；
- `quotas/{uid}_{yyyy-mm-dd}` 由本人在 transaction 中累加，rules 限 `inviteCount <= 3` 且只能遞增。

剩下三類事情仍走 server，因為 client 沒辦法做：

| 端點 | 為什麼留 server | 觸發方式 |
|------|----------------|----------|
| `/api/upload` | R2 secret 不能進 bundle | client 點上傳 → 拿 presigned URL → 直接 PUT 給 R2 |
| `/api/auth/session` | middleware 需要 httpOnly session cookie 才能 SSR 守 `(app)` | sign-in / sign-up 完 client 換一次 |
| `/api/revalidate` | `revalidatePath` 只能 server 呼叫 | client 寫完 Firestore 後 ping 對應 path |

第二階段的 `/api/ai/*` 也屬於同一類（LLM key 與配額簿記必須在 server）。

---

## 十二、待確認事項

> 這些問題會影響 Phase 2/3 的具體實作，請先回答：

- [ ] **手機驗證成本：** 台灣預估單次 NT$1–3，若冷啟動 1 萬用戶約 NT$1–3 萬。是否先自費，或採初期邀請碼制 (PRD 未採但作為 cost control 可選)？
- [ ] **第一階段測試帳號策略：** 開發 / staging 是否允許 email-only 測試帳號，production 才強制 Phone OTP？
- [ ] **LLM 供應商：** 主力 OpenAI 還是 Claude？潤稿對語氣保留 Claude 較佳，嵌入用 OpenAI。是否接受雙 provider？
- [ ] **向量儲存：** 第二階段先在 Firestore 放 `embedding: number[]` + server-side cosine (小規模可接受)，還是一開始就上 pgvector / Pinecone？
- [ ] **翻譯 MVP 範圍：** 只做 zh-TW ↔ en，還是 MVP 就要日韓？影響 Phase 3 vs Phase 4 分界。
- [ ] **`referenceCardId` 的通知機制：** 引用回應產新卡時，原作者看到的通知語氣？(影響 M5 vs M6 的心理動線)
- [ ] **手機驗證的地區覆蓋：** 初期是否限制僅台灣 + 國際手機，日本 / 韓國的 SMS gateway 後補？
- [ ] **內容審核：** 是否用 LLM 自動審核 + 檢舉混合？還是只靠社群檢舉？(M10)
- [ ] **Landing CTA 行為：** 訪客點 StoryCard → `/signin?next=/card/{id}` (wireframe 01 已規劃)，確認 URL 結構。
