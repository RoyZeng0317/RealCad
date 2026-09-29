// HTML 控制面板的「電源供應器 + 負載」分頁
import type { CSSProperties } from 'react';
import { Section, Slider, chip } from './panelUi.js';
import { usePsuLab, loadResistance } from './psuStore.js';
import { V_MAX, I_MAX, LOAD_STEPS, RATED_POWER } from './psu.js';
import { useBench } from './bench.js';
import { formatSI } from './waveform.js';

const rLabel = (r: number) => (isFinite(r) ? formatSI(r, 'Ω', 2) : '開路');

export function PsuSection() {
  const { psu, loadIdx, loadTemp, burnt, setPsu, setLoadIdx, replaceResistor } = usePsuLab();
  const r = loadResistance({ loadIdx, burnt });
  const bench = useBench();
  const rd = bench.psu;
  const loadI = isFinite(r) ? rd.v / r : 0;
  const over = bench.loadP > RATED_POWER;

  return (
    <>
      <Section title="電源供應器 PS-3005">
        <Slider label="電壓設定" value={`${psu.vSet.toFixed(2)} V`} min={0} max={V_MAX} step={0.01} v={psu.vSet}
          onChange={(x) => setPsu({ vSet: x })} />
        <Slider label="限流設定" value={`${psu.iSet.toFixed(3)} A`} min={0} max={I_MAX} step={0.001} v={psu.iSet}
          onChange={(x) => setPsu({ iSet: x })} />
        <div style={row}>
          {[3.3, 5, 12].map((v) => (
            <button key={v} style={chip(Math.abs(psu.vSet - v) < 1e-6)} onClick={() => setPsu({ vSet: v })}>{v} V</button>
          ))}
        </div>
        <div style={row}>
          <button style={chip(psu.power, '#d23b3b')} onClick={() => setPsu({ power: !psu.power, output: false })}>
            電源 {psu.power ? 'ON' : 'OFF'}
          </button>
          <button style={chip(psu.output, '#27b34a')} onClick={() => psu.power && setPsu({ output: !psu.output })}>
            輸出 {psu.output ? 'ON' : 'OFF'}
          </button>
        </div>
      </Section>

      <Section title="負載（鋁殼功率電阻 25 W）">
        <Slider label="電阻" value={burnt ? '燒斷（開路）' : rLabel(LOAD_STEPS[loadIdx])}
          min={0} max={LOAD_STEPS.length - 1} step={1} v={loadIdx} onChange={setLoadIdx} />
        <div style={grid}>
          <Stat k="模式" v={rd.mode} color={rd.mode === 'CC' ? '#ff4d3a' : rd.mode === 'CV' ? '#3cff7a' : undefined} />
          <Stat k="電壓" v={`${rd.v.toFixed(2)} V`} />
          <Stat k="電源總電流" v={`${rd.i.toFixed(3)} A`} />
          <Stat k="負載電流" v={`${loadI.toFixed(3)} A`} />
          <Stat k="負載功率" v={`${bench.loadP.toFixed(2)} W`} color={over ? '#ff4d3a' : undefined} />
          <Stat k="溫度" v={`${loadTemp} °C`} color={loadTemp > 150 ? '#ff8a1f' : undefined} />
        </div>
        {over && !burnt && <div style={warn}>⚠ 超過電阻額定功率 {RATED_POWER} W，溫度會持續上升，超過 350 °C 會燒斷</div>}
        {burnt && (
          <div style={warn}>
            電阻已燒斷，電路變成開路。
            <button style={{ ...chip(false, '', '#6b5a2a'), marginTop: 6, width: '100%' }} onClick={replaceResistor}>
              更換電阻
            </button>
          </div>
        )}
      </Section>
    </>
  );
}

function Stat({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div style={{ background: '#1f252c', borderRadius: 6, padding: '4px 8px' }}>
      <div style={{ fontSize: 11, color: '#8a97a6' }}>{k}</div>
      <div style={{ fontFamily: 'Consolas, monospace', color: color ?? '#ffd21f', fontSize: 14 }}>{v}</div>
    </div>
  );
}

const row: CSSProperties = { display: 'flex', gap: 6 };
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 };
const warn: CSSProperties = {
  fontSize: 12, color: '#ffb4a8', background: 'rgba(210,59,59,0.15)', border: '1px solid #6b2a2a',
  borderRadius: 6, padding: '6px 8px', lineHeight: 1.5,
};
