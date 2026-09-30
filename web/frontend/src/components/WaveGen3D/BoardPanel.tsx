// 麵包板操作介面：左側元件庫（零件/工具/範例）、右側檢視器（三用電表、選取零件的工作點）
import { useEffect, type CSSProperties } from 'react';
import { useBoard, type Tool } from './boardStore.js';
import { ChipCard } from './chips/ChipPanels.js';
import { ResistorInput } from './ResistorInput.js';
import { loadAtmegaDemo } from './chips/chipDemo.js';
import { useBench } from './bench.js';
import { dmmReading } from './scopeLink.js';
import { holeName } from './boardModel.js';
import {
  DIODE_MODELS, DIODE_PIV, RESISTOR_RATING, WIRE_COLORS, THERMAL, LDO_VIN_MAX,
  partLabel, LED_COLORS, LED_SPEC, LED_IMAX, type BoardPart,
} from './boardParts.js';
import { loadDemoCircuit, loadUnoBlink, loadEsp32Mistake, loadPi5Blink, loadRectifierDemo } from './boardDemo.js';
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
  fg: '函數產生器輸出線：先點紅色 +（訊號）要插的孔，再點黑色 −（地）要插的孔。產生器輸出內阻 50 Ω。',
  ch1: '示波器 CH1 探棒：先點探針要勾的孔（量這一點），再點接地夾要夾的孔（通常是 GND）。',
  ch2: '示波器 CH2 探棒：先點探針要勾的孔（量這一點），再點接地夾要夾的孔（通常是 GND）。',
};

export const TOOL_NAME: Record<Tool, string> = {
  select: '選取', erase: '刪除', probe: '三用電表', wire: '杜邦線', resistor: '電阻', diode: '二極體', led: 'LED', ldo: 'LT1117-3.3', atmega: 'ATmega328P', ch340: 'CH340G',
  fg: '函數產生器輸出線', ch1: '示波器 CH1 探棒', ch2: '示波器 CH2 探棒',
};

/**
 * 單鍵快捷鍵對應的字母。先看 e.key（一般英文輸入）；中文輸入法開著時 e.key 會變成 "Process"（keyCode 229），
 * 這時改看實體按鍵位置 e.code（KeyS / KeyW / KeyX），所以英文鍵盤、中文輸入法的英文或中文模式都能用。
 */
export function shortcutLetter(e: KeyboardEvent): string {
  if (e.key && e.key.length === 1 && /[a-z]/i.test(e.key)) return e.key.toLowerCase();
  const m = /^Key([A-Z])$/.exec(e.code ?? '');
  if (m) return m[1].toLowerCase();
  if (e.keyCode >= 65 && e.keyCode <= 90) return String.fromCharCode(e.keyCode).toLowerCase();
  return '';
}

/** 工具列與快捷鍵共用的動作 */
export const boardActions = {
  select: () => useBoard.getState().setTool('select'),
  wire: () => useBoard.getState().setTool('wire'),
  /** 刪除模式：按一下進入（再按一下離開），之後滑鼠點哪個零件就刪哪個，不用先選取 */
  remove: () => {
    const s = useBoard.getState();
    s.setTool(s.tool === 'erase' ? 'select' : 'erase');
  },
};

/**
 * 焦點是不是在「正在打字」的地方（文字輸入框、程式編輯器）：這時字母要打進去，不當快捷鍵。
 * 滑桿、下拉選單、按鈕、勾選框用完後焦點會留在上面，但不會打字，所以快捷鍵照樣要能用。
 */
const TEXT_INPUTS = new Set(['text', 'search', 'number', 'email', 'password', 'url', 'tel', '']);
export function isTyping(el: EventTarget | null): boolean {
  const h = el as HTMLElement | null;
  if (!h || !h.tagName) return false;
  if (h.isContentEditable || h.tagName === 'TEXTAREA') return true;
  return h.tagName === 'INPUT' && TEXT_INPUTS.has(((h as HTMLInputElement).getAttribute('type') ?? '').toLowerCase());
}

/** S 選取、W 杜邦線、X / Delete 刪除選取的零件、Esc 取消 */
export function useBoardKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const st = useBoard.getState();
      if (e.key === 'Escape') { st.endDrag(false); useBoard.setState({ pending: null, message: '', tool: 'select' }); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (st.selectedId) { e.preventDefault(); boardActions.remove(); } return; }
      const k = shortcutLetter(e);
      if (k === 's') { e.preventDefault(); boardActions.select(); }
      else if (k === 'w') { e.preventDefault(); boardActions.wire(); }
      else if (k === 'x') { e.preventDefault(); boardActions.remove(); }
    };
    // capture 階段：就算焦點在按鈕或 3D 畫面上也收得到
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}

interface LibItem { tool: Tool; name: string; sub: string; icon: string }
const PART_ITEMS: LibItem[] = [
  { tool: 'resistor', name: '電阻', sub: '碳膜 1/4 W・E12 10 Ω–1 MΩ', icon: '▭' },
  { tool: 'diode', name: '整流二極體', sub: '1N4001 – 1N4007・1 A', icon: '▷|' },
  { tool: 'led', name: 'LED', sub: '5 mm・紅 / 黃 / 綠 / 藍 / 白', icon: '◉' },
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
    <div style={{ display: 'flex', gap: 4 }}>
      {WIRE_COLORS.map((c) => (
        <button key={c} onClick={() => s.setParam({ wireColor: c })} style={{
          flex: 1, height: 22, borderRadius: 4, background: c, cursor: 'pointer',
          border: s.wireColor === c ? `2px solid ${T.accent}` : '1px solid #2a2a5a',
        }} />
      ))}
    </div>
  );
  if (s.tool === 'probe') return (
    <div style={row}>
      <button style={chip(s.probeSide === 'red', '#8a1f24')} onClick={() => s.setParam({ probeSide: 'red' })}>下一次放紅棒</button>
      <button style={chip(s.probeSide === 'black', '#3a3a44')} onClick={() => s.setParam({ probeSide: 'black' })}>下一次放黑棒</button>
    </div>
  );
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
  const { tool, pending, message } = useBoard();
  return (
    <Section title={`工具：${TOOL_NAME[tool]}`}>
      <p style={help}>{TOOL_HINT[tool]}</p>
      {pending && <p style={{ ...help, color: T.value }}>已選第一點 {holeName(pending)}，請點第二點（Esc 取消）</p>}
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
