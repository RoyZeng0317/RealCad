// NE555 計時 IC 與 CH224K PD 誘騙模組的面板：左側放置前的參數、右側選取後的狀態卡片
//   全部用按鈕，沒有文字輸入框（快捷鍵規則，見 SHORTCUTS.md）
import { useEffect, useState } from 'react';
import { useBoard } from './boardStore.js';
import { useBench, getBench } from './bench.js';
import { holeName } from './boardModel.js';
import { THERMAL, type BoardPart } from './boardParts.js';
import { NE, NE555_PINS, NE555_VMIN, NE555_VMAX, ne555Stats } from './ne555.js';
import { PD_VOLTS, CFG1_RES, CHARGERS, CHARGER_IDS, CHP, CH224_PINS, negotiate } from './ch224.js';
import { ne555Sim } from './scopeLink.js';
import { Section, Stat, chip, row, help, T } from './panelUi.js';

const mA = (i: number) => `${(i * 1000).toFixed(2)} mA`;
const fmtF = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(3)} kHz` : f >= 1 ? `${f.toFixed(3)} Hz` : `${(1 / f).toFixed(2)} s 一次`);

/** 左側「零件」區：選了 NE555 / CH224K 工具時的參數 */
export function IcParams() {
  const s = useBoard();
  if (s.tool === 'ch224') return (
    <>
      <div style={row}>
        {PD_VOLTS.map((v) => <button key={v} style={chip(s.pdVolt === v)} onClick={() => s.setParam({ pdVolt: v })}>{v} V</button>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
        {CHARGER_IDS.map((c) => <button key={c} style={chip(s.charger === c)} onClick={() => s.setParam({ charger: c })}>{CHARGERS[c].name}</button>)}
      </div>
      <div style={row}>
        <button style={chip(s.ldoDir === 1)} onClick={() => s.setParam({ ldoDir: 1 })}>排針往下排</button>
        <button style={chip(s.ldoDir === -1)} onClick={() => s.setParam({ ldoDir: -1 })}>排針往上排</button>
      </div>
    </>
  );
  return null;
}

export const isIc = (p: BoardPart) => p.kind === 'ne555' || p.kind === 'ch224';

/** 慢速振盪時每 0.1 秒更新一次（getBench 依時間給當下的解） */
function useTicker(on: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => set((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [on]);
}

export function IcCard({ part }: { part: BoardPart }) {
  return part.kind === 'ne555' ? <Ne555Card part={part} /> : <Ch224Card part={part} />;
}

function Ne555Card({ part }: { part: BoardPart }) {
  const s = useBoard.getState();
  useBench();
  const sim = ne555Sim();
  const slow = !!sim?.per && sim.per.period >= 1 / 12;
  useTicker(slow);
  const b = getBench();
  const net = b.netOfHole;
  const V = (i: number) => b.holeV(part.pins[i]);
  const g = V(NE.GND) ?? 0;
  const pv = (i: number) => { const v = V(i); return v === null ? '未接' : `${(v - g).toFixed(3)} V`; };
  const vcc = (V(NE.VCC) ?? 0) - g;
  const st = sim?.per ? ne555Stats(sim.per, part, net) : null;
  const temp = useBoard.getState().temps[part.id] ?? 25;
  let status: string, color: string;
  if (part.burnt) [status, color] = ['損壞（VCC 超過 18 V 或過熱）', '#ff4d3a'];
  else if (vcc < NE555_VMIN * 0.8) [status, color] = [`沒有電源：第 8 腳 VCC 接 ${NE555_VMIN}–${NE555_VMAX} V、第 1 腳接地`, '#8fb4d0'];
  else if (st) [status, color] = [`無穩態振盪中：${fmtF(st.f)}、工作週期 ${(st.duty * 100).toFixed(1)} %`, '#3cff7a'];
  else if (V(NE.RESET) !== null && (V(NE.RESET)! - g) < 0.7) [status, color] = ['RESET（第 4 腳）是低電位：輸出被強制為低', '#ffb020'];
  else [status, color] = [`沒有振盪：輸出固定${(V(NE.OUT) ?? 0) - g > vcc / 2 ? '高' : '低'}（檢查 R、C 與 2、6、7 腳的接法）`, '#ffb020'];
  if (vcc > NE555_VMAX) [status, color] = [`VCC ${vcc.toFixed(1)} V 超過最大 ${NE555_VMAX} V！`, '#ff4d3a'];

  return (
    <Section title="選取：NE555 計時 IC">
      <div style={{ background: '#06120c', border: '1px solid #1f5a3a', borderRadius: 6, padding: '6px 10px', fontFamily: T.mono, fontSize: 13, color }}>{status}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
        <Stat k="VCC（8）" v={`${vcc.toFixed(2)} V`} />
        <Stat k={slow ? 'OUT（3）此刻' : 'OUT（3）'} v={pv(NE.OUT)} />
        <Stat k={slow ? 'THR / TRIG（6 / 2）此刻' : 'THR（6）'} v={slow ? `${pv(NE.THR)} / ${pv(NE.TRIG)}` : pv(NE.THR)} />
        <Stat k="門檻 2/3 · 1/3 VCC" v={`${((V(NE.CTRL) ?? 0) - g).toFixed(2)} / ${(((V(NE.CTRL) ?? 0) - g) / 2).toFixed(2)} V`} />
        {st && <Stat k="頻率 f" v={fmtF(st.f)} />}
        {st && <Stat k="週期 T" v={st.period >= 1 ? `${st.period.toFixed(3)} s` : `${(st.period * 1000).toFixed(3)} ms`} />}
        {st && <Stat k="工作週期（高電位比例）" v={`${(st.duty * 100).toFixed(1)} %`} />}
        <Stat k="溫度" v={`${temp} °C`} color={temp > 120 ? '#ff8a1f' : undefined} />
      </div>
      <div style={help}>
        無穩態（自己振盪）的標準接法：VCC → R1 → 第 7 腳 → R2 → 第 6、2 腳 → C → 地；第 4 腳接 VCC、第 5 腳接 0.01 µF 到地。
        f ≈ 1.44 / ((R1 + 2·R2)·C)，工作週期 = (R1 + R2) / (R1 + 2·R2)。
        {slow ? '振盪很慢：3D 上的 LED 會真的一閃一閃。' : st ? '振盪太快，眼睛（跟 LED）看到的是平均亮度，用示波器看波形。' : ''}
      </div>
      <PinTable part={part} names={NE555_PINS} g={g} />
      <div style={help}>第 1 腳（缺口左邊，e 欄）：{holeName(part.pins[0])}。燒毀溫度約 {THERMAL.ne555.burn} °C</div>
      <Buttons part={part} s={s} />
    </Section>
  );
}

function Ch224Card({ part }: { part: BoardPart }) {
  const s = useBoard.getState();
  const b = useBench();
  const r = b.sol.el[part.id];
  const plugged = part.plugged !== false;
  const neg = negotiate(part);
  const upd = (patch: Parameters<typeof s.updatePart>[1]) => s.updatePart(part.id, patch);
  const g = b.holeV(part.pins[CHP.GND]) ?? 0;
  const vout = (b.holeV(part.pins[CHP.VOUT]) ?? 0) - g;
  const i = r?.i ?? 0;
  let status: string, color: string;
  if (!plugged) [status, color] = [part.tripped ? `充電器過流保護！輸出電流超過 ${neg.imax} A，已關閉輸出（重插 USB-C 線恢復）` : 'USB-C 線沒插', part.tripped ? '#ff4d3a' : '#8fb4d0'];
  else if (!neg.ok) [status, color] = [`充電器不支援 ${part.pdVolt ?? 12} V → 退回 5 V（PG 不拉低）`, '#ffb020'];
  else [status, color] = [`PD 協商成功：${neg.v} V，最大 ${neg.imax} A（PG 拉低）`, '#3cff7a'];
  return (
    <Section title={`選取：CH224K PD 誘騙模組`}>
      <div style={{ background: '#06120c', border: '1px solid #1f5a3a', borderRadius: 6, padding: '6px 10px', fontFamily: T.mono, fontSize: 13, color }}>{status}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
        <Stat k="VOUT 對 GND" v={`${vout.toFixed(3)} V`} />
        <Stat k="輸出電流" v={mA(i)} color={i > neg.imax ? '#ff4d3a' : undefined} />
        <Stat k="輸出功率" v={`${(vout * i).toFixed(2)} W`} />
        <Stat k="PG" v={plugged && neg.ok ? '低（電源良好）' : '高阻抗'} />
      </div>
      <div style={{ fontSize: 12, color: T.muted }}>要求電壓（模組上 CFG1 的設定）</div>
      <div style={row}>
        {PD_VOLTS.map((v) => <button key={v} style={chip((part.pdVolt ?? 12) === v)} onClick={() => upd({ pdVolt: v })}>{v} V</button>)}
      </div>
      <div style={{ fontSize: 12, color: T.muted }}>USB-C 接的充電器</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
        {CHARGER_IDS.map((c) => <button key={c} style={chip((part.charger ?? 'pd65') === c)} onClick={() => upd({ charger: c })}>{CHARGERS[c].name}</button>)}
      </div>
      <button style={chip(false, '', plugged ? '#5a2030' : '#1f5a3a')} onClick={() => upd({ plugged: !plugged, tripped: false })}>{plugged ? '拔掉 USB-C 線' : '插上 USB-C 線'}</button>
      <div style={help}>
        CH224K 是 ESSOP-10 貼片 IC，跟實際一樣做成小模組：USB-C 母座 + CH224K + 排針。
        CFG1 對地電阻：{PD_VOLTS.map((v) => `${v} V = ${CFG1_RES[v]}`).join('、')}。
        排針：VOUT {holeName(part.pins[CHP.VOUT])}・GND {holeName(part.pins[CHP.GND])}・PG {holeName(part.pins[CHP.PG])}。
        PG 是開汲極輸出：要接上拉電阻（或 LED + 電阻到 VOUT）才看得到高低。
      </div>
      <PinTable part={part} names={CH224_PINS} g={g} />
      <Buttons part={part} s={s} />
    </Section>
  );
}

function PinTable({ part, names, g }: { part: BoardPart; names: [string, string][]; g: number }) {
  const b = getBench();
  return (
    <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: T.mono }}>
      <thead><tr style={{ color: T.muted }}><td style={td}>腳</td><td style={td}>名稱</td><td style={td}>電壓</td><td style={td}>說明</td></tr></thead>
      <tbody>{names.map(([n, note], i) => {
        const v = b.holeV(part.pins[i]);
        return (
          <tr key={i}>
            <td style={td}>{i + 1}</td><td style={{ ...td, color: '#00d2ff' }}>{n}</td>
            <td style={td}>{v === null ? '未接' : (v - g).toFixed(2)}</td><td style={{ ...td, color: T.muted, fontFamily: 'inherit' }}>{note}</td>
          </tr>
        );
      })}</tbody>
    </table>
  );
}

function Buttons({ part, s }: { part: BoardPart; s: ReturnType<typeof useBoard.getState> }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {part.burnt && <button style={chip(false, '', '#5a4a1a')} onClick={() => s.replacePart(part.id)}>更換新零件</button>}
      <button style={chip(false, '', '#5a2030')} onClick={() => s.removePart(part.id)}>刪除</button>
      <button style={chip(false)} onClick={() => s.selectPart(null)}>取消選取</button>
    </div>
  );
}

const td = { padding: '2px 6px', borderBottom: '1px solid #1f1f48' } as const;
