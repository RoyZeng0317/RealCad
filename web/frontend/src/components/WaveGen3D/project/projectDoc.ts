// 專案內容 ↔ 各 store：存檔時收集、開檔時「逐欄驗證後」才寫回（別人給的 .rc 檔也不會塞進奇怪的資料）
import { useWaveLab } from '../waveStore.js';
import { useSa, SA_DEFAULT } from '../saStore.js';
import { RBW_CHOICES, SA_FMAX } from '../spectrum.js';
import { usePsuLab } from '../psuStore.js';
import { useBoard, type Leads } from '../boardStore.js';
import { useDev, type DevConf } from '../devboards/devStore.js';
import { DEV_KINDS, DEV_BOARDS, type DevKind } from '../devboards/boardDefs.js';
import { useFpga, exampleConf, MAX_FILE, type FpgaConf } from '../devboards/fpga/fpgaStore.js';
import { SLOW_CLOCKS } from '../devboards/fpga/fpgaBoard.js';
import type { FpgaFile } from '../devboards/fpga/fpgaBuild.js';
import { isValidHole } from '../boardModel.js';
import { useChips } from '../chips/chipStore.js';
import { LOAD_STEPS } from '../psu.js';
import { TIME_DIVS, VOLT_DIVS, type Waveform } from '../waveform.js';
import {
  DIODE_MODELS, LED_COLORS, WIRE_COLORS, RESISTOR_VALUES, R_MIN, R_MAX, type BoardPart, type PartKind,
  POT_VALUES, IND_VALUES, CAP_MODEL_IDS, BJT_MODEL_IDS,
} from '../boardParts.js';

export const DOC_FORMAT = 'realcad-lab';
export const DOC_VERSION = 1;

export interface LabDoc {
  format: typeof DOC_FORMAT;
  version: number;
  name: string;
  savedAt: string;
  gen: unknown; scope: unknown; psu: unknown;
  load: { idx: number; burnt: boolean };
  board: { parts: BoardPart[]; dmm: string | null; dmmBlack?: string | null; leads?: Leads };
  dev: Record<DevKind, DevConf>;
  fpga?: FpgaConf;
  sa?: unknown; // 頻譜分析儀設定（舊檔沒有 → 用預設值）
}

export function collectDoc(name: string): LabDoc {
  const w = useWaveLab.getState(), p = usePsuLab.getState(), b = useBoard.getState(), d = useDev.getState();
  return {
    format: DOC_FORMAT, version: DOC_VERSION, name, savedAt: new Date().toISOString(),
    gen: w.gen, scope: w.scope, psu: p.psu,
    load: { idx: p.loadIdx, burnt: p.burnt },
    board: { parts: b.parts, dmm: b.dmm, dmmBlack: b.dmmBlack, leads: b.leads },
    dev: d.conf,
    sa: useSa.getState().sa,
    fpga: (({ files, active, top, slowHz, sw, epc, slides, sdCard, tfCard, speaker }) =>
      ({ files, active, top, slowHz, sw, epc, slides, sdCard, tfCard, speaker }))(useFpga.getState()),
  };
}

// ---- 驗證小工具 ----
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const num = (v: unknown, lo: number, hi: number, dflt: number) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);
const int = (v: unknown, lo: number, hi: number, dflt: number) => Math.round(num(v, lo, hi, dflt));
const bool = (v: unknown, dflt: boolean) => (typeof v === 'boolean' ? v : dflt);
const str = (v: unknown, max: number, dflt = '') => (typeof v === 'string' ? v.slice(0, max) : dflt);
const oneOf = <T extends string>(v: unknown, list: readonly T[], dflt: T): T => (list.includes(v as T) ? (v as T) : dflt);

const PIN_COUNT: Record<PartKind, number> = { resistor: 2, diode: 2, led: 2, wire: 2, ldo: 3, atmega: 28, ch340: 16, pot: 3, cap: 2, ind: 2, bjt: 3 };

function cleanParts(raw: unknown, present: Record<DevKind, boolean>): BoardPart[] {
  if (!Array.isArray(raw)) return [];
  const out: BoardPart[] = [];
  const ids = new Set<string>();
  const used = new Set<string>();
  for (const r of raw.slice(0, 2000)) {
    const o = obj(r);
    const kind = oneOf(o.kind, ['resistor', 'diode', 'led', 'ldo', 'wire', 'atmega', 'ch340', 'pot', 'cap', 'ind', 'bjt'] as const, 'wire');
    if (o.kind !== kind) continue;
    const pins = Array.isArray(o.pins) ? o.pins.map((x) => str(x, 40)) : [];
    if (pins.length !== PIN_COUNT[kind] || !pins.every(isValidHole)) continue;
    // 開發板沒放上桌就不能接線到它的排針；每個孔只能插一隻腳（接線柱除外）
    if (pins.some((h) => h.startsWith('h:') && !present[h.split(':')[1] as DevKind])) continue;
    if (pins.some((h) => !h.startsWith('p:') && used.has(h))) continue;
    let id = str(o.id, 64) || `${kind}-${out.length}`;
    while (ids.has(id)) id += '_';
    const p: BoardPart = { id, kind, pins, gen: 0, burnt: bool(o.burnt, false) };
    if (kind === 'resistor') p.value = RESISTOR_VALUES.includes(o.value as number) ? (o.value as number) : num(o.value, R_MIN, R_MAX, 330);
    if (kind === 'diode') p.model = oneOf(o.model, DIODE_MODELS, '1N4007');
    if (kind === 'led') p.ledColor = oneOf(o.ledColor, LED_COLORS, 'red');
    if (kind === 'pot') { p.value = POT_VALUES.includes(o.value as number) ? (o.value as number) : 10e3; p.pos = num(o.pos, 0, 1, 0.5); }
    if (kind === 'cap') p.capModel = oneOf(o.capModel, CAP_MODEL_IDS, '100u50');
    if (kind === 'ind') p.value = IND_VALUES.includes(o.value as number) ? (o.value as number) : 1e-3;
    if (kind === 'bjt') p.bjtModel = oneOf(o.bjtModel, BJT_MODEL_IDS, '2N3904');
    if (kind === 'atmega') { p.code = str(o.code, 100_000, ''); p.flash = str(o.flash, 100_000, ''); }
    if (kind === 'wire') p.color = typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : WIRE_COLORS[0];
    ids.add(id);
    pins.forEach((h) => used.add(h));
    out.push(p);
  }
  return out;
}

/** FPGA 專案檔：檔名只留安全字元，.sof / .pof 只存大小與型號（內容本來就沒有讀進來） */
function cleanFiles(raw: unknown): FpgaFile[] {
  if (!Array.isArray(raw)) return [];
  const out: FpgaFile[] = [];
  for (const r of raw.slice(0, 64)) {
    const o = obj(r);
    const name = str(o.name, 120).replace(/[^\w.\-\u4e00-\u9fff ]/g, '_');
    if (!name || out.some((f) => f.name === name)) continue;
    const text = typeof o.text === 'string' ? o.text.slice(0, MAX_FILE) : null;
    out.push({ name, text, size: int(o.size, 0, 1e9, text?.length ?? 0), device: typeof o.device === 'string' ? str(o.device, 40) : null });
  }
  return out;
}
function cleanFpga(raw: unknown): FpgaConf {
  if (raw === undefined) return exampleConf();
  const o = obj(raw);
  const files = cleanFiles(o.files);
  const e = o.epc === null ? null : obj(o.epc);
  const epcFiles = e ? cleanFiles(e.files) : [];
  return {
    files, active: files.some((f) => f.name === o.active) ? (o.active as string) : files[0]?.name ?? '',
    top: str(o.top, 80).replace(/[^\w$]/g, ''), slowHz: SLOW_CLOCKS.includes(o.slowHz as number) ? (o.slowHz as number) : 2,
    sw: int(o.sw, 0, 255, 0),
    slides: int(o.slides, 0, 3, 0), sdCard: bool(o.sdCard, false), tfCard: bool(o.tfCard, false), speaker: bool(o.speaker, true),
    epc: e && epcFiles.length ? { files: epcFiles, top: str(e.top, 80).replace(/[^\w$]/g, ''), name: str(e.name, 80) || 'design' } : null,
  };
}

/** 驗證並套用；回傳專案名稱 */
export function applyDoc(raw: unknown): string {
  const d = obj(raw);
  if (d.format !== DOC_FORMAT) throw new Error('檔案內容不是 RealCad Lab 專案');

  // 函數波產生器 / 示波器（setGen 會自己夾限範圍）
  const g = obj(d.gen);
  const w = useWaveLab.getState();
  w.setGen({
    frequency: num(g.frequency, 0.1, 10e6, 1000), amplitude: num(g.amplitude, 0.002, 20, 4),
    offset: num(g.offset, -10, 10, 0), duty: num(g.duty, 1, 99, 25),
    output: bool(g.output, true), power: bool(g.power, true),
  });
  w.setWaveform(oneOf(g.waveform, ['sine', 'square', 'triangle', 'ramp', 'pulse', 'noise'] as Waveform[], 'sine'));
  const s = obj(d.scope);
  w.setScope({
    timeDivIdx: int(s.timeDivIdx, 0, TIME_DIVS.length - 1, w.scope.timeDivIdx),
    voltDivIdx: int(s.voltDivIdx, 0, VOLT_DIVS.length - 1, w.scope.voltDivIdx),
    position: num(s.position, -4, 4, 0), trigLevel: num(s.trigLevel, -30, 30, 0),
    running: bool(s.running, true), coupling: oneOf(s.coupling, ['DC', 'AC'] as const, 'DC'),
    ch2On: bool(s.ch2On, true), ch2VoltDivIdx: int(s.ch2VoltDivIdx, 0, VOLT_DIVS.length - 1, w.scope.ch2VoltDivIdx),
    ch2Position: num(s.ch2Position, -4, 4, -3), trigSource: oneOf(s.trigSource, ['CH1', 'CH2'] as const, 'CH1'),
  });

  // 頻譜分析儀
  const a = obj(d.sa);
  const sp = num(a.span, 10, SA_FMAX, SA_DEFAULT.span);
  useSa.setState({ sa: {
    center: num(a.center, 0, SA_FMAX, SA_DEFAULT.center), span: sp, ref: num(a.ref, -80, 40, SA_DEFAULT.ref),
    rbw: a.rbw === 0 || RBW_CHOICES.includes(a.rbw as number) ? (a.rbw as number) : 0,
    unit: oneOf(a.unit, ['dBm', 'dBV'] as const, 'dBm'), z50: bool(a.z50, true), running: bool(a.running, true),
    marker: a.marker === null || a.marker === undefined ? null : num(a.marker, 0, SA_FMAX, 0),
  } });

  // 電源與負載
  const ps = obj(d.psu), load = obj(d.load);
  const p = usePsuLab.getState();
  p.setPsu({ vSet: num(ps.vSet, 0, 30, 5), iSet: num(ps.iSet, 0, 5, 1), output: bool(ps.output, false), power: bool(ps.power, true) });
  p.setLoadIdx(int(load.idx, 0, LOAD_STEPS.length - 1, LOAD_STEPS.indexOf(10)));
  p.replaceResistor();
  if (bool(load.burnt, false)) usePsuLab.setState({ burnt: true });

  // 開發板（先放板子，接到排針的線才驗證得過）
  const dv = obj(d.dev);
  const conf = Object.fromEntries(DEV_KINDS.map((k) => {
    const c = obj(dv[k]);
    return [k, { present: bool(c.present, false), usb: bool(c.usb, true), code: str(c.code, 100_000, DEV_BOARDS[k].example) }];
  })) as Record<DevKind, DevConf>;
  useDev.getState().loadConf(conf);
  useFpga.getState().loadConf(cleanFpga(d.fpga));

  // 麵包板
  const b = obj(d.board);
  const present = Object.fromEntries(DEV_KINDS.map((k) => [k, conf[k].present])) as Record<DevKind, boolean>;
  const parts = cleanParts(b.parts, present);
  useChips.setState({ rt: {}, tab: null }); // 麵包板 IC 的執行狀態從頭開始（Flash 內容跟著零件存在專案裡）
  useBoard.getState().loadParts(parts);
  const dmm = typeof b.dmm === 'string' && isValidHole(b.dmm) ? b.dmm : null;
  // 舊檔沒有黑棒位置：當時黑棒固定接 GND
  const dmmBlack = b.dmmBlack === null ? null : typeof b.dmmBlack === 'string' && isValidHole(b.dmmBlack) ? b.dmmBlack : 'p:GND';
  // 儀器接到麵包板的線：兩端都要是合法的孔
  const rl = obj(b.leads);
  const lead = (v: unknown): [string, string] | null =>
    Array.isArray(v) && v.length === 2 && v.every((h) => typeof h === 'string' && isValidHole(h)) ? [v[0], v[1]] : null;
  const leads: Leads = { fg: lead(rl.fg), ch1: lead(rl.ch1), ch2: lead(rl.ch2), sa: lead(rl.sa) };
  useBoard.setState({ dmm, dmmBlack, probeSide: 'red', leads, tool: 'select', temps: {}, tsd: {}, message: '' });

  return str(d.name, 100, '未命名專案') || '未命名專案';
}
