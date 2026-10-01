// 左側元件庫（儀器 + 麵包板零件）與右側檢視器（工具狀態、三用電表、選取零件、儀器即時讀值）
import { useEffect, useState, type CSSProperties } from 'react';
import { useWaveLab, type ViewPreset } from './waveStore.js';
import { useBoard } from './boardStore.js';
import { useBench } from './bench.js';
import { useLabUi } from './labUi.js';
import { formatSI } from './waveform.js';
import { PartLibrary, ToolStatus, DmmCard, PartCard } from './BoardPanel.js';
import { DevLibrary, DevBoardCard } from './devboards/DevPanels.js';
import { useDev } from './devboards/devStore.js';
import { Section, Stat, T } from './panelUi.js';

const INSTRUMENTS: [ViewPreset, string, string, string][] = [
  ['generator', '函數波產生器', 'FG-2000・0.1 Hz – 10 MHz', '∿'],
  ['scope', '示波器', 'DS-1102・雙通道 100 MHz', '⌁'],
  ['spectrum', '頻譜分析儀', 'SA-1010・DC – 100 MHz', '⫶'],
  ['psu', '直流電源供應器', 'PS-3005・0–30 V / 0–5 A', '⎓'],
  ['breadboard', '麵包板', 'RB-2・2 × 830 孔', '▦'],
  ['bbgrid', '麵包板矩陣 4 × 4', '16 片 830 孔・側桌', '▩'],
  ['bbgrid2', '麵包板組 2 × 2', '4 片 830 孔・小側桌', '▤'],
  ['devboards', '開發板區', 'Uno・ESP32・STM32・Pi 5', '⌗'],
  ['fpga', 'FPGA 實驗板', 'EPF10K50EQC240-1', '⧉'],
];

function InstrumentList() {
  const view = useWaveLab((s) => s.view);
  const focus = useLabUi((s) => s.focus);
  return (
    <Section title="儀器">
      {INSTRUMENTS.map(([v, name, sub, icon]) => (
        <button key={v} onClick={() => focus(v)} style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer',
          background: view === v ? '#0b3550' : 'transparent', border: `1px solid ${view === v ? T.accent : 'transparent'}`,
          borderRadius: 6, padding: '6px 8px', color: T.text, fontFamily: T.font,
        }}>
          <span style={{ width: 28, textAlign: 'center', color: T.accent, fontSize: 18 }}>{icon}</span>
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span>
            <span style={{ fontSize: 11, color: T.muted }}>{sub}</span>
          </span>
        </button>
      ))}
    </Section>
  );
}

/** 視窗較窄（手機/平板）時側欄改成浮在 3D 畫面上，不擠壓場景 */
function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1000);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 1000);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return narrow;
}

export function LabLibrary() {
  const narrow = useNarrow();
  return (
    <aside style={side('left', narrow)}>
      <div style={sideHead}>元件庫</div>
      <InstrumentList />
      <DevLibrary />
      <PartLibrary />
    </aside>
  );
}

function LiveReadings() {
  const gen = useWaveLab((s) => s.gen);
  const bench = useBench();
  const on = gen.power && gen.output;
  return (
    <Section title="即時讀值">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <Stat k="FG 輸出" v={on ? `${formatSI(gen.frequency, 'Hz', 4)}` : 'OFF'} />
        <Stat k="FG 振幅" v={on ? `${gen.amplitude.toFixed(2)} Vpp` : '—'} />
        <Stat k={`電源（${bench.psu.mode}）`} v={`${bench.psu.v.toFixed(2)} V`}
          color={bench.psu.mode === 'CC' ? '#ff4d3a' : undefined} />
        <Stat k="電源電流" v={`${bench.psu.i.toFixed(3)} A`} />
      </div>
    </Section>
  );
}

export function LabInspector() {
  const parts = useBoard((s) => s.parts);
  const selectedId = useBoard((s) => s.selectedId);
  const selected = parts.find((p) => p.id === selectedId) ?? null;
  const devSel = useDev((s) => s.selected);
  const narrow = useNarrow();
  return (
    <aside style={side('right', narrow)}>
      <div style={sideHead}>檢視器</div>
      <ToolStatus />
      <DmmCard />
      {devSel && !selected && <DevBoardCard kind={devSel} />}
      {selected
        ? <PartCard part={selected} />
        : devSel ? null
        : <Section title="選取零件"><p style={{ fontSize: 12, color: T.muted, margin: 0 }}>點麵包板上的零件，這裡會顯示它的電壓、電流、功率與溫度。</p></Section>}
      <LiveReadings />
    </aside>
  );
}

const side = (which: 'left' | 'right', narrow: boolean): CSSProperties => ({
  ...(narrow ? { position: 'absolute', top: 0, bottom: 0, [which]: 0, zIndex: 5, boxShadow: '0 0 24px rgba(0,0,0,0.6)' } : {}),
  width: narrow ? 'min(272px, calc(100vw - 48px))' : 272, flexShrink: 0, overflowY: 'auto', background: T.panel, padding: 10,
  display: 'flex', flexDirection: 'column', gap: 10, fontFamily: T.font, color: T.text,
  [which === 'left' ? 'borderRight' : 'borderLeft']: `1px solid ${T.border}`,
});
const sideHead: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: T.muted, textTransform: 'uppercase' };
