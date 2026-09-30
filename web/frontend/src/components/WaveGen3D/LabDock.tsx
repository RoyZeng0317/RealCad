// 下方可調高度的面板（仿 Explore Demos 的 Code Editor 區）：各儀器控制、電路節點、說明；最下方狀態列
import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { useLabUi, type DockTab } from './labUi.js';
import { useWaveLab } from './waveStore.js';
import { useBoard } from './boardStore.js';
import { useBench } from './bench.js';
import { formatSI } from './waveform.js';
import { GeneratorControls } from './GenPanel.js';
import { ScopeControls } from './ScopePanel.js';
import { PsuSection } from './PsuPanel.js';
import { NodesPanel, HelpPanel } from './NodesPanel.js';
import { CodePanel, SerialPanel } from './devboards/DevPanels.js';
import { TOOL_NAME } from './BoardPanel.js';
import { T } from './panelUi.js';

const TABS: [DockTab, string][] = [
  ['generator', '函數波產生器'], ['scope', '示波器'], ['psu', '電源供應器'], ['nodes', '電路節點'],
  ['code', '程式碼'], ['serial', '序列埠'], ['help', '操作說明'],
];

export function LabDock() {
  const { dockTab, setDockTab } = useLabUi();
  const [height, setHeight] = useState(260);
  const [collapsed, setCollapsed] = useState(false);
  const dragging = useRef(false);

  const onGrip = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startY = e.clientY, startH = height;
    const move = (ev: PointerEvent) => {
      if (dragging.current) setHeight(Math.max(120, Math.min(window.innerHeight * 0.7, startH - (ev.clientY - startY))));
    };
    const up = () => {
      dragging.current = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [height]);

  return (
    <div style={{ ...dock, height: collapsed ? 'auto' : height }}>
      <div style={tabBar}>
        <span style={grip} onPointerDown={onGrip} title="拖曳調整高度">⋯</span>
        {TABS.map(([t, name]) => (
          <button key={t} style={{ ...tab, ...(dockTab === t && !collapsed ? tabActive : {}) }}
            onClick={() => { setDockTab(t); setCollapsed(false); }}>{name}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button style={tab} onClick={() => setCollapsed(!collapsed)}>{collapsed ? '▲ 展開' : '▼ 收合'}</button>
      </div>
      {!collapsed && (
        <div style={content}>
          {dockTab === 'generator' && <GeneratorControls />}
          {dockTab === 'scope' && <ScopeControls />}
          {dockTab === 'psu' && <PsuSection />}
          {dockTab === 'nodes' && <NodesPanel />}
          {dockTab === 'code' && <CodePanel />}
          {dockTab === 'serial' && <SerialPanel />}
          {dockTab === 'help' && <HelpPanel />}
        </div>
      )}
    </div>
  );
}

export function LabStatusBar() {
  const gen = useWaveLab((s) => s.gen);
  const scope = useWaveLab((s) => s.scope);
  const tool = useBoard((s) => s.tool);
  const dmm = useBoard((s) => s.dmm);
  const bench = useBench();
  const dmmV = dmm ? bench.holeV(dmm) : null;
  const items = [
    `FG ${gen.power && gen.output ? `${gen.waveform.toUpperCase()} ${formatSI(gen.frequency, 'Hz', 4)} ${gen.amplitude.toFixed(2)} Vpp` : 'OFF'}`,
    `示波器 ${scope.running ? 'RUN' : 'STOP'}・觸發 ${scope.trigSource}`,
    `電源 ${bench.psu.mode} ${bench.psu.v.toFixed(2)} V / ${bench.psu.i.toFixed(3)} A`,
    `DMM ${dmmV === null ? '—' : `${dmmV.toFixed(3)} V`}`,
    `工具：${TOOL_NAME[tool]}`,
  ];
  return (
    <div style={status}>
      {items.map((t) => <span key={t} style={{ flexShrink: 0 }}>{t}</span>)}
      <div style={{ flex: 1 }} />
      <span style={{ color: bench.sol.converged ? '#3cff7a' : '#ffb020', flexShrink: 0 }}>● {bench.sol.converged ? '電路已收斂' : '電路未收斂'}</span>
    </div>
  );
}

const dock: CSSProperties = {
  display: 'flex', flexDirection: 'column', background: T.panel, borderTop: `1px solid ${T.border}`,
  flexShrink: 0, overflow: 'hidden', fontFamily: T.font, color: T.text,
};
const tabBar: CSSProperties = {
  display: 'flex', alignItems: 'center', background: T.bg, borderBottom: `1px solid ${T.border}`,
  userSelect: 'none', flexShrink: 0, overflowX: 'auto',
};
const grip: CSSProperties = { padding: '0 12px', color: '#5555aa', cursor: 'row-resize', fontSize: 18, lineHeight: '32px', touchAction: 'none' };
const tab: CSSProperties = {
  padding: '8px 16px', background: 'transparent', color: '#6666aa', border: 'none',
  borderBottom: '2px solid transparent', cursor: 'pointer', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', fontFamily: T.font,
};
const tabActive: CSSProperties = { color: T.accent, borderBottom: `2px solid ${T.accent}` };
const content: CSSProperties = {
  flex: 1, overflow: 'auto', padding: 10, display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, alignItems: 'start',
};
const status: CSSProperties = {
  display: 'flex', gap: 18, whiteSpace: 'nowrap', padding: '3px 12px', background: '#070714', borderTop: `1px solid ${T.border}`,
  fontSize: 11, color: T.muted, fontFamily: T.mono, flexShrink: 0, overflowX: 'auto',
};
