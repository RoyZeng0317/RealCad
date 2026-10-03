// 類比零件的面板：左側放置前的參數（阻值 / 型號 / 腳位方向）與右側選取後的工作點卡片
//   全部用按鈕 / 滑桿 / 下拉選單，沒有文字輸入框（避免快捷鍵失效，見 SHORTCUTS.md）
import { useBoard } from './boardStore.js';
import { useBench } from './bench.js';
import { holeName } from './boardModel.js';
import {
  POT_VALUES, POT_RATING, CAP_MODELS, CAP_MODEL_IDS, CAP_REVERSE_MAX, IND_VALUES, IND_IMAX, indDcr,
  BJT_MODELS, BJT_MODEL_IDS, XFMR_MODELS, XFMR_MODEL_IDS, XFMR_IMAX, xfmrParams, CTX_MODELS, CTX_MODEL_IDS, CTX_IRATED, MAINS_VRMS, MAINS_F, ctxParams, THERMAL, fmtOhm, fmtHenry, partLabel, type BoardPart,
} from './boardParts.js';
import { elementWave } from './scopeLink.js';
import { Section, Slider, Stat, chip, row, help, selectStyle, T } from './panelUi.js';

const blur = (e: { currentTarget: HTMLElement }) => e.currentTarget.blur();
const mA = (i: number) => `${(i * 1000).toFixed(2)} mA`;
const mW = (p: number) => `${(p * 1000).toFixed(1)} mW`;

function DirButtons() {
  const s = useBoard();
  return (
    <div style={row}>
      <button style={chip(s.ldoDir === 1)} onClick={() => s.setParam({ ldoDir: 1 })}>腳位往下排</button>
      <button style={chip(s.ldoDir === -1)} onClick={() => s.setParam({ ldoDir: -1 })}>腳位往上排</button>
    </div>
  );
}

/** 左側「零件」區：選了類比零件工具時的參數 */
export function AnalogParams() {
  const s = useBoard();
  if (s.tool === 'pot') return (
    <>
      <div style={row}>
        {POT_VALUES.map((v) => <button key={v} style={chip(s.potValue === v)} onClick={() => s.setParam({ potValue: v })}>{fmtOhm(v)}</button>)}
      </div>
      <DirButtons />
    </>
  );
  if (s.tool === 'cap') return (
    <div style={row}>
      {CAP_MODEL_IDS.map((m) => <button key={m} style={chip(s.capModel === m)} onClick={() => s.setParam({ capModel: m })}>{CAP_MODELS[m].name}</button>)}
    </div>
  );
  if (s.tool === 'ind') return (
    <div style={row}>
      {IND_VALUES.map((v) => <button key={v} style={chip(s.indValue === v)} onClick={() => s.setParam({ indValue: v })}>{fmtHenry(v)}</button>)}
    </div>
  );
  if (s.tool === 'bjt') return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
        {BJT_MODEL_IDS.map((m) => <button key={m} style={chip(s.bjtModel === m)} onClick={() => s.setParam({ bjtModel: m })}>{BJT_MODELS[m].name}</button>)}
      </div>
      <DirButtons />
    </>
  );
  if (s.tool === 'xfmr') return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
      {XFMR_MODEL_IDS.map((m) => <button key={m} style={chip(s.xfmrModel === m)} onClick={() => s.setParam({ xfmrModel: m })}>{XFMR_MODELS[m].name}</button>)}
    </div>
  );
  if (s.tool === 'ctx') return (
    <>
      <div style={row}>
        {CTX_MODEL_IDS.map((m) => <button key={m} style={chip(s.ctxModel === m)} onClick={() => s.setParam({ ctxModel: m })}>{CTX_MODELS[m].name}</button>)}
      </div>
      <DirButtons />
    </>
  );
  return null;
}

export const isAnalog = (p: BoardPart) => p.kind === 'pot' || p.kind === 'cap' || p.kind === 'ind' || p.kind === 'bjt' || p.kind === 'xfmr' || p.kind === 'ctx';

/** 一個週期的 RMS（暫態模擬的每個相位等時間間隔） */
const rmsOf = (xs: number[]) => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / Math.max(1, xs.length));

/** 右側檢視器：選取的類比零件 */
export function AnalogCard({ part }: { part: BoardPart }) {
  const s = useBoard();
  const bench = useBench();
  const r = bench.sol.el[part.id];
  const temp = s.temps[part.id] ?? 25;
  const V = (i: number) => bench.holeV(part.pins[i]);
  const fmtV = (v: number | null) => (v === null ? '未接' : `${v.toFixed(3)} V`);
  const upd = (patch: Parameters<typeof s.updatePart>[1]) => s.updatePart(part.id, patch);

  let rows: [string, string, string?][] = [];
  let status = '正常', color = '#3cff7a';
  let extra: React.ReactNode = null;

  if (part.kind === 'pot') {
    const k = part.pos ?? 0.5, R = part.value!;
    rows = [['腳 1–W', fmtOhm(Math.max(0.5, R * k))], ['W–腳 3', fmtOhm(Math.max(0.5, R * (1 - k)))],
      ['W（滑動端）電壓', fmtV(V(1))], ['功率', mW(r?.p ?? 0), (r?.p ?? 0) > POT_RATING ? '#ff4d3a' : undefined]];
    if ((r?.p ?? 0) > POT_RATING) { status = `超過額定 ${POT_RATING * 1000} mW，發熱中`; color = '#ff8a1f'; }
    extra = (
      <>
        <Slider label="旋鈕位置（腳 1 → 腳 3）" value={`${Math.round(k * 100)} %`} min={0} max={1} step={0.005} v={k}
          onChange={(x) => upd({ pos: x })} />
        <div style={row}>
          {POT_VALUES.map((v) => <button key={v} style={chip(R === v)} onClick={() => upd({ value: v })}>{fmtOhm(v)}</button>)}
        </div>
        <div style={help}>也可以在 3D 畫面的白色旋鈕上按住上下拖曳、或用滑鼠滾輪轉（Shift 微調）。腳位：1 {holeName(part.pins[0])}・W {holeName(part.pins[1])}・3 {holeName(part.pins[2])}</div>
      </>
    );
  } else if (part.kind === 'cap') {
    const m = CAP_MODELS[part.capModel ?? '100u50'];
    const v = r?.v ?? 0;
    rows = [['兩端電壓（+ 對 −）', `${v.toFixed(3)} V`, v > m.v || v < -CAP_REVERSE_MAX ? '#ff4d3a' : undefined],
      ['電容量', `${m.c * 1e6} µF`], ['耐壓', `${m.v} V`], ['儲存能量', `${(0.5 * m.c * v * v * 1000).toFixed(2)} mJ`]];
    [status, color] = v < -0.3 ? ['反接！電解電容有極性，+ 腳要接高電位', '#ff8a1f']
      : v > m.v * 0.8 ? ['接近耐壓上限（建議工作電壓 ≤ 耐壓的 80%）', '#ffb020']
      : ['正常（直流時電容開路，量到的是充好的電壓）', '#3cff7a'];
    extra = (
      <>
        <div style={row}>
          {CAP_MODEL_IDS.map((id) => (
            <button key={id} style={chip(part.capModel === id)} onClick={() => upd({ capModel: id })}>{CAP_MODELS[id].name}</button>
          ))}
        </div>
        <div style={help}>+ 腳 {holeName(part.pins[0])}・− 腳（白色條紋）{holeName(part.pins[1])}。接上函數產生器時會做暫態模擬，示波器可以看到充放電曲線。</div>
      </>
    );
  } else if (part.kind === 'ind') {
    const i = r?.i ?? 0;
    rows = [['電流', mA(i), Math.abs(i) > IND_IMAX ? '#ff4d3a' : undefined], ['兩端電壓', `${(r?.v ?? 0).toFixed(3)} V`],
      ['直流電阻 DCR', fmtOhm(indDcr(part.value!))], ['儲存能量', `${(0.5 * part.value! * i * i * 1000).toFixed(3)} mJ`]];
    if (Math.abs(i) > IND_IMAX) { status = `電流超過 ${IND_IMAX * 1000} mA（磁芯飽和、線圈發熱）`; color = '#ff8a1f'; }
    extra = (
      <>
        <div style={row}>
          {IND_VALUES.map((v) => <button key={v} style={chip(part.value === v)} onClick={() => upd({ value: v })}>{fmtHenry(v)}</button>)}
        </div>
        <div style={help}>{holeName(part.pins[0])} → {holeName(part.pins[1])}。直流時電感就是一顆小電阻（DCR）；接上函數產生器可以看到 L/R 暫態。</div>
      </>
    );
  } else if (part.kind === 'bjt') {
    const m = BJT_MODELS[part.bjtModel ?? '2N3904'];
    const ic = r?.i ?? 0, ib = r?.ib ?? 0, p = r?.p ?? 0;
    const pnp = m.pol < 0;
    rows = [[pnp ? 'VEB' : 'VBE', `${(r?.vbe ?? 0).toFixed(3)} V`], [pnp ? 'VEC' : 'VCE', `${(r?.v ?? 0).toFixed(3)} V`],
      ['IB', `${(ib * 1e6).toFixed(1)} µA`], ['IC', mA(ic), Math.abs(ic) > m.icMax ? '#ff4d3a' : undefined],
      ['β = IC / IB', Math.abs(ib) > 1e-9 ? (ic / ib).toFixed(1) : '—'], ['功率', mW(p), p > m.pMax ? '#ff4d3a' : undefined]];
    const mode = r?.mode;
    [status, color] = mode === 'active' ? ['放大區（IC ≈ β·IB）', '#3cff7a']
      : mode === 'sat' ? ['飽和區（當開關導通，VCE 很小）', '#5ad1ff']
      : mode === 'reverse' ? ['反向（C、E 接反了？）', '#ffb020']
      : ['截止區（基極電壓不夠，不導通）', '#8fb4d0'];
    if (p > m.pMax) { status = `超過額定功率 ${m.pMax * 1000} mW，發熱中`; color = '#ff8a1f'; }
    else if (Math.abs(ic) > m.icMax) { status = `集極電流超過額定 ${m.icMax * 1000} mA`; color = '#ff8a1f'; }
    extra = (
      <>
        <select style={selectStyle} value={part.bjtModel ?? '2N3904'} onChange={(e) => { upd({ bjtModel: e.target.value as BoardPart['bjtModel'] }); blur(e); }}>
          {BJT_MODEL_IDS.map((id) => <option key={id} value={id}>{BJT_MODELS[id].name}</option>)}
        </select>
        <button style={chip(false)} onClick={() => upd({ rot: (((part.rot ?? 1) + 1) % 4) })}>↻ 本體旋轉 90°（只改外觀，接腳不變）</button>
        <div style={help}>腳位（平面朝自己由左到右）：E {holeName(part.pins[0])}・B {holeName(part.pins[1])}・C {holeName(part.pins[2])}</div>
      </>
    );
  } else if (part.kind === 'xfmr') {
    const model = part.xfmrModel ?? '2:1';
    const { n, l1, l2, r1, r2 } = xfmrParams(model);
    // 交流（產生器接上、有暫態模擬）時看 RMS；只有直流時線圈就是電阻，二次側不會有電壓
    const pw = elementWave(`${part.id}:p`), sw = elementWave(`${part.id}:s`);
    const ac = !!pw && !!sw && pw.every(Boolean) && sw.every(Boolean);
    const vp = ac ? rmsOf(pw!.map((x) => x!.v)) : r?.vin ?? 0, vs = ac ? rmsOf(sw!.map((x) => x!.v)) : r?.v ?? 0;
    const ip = ac ? rmsOf(pw!.map((x) => x!.i)) : r?.ib ?? 0, is = ac ? rmsOf(sw!.map((x) => -x!.i)) : -(r?.i ?? 0);
    const unit = ac ? ' rms' : '';
    const over = Math.max(Math.abs(ip), Math.abs(is)) > XFMR_IMAX;
    rows = [[`一次側電壓 P1–P2${unit}`, `${vp.toFixed(3)} V`], [`二次側電壓 S1–S2${unit}`, `${vs.toFixed(3)} V`],
      [`一次側電流${unit}`, mA(ip), Math.abs(ip) > XFMR_IMAX ? '#ff4d3a' : undefined], [`二次側電流（流出 S1）${unit}`, mA(is), Math.abs(is) > XFMR_IMAX ? '#ff4d3a' : undefined],
      ['實際電壓比 Vp / Vs', Math.abs(vs) > 1e-4 ? (vp / vs).toFixed(2) : '—'], ['銅損（線圈發熱）', mW(r?.p ?? 0)]];
    [status, color] = over ? [`過載：電流超過 ${XFMR_IMAX * 1000} mA，線圈發熱中`, '#ff8a1f']
      : ac ? [`交流傳遞中（理想比 ${n >= 1 ? `${n} : 1` : `1 : ${1 / n}`}，有負載時二次側會略低）`, '#3cff7a']
      : Math.abs(ip) > 1e-3 ? ['直流流過一次側：變壓器不能傳直流（只是一顆 10 Ω 線圈電阻在發熱）', '#ffb020']
      : ['等待交流訊號（把函數產生器接到一次側 P1 / P2）', '#8fb4d0'];
    extra = (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {XFMR_MODEL_IDS.map((id) => <button key={id} style={chip(model === id)} onClick={() => upd({ xfmrModel: id })}>{XFMR_MODELS[id].name}</button>)}
        </div>
        <div style={help}>
          一次側（e 欄）P1 {holeName(part.pins[0])}・P2 {holeName(part.pins[1])}；二次側（f 欄）S1 {holeName(part.pins[2])}・S2 {holeName(part.pins[3])}（白點 = 同名端，P1、S1 同相位）。
          一次 / 二次電感 {fmtHenry(l1)} / {fmtHenry(l2)}、線圈電阻 {fmtOhm(r1)} / {fmtOhm(r2)}、耦合係數 0.999。兩側電氣隔離：二次側要量波形時，示波器接地夾要夾在 S2（或另外接到一次側的地）。
        </div>
      </>
    );
  }
  else if (part.kind === 'ctx') {
    const model = part.ctxModel ?? '12';
    const q = ctxParams(model);
    const plugged = part.plugged !== false;
    // 繞組 0 = 一次側、1 = A→COM、2 = COM→B；交流看 RMS
    const w = [0, 1, 2].map((k) => elementWave(`${part.id}:${k}`));
    const ok = w.every((x) => x && x.every(Boolean));
    const vr = (k: number) => (ok ? rmsOf(w[k]!.map((x) => x!.v)) : 0);
    const ir = (k: number) => (ok ? rmsOf(w[k]!.map((x) => x!.i)) : 0);
    const vab = ok ? rmsOf(w[1]!.map((x, j) => x!.v + w[2]![j]!.v)) : 0;
    const pAvg = ok ? w.reduce((acc, x) => acc + x!.reduce((a2, y) => a2 + y!.p, 0) / x!.length, 0) : 0;
    const iMax = Math.max(ir(1), ir(2));
    rows = [['A–COM rms', `${vr(1).toFixed(3)} V`], ['COM–B rms', `${vr(2).toFixed(3)} V`],
      ['A–B（全繞組）rms', `${vab.toFixed(3)} V`], ['一次側電流 rms', mA(ir(0))],
      ['A 端電流 rms', mA(ir(1)), ir(1) > CTX_IRATED ? '#ff4d3a' : undefined], ['B 端電流 rms', mA(ir(2)), ir(2) > CTX_IRATED ? '#ff4d3a' : undefined],
      ['銅損（平均）', mW(pAvg)]];
    [status, color] = !plugged ? ['插頭沒插：二次側沒有電', '#8fb4d0']
      : iMax > CTX_IRATED * 1.5 ? [`嚴重過載（額定 ${CTX_IRATED * 1000} mA）：線圈快速發熱，短路會燒毀`, '#ff4d3a']
      : iMax > CTX_IRATED ? [`過載：二次側電流超過額定 ${CTX_IRATED * 1000} mA`, '#ff8a1f']
      : [`通電中：${MAINS_VRMS} V / ${MAINS_F} Hz → ${q.vs} V（${q.vs / 2}-0-${q.vs / 2} V），A、B 對 COM 反相`, '#3cff7a'];
    extra = (
      <>
        <button style={chip(false, '', plugged ? '#5a2030' : '#1f5a3a')} onClick={() => upd({ plugged: !plugged })}>{plugged ? '🔌 拔掉插頭' : '🔌 插上 110 V 市電'}</button>
        <div style={row}>
          {CTX_MODEL_IDS.map((id) => <button key={id} style={chip(model === id)} onClick={() => upd({ ctxModel: id })}>{CTX_MODELS[id].name}</button>)}
        </div>
        <div style={help}>
          引線：A（黃）{holeName(part.pins[0])}・COM（黑，中間抽頭 0 V）{holeName(part.pins[1])}・B（黃）{holeName(part.pins[2])}。
          額定 {q.vs} V / {CTX_IRATED * 1000} mA；空載電壓約高 10%（{(q.vs * 1.1).toFixed(1)} V）。一次側插市電、跟麵包板電氣隔離：用 COM 當這組電源的地。
          全波整流：A、B 各接一顆二極體陽極，陰極接在一起當 +，負載接到 COM。
        </div>
      </>
    );
  }
  if (part.burnt) {
    [status, color] = [part.kind === 'cap' ? '損壞（過壓或反接，電容鼓起）—當開路' : '燒毀（開路）', '#ff4d3a'];
  }

  return (
    <Section title={`選取：${partLabel(part)}`}>
      <div style={{ background: '#06120c', border: '1px solid #1f5a3a', borderRadius: 6, padding: '6px 10px', fontFamily: T.mono, fontSize: 13, color }}>{status}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
        {rows.map(([k, v, c]) => <Stat key={k} k={k} v={v} color={c} />)}
        {part.kind !== 'cap' && <Stat k="溫度" v={`${temp} °C`} color={temp > 120 ? '#ff8a1f' : undefined} />}
      </div>
      {extra}
      {part.kind !== 'cap' && <div style={help}>燒毀溫度約 {THERMAL[part.kind as 'pot'].burn} °C</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        {part.burnt && <button style={chip(false, '', '#5a4a1a')} onClick={() => s.replacePart(part.id)}>更換新零件</button>}
        <button style={chip(false, '', '#5a2030')} onClick={() => s.removePart(part.id)}>刪除</button>
        <button style={chip(false)} onClick={() => s.selectPart(null)}>取消選取</button>
      </div>
    </Section>
  );
}
