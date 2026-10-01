// 實驗室工作區上方工具列：返回、視角切換、各儀器的快速開關（產生器輸出 / 電源輸出 / 示波器 RUN）、側欄開關
// 固定單列：儀器快速開關與檢視器開關永遠靠右上（不換行）；視窗太窄時中間的視角按鈕區改成左右捲動
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWaveLab, type ViewPreset } from './waveStore.js';
import { usePsuLab } from './psuStore.js';
import { useLabUi } from './labUi.js';
import { T } from './panelUi.js';
import { MenuBar, ProjectTitle } from './project/MenuBar.js';
import { useBoard } from './boardStore.js';
import { boardActions, useTypingFocus } from './shortcuts.js';
import { useProject, undo, redo } from './project/projectStore.js';
import { WirePalette } from './WirePalette.js';

const VIEWS: [ViewPreset, string][] = [
  ['overview', '全景'], ['generator', '產生器'], ['scope', '示波器'], ['spectrum', '頻譜'], ['dmm', '電表'], ['psu', '電源'], ['breadboard', '麵包板'], ['bbgrid', '4×4'], ['bbgrid2', '2×2'], ['devboards', '開發板'], ['fpga', 'FPGA'],
];

/** 縮短的按鈕的完整名稱（滑鼠移上去顯示） */
const TITLE: Partial<Record<ViewPreset, string>> = { generator: '函數波產生器', bbgrid: '4×4 麵包板矩陣', bbgrid2: '2×2 麵包板組', dmm: '桌上型萬用電表', spectrum: '頻譜分析儀' };

export function LabToolbar() {
  const navigate = useNavigate();
  const view = useWaveLab((s) => s.view);
  const gen = useWaveLab((s) => s.gen);
  const scope = useWaveLab((s) => s.scope);
  const psu = usePsuLab((s) => s.psu);
  const { focus, toggleLeft, toggleRight, leftOpen, rightOpen } = useLabUi();
  const tool = useBoard((s) => s.tool);
  const undoN = useProject((s) => s.undo.length);
  const redoN = useProject((s) => s.redo.length);
  const typing = useTypingFocus();
  const wireColor = useBoard((s) => s.wireColor);
  const paletteOpen = useLabUi((s) => s.paletteOpen);
  const setPaletteOpen = useLabUi((s) => s.setPaletteOpen);

  return (
    <div style={bar}>
      <button style={btn(false)} onClick={() => navigate('/')} title="回首頁">←</button>
      <button style={btn(leftOpen)} onClick={toggleLeft} title="元件庫">☰</button>
      <div style={brand}>
        <span style={{ color: T.accent, fontWeight: 800 }}>RealCad Lab</span>
        <span style={{ color: T.muted, fontSize: 11 }}>Explore Demos</span>
      </div>
      <MenuBar />
      <ProjectTitle />
      <div style={sep} />
      <div style={viewsGroup} onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; }} title="滑鼠滾輪可以左右捲動">
        {VIEWS.map(([v, name]) => (
          <button key={v} style={{ ...btn(view === v), padding: '5px 7px' }} onClick={() => focus(v)} title={TITLE[v] ?? name}>{name}</button>
        ))}
      </div>
      <div style={sep} />
      {/* 編輯工具：跟快捷鍵 S / W / X 相同 */}
      <div style={group}>
        <button style={btn(tool === 'select')} onClick={boardActions.select} title="選取／拖曳零件（S）">↖ 選取<Key k="S" /></button>
        <button style={btn(tool === 'wire')} onClick={boardActions.wire} title="杜邦線（W）">〰 杜邦線<Key k="W" /></button>
        <button style={btn(paletteOpen)} onClick={() => setPaletteOpen(!paletteOpen)} title="杜邦線顏色（懸浮調色盤）">
          <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: wireColor, border: '1px solid #888', verticalAlign: -1 }} />
        </button>
        <button style={btn(tool === 'erase')} onClick={boardActions.remove} title="刪除模式（X）：再用滑鼠點要刪除的零件">✕ 刪除<Key k="X" /></button>
        <button style={{ ...btn(false), opacity: undoN ? 1 : 0.4 }} disabled={!undoN} onClick={undo} title="復原（Ctrl+Z）">↶</button>
        <button style={{ ...btn(false), opacity: redoN ? 1 : 0.4 }} disabled={!redoN} onClick={redo} title="重做（Ctrl+Y）">↷</button>
        {/* 焦點在文字框 / 程式編輯器時字母會打進去，快捷鍵暫停：明確告訴使用者，按一下就恢復 */}
        {typing && (
          <button style={{ ...btn(false), borderColor: '#8a6a1a', color: '#ffd21f' }} title="正在輸入文字，S / W / X 暫停"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (document.activeElement as HTMLElement | null)?.blur()}>⌨ 輸入中・快捷鍵暫停（Esc 恢復）</button>
        )}
      </div>
      {/* 右上角：儀器快速開關（固定不換行） */}
      <div style={{ ...group, marginLeft: 'auto' }}>
        <button style={toggle(gen.power && gen.output, '#1f8f3c')} title="函數產生器輸出"
          onClick={() => useWaveLab.getState().setGen({ output: !gen.output, power: true })}>
          FG {gen.power && gen.output ? 'ON' : 'OFF'}
        </button>
        <button style={toggle(psu.power && psu.output, '#1f8f3c')} title="電源供應器輸出"
          onClick={() => usePsuLab.getState().setPsu({ output: !psu.output, power: true })}>
          電源 {psu.power && psu.output ? 'ON' : 'OFF'}
        </button>
        <button style={toggle(scope.running, '#1f8f3c', '#8a2020')}
          onClick={() => useWaveLab.getState().setScope({ running: !scope.running })}>
          示波器 {scope.running ? 'RUN' : 'STOP'}
        </button>
        <button style={btn(false)} onClick={() => useWaveLab.getState().autoSet()}>AUTO SET</button>
      </div>
      <button style={btn(rightOpen)} onClick={toggleRight} title="檢視器">ⓘ</button>
      <WirePalette />
    </div>
  );
}

/** 按鈕上的快捷鍵提示 */
function Key({ k }: { k: string }) {
  return (
    <span style={{
      marginLeft: 6, padding: '0 5px', borderRadius: 4, border: '1px solid #3a3a6a', fontSize: 11,
      fontFamily: T.mono, color: T.muted, lineHeight: '16px', display: 'inline-block',
    }}>{k}</span>
  );
}

const bar: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: T.bg, position: 'relative', zIndex: 20,
  borderBottom: `1px solid ${T.border}`, flexShrink: 0, fontFamily: T.font, flexWrap: 'nowrap', minWidth: 0,
};
/** 視角按鈕區：空間不夠時縮小並左右捲動，右邊的快速開關才不會被擠到第二列 */
const viewsGroup: CSSProperties = {
  display: 'flex', gap: 4, flex: '1 1 0', minWidth: 60, overflowX: 'auto', scrollbarWidth: 'thin',
};
const brand: CSSProperties = { display: 'flex', flexDirection: 'column', lineHeight: 1.2, whiteSpace: 'nowrap', marginLeft: 4 };
const sep: CSSProperties = { width: 1, alignSelf: 'stretch', background: T.border, margin: '0 2px', flexShrink: 0 };
const group: CSSProperties = { display: 'flex', gap: 4, flexShrink: 0 };
const btn = (active: boolean): CSSProperties => ({
  padding: '5px 9px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 13, fontFamily: T.font,
  background: active ? '#0b3550' : 'transparent', color: active ? T.accent : '#b0b0d8',
  border: `1px solid ${active ? T.accent : '#2a2a5a'}`,
});
const toggle = (on: boolean, onBg: string, offBg = '#1a1a3e'): CSSProperties => ({
  ...btn(false), background: on ? onBg : offBg, color: '#fff', border: `1px solid ${on ? onBg : '#2a2a5a'}`,
});
