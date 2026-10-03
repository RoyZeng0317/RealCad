// 桌面程式風格的功能選單：檔案 / 編輯 / 檢視 / 說明，並處理快捷鍵、拖放開檔、提示訊息與對話框
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { newProject, openProject, saveProject, renameProject, openDroppedFile } from './fileActions.js';
import { useProject, undo, redo, startTracking } from './projectStore.js';
import { useBoard } from '../boardStore.js';
import { useWaveLab, type ViewPreset } from '../waveStore.js';
import { useLabUi, type DockTab } from '../labUi.js';
import { loadDemoCircuit, loadUnoBlink, loadEsp32Mistake, loadPi5Blink, loadFpgaCounter, loadRectifierDemo } from '../boardDemo.js';
import { loadRcDemo, loadBjtDemo, loadXfmrDemo, loadCtxDemo, loadCurveDemo } from '../analogDemo.js';
import { loadAtmegaDemo } from '../chips/chipDemo.js';
import { T } from '../panelUi.js';

interface Item { label: string; keys?: string; onClick?: () => void; disabled?: boolean; checked?: boolean; header?: boolean }
type Menu = { name: string; items: (Item | 'sep')[] };

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

const VIEW_ITEMS: [ViewPreset, string][] = [
  ['overview', '全景'], ['generator', '函數產生器'], ['scope', '示波器'], ['spectrum', '頻譜分析儀'], ['dmm', '桌上型萬用電表'], ['psu', '電源供應器'], ['breadboard', '麵包板'], ['bbgrid', '麵包板矩陣 4×4'], ['bbgrid2', '麵包板組 2×2'], ['devboards', '開發板區'], ['fpga', 'FPGA 實驗板'],
];
const DOCK_ITEMS: [DockTab, string][] = [
  ['generator', '函數波產生器'], ['scope', '示波器'], ['spectrum', '頻譜分析儀'], ['dmm', '萬用電表'], ['psu', '電源供應器'], ['nodes', '電路節點'], ['code', '程式碼'], ['serial', '序列埠'],
];

const SHORTCUTS = `${MOD}N　新增專案（部分瀏覽器保留此鍵，請改用選單）
${MOD}O　開啟 .rc 專案
${MOD}S　儲存
${MOD}Shift+S　另存新檔
${MOD}Z　復原（麵包板與開發板的擺放）
${MOD}Y 或 ${MOD}Shift+Z　重做
S　選取工具（可拖曳零件）
W　杜邦線工具
X 或 Delete　刪除選取的零件
Esc　取消放置 / 取消拖曳、回到選取工具
${MOD}Enter（在程式碼編輯器裡）　上傳並執行`;

const ABOUT_RC = `.rc 是 RealCad Lab 的專案檔，只有這個網站可以開啟。

• 內容：函數波產生器、示波器、電源供應器與負載設定，麵包板上的所有零件與杜邦線，放上桌的開發板、USB 供電狀態與各自的程式碼。
• 格式：8 bytes 專屬簽章 + 版本 + AES-256-GCM 加密的 gzip 壓縮資料，一般文字編輯器或其他程式看不懂。
• 防竄改：內容被改過（即使只有 1 個位元）驗證就不會通過，網站會拒絕開啟。
• 開啟時所有欄位都會重新驗證，別人給你的 .rc 檔也不會帶入不合法的資料；程式碼只在網站內建的直譯器裡執行，不會執行任意 JavaScript。
• 注意：金鑰內建在網站裡，這是「專屬格式 + 防竄改」，不是給機密資料用的加密。`;

export function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const undoN = useProject((s) => s.undo.length);
  const redoN = useProject((s) => s.redo.length);
  const selectedId = useBoard((s) => s.selectedId);
  const view = useWaveLab((s) => s.view);
  const { leftOpen, rightOpen, dockTab } = useLabUi();
  const ui = useLabUi.getState();
  const dialog = useProject.getState().setDialog;

  const menus: Menu[] = [
    { name: '檔案', items: [
      { label: '新增專案', onClick: newProject },
      { label: '開啟…', keys: `${MOD}O`, onClick: openProject },
      'sep',
      { label: '儲存', keys: `${MOD}S`, onClick: () => saveProject() },
      { label: '另存新檔…', keys: `${MOD}Shift+S`, onClick: () => saveProject(true) },
      { label: '重新命名專案…', onClick: renameProject },
      'sep',
      { label: '範例', header: true },
      { label: '3.3 V 穩壓電路（1N4007 + LT1117）', onClick: () => { loadDemoCircuit(); ui.focus('breadboard'); } },
      { label: '函數產生器 → 麵包板：半波整流（示波器看波形）', onClick: () => { loadRectifierDemo(); ui.focus('scope'); } },
      { label: 'RC 充放電：1 kΩ + 100 µF（示波器看電容電壓）', onClick: () => { loadRcDemo(); ui.focus('scope'); } },
      { label: '可變電阻 + 2N3904 電晶體開關 LED', onClick: () => { loadBjtDemo(); ui.focus('breadboard'); } },
      { label: '2N3904 特性曲線（示波器 XY，轉旋鈕畫 IB 曲線族）', onClick: () => { loadCurveDemo(); ui.focus('scope'); } },
      { label: '2 : 1 變壓器降壓（CH1 一次側、CH2 二次側）', onClick: () => { loadXfmrDemo(); ui.focus('scope'); } },
      { label: '12 V 中心抽頭變壓器全波整流（6-0-6 V）', onClick: () => { loadCtxDemo(); ui.focus('scope'); } },
      { label: 'Arduino Uno：LED 閃爍', onClick: () => { loadUnoBlink(); ui.focus('devboards'); } },
      { label: 'Raspberry Pi 5：MicroPython LED 閃爍', onClick: () => { loadPi5Blink(); ui.focus('devboards'); } },
      { label: '錯誤示範：5 V 接到 ESP32 GPIO', onClick: () => { loadEsp32Mistake(); ui.focus('devboards'); } },
      { label: 'FLEX 10K FPGA：計數器 + 七段顯示器', onClick: () => { loadFpgaCounter(); ui.focus('fpga'); } },
      { label: '麵包板 Arduino：ATmega328P + CH340 上傳 Blink', onClick: () => { loadAtmegaDemo(); ui.focus('breadboard'); } },
    ] },
    { name: '編輯', items: [
      { label: '復原', keys: `${MOD}Z`, onClick: undo, disabled: !undoN },
      { label: '重做', keys: `${MOD}Y`, onClick: redo, disabled: !redoN },
      'sep',
      { label: '刪除選取的零件', keys: 'X / Delete', disabled: !selectedId, onClick: () => { const id = useBoard.getState().selectedId; if (id) useBoard.getState().removePart(id); } },
      { label: '取消放置 / 回到選取工具', keys: 'Esc', onClick: () => useBoard.setState({ pending: null, tool: 'select', message: '' }) },
      'sep',
      { label: '清空麵包板', onClick: () => { if (confirm('清空麵包板上所有零件？')) useBoard.getState().clearBoard(); } },
    ] },
    { name: '檢視', items: [
      ...VIEW_ITEMS.map(([v, n]): Item => ({ label: n, checked: view === v, onClick: () => ui.focus(v) })),
      'sep',
      { label: '元件庫', checked: leftOpen, onClick: ui.toggleLeft },
      { label: '檢視器', checked: rightOpen, onClick: ui.toggleRight },
      'sep',
      ...DOCK_ITEMS.map(([t, n]): Item => ({ label: `下方面板：${n}`, checked: dockTab === t, onClick: () => ui.setDockTab(t) })),
    ] },
    { name: '說明', items: [
      { label: '操作說明', onClick: () => ui.setDockTab('help') },
      { label: '鍵盤快捷鍵', onClick: () => dialog({ title: '鍵盤快捷鍵', body: SHORTCUTS }) },
      { label: '關於 .rc 專案檔', onClick: () => dialog({ title: '關於 .rc 專案檔', body: ABOUT_RC }) },
    ] },
  ];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!bar.current?.contains(e.target as Node)) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div ref={bar} style={{ display: 'flex', gap: 2, position: 'relative', flexShrink: 0 }}>
      {menus.map((m) => (
        <div key={m.name} style={{ position: 'relative' }}>
          <button
            style={{ ...menuBtn, ...(open === m.name ? { background: '#0b3550', color: T.accent } : {}) }}
            onClick={() => setOpen(open === m.name ? null : m.name)}
            onMouseEnter={() => { if (open && open !== m.name) setOpen(m.name); }}
          >{m.name}</button>
          {open === m.name && (
            <div style={dropdown}>
              {m.items.map((it, i) => it === 'sep'
                ? <div key={i} style={{ height: 1, background: T.border, margin: '4px 0' }} />
                : it.header
                  ? <div key={i} style={{ padding: '4px 12px', fontSize: 11, color: T.muted }}>{it.label}</div>
                  : (
                    <button key={i} disabled={it.disabled} style={{ ...itemBtn, opacity: it.disabled ? 0.4 : 1 }}
                      onClick={() => { setOpen(null); it.onClick?.(); }}>
                      <span style={{ width: 16, color: T.accent }}>{it.checked ? '✓' : ''}</span>
                      <span style={{ flex: 1 }}>{it.label}</span>
                      {it.keys && <span style={{ color: T.muted, fontSize: 11, marginLeft: 16 }}>{it.keys}</span>}
                    </button>
                  ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** 專案名稱與未儲存標記（點一下可以改名） */
export function ProjectTitle() {
  const name = useProject((s) => s.name);
  const dirty = useProject((s) => s.dirty);
  const handle = useProject((s) => s.handle);
  return (
    <button onClick={renameProject} title="重新命名專案" style={{
      background: 'none', border: 'none', color: T.text, cursor: 'pointer', fontFamily: T.font, fontSize: 13,
      whiteSpace: 'nowrap', padding: '4px 6px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {name}.rc{dirty && <span style={{ color: T.value }} title="有未儲存的變更"> ●</span>}
      {handle && !dirty && <span style={{ color: T.muted, fontSize: 11 }}>　已儲存</span>}
    </button>
  );
}

/** 快捷鍵、拖放開檔、未儲存追蹤；放在工作區頁面最上層 */
export function useProjectShell() {
  useEffect(() => startTracking(), []);
  useEffect(() => {
    const name = () => { const s = useProject.getState(); document.title = `${s.dirty ? '● ' : ''}${s.name}.rc — RealCad Lab`; };
    name();
    return useProject.subscribe(name);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      const inText = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);
      if (k === 's') { e.preventDefault(); saveProject(e.shiftKey); }
      else if (k === 'o') { e.preventDefault(); openProject(); }
      else if (!inText && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (!inText && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    const onDrag = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    const onDrop = (e: DragEvent) => {
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      e.preventDefault();
      openDroppedFile(f);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('dragover', onDrag);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('dragover', onDrag);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
}

export function ProjectOverlays() {
  const toast = useProject((s) => s.toast);
  const dialog = useProject((s) => s.dialog);
  return (
    <>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 36, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
          background: toast.kind === 'err' ? '#5a1a1a' : '#0b3550', border: `1px solid ${toast.kind === 'err' ? '#c03030' : T.accent}`,
          color: '#fff', padding: '8px 16px', borderRadius: 8, fontFamily: T.font, fontSize: 13, maxWidth: 'calc(100vw - 32px)',
        }}>{toast.text}</div>
      )}
      {dialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onMouseDown={() => useProject.getState().setDialog(null)}>
          <div onMouseDown={(e) => e.stopPropagation()} style={{
            background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20, maxWidth: 560, width: '100%',
            color: T.text, fontFamily: T.font,
          }}>
            <div style={{ color: T.accent, fontWeight: 700, marginBottom: 12 }}>{dialog.title}</div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7 }}>{dialog.body}</div>
            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <button onClick={() => useProject.getState().setDialog(null)} style={{ ...menuBtn, border: `1px solid ${T.accent}`, color: T.accent }}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const menuBtn: CSSProperties = {
  padding: '5px 10px', background: 'transparent', color: '#c0c0e8', border: '1px solid transparent', borderRadius: 6,
  cursor: 'pointer', fontSize: 13, fontFamily: T.font, whiteSpace: 'nowrap',
};
const dropdown: CSSProperties = {
  position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 260, zIndex: 40, background: T.panel,
  border: `1px solid ${T.border}`, borderRadius: 8, padding: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
};
const itemBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', width: '100%', gap: 6, padding: '6px 10px', background: 'transparent', border: 'none',
  color: T.text, cursor: 'pointer', fontSize: 13, fontFamily: T.font, textAlign: 'left', borderRadius: 4,
};
