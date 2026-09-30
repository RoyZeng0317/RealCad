# 快捷鍵失效紀錄與修改規範（嚴重・反覆發生）

實驗室的快捷鍵：**S** 選取、**W** 杜邦線、**X** 刪除模式、**Delete／Backspace** 刪除選取的零件、**Esc** 取消。
使用者回報「快捷鍵一直不斷消失」，這是反覆發生的嚴重問題。**之後任何修改（新功能、修 bug、改介面）都必須遵守下面的規範，並在合併前跑回歸測試。**

## 程式位置

- 全部集中在 `shortcuts.ts`：`shortcutLetter`、`isTyping`、`boardActions`、`useBoardKeys`、`useTypingFocus`
- `useBoardKeys()` 只在 `pages/LabWorkspacePage.tsx` 呼叫一次（window 的 capture 階段）
- 工具列按鈕與快捷鍵共用 `boardActions`，不可以各寫一份

## 歷次失效紀錄

| # | 現象 | 原因 | 修正 |
|---|---|---|---|
| 1 | 中文輸入法下 S／W／X 沒反應 | 輸入法開著時 `e.key` 是 `"Process"`（keyCode 229），只判斷 `e.key` 就抓不到 | 改用 `e.key` → `e.code`（KeyS…）→ `keyCode` 三層判斷，capture 階段監聽（PR #5） |
| 2 | 刪除鈕／X 沒作用 | 沒選零件時刪除鈕被停用、X 不做事；選到開發板時也不能刪 | 刪除改成「按刪除 → 直接點零件」的刪除模式（PR #6～#8） |
| 3 | 拉了新版還是沒有修正 | 本機有未提交的修改，`git pull` 中止（Aborting），實際還在舊版 | 不是程式問題：更新後要確認 `git log --oneline -1` 是最新的 merge |
| 4 | 在電阻值數值框按 Enter 後快捷鍵消失；用過滑桿、下拉選單後也會 | 焦點留在輸入框；判斷是否在打字時把滑桿、下拉選單也算進去 | 只有文字輸入框／程式編輯器才暫停；數值框按 Enter／Esc 後 `blur()`（PR #11） |
| 5 | 在「程式碼」分頁編輯或 Ctrl+Enter 上傳後，快捷鍵一直沒反應 | 焦點留在程式編輯器，按 Esc 也離不開，畫面上又沒有任何提示，看起來像壞掉 | 在任何打字的地方按 Esc 一律離開；工具列顯示「⌨ 輸入中・快捷鍵暫停（Esc 恢復）」，點一下也能恢復（本次） |

## 修改規範（必須遵守）

1. **不要新增自己的 keydown 監聽來處理 S／W／X／Delete／Esc**；需要新快捷鍵就加在 `shortcuts.ts` 的 `useBoardKeys`。
2. **不要在 capture 階段呼叫 `stopPropagation()`／`preventDefault()` 擋掉按鍵**，元件內的 `onKeyDown` 只能處理自己的輸入。
3. **新增文字輸入框**（`<input type="text">`、`<textarea>`、`contentEditable`）：按 Enter 套用後要 `blur()`；Esc 由 `useBoardKeys` 統一讓它離開。
4. **滑桿、下拉選單、勾選框、按鈕**不能讓快捷鍵失效；`isTyping` 只把「會打字」的元素當成輸入中。
5. 字母判斷一律用 `shortcutLetter(e)`，不可以只看 `e.key`（中文輸入法）。
6. **合併前一定要跑回歸測試，全部 OK 才能開 PR**：
   ```bash
   cd web/frontend
   npm run dev                      # 另開一個終端機
   node scripts/shortcuts-regression.mjs http://localhost:5173/demos
   ```
   測試會檢查：剛開頁面、載入範例、按過面板按鈕、切工具、用過滑桿、在程式編輯器裡（要打字、要顯示提示）、按 Esc 之後、點提示之後、點回 3D、電阻值數值框、下拉選單，每一種情況都要能用 S／W／X 與中文輸入法切換工具。
7. 新增會搶焦點的介面（新的編輯器、對話框、輸入框）時，要把它加進回歸測試的情境清單。
