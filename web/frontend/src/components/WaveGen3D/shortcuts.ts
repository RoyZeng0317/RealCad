// 實驗室快捷鍵（S 選取、W 杜邦線、X 刪除模式、Delete 刪除選取的零件、Esc 取消）——全部集中在這個檔案
//
// ⚠ 快捷鍵「失效」已經發生過很多次（紀錄見同資料夾的 SHORTCUTS.md），每次修改任何介面都要跑回歸測試：
//   web/frontend/scripts/shortcuts-regression.mjs
// 規則：
//   1. 只在 window 的 capture 階段監聽一次（useBoardKeys），其他元件不要再各自處理 S / W / X
//   2. 只有焦點在「正在打字」的地方（文字輸入框、程式編輯器）才暫停快捷鍵；滑桿、下拉選單、按鈕都不能擋
//   3. 新增的文字輸入框：按 Enter 套用後要 blur()；在打字的地方按 Esc 一律離開輸入框
//   4. 字母要同時支援 e.key、e.code（中文輸入法會送 key = "Process"）與 keyCode
import { useEffect, useSyncExternalStore } from 'react';
import { useBoard } from './boardStore.js';

/**
 * 單鍵快捷鍵對應的字母。先看 e.key（一般英文輸入）；中文輸入法開著時 e.key 會變成 "Process"（keyCode 229），
 * 這時改看實體按鍵位置 e.code（KeyS / KeyW / KeyX），所以英文鍵盤、中文輸入法的英文或中文模式都能用。
 */
export function shortcutLetter(e: KeyboardEvent): string {
  if (e.key && e.key.length === 1 && /[a-z]/i.test(e.key)) return e.key.toLowerCase();
  const m = /^Key([A-Z])$/.exec(e.code ?? '');
  if (m) return m[1].toLowerCase();
  if (e.keyCode >= 65 && e.keyCode <= 90) return String.fromCharCode(e.keyCode).toLowerCase();
  return '';
}

/**
 * 焦點是不是在「正在打字」的地方（文字輸入框、程式編輯器）：這時字母要打進去，不當快捷鍵。
 * 滑桿、下拉選單、按鈕、勾選框用完後焦點會留在上面，但不會打字，所以快捷鍵照樣要能用。
 */
const TEXT_INPUTS = new Set(['text', 'search', 'number', 'email', 'password', 'url', 'tel', '']);
export function isTyping(el: EventTarget | null): boolean {
  const h = el as HTMLElement | null;
  if (!h || !h.tagName) return false;
  if (h.isContentEditable || h.tagName === 'TEXTAREA') return true;
  return h.tagName === 'INPUT' && TEXT_INPUTS.has(((h as HTMLInputElement).getAttribute('type') ?? '').toLowerCase());
}

/** 工具列與快捷鍵共用的動作 */
export const boardActions = {
  select: () => useBoard.getState().setTool('select'),
  wire: () => useBoard.getState().setTool('wire'),
  /** 刪除模式：按一下進入（再按一下離開），之後滑鼠點哪個零件就刪哪個，不用先選取 */
  remove: () => {
    const s = useBoard.getState();
    s.setTool(s.tool === 'erase' ? 'select' : 'erase');
  },
};

/** S 選取、W 杜邦線、X 刪除模式、Delete 刪除選取的零件、Esc 取消（整個頁面只呼叫一次） */
export function useBoardKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) {
        // 在打字的地方按 Esc：離開輸入框，快捷鍵馬上恢復（不會一直卡在輸入框裡）
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const st = useBoard.getState();
      if (e.key === 'Escape') { st.endDrag(false); useBoard.setState({ pending: null, message: '', tool: 'select', leadEnd: null }); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (st.selectedId) { e.preventDefault(); st.removePart(st.selectedId); } return; }
      const k = shortcutLetter(e);
      if (k === 's') { e.preventDefault(); boardActions.select(); }
      else if (k === 'w') { e.preventDefault(); boardActions.wire(); }
      else if (k === 'x') { e.preventDefault(); boardActions.remove(); }
    };
    // capture 階段：就算焦點在按鈕、滑桿或 3D 畫面上也收得到
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}

// ---- 目前是不是在打字（給工具列顯示「快捷鍵暫停」提示）----
const subscribe = (cb: () => void) => {
  document.addEventListener('focusin', cb);
  document.addEventListener('focusout', cb);
  return () => { document.removeEventListener('focusin', cb); document.removeEventListener('focusout', cb); };
};
const snapshot = () => (typeof document === 'undefined' ? false : isTyping(document.activeElement));

/** 焦點在文字輸入框或程式編輯器時為 true：這時字母會打進去，S / W / X 暫停 */
export const useTypingFocus = () => useSyncExternalStore(subscribe, snapshot, () => false);
