// HTML 控制面板的「麵包板」分頁：選工具放零件（電阻 / 1N400x / LT1117 / 跳線）、選取零件看電壓電流、三用電表
import { useEffect, type CSSProperties } from 'react';
import { useBoard, type Tool } from './boardStore.js';
import { useBench } from './bench.js';
import { holeName } from './boardModel.js';
import {
  DIODE_MODELS, DIODE_PIV, RESISTOR_VALUES, RESISTOR_RATING, WIRE_COLORS, THERMAL, LDO_VIN_MAX,
  fmtOhm, partLabel, type BoardPart,
} from './boardParts.js';
import { loadDemoCircuit } from './boardDemo.js';
import { Section, chip } from './panelUi.js';

const TOOLS: [Tool, string][] = [
  ['select', '選取'], ['probe', '三用電表'], ['wire', '跳線'],
  ['resistor', '電阻'], ['diode', '二極體'], ['ldo', 'LT1117'],
];

const HINT: Record<Tool, string> = {
  select: '點零件（或它插的孔）看電壓、電流、功率與溫度；Delete 鍵刪除。',
  probe: '點任一個孔：紅棒放在那裡，黑棒固定接 GND，讀出該點對地電壓。',
  wire: '先點第一個孔（或 Va/Vb/GND 接線柱），再點第二個孔。',
  resistor: '先點第一隻腳的孔，再點第二隻腳的孔（兩孔不能在同一組相通的孔）。',
  diode: '先點陽極（A）的孔，再點陰極（K，有銀色環那端）的孔。',
  ldo: '點第 1 腳（GND）的孔，第 2 腳（OUT）、第 3 腳（IN）會沿同一欄自動排在接下來兩列。',
};

export function BoardSection() {
  const s = useBoard();
  const bench = useBench();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      const st = useBoard.getState();
      if (e.key === 'Escape') useBoard.setState({ pending: null, message: '' });
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedId) st.removePart(st.selectedId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selected = s.parts.find((p) => p.id === s.selectedId) ?? null;
  const dmmV = s.dmm ? bench.holeV(s.dmm) : null;

  return (
    <>
      <Section title="麵包板 RB-2（2 × 830 孔）· 工具">
        <div style={grid3}>
          {TOOLS.map(([t, name]) => (
            <button key={t} style={chip(s.tool === t)} onClick={() => s.setTool(t)}>{name}</button>
          ))}
        </div>

        {s.tool === 'resistor' && (
          <label style={field}>電阻值（1/4 W）
            <select style={select} value={s.resistorValue} onChange={(e) => s.setParam({ resistorValue: Number(e.target.value) })}>
              {RESISTOR_VALUES.map((v) => <option key={v} value={v}>{fmtOhm(v)}</option>)}
            </select>
          </label>
        )}
        {s.tool === 'diode' && (
          <label style={field}>型號（1 A 整流二極體）
            <select style={select} value={s.diodeModel} onChange={(e) => s.setParam({ diodeModel: e.target.value as typeof s.diodeModel })}>
              {DIODE_MODELS.map((m) => <option key={m} value={m}>{m}（PIV {DIODE_PIV[m]} V）</option>)}
            </select>
          </label>
        )}
        {s.tool === 'wire' && (
          <div style={{ display: 'flex', gap: 6 }}>
            {WIRE_COLORS.map((c) => (
              <button key={c} onClick={() => s.setParam({ wireColor: c })} style={{
                flex: 1, height: 24, borderRadius: 6, background: c, cursor: 'pointer',
                border: s.wireColor === c ? '2px solid #2f8cff' : '1px solid #3a424d',
              }} />
            ))}
          </div>
        )}
        {s.tool === 'ldo' && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={chip(s.ldoDir === 1)} onClick={() => s.setParam({ ldoDir: 1 })}>腳位往下排</button>
            <button style={chip(s.ldoDir === -1)} onClick={() => s.setParam({ ldoDir: -1 })}>腳位往上排</button>
          </div>
        )}
        <p style={help}>{HINT[s.tool]}{s.pending && <><br /><b style={{ color: '#ffd21f' }}>已選第一點 {holeName(s.pending)}，請點第二點（Esc 取消）</b></>}</p>
        {s.message && <div style={warn}>{s.message}</div>}
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={chip(false, '', '#2d4a6b')} onClick={loadDemoCircuit}>載入範例電路</button>
          <button style={chip(false, '', '#5a3035')} onClick={() => { if (confirm('清空麵包板上所有零件？')) s.clearBoard(); }}>清空麵包板</button>
        </div>
      </Section>

      <Section title="三用電表（DC V，黑棒接 GND）">
        <div style={dmmBox}>{s.dmm ? (dmmV === null ? '---- （未接到電路）' : `${dmmV.toFixed(3)} V`) : '選「三用電表」工具後點一個孔'}</div>
        {s.dmm && <div style={{ fontSize: 12, color: '#8a97a6' }}>紅棒：{holeName(s.dmm)}</div>}
      </Section>

      {selected && <PartCard part={selected} />}
    </>
  );
}

function PartCard({ part }: { part: BoardPart }) {
  const s = useBoard();
  const bench = useBench();
  const r = bench.sol.el[part.id];
  const temp = s.temps[part.id] ?? 25;
  const V = (i: number) => bench.holeV(part.pins[i]);
  const fmtV = (v: number | null) => (v === null ? '未接' : `${v.toFixed(3)} V`);

  let rows: [string, string, string?][] = [];
  let status = '正常';
  let statusColor = '#3cff7a';
  if (part.kind === 'wire') {
    rows = [['端點 1', `${holeName(part.pins[0])}：${fmtV(V(0))}`], ['端點 2', `${holeName(part.pins[1])}：${fmtV(V(1))}`]];
  } else if (part.kind === 'resistor') {
    rows = [['兩端電壓', `${(r?.v ?? 0).toFixed(3)} V`], ['電流', `${((r?.i ?? 0) * 1000).toFixed(2)} mA`],
      ['功率', `${((r?.p ?? 0) * 1000).toFixed(1)} mW`, (r?.p ?? 0) > RESISTOR_RATING ? '#ff4d3a' : undefined], ['額定', '250 mW']];
    if ((r?.p ?? 0) > RESISTOR_RATING) { status = '超過額定功率，持續發熱中'; statusColor = '#ff8a1f'; }
  } else if (part.kind === 'diode') {
    const piv = DIODE_PIV[part.model!];
    const v = r?.v ?? 0;
    rows = [['Vak', `${v.toFixed(3)} V`], ['電流', `${((r?.i ?? 0) * 1000).toFixed(2)} mA`],
      ['功率', `${((r?.p ?? 0) * 1000).toFixed(1)} mW`], ['PIV', `${piv} V`]];
    status = v > 0.4 ? '順向導通' : v < -piv * 0.98 ? '逆向崩潰！' : '逆向截止';
    statusColor = v < -piv * 0.98 ? '#ff4d3a' : v > 0.4 ? '#3cff7a' : '#8fb4d0';
  } else if (part.kind === 'ldo') {
    rows = [['VIN（對 GND 腳）', `${(r?.vin ?? 0).toFixed(3)} V`, (r?.vin ?? 0) > LDO_VIN_MAX ? '#ff4d3a' : undefined],
      ['VOUT', `${(r?.v ?? 0).toFixed(3)} V`], ['輸出電流', `${((r?.i ?? 0) * 1000).toFixed(1)} mA`],
      ['消耗功率', `${((r?.p ?? 0) * 1000).toFixed(0)} mW`]];
    const mode = s.tsd[part.id] ? 'tsd' : r?.mode;
    [status, statusColor] =
      mode === 'reg' ? ['穩壓中（3.3 V）', '#3cff7a']
      : mode === 'drop' ? ['輸入電壓不足（VIN − VOUT < 1.1 V），輸出跟著掉', '#ffb020']
      : mode === 'ilim' ? ['輸出過載，限流 1 A', '#ff8a1f']
      : mode === 'tsd' ? ['過熱保護（150 °C 熱關斷，降到 130 °C 恢復）', '#ff4d3a']
      : ['未工作（沒有輸入電壓）', '#8fb4d0'];
  }
  if (part.burnt) {
    status = part.kind === 'ldo' ? `損壞（輸入超過 ${LDO_VIN_MAX} V）` : part.kind === 'diode' ? '燒毀（短路）' : '燒毀（開路）';
    statusColor = '#ff4d3a';
  }

  return (
    <Section title={`選取：${partLabel(part)}`}>
      <div style={{ ...dmmBox, fontSize: 13, color: statusColor, textAlign: 'left' }}>{status}</div>
      <div style={cardGrid}>
        {rows.map(([k, v, c]) => (
          <div key={k} style={stat}><div style={statK}>{k}</div><div style={{ ...statV, color: c ?? '#ffd21f' }}>{v}</div></div>
        ))}
        {part.kind !== 'wire' && (
          <div style={stat}><div style={statK}>溫度</div>
            <div style={{ ...statV, color: temp > 120 ? '#ff8a1f' : '#ffd21f' }}>{temp} °C</div></div>
        )}
      </div>
      {part.kind === 'ldo' && (
        <div style={{ fontSize: 12, color: '#8a97a6' }}>
          腳位：1 GND {holeName(part.pins[0])}・2 OUT {holeName(part.pins[1])}・3 IN {holeName(part.pins[2])}
        </div>
      )}
      {part.kind !== 'wire' && part.kind !== 'ldo' && (
        <div style={{ fontSize: 12, color: '#8a97a6' }}>
          {part.kind === 'diode' ? '陽極 ' : ''}{holeName(part.pins[0])} → {part.kind === 'diode' ? '陰極 ' : ''}{holeName(part.pins[1])}
          {part.kind !== 'resistor' ? '' : `　燒毀溫度約 ${THERMAL.resistor.burn} °C`}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        {part.burnt && <button style={chip(false, '', '#6b5a2a')} onClick={() => s.replacePart(part.id)}>更換新零件</button>}
        <button style={chip(false, '', '#5a3035')} onClick={() => s.removePart(part.id)}>刪除</button>
        <button style={chip(false)} onClick={() => s.selectPart(null)}>取消選取</button>
      </div>
    </Section>
  );
}

const grid3: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 };
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 };
const select: CSSProperties = { background: '#1f252c', color: '#e6ebf1', border: '1px solid #3a424d', borderRadius: 6, padding: '5px 6px' };
const help: CSSProperties = { fontSize: 12, color: '#8a97a6', lineHeight: 1.6, margin: 0 };
const warn: CSSProperties = {
  fontSize: 12, color: '#ffb4a8', background: 'rgba(210,59,59,0.15)', border: '1px solid #6b2a2a',
  borderRadius: 6, padding: '6px 8px',
};
const dmmBox: CSSProperties = {
  background: '#0d1512', border: '1px solid #2c5a3c', borderRadius: 6, padding: '6px 10px',
  fontFamily: 'Consolas, monospace', color: '#7dffb0', fontSize: 18, textAlign: 'right',
};
const cardGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 };
const stat: CSSProperties = { background: '#1f252c', borderRadius: 6, padding: '4px 8px' };
const statK: CSSProperties = { fontSize: 11, color: '#8a97a6' };
const statV: CSSProperties = { fontFamily: 'Consolas, monospace', fontSize: 13 };
