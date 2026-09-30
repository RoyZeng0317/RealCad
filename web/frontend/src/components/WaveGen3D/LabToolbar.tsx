// 實驗室工作區上方工具列：返回、視角切換、各儀器的快速開關（產生器輸出 / 電源輸出 / 示波器 RUN）、側欄開關
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWaveLab, type ViewPreset } from './waveStore.js';
import { usePsuLab } from './psuStore.js';
import { useLabUi } from './labUi.js';
import { T } from './panelUi.js';
import { MenuBar, ProjectTitle } from './project/MenuBar.js';

const VIEWS: [ViewPreset, string][] = [
  ['overview', '全景'], ['generator', '函數產生器'], ['scope', '示波器'], ['psu', '電源'], ['breadboard', '麵包板'], ['devboards', '開發板'],
];

export function LabToolbar() {
  const navigate = useNavigate();
  const view = useWaveLab((s) => s.view);
  const gen = useWaveLab((s) => s.gen);
  const scope = useWaveLab((s) => s.scope);
  const psu = usePsuLab((s) => s.psu);
  const { focus, toggleLeft, toggleRight, leftOpen, rightOpen } = useLabUi();

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
      <div style={group}>
        {VIEWS.map(([v, name]) => (
          <button key={v} style={btn(view === v)} onClick={() => focus(v)}>{name}</button>
        ))}
      </div>
      <div style={sep} />
      <div style={group}>
        <button style={toggle(gen.power && gen.output, '#1f8f3c')}
          onClick={() => useWaveLab.getState().setGen({ output: !gen.output, power: true })}>
          FG 輸出 {gen.power && gen.output ? 'ON' : 'OFF'}
        </button>
        <button style={toggle(psu.power && psu.output, '#1f8f3c')}
          onClick={() => usePsuLab.getState().setPsu({ output: !psu.output, power: true })}>
          電源輸出 {psu.power && psu.output ? 'ON' : 'OFF'}
        </button>
        <button style={toggle(scope.running, '#1f8f3c', '#8a2020')}
          onClick={() => useWaveLab.getState().setScope({ running: !scope.running })}>
          示波器 {scope.running ? 'RUN' : 'STOP'}
        </button>
        <button style={btn(false)} onClick={() => useWaveLab.getState().autoSet()}>AUTO SET</button>
      </div>
      <div style={{ flex: 1 }} />
      <button style={btn(rightOpen)} onClick={toggleRight} title="檢視器">ⓘ</button>
    </div>
  );
}

const bar: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: T.bg, position: 'relative', zIndex: 20,
  borderBottom: `1px solid ${T.border}`, flexShrink: 0, fontFamily: T.font, flexWrap: 'wrap',
};
const brand: CSSProperties = { display: 'flex', flexDirection: 'column', lineHeight: 1.2, whiteSpace: 'nowrap', marginLeft: 4 };
const sep: CSSProperties = { width: 1, alignSelf: 'stretch', background: T.border, margin: '0 4px', flexShrink: 0 };
const group: CSSProperties = { display: 'flex', gap: 4, flexShrink: 0 };
const btn = (active: boolean): CSSProperties => ({
  padding: '6px 12px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 13, fontFamily: T.font,
  background: active ? '#0b3550' : 'transparent', color: active ? T.accent : '#b0b0d8',
  border: `1px solid ${active ? T.accent : '#2a2a5a'}`,
});
const toggle = (on: boolean, onBg: string, offBg = '#1a1a3e'): CSSProperties => ({
  ...btn(false), background: on ? onBg : offBg, color: '#fff', border: `1px solid ${on ? onBg : '#2a2a5a'}`,
});
