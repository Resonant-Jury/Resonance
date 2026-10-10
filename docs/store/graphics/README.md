# 商店圖片（App Store / Google Play）

從實機截圖產生上架用的行銷圖，繁體中文（zh-TW）與英文（en-US）各一組：每組 6 張 iOS、6 張 Android，加上 Play 的主題圖片與圖示。手繪形狀、顏色、筆觸都取自 App 本身（`src/lib/design/*`、`src/styles/tokens.css`），所以同樣的 seed 每次都畫出同樣的圖。

```
raw/ios/<key>.png          模擬器截圖（App 設成中文）  ─┐
raw/android/<key>.png      模擬器截圖（App 設成中文）  ─┤
raw/ios-en/<key>.png       模擬器截圖（App 設成英文）  ─┼─ npx tsx docs/store/graphics/render.ts ─→ out/…
raw/android-en/<key>.png   模擬器截圖（App 設成英文）  ─┘
```

`<key>` 依序是 `feed`、`card`、`write`、`resonance`、`messages`、`thoughtmap`。

| 輸出 | 尺寸 | 來源 |
| --- | --- | --- |
| `out/ios/<nn>-<key>.jpg` | 1320×2868（App Store 6.9"） | 只用 `raw/ios` |
| `out/android/<nn>-<key>.jpg` | 1080×1920（Play 手機 9:16） | 只用 `raw/android` |
| `out/ios-en/<nn>-<key>.jpg` | 1320×2868（App Store 6.9"，English (U.S.)） | 只用 `raw/ios-en` |
| `out/android-en/<nn>-<key>.jpg` | 1080×1920（Play 手機 9:16，en-US） | 只用 `raw/android-en` |
| `out/play/feature-graphic.jpg` | 1024×500（zh-TW） | 不用截圖 |
| `out/play/feature-graphic.en.jpg` | 1024×500（en-US） | 不用截圖 |
| `out/play/icon-512.png` | 512×512（32-bit PNG） | `AppIcon-1024.png` 縮小，沒有重繪 |
| `out/ipad/<nn>-<key>.jpg` | 2752×2064（App Store 13" iPad，橫向） | 只用 `raw/ipad`（iPad Pro 13-inch 模擬器，橫向） |
| `out/tablet/<nn>-<key>.jpg` | 2560×1440（Play 7 吋與 10 吋平板，16:9） | 只用 `raw/tablet`（Pixel Tablet AVD，橫向） |
| `out/ipad-en/`、`out/tablet-en/` | 同上（English） | `raw/ipad-en`、`raw/tablet-en` |

iOS 與 Android 一定各自用自己的截圖：商店會退回拿另一個平台截圖的版本。英文那組也一樣各用各的 `-en` 資料夾，上傳到各商店的 English 本地化。缺哪一張（中英文都一樣），就會用 `raw/_placeholder/` 的假畫面頂替（畫面上有紅色「PLACEHOLDER」標籤，英文那組是英文標籤），並在結尾警告；上傳前確認沒有警告。

## 重新截圖

換一張，只要覆蓋 `raw/<平台>/<key>.png`（PNG，直向，不必是特定尺寸，比例會保持不變形）。

- iOS：iPhone 6.9" 模擬器（例如 iPhone 17 Pro Max，1320×2868）：`xcrun simctl io booted screenshot docs/store/graphics/raw/ios/feed.png`
- Android：手機模擬器：`adb exec-out screencap -p > docs/store/graphics/raw/android/feed.png`
- 英文版：把 App 切到 English（設定裡的語言，或模擬器 / 手機的系統語言），用同一批資料和同樣的畫面各拍一次，存到 `raw/ios-en/`、`raw/android-en/`，檔名與 key 都和中文那組相同。
- 資料用 `npx tsx scripts/seed-emulator.ts` 灌進 Firebase emulator，只會碰到本機的 emulator。
- 平板（`ipad`、`tablet`）都拍橫向。iPad 的狀態列會被裁掉（模擬器覆寫的日期一律是英文），拍之前把 iPad 的多工設定改成「全螢幕 App」，右下角才不會有視窗縮放把手。思緒地圖那張用 `seed-store-demo.ts --wide-map`（兩個區域左右並排，填滿橫向畫面）；寫作那張用一般的上下排（地圖在編輯區旁邊）。平板有幾張換成專屬的副標（`SLIDES` 的 `tabletCopy`）。

## 重新產圖

```bash
npx tsx docs/store/graphics/render.ts                    # 全部（中文 + 英文）
npx tsx docs/store/graphics/render.ts ios                # 只做 ios | android | play
npx tsx docs/store/graphics/render.ts android --only=feed,card
npx tsx docs/store/graphics/render.ts --lang=en          # 只做一種語言：--lang=zh-TW | --lang=en（不寫就是兩種都做）
npx tsx docs/store/graphics/render.ts ios android --lang=en --check
npx tsx docs/store/graphics/render.ts --check            # 另外在 Chrome 量文字、字型有沒有載入、有沒有破版
```

`--lang` 決定要做哪組截圖（`raw/ios` → `out/ios`，`raw/ios-en` → `out/ios-en`），也決定 `play` 做哪一張主題圖片（`--lang=en` 只做 `feature-graphic.en.jpg`）；圖示每次都做。`--check` 的字型檢查依語言：中文要載到 Noto Serif TC / Noto Sans TC，英文要載到 Playfair Display / DM Sans，缺了就算失敗；標題或副標換行、被縮小才擠得進去、或離邊緣小於 4%，也都算失敗。

```bash
npx tsx docs/store/graphics/contact-sheet.ts             # out/contact-sheet.jpg（中文）與 out/contact-sheet.en.jpg（英文）：iOS 一列、Android 一列、主題圖片＋圖示，方便一眼檢查
npx tsx docs/store/graphics/contact-sheet.ts --lang=en   # 只做英文那張；--lang=zh-TW 只做中文那張
```

需要本機的 Google Chrome（headless）；字型（Noto Serif TC、Noto Sans TC、Playfair Display、DM Sans）第一次會從 Google Fonts 下載並快取在 `build/_cache`，之後離線也能跑。中間的 HTML / PNG 在 `build/`（不進 git）。

## 調整

- 文案、強調字、每張的主題色：`render.ts` 最上面的 `SLIDES`（短句結尾不加句號）；每張有 `'zh-TW'` 與 `en` 兩份 `{ headline, em, subline }`，`em` 必須在標題裡剛好出現一次（否則一開始就報錯）。英文標題用 Playfair Display 700、副標用 DM Sans 500，沒有中文用的字距；字級在 `TYPE`（英文標題比中文小一點，因為拉丁字母比方塊字窄）；強調字底下的波浪線依字母寬度縮放（`waveUnits`）。每句都要在該張的字級下排成一行，`--check` 會驗。
- 截圖底部要裁掉一點（例如手勢列、被切一半的最後一行）：`CROP_BOTTOM`：iOS 約 1.4%、Android 約 1.9%（再多就會切到底部的分頁列）；它也決定手機外框的比例，所以同一平台每張的手機一樣大。某一張要多裁一點（避免切在文字中間），寫在 `SLIDES` 那張的 `cropBottom`，兩側會等比例修掉一點，外框大小不變。換新截圖後要重新對一次。
- 螢幕圓角：`SCREEN_RADIUS`。
- `out/` 被專案根目錄 `.gitignore` 的 `out` 規則忽略；`raw/`（含 `raw/*-en/`）被這個資料夾的 `.gitignore` 忽略，截圖原檔需要時重拍。
