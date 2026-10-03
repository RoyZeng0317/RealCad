// 麵包板操作介面：左側元件庫（零件/工具/範例）、右側檢視器（三用電表、選取零件的工作點）
import type { CSSProperties } from 'react';
import { useBoard, type Tool } from './boardStore.js';
import { LEAD_TAG } from './LeadControls.js';
import { ChipCard } from './chips/ChipPanels.js';
import { ResistorInput } from './ResistorInput.js';
import { AnalogParams, AnalogCard, isAnalog } from './AnalogPanels.js';
import { loadAtmegaDemo } from './chips/chipDemo.js';
import { useBench } from './bench.js';
import { dmmReading } from './scopeLink.js';
import { holeName } from './boardModel.js';
import {
  DIODE_MODELS, DIODE_PIV, RESISTOR_RATING, WIRE_COLORS, THERMAL, LDO_VIN_MAX,
  partLabel, LED_COLORS, LED_SPEC, LED_IMAX, type BoardPart,
} from './boardParts.js';
import { loadDemoCircuit, loadUnoBlink, loadEsp32Mistake, loadPi5Blink, loadRectifierDemo } from './boardDemo.js';
import { loadRcDemo, loadBjtDemo, loadXfmrDemo, loadCtxDemo } from './analogDemo.js';
import { useLabUi } from './labUi.js';
import { Section, Stat, chip, row, help, warn, selectStyle, T } from './panelUi.js';

export const TOOL_HINT: Record<Tool, string> = {
  erase: '刪除模式：直接用滑鼠點要刪除的零件或杜邦線（可以連續刪）。按 S 或再按一次刪除回到選取，刪錯可用 Ctrl+Z 復原。',
  select: '點零件看電壓、電流、功率與溫度；按住零件拖曳可以移到別的孔（杜邦線是拖其中一端）；Delete 刪除選取的零件，按 X（刪除）進入刪除模式直接點零件刪除。',
  probe: '紅棒、黑棒輪流放：點孔（或接線柱、開發板排針）插上探棒，讀值 = 紅棒電壓 − 黑棒電壓。黑棒預設插在 GND 接線柱。',
  wire: '杜邦線：先點第一個孔（或 Va / Vb / GND 接線柱），再點第二個孔。',
  resistor: '先點第一隻腳的孔，再點第二隻腳的孔（兩孔不能在同一組相通的孔）。',
  diode: '先點陽極（A）的孔，再點陰極（K，有銀色環那端）的孔。',
  led: '先點陽極（長腳 +）的孔，再點陰極（短腳 −）的孔；記得串限流電阻。',
  atmega: '點一個端子排的孔：第 1 腳（RESET，缺口那端）放在那一列，14 隻腳沿 e 欄往下、另 14 隻在 f 欄（跨在中間的溝上）。',
  ch340: '點一個端子排的孔：第 1 腳（GND）放在那一列，8 隻腳沿 e 欄往下、另 8 隻在 f 欄；Micro USB 線已接到電腦。',
  ldo: '點第 1 腳（GND）的孔，第 2 腳（OUT）、第 3 腳（IN）會沿同一欄自動排在接下來兩列。',
  pot: '點第 1 腳的孔，滑動端 W、第 3 腳會沿同一欄自動排在接下來兩列。放好後在白色旋鈕上拖曳或滾輪就能轉。',
  cap: '電解電容有極性：先點 + 腳（長腳）的孔，再點 − 腳（白色條紋那邊）的孔。反接或超過耐壓會損壞。',
  ind: '先點第一隻腳的孔，再點第二隻腳的孔（電感沒有極性）。',
  bjt: '點 E（射極）的孔，B（基極）、C（集極）會沿同一欄自動排在接下來兩列（平面朝自己時由左到右 E、B、C）。',
  xfmr: '點一個端子排的孔：那一列放 P1 / S1，往下第 3 列放 P2 / S2，跨在中間的溝上（e 欄一次側、f 欄二次側，兩側電氣隔離）。只能傳交流：接函數產生器到一次側。',
  ctx: '點 A 端引線要插的孔，COM（中間抽頭、0 V 共地）、B 端會沿同一欄每隔一列排好；一次側自己插 110 V 市電（檢視器可以拔插頭）。A、B 對 COM 是反相的兩組交流電。',
  fg: '函數產生器輸出線：先點 + 端（紅線，訊號），再點 − 端（黑線，地）。產生器輸出內阻 50 Ω。',
  ch1: '示波器 CH1 探棒：先點 + 端（探針，要量的點），再點 − 端（接地夾，通常接 GND）。螢幕顯示的是 + 端減 − 端的電壓。',
  ch2: '示波器 CH2 探棒：先點 + 端（探針，要量的點），再點 − 端（接地夾，通常接 GND）。螢幕顯示的是 + 端減 − 端的電壓。',
  dm: '桌上型萬用電表測試線：先點紅棒（+）要接的孔，再點黑棒（−）。量電壓並聯（黑棒接 GND）；量電流要串聯（把線路斷開接在中間）；功能在下方「萬用電表」分頁或 3D 面板上切換。',
  sa: '頻譜分析儀紅黑測試線：先點紅棒（+，要量的點），再點黑棒（−，通常接 GND）。分析的是紅棒減黑棒電壓的頻譜；黑棒經儀器外殼接大地（跟示波器接地夾共地）。',
};

export const TOOL_NAME: Record<Tool, string> = {
  select: '選取', erase: '刪除', probe: '三用電表', wire: '杜邦線', resistor: '電阻', diode: '二極體', led: 'LED', ldo: 'LT1117-3.3', pot: '可變電阻', cap: '電解電容', ind: '電感', bjt: '電晶體', xfmr: '變壓器', ctx: '中心抽頭變壓器', atmega: 'ATmega328P', ch340: 'CH340G',
  fg: '函數產生器輸出線', ch1: '示波器 CH1 探棒', ch2: '示波器 CH2 探棒', sa: '頻譜分析儀紅黑測試線', dm: '桌上型萬用電表測試線',
};

// 快捷鍵（shortcutLetter / isTyping / boardActions / useBoardKeys）已集中到 shortcuts.ts；這裡轉出去給舊的 import 使用
export { shortcutLetter, isTyping, boardActions, useBoardKeys } from './shortcuts.js';

interface LibItem { tool: Tool; name: string; sub: string; icon: string }
const PART_ITEMS: LibItem[] = [
  { tool: 'resistor', name: '電阻', sub: '碳膜 1/4 W・E12 10 Ω–1 MΩ', icon: '▭' },
  { tool: 'diode', name: '整流二極體', sub: '1N4001 – 1N4007・1 A', icon: '▷|' },
  { tool: 'led', name: 'LED', sub: '5 mm・紅 / 黃 / 綠 / 藍 / 白', icon: '◉' },
  { tool: 'pot', name: '可變電阻', sub: '1 kΩ / 10 kΩ / 100 kΩ・旋鈕可轉', icon: '⏚' },
  { tool: 'cap', name: '電解電容', sub: '100 µF / 50 V・47 µF / 25 V・有極性', icon: '⊣⊢' },
  { tool: 'ind', name: '電感', sub: '100 µH / 1 mH / 10 mH・工字電感', icon: '∞' },
  { tool: 'bjt', name: '電晶體', sub: '2N3904 / S9013 NPN・2N3906 / S9012 PNP・TO-92', icon: '⋎' },
  { tool: 'xfmr', name: '變壓器', sub: '1:1 / 2:1 / 4:1 / 10:1 / 1:2・EI 鐵芯・只傳交流', icon: '⧛' },
  { tool: 'ctx', name: '中心抽頭變壓器', sub: '110 V → 6 V（3-0-3）/ 12 V（6-0-6）/ 24 V（12-0-12）・0.5 A', icon: '⫶' },
  { tool: 'ldo', name: 'LT1117-3.3', sub: '低壓降穩壓 IC・TO-220', icon: '⊓' },
  { tool: 'atmega', name: 'ATmega328P-PU', sub: 'AVR 微控制器・DIP-28・可寫 Arduino C', icon: '▥' },
  { tool: 'ch340', name: 'CH340G', sub: 'USB 轉序列（上傳程式／序列埠）・DIP-16', icon: '⇄' },
  { tool: 'wire', name: '杜邦線（W）', sub: '公對公・接孔或接線柱', icon: '〰' },
];
const TOOL_ITEMS: LibItem[] = [
  { tool: 'select', name: '選取（S）', sub: '拖曳移動零件・X 刪除', icon: '↖' },
  { tool: 'probe', name: '三用電表', sub: 'DC V・紅棒 / 黑棒兩支探棒', icon: 'V' },
  { tool: 'fg', name: '函數產生器輸出線', sub: 'BNC → 紅 + / 黑 −，接到麵包板', icon: '∿' },
  { tool: 'ch1', name: '示波器 CH1 探棒', sub: '探針 + 接地夾，量麵包板上的波形', icon: '①' },
  { tool: 'ch2', name: '示波器 CH2 探棒', sub: '探針 + 接地夾，量麵包板上的波形', icon: '②' },
  { tool: 'dm', name: '桌上型萬用電表測試線', sub: 'DM-5050・紅棒 + / 黑棒 −，V / A / Ω / 二極體 / 頻率', icon: 'Ω' },
  { tool: 'sa', name: '頻譜分析儀紅黑測試線', sub: '紅棒 + / 黑棒 −，看麵包板上訊號的頻譜', icon: '≋' },
];

function LibRow({ item }: { item: LibItem }) {
  const tool = useBoard((s) => s.tool);
  const setTool = useBoard((s) => s.setTool);
  const active = tool === item.tool;
  return (
    <button
      onClick={() => { setTool(item.tool); if (item.tool !== 'select') useLabUi.getState().focus('breadboard'); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer',
        background: active ? '#0b3550' : 'transparent', border: `1px solid ${active ? T.accent : 'transparent'}`,
        borderRadius: 6, padding: '6px 8px', color: T.text, fontFamily: T.font,
      }}
    >
      <span style={{ width: 28, textAlign: 'center', color: T.accent, fontFamily: T.mono, fontWeight: 700 }}>{item.icon}</span>
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{item.name}</span>
        <span style={{ fontSize: 11, color: T.muted }}>{item.sub}</span>
      </span>
    </button>
  );
}

/** 目前工具的參數（電阻值、二極體型號、杜邦線顏色、LT1117 腳位方向） */
function ToolParams() {
  const s = useBoard();
  if (s.tool === 'resistor') return (
    <ResistorInput id="place-r" value={s.resistorValue} onChange={(r) => s.setParam({ resistorValue: r })} />
  );
  if (s.tool === 'diode') return (
    <select style={selectStyle} value={s.diodeModel} onChange={(e) => s.setParam({ diodeModel: e.target.value as typeof s.diodeModel })}>
      {DIODE_MODELS.map((m) => <option key={m} value={m}>{m}（PIV {DIODE_PIV[m]} V）</option>)}
    </select>
  );
  if (s.tool === 'led') return (
    <div style={{ display: 'flex', gap: 4 }}>
      {LED_COLORS.map((c) => (
        <button key={c} onClick={() => s.setParam({ ledColor: c })} title={LED_SPEC[c].name} style={{
          flex: 1, height: 22, borderRadius: 11, background: LED_SPEC[c].hex, cursor: 'pointer',
          border: s.ledColor === c ? `2px solid ${T.accent}` : '1px solid #2a2a5a',
        }} />
      ))}
    </div>
  );
  if (s.tool === 'wire') return (
    <>
    <button style={chip(useLabUi.getState().paletteOpen)} onClick={() => useLabUi.getState().setPaletteOpen(true)}>🎨 開啟調色盤（RGB / 色碼）</button>
    <div style={{ display: 'flex', gap: 4 }}>
      {WIRE_COLORS.map((c) => (
        <button key={c} onClick={() => s.setParam({ wireColor: c })} style={{
          flex: 1, height: 22, borderRadius: 4, background: c, cursor: 'pointer',
          border: s.wireColor === c ? `2px solid ${T.accent}` : '1px solid #2a2a5a',
        }} />
      ))}
    </div>
    </>
  );
  if (s.tool === 'probe') return (
    <div style={row}>
      <button style={chip(s.probeSide === 'red', '#8a1f24')} onClick={() => s.setParam({ probeSide: 'red' })}>下一次放紅棒</button>
      <button style={chip(s.probeSide === 'black', '#3a3a44')} onClick={() => s.setParam({ probeSide: 'black' })}>下一次放黑棒</button>
    </div>
  );
  if (s.tool === 'pot' || s.tool === 'cap' || s.tool === 'ind' || s.tool === 'bjt' || s.tool === 'xfmr' || s.tool === 'ctx') return <AnalogParams />;
  if (s.tool === 'ldo') return (
    <div style={row}>
      <button style={chip(s.ldoDir === 1)} onClick={() => s.setParam({ ldoDir: 1 })}>腳位往下排</button>
      <button style={chip(s.ldoDir === -1)} onClick={() => s.setParam({ ldoDir: -1 })}>腳位往上排</button>
    </div>
  );
  return null;
}

/** 左側元件庫的「零件 / 工具 / 範例」三個區塊 */
export function PartLibrary() {
  const clearBoard = useBoard((s) => s.clearBoard);
  return (
    <>
      <Section title="零件">
        {PART_ITEMS.map((it) => <LibRow key={it.tool} item={it} />)}
        <ToolParams />
      </Section>
      <Section title="工具">
        {TOOL_ITEMS.map((it) => <LibRow key={it.tool} item={it} />)}
      </Section>
      <Section title="範例">
        <button style={chip(false, '', '#12345a')} onClick={() => { loadDemoCircuit(); useLabUi.getState().focus('breadboard'); }}>
          3.3 V 穩壓電路（1N4007 + LT1117）
        </button>
        <button style={chip(false, '', '#12345a')} onClick={() => { loadRectifierDemo(); useLabUi.getState().focus('scope'); }}>
          函數產生器 → 麵包板：半波整流
        </button>
        <button style={chip(false, '', '#12345a')} onClick={() => { loadRcDemo(); useLabUi.getState().focus('scope'); }}>
          RC 充放電（1 kΩ + 100 µF，示波器看電容電壓）
        </button>
        <button style={chip(false, '', '#12345a')} onClick={() => { loadBjtDemo(); useLabUi.getState().focus('breadboard'); }}>
          可變電阻 + 2N3904 電晶體開關 LED
        </button>
        <button style={chip(false, '', '#12345a')} onClick={() => { loadXfmrDemo(); useLabUi.getState().focus('scope'); }}>
          2 : 1 變壓器降壓（CH1 一次側、CH2 二次側）
        </button>
        <button style={chip(false, '', '#12345a')} onClick={() => { loadCtxDemo(); useLabUi.getState().focus('scope'); }}>
          12 V 中心抽頭變壓器全波整流（6-0-6 V）
        </button>
        <button style={chip(false, '', '#12345a')} onClick={() => { loadUnoBlink(); useLabUi.getState().focus('devboards'); }}>
          Arduino Uno：LED 閃爍（Blink）
        </button>
        <button style={chip(false, '', '#12345a')} onClick={() => { loadPi5Blink(); useLabUi.getState().focus('devboards'); }}>
          Raspberry Pi 5：MicroPython LED 閃爍
        </button>
        <button style={chip(false, '', '#12345a')} onClick={() => { loadAtmegaDemo(); useLabUi.getState().focus('breadboard'); }}>
          麵包板 Arduino：ATmega328P + CH340
        </button>
        <button style={chip(false, '', '#4a1a1a')} onClick={() => { loadEsp32Mistake(); useLabUi.getState().focus('devboards'); }}>
          錯誤示範：5 V 接到 ESP32 GPIO
        </button>
        <button style={chip(false, '', '#3a1a2a')} onClick={() => { if (confirm('清空麵包板上所有零件？')) clearBoard(); }}>清空麵包板</button>
      </Section>
    </>
  );
}

/** 右側檢視器上方：目前工具提示、放置中的第一點、錯誤訊息 */
export function ToolStatus() {
  const { tool, pending, message, leadEnd } = useBoard();
  const lead = tool === 'fg' || tool === 'ch1' || tool === 'ch2' || tool === 'sa' || tool === 'dm' ? LEAD_TAG[tool] : null;
  return (
    <Section title={`工具：${TOOL_NAME[tool]}`}>
      <p style={help}>{TOOL_HINT[tool]}</p>
      {lead && leadEnd !== null && <p style={{ ...help, color: T.value }}>請點要把 {lead} {leadEnd === 0 ? '+ 端' : '− 端'}改接到的孔（Esc 取消）</p>}
      {lead && leadEnd === null && !pending && <p style={{ ...help, color: T.value }}>第 1 步：點 {lead} 的 + 端（{tool === 'fg' ? '紅線' : tool === 'sa' || tool === 'dm' ? '紅棒' : '探針'}）要接的孔</p>}
      {lead && leadEnd === null && pending && <p style={{ ...help, color: T.value }}>+ 端已接在 {holeName(pending)}；第 2 步：點 {lead} 的 − 端（{tool === 'fg' ? '黑線' : tool === 'sa' || tool === 'dm' ? '黑棒' : '接地夾'}）要接的孔（Esc 取消）</p>}
      {!lead && pending && <p style={{ ...help, color: T.value }}>已選第一點 {holeName(pending)}，請點第二點（Esc 取消）</p>}
      {message && <div style={warn}>{message}</div>}
    </Section>
  );
}

export function DmmCard() {
  const dmm = useBoard((s) => s.dmm);
  const black = useBoard((s) => s.dmmBlack);
  useBench(); // 電路或產生器改變時重新讀值
  const v = dmmReading(dmm, black);
  const small = { ...chip(false), flex: 'none', padding: '1px 8px', fontSize: 11 };
  const where = (h: string | null) => (h ? holeName(h) : '未插');
  return (
    <Section title="三用電表（DC V）" right={dmm || black ? (
      <button style={small} onClick={() => useBoard.setState({ dmm: null, dmmBlack: null, probeSide: 'red' })}>拔掉探棒</button>
    ) : undefined}>
      <div style={dmmBox}>{dmm && black ? (v === null ? '----' : `${v.toFixed(3)} V`) : '— — —'}</div>
      <div style={{ ...help, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span><b style={{ color: '#ff5a4a' }}>● 紅棒</b>：{where(dmm)}</span>
        <span><b style={{ color: '#c8c8c8' }}>● 黑棒</b>：{where(black)}
          {black !== 'p:GND' && <button style={{ ...small, marginLeft: 6 }} onClick={() => useBoard.setState({ dmmBlack: 'p:GND' })}>插回 GND</button>}
        </span>
        {dmm && black && v === null && <span style={{ color: '#ffd9a0' }}>探棒插的點沒有接到電路（讀不到電壓）</span>}
        {(!dmm || !black) && <span>左側選「三用電表」後點孔：{!dmm ? '先放紅棒' : '再放黑棒'}</span>}
      </div>
    </Section>
  );
}

export function PartCard({ part }: { part: BoardPart }) {
  if (isAnalog(part)) return <AnalogCard part={part} />;
  return part.kind === 'atmega' || part.kind === 'ch340' ? <ChipCard part={part} /> : <SimplePartCard part={part} />;
}

function SimplePartCard({ part }: { part: BoardPart }) {
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
  } else if (part.kind === 'led') {
    const i = r?.i ?? 0;
    rows = [['Vf', `${(r?.v ?? 0).toFixed(3)} V`], ['電流', `${(i * 1000).toFixed(2)} mA`, i > LED_IMAX ? '#ff4d3a' : undefined],
      ['功率', `${((r?.p ?? 0) * 1000).toFixed(1)} mW`], ['亮度', `${Math.round(Math.min(1, Math.max(0, i) / 0.02) * 100)} %`]];
    [status, statusColor] = i > LED_IMAX ? ['電流超過 30 mA，LED 會過熱燒毀（加限流電阻）', '#ff4d3a']
      : i > 0.0005 ? ['發光中', '#3cff7a'] : (r?.v ?? 0) < -1 ? ['反接（不亮）', '#ffb020'] : ['不亮', '#8fb4d0'];
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
    status = part.kind === 'led' ? '燒毀（開路）' : part.kind === 'ldo' ? `損壞（輸入超過 ${LDO_VIN_MAX} V）` : part.kind === 'diode' ? '燒毀（短路）' : '燒毀（開路）';
    statusColor = '#ff4d3a';
  }

  return (
    <Section title={`選取：${partLabel(part)}`}>
      <div style={{ ...dmmBox, fontSize: 13, color: statusColor, textAlign: 'left' }}>{status}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
        {rows.map(([k, v, c]) => (
          <Stat key={k} k={k} v={v} color={c} />
        ))}
        {part.kind !== 'wire' && (
          <Stat k="溫度" v={`${temp} °C`} color={temp > 120 ? '#ff8a1f' : undefined} />
        )}
      </div>
      {part.kind === 'ldo' && (
        <div style={help}>
          腳位：1 GND {holeName(part.pins[0])}・2 OUT {holeName(part.pins[1])}・3 IN {holeName(part.pins[2])}
        </div>
      )}
      {part.kind === 'resistor' && (
        <ResistorInput id={`r-${part.id}`} value={part.value!}
          onChange={(r) => useBoard.setState((st) => ({ parts: st.parts.map((q) => (q.id === part.id ? { ...q, value: r } : q)) }))} />
      )}
      {part.kind !== 'wire' && part.kind !== 'ldo' && (
        <div style={help}>
          {part.kind !== 'resistor' ? '陽極 ' : ''}{holeName(part.pins[0])} → {part.kind !== 'resistor' ? '陰極 ' : ''}{holeName(part.pins[1])}
          {part.kind !== 'resistor' ? '' : `　燒毀溫度約 ${THERMAL.resistor.burn} °C`}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        {part.burnt && <button style={chip(false, '', '#5a4a1a')} onClick={() => s.replacePart(part.id)}>更換新零件</button>}
        <button style={chip(false, '', '#5a2030')} onClick={() => s.removePart(part.id)}>刪除</button>
        <button style={chip(false)} onClick={() => s.selectPart(null)}>取消選取</button>
      </div>
    </Section>
  );
}

const dmmBox: CSSProperties = {
  background: '#06120c', border: '1px solid #1f5a3a', borderRadius: 6, padding: '6px 10px',
  fontFamily: T.mono, color: '#7dffb0', fontSize: 22, textAlign: 'right', letterSpacing: 1,
};
