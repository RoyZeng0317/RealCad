// 畫面右側的 HTML 控制面板：跟 3D 面板上的按鍵/旋鈕是同一份狀態，兩邊都能操作
import { useState, type CSSProperties } from 'react';
import { useWaveLab, type ViewPreset } from './waveStore.js';
import { type Waveform, TIME_DIVS, VOLT_DIVS, FREQ_MIN, FREQ_MAX, OUTPUT_LIMIT, formatSI } from './waveform.js';
import { PsuSection } from './PsuPanel.js';
import { Section, Slider, chip } from './panelUi.js';

const WAVES: [Waveform, string][] = [
  ['sine', '正弦'], ['square', '方波'], ['triangle', '三角'],
  ['ramp', '鋸齒'], ['pulse', '脈波'], ['noise', '雜訊'],
];
const VIEWS: [ViewPreset, string][] = [
  ['overview', '全景'], ['generator', '產生器'], ['scope', '示波器'], ['psu', '電源'],
];
type Tab = Exclude<ViewPreset, 'overview'>;

export function ControlPanel() {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>('generator');
  const { gen, scope, view, setGen, setWaveform, setView, setScope, autoSet } = useWaveLab();
  // 點儀器視角時同時切換下方要顯示哪一台儀器的控制項；「全景」保留目前的分頁
  const pickView = (v: ViewPreset) => { setView(v); if (v !== 'overview') setTab(v); };
  const logF = Math.log10(gen.frequency);

  return (
    <div style={{ ...s.panel, ...(open ? {} : { width: 'auto' }) }}>
      <div style={s.head}>
        <strong>函數波產生器模擬</strong>
        <button style={s.small} onClick={() => setOpen(!open)}>{open ? '收合' : '展開'}</button>
      </div>
      {open && (
        <div style={s.body}>
          <Section title="視角">
            <div style={s.row}>
              {VIEWS.map(([v, t]) => (
                <button key={v} style={chip(view === v)} onClick={() => pickView(v)}>{t}</button>
              ))}
            </div>
          </Section>

          {tab === 'generator' && <Section title="函數波產生器 FG-2000">
            <div style={s.grid3}>
              {WAVES.map(([w, t]) => (
                <button key={w} style={chip(gen.waveform === w)} onClick={() => setWaveform(w)}>{t}</button>
              ))}
            </div>
            <Slider label="頻率" value={formatSI(gen.frequency, 'Hz', 4)}
              min={Math.log10(FREQ_MIN)} max={Math.log10(FREQ_MAX)} step={0.01} v={logF}
              onChange={(x) => setGen({ frequency: 10 ** x })} />
            <Slider label="振幅" value={`${gen.amplitude.toFixed(2)} Vpp`}
              min={0.01} max={2 * OUTPUT_LIMIT} step={0.01} v={gen.amplitude}
              onChange={(x) => setGen({ amplitude: x })} />
            <Slider label="直流偏移" value={`${gen.offset.toFixed(2)} V`}
              min={-OUTPUT_LIMIT} max={OUTPUT_LIMIT} step={0.01} v={gen.offset}
              onChange={(x) => setGen({ offset: x })} />
            {gen.waveform === 'pulse' && (
              <Slider label="工作週期" value={`${gen.duty} %`} min={1} max={99} step={1} v={gen.duty}
                onChange={(x) => setGen({ duty: x })} />
            )}
            <div style={s.row}>
              <button style={chip(gen.power, '#d23b3b')} onClick={() => setGen({ power: !gen.power })}>
                電源 {gen.power ? 'ON' : 'OFF'}
              </button>
              <button style={chip(gen.output, '#27b34a')} onClick={() => setGen({ output: !gen.output })}>
                輸出 {gen.output ? 'ON' : 'OFF'}
              </button>
            </div>
          </Section>}

          {tab === 'scope' && <Section title="示波器 DS-1100">
            <Slider label="VOLTS/DIV" value={formatSI(VOLT_DIVS[scope.voltDivIdx], 'V')}
              min={0} max={VOLT_DIVS.length - 1} step={1} v={scope.voltDivIdx}
              onChange={(x) => setScope({ voltDivIdx: x })} />
            <Slider label="TIME/DIV" value={formatSI(TIME_DIVS[scope.timeDivIdx], 's')}
              min={0} max={TIME_DIVS.length - 1} step={1} v={scope.timeDivIdx}
              onChange={(x) => setScope({ timeDivIdx: x })} />
            <Slider label="觸發準位" value={formatSI(scope.trigLevel, 'V')}
              min={-OUTPUT_LIMIT} max={OUTPUT_LIMIT} step={0.01} v={scope.trigLevel}
              onChange={(x) => setScope({ trigLevel: x })} />
            <div style={s.row}>
              <button style={chip(false, '', '#6b5a2a')} onClick={autoSet}>AUTO SET</button>
              <button style={chip(scope.running, '#27b34a')} onClick={() => setScope({ running: !scope.running })}>
                {scope.running ? 'RUN' : 'STOP'}
              </button>
              <button style={chip(false)} onClick={() => setScope({ coupling: scope.coupling === 'DC' ? 'AC' : 'DC' })}>
                {scope.coupling} 耦合
              </button>
            </div>
          </Section>}

          {tab === 'psu' && <PsuSection />}

          <p style={s.help}>
            拖曳空白處旋轉視角、滾輪縮放、右鍵平移。3D 面板上的按鍵可直接點；旋鈕用「按住上下拖曳」或「滑鼠滾輪」轉動，按住 Shift 微調。
          </p>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  panel: {
    position: 'absolute', top: 16, right: 16, width: 'min(320px, calc(100vw - 32px))',
    maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', background: 'rgba(18,21,26,0.92)',
    border: '1px solid #2c333c', borderRadius: 12, color: '#e6ebf1',
    fontFamily: '"Segoe UI", "Microsoft JhengHei", system-ui, sans-serif', backdropFilter: 'blur(6px)',
  },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 14px' },
  small: { background: 'transparent', color: '#9fb3c8', border: '1px solid #3a424d', borderRadius: 6, cursor: 'pointer', padding: '2px 8px' },
  body: { padding: '0 14px 12px' },
  row: { display: 'flex', gap: 6 },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 },
  help: { fontSize: 12, color: '#8a97a6', lineHeight: 1.6, margin: '4px 0 0' },
};
