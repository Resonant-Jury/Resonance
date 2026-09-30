# Google Play：App 設定與商店資訊（草稿）

> 依 2026-09-30 的程式實際行為填寫。Play Console → Resonance（`com.resonance.stories`）→「資訊主頁 → 完成應用程式設定」的每一項，照順序對應下面各節。
> 標 **【你來填】** 的是只能由帳號擁有者輸入的項目（密碼、身分）。

## 1. 隱私權政策

- 網址：`https://resonance-world.vercel.app/zh-TW/privacy`

## 2. 應用程式存取權（登入詳細資料）

- 選「應用程式的所有功能或部分功能受到限制」（要登入才能使用）。
- 新增一組說明：
  - 名稱：`審查用帳號`
  - 使用者名稱／密碼：**【你來填】** 請先在網站用電子郵件註冊一個專門給審查用的帳號（例如 assist.resonance@gmail.com 的別名信箱），完成筆名設定，並寫一兩張公開卡片，讓審查人員看得到內容。
  - 其他說明：`在登入畫面輸入上述電子郵件與密碼，按「登入」。不需要雙重驗證。`

## 3. 廣告

- 「應用程式是否含有廣告？」→ **否**

## 4. 內容分級（IARC 問卷）

- 電子郵件：`assist.resonance@gmail.com`
- 類別：**社群網路、論壇、網誌和使用者原創內容分享**（Social Networking, Forums, Blogs and UGC Sharing）

| 問題 | 回答 | 說明 |
| --- | --- | --- |
| 暴力、血腥 | 否 | 應用程式本身不含；使用者內容受條款禁止 |
| 性、裸露 | 否 | 同上 |
| 粗俗語言 | 否 | 同上 |
| 管制藥物（菸、酒、毒品） | 否 | |
| 賭博、模擬賭博 | 否 | |
| 恐怖、驚嚇內容 | 否 | |
| 使用者之間是否能互動或交換內容？ | **是** | 共振、紙條、連結對象之間的私訊 |
| 是否分享使用者提供的內容給其他使用者？ | **是** | 公開卡片 |
| 是否分享使用者的實際位置？ | 否 | 「地區」是使用者自選的國家，不是定位 |
| 是否能購買數位商品？ | 否 | |
| 是否提供不受限制的網路存取（瀏覽器）？ | 否 | App 內只開啟我們自己的條款頁 |
| 是否為網頁瀏覽器或搜尋引擎？ | 否 | |
| 是否為新聞應用程式？ | 否 | |

預期結果：13+／PEGI 12 左右，並加註「使用者互動」。

## 5. 目標對象與內容

- 目標年齡層：勾 **13–15 歲、16–17 歲、18 歲以上**（與服務條款「年滿 13 歲」一致；不勾 13 歲以下，就不適用「闔家適用」政策）。
- 「應用程式是否會吸引兒童？」→ **否**
- 商店資訊不會出現兒童導向的內容。

> 若想減少審查負擔，也可以只勾 18 歲以上，但服務條款的年齡限制要一起改成 18 歲。

## 6. 資料安全性

**總覽**

| 問題 | 回答 |
| --- | --- |
| 是否收集或分享必要的使用者資料類型？ | 是 |
| 所有收集的使用者資料是否都經過傳輸加密？ | 是（HTTPS） |
| 使用者可以透過哪些方式建立帳戶？ | 使用者名稱與密碼（電子郵件）、OAuth（Google、Apple） |
| 刪除帳戶的網址 | `https://resonance-world.vercel.app/zh-TW/support` |
| 使用者能否要求刪除部分資料而不刪除帳戶？ | 是（可刪除自己的卡片、思想地圖上的內容） |

**資料類型**（全部：已收集、**不分享**給第三方、非暫時處理、與使用者身分相關）

> Firebase、Cloudflare、OpenAI、Vercel 都是代我們處理資料的服務供應商，依 Play 的定義不算「分享」。

| 類別 → 類型 | 必要／選用 | 用途 |
| --- | --- | --- |
| 個人資訊 → 姓名（筆名） | 必要 | 應用程式功能、帳戶管理 |
| 個人資訊 → 電子郵件地址 | 必要 | 帳戶管理、應用程式功能 |
| 個人資訊 → 使用者 ID | 必要 | 應用程式功能、帳戶管理 |
| 個人資訊 → 其他資訊（自我介紹、地區） | 選用 | 應用程式功能 |
| 相片和影片 → 相片（封面、頭像） | 選用 | 應用程式功能 |
| 訊息 → 其他應用程式內訊息（私訊、紙條） | 選用 | 應用程式功能 |
| 應用程式活動 → 其他使用者原創內容（卡片、共振、思想地圖） | 選用 | 應用程式功能、個人化（依你自己的卡片推薦） |
| 應用程式活動 → 其他動作（書籤、封鎖、檢舉） | 選用 | 應用程式功能、詐欺防範／安全性 |
| 裝置或其他 ID（推播權杖、安裝 ID） | 選用 | 應用程式功能（通知） |

不收集：位置、財務資訊、健康、聯絡人、行事曆、音訊、檔案、網頁瀏覽紀錄、當機紀錄、診斷資料、廣告 ID。

## 7. 政府應用程式、金融功能、健康

- 政府應用程式：**否**
- 金融功能：**都沒有**
- 健康：**都沒有**

## 8. 應用程式類別與聯絡資料

- 應用程式或遊戲：應用程式
- 類別：**社交**
- 標記（最多 5 個）：寫作、日記、社群、故事、生活
- 電子郵件：`assist.resonance@gmail.com`
- 網站：`https://resonance-world.vercel.app`
- 電話：（可留空）

## 9. 主要商店資訊

### 繁體中文（zh-TW，預設）

- **應用程式名稱**（30）：`Resonance`
- **簡短說明**（80）：

  > 寫下一段人生故事，讓另一個人用自己的故事回應你。

- **完整說明**（4000）：

  > Resonance（共振）是一個用故事卡片彼此交流的地方。
  >
  > 在這裡，回應不是按讚，而是另一段故事。讀到觸動你的卡片時，你可以寫下自己的經歷來「共振」它；兩張卡片從此連在一起，你們也成為彼此的連結。
  >
  > ✦ 寫卡片
  > 用溫暖的手繪紙張寫下一段經歷：標題、故事、照片。每張卡片都能決定給誰看——所有人、你的連結，或只有自己。
  >
  > ✦ 用故事回應故事
  > 共振一張卡片，就是寫一張回應它的卡片。也可以給作者留一張紙條，不必公開。
  >
  > ✦ 連結與私訊
  > 因為故事而相遇的人，可以在私訊裡繼續聊。
  >
  > ✦ 思想地圖
  > 把自己的卡片放在點點紙上，分區、畫箭頭、寫下它們之間的關係，看見自己的想法怎麼長出來。
  >
  > ✦ 為你挑選的故事
  > 依你自己寫過的卡片，推薦可能和你共振的故事。
  >
  > ✦ 安心的空間
  > 每張卡片、每個人、每段對話都能檢舉或封鎖；我們在 24 小時內處理檢舉。沒有廣告，不追蹤你。可以隨時下載或刪除你的所有資料。
  >
  > 讓生命影響生命。

### English (en-US)

- **Title**: `Resonance`
- **Short description**:

  > Write a piece of your life, and let someone answer with a story of their own.

- **Full description**:

  > Resonance is a place to share life stories as cards.
  >
  > Here a reply isn't a like — it's another story. When a card moves you, write your own experience to resonate with it; the two cards are linked, and so are the two of you.
  >
  > ✦ Write cards
  > On warm, hand-drawn paper: a title, a story, a photo. Choose who sees each card — everyone, your connections, or only you.
  >
  > ✦ Answer stories with stories
  > Resonating with a card means writing a card in response. Or leave the author a private note.
  >
  > ✦ Connections and messages
  > People who meet through their stories can keep talking in private messages.
  >
  > ✦ Thought map
  > Lay your cards out on dotted paper, group them, draw arrows and label how they relate — and watch your thinking take shape.
  >
  > ✦ Stories picked for you
  > Recommendations based on the cards you've written.
  >
  > ✦ A safe place
  > Report or block any card, person or conversation; we act on reports within 24 hours. No ads, no tracking. Download or delete everything you've written at any time.
  >
  > Let lives touch lives.

### 圖像素材

| 素材 | 規格 | 來源 |
| --- | --- | --- |
| 應用程式圖示 | 512×512 PNG（32 位元含 alpha，≤1 MB） | 由 App 圖示輸出 |
| 主題圖片 | 1024×500 JPG／PNG | 待製作（紙張質感＋標語「讓生命影響生命」） |
| 手機螢幕截圖 | 2–8 張，9:16，最短邊 ≥1080 px | 從模擬器拍：動態、卡片頁、寫卡片、共振、私訊、思想地圖 |

## 10. 封閉測試（申請正式版前）

- 測試群組：Google 群組 `tuckin@googlegroups.com`（20 人）
- 國家／地區：台灣（可再加）
- 意見回饋：`assist.resonance@gmail.com`
- 條件：至少 12 人選擇加入，並連續 14 天保持參加，才可申請正式版。
