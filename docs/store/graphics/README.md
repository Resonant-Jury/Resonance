# 商店圖片（App Store / Google Play）

從實機截圖產生上架用的行銷圖：6 張 iOS、6 張 Android、Play 的主題圖片與圖示。手繪形狀、顏色、筆觸都取自 App 本身（`src/lib/design/*`、`src/styles/tokens.css`），所以同樣的 seed 每次都畫出同樣的圖。

```
raw/ios/<key>.png        模擬器截圖  ─┐
raw/android/<key>.png    模擬器截圖  ─┴─ npx tsx docs/store/graphics/render.ts ─→ out/…
```

`<key>` 依序是 `feed`、`card`、`write`、`resonance`、`messages`、`thoughtmap`。

| 輸出 | 尺寸 | 來源 |
| --- | --- | --- |
| `out/ios/<nn>-<key>.jpg` | 1320×2868（App Store 6.9"） | 只用 `raw/ios` |
| `out/android/<nn>-<key>.jpg` | 1080×1920（Play 手機 9:16） | 只用 `raw/android` |
| `out/play/feature-graphic.jpg` | 1024×500 | 不用截圖 |
| `out/play/icon-512.png` | 512×512（32-bit PNG） | `AppIcon-1024.png` 縮小，沒有重繪 |

iOS 與 Android 一定各自用自己的截圖：商店會退回拿另一個平台截圖的版本。缺哪一張，就會用 `raw/_placeholder/` 的假畫面頂替（畫面上有紅色「PLACEHOLDER」標籤），並在結尾警告；上傳前確認沒有警告。

## 重新截圖

換一張，只要覆蓋 `raw/<平台>/<key>.png`（PNG，直向，不必是特定尺寸，比例會保持不變形）。

- iOS：iPhone 6.9" 模擬器（例如 iPhone 17 Pro Max，1320×2868）：`xcrun simctl io booted screenshot docs/store/graphics/raw/ios/feed.png`
- Android：手機模擬器：`adb exec-out screencap -p > docs/store/graphics/raw/android/feed.png`
- 資料用 `npx tsx scripts/seed-emulator.ts` 灌進 Firebase emulator，只會碰到本機的 emulator。

## 重新產圖

```bash
npx tsx docs/store/graphics/render.ts                    # 全部
npx tsx docs/store/graphics/render.ts ios                # 只做 ios | android | play
npx tsx docs/store/graphics/render.ts android --only=feed,card
npx tsx docs/store/graphics/render.ts --check            # 另外在 Chrome 量文字、字型有沒有載入、有沒有破版
```

```bash
npx tsx docs/store/graphics/contact-sheet.ts            # out/contact-sheet.jpg：iOS 一列、Android 一列、主題圖片＋圖示，方便一眼檢查
```

需要本機的 Google Chrome（headless）；字型（Noto Serif TC、Noto Sans TC、Playfair Display）第一次會從 Google Fonts 下載並快取在 `build/_cache`，之後離線也能跑。中間的 HTML / PNG 在 `build/`（不進 git）。

## 調整

- 文案、強調字、每張的主題色：`render.ts` 最上面的 `SLIDES`（短句結尾不加句號）。
- 截圖底部要裁掉一點（例如手勢列、被切一半的最後一行）：`CROP_BOTTOM`：iOS 約 1.4%、Android 約 1.9%（再多就會切到底部的分頁列）；它也決定手機外框的比例，所以同一平台每張的手機一樣大。某一張要多裁一點（避免切在文字中間），寫在 `SLIDES` 那張的 `cropBottom`，兩側會等比例修掉一點，外框大小不變。換新截圖後要重新對一次。
- 螢幕圓角：`SCREEN_RADIUS`。
- `out/` 被專案根目錄 `.gitignore` 的 `out` 規則忽略；`raw/` 不會，截圖原檔可以進版控。
