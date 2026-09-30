// 「編譯」Quartus 專案（Analysis & Synthesis + Fitter 的模擬版）：
//   .v 原始碼 → 展開成電路（verilogElab）、.qsf → 腳位指定，檢查型號、腳位衝突，產生可以燒進板子的「位元流映像」
import { HdlError } from './verilogLang.js';
import { elaborate, type Design } from './verilogElab.js';
import { parseQsf, DEVICE, deviceCompat } from './qsf.js';
import { RES_BY_PIN, type Res } from './fpgaBoard.js';

export interface FpgaFile { name: string; text: string | null; size: number; device?: string | null } // text = null → 二進位檔（.sof / .pof）
export interface PinBit { port: number; sig: number; off: number; name: string; pin: number; res?: Res; dir: 'input' | 'output' }
export interface ReportLine { sev: 'info' | 'warn' | 'error'; msg: string; file?: string; line?: number }
export interface Image { name: string; top: string; design: Design; bits: PinBit[]; files: FpgaFile[] }
export interface Build { ok: boolean; image: Image | null; report: ReportLine[]; top: string; at: number }

export const ext = (name: string) => (/\.([^.]+)$/.exec(name)?.[1] ?? '').toLowerCase();
export const baseName = (name: string) => name.replace(/\.[^.]+$/, '');
export const isHdl = (n: string) => ['v', 'sv', 'vh', 'vlg', 'verilog'].includes(ext(n));

/** 各種不支援的 Quartus 檔案：告訴使用者怎麼轉 */
const UNSUPPORTED: Record<string, string> = {
  vhd: 'VHDL 尚未支援：請改寫成 Verilog，或在 Quartus 以 Verilog 重新產生',
  vhdl: 'VHDL 尚未支援：請改寫成 Verilog，或在 Quartus 以 Verilog 重新產生',
  bdf: '電路圖檔（.bdf）請在 Quartus 用 File → Create / Update → Create HDL Design File from Current File 轉成 Verilog（.v）再上傳',
  gdf: 'MAX+PLUS II 圖形檔（.gdf）請先在 Quartus 轉成 Verilog（.v）',
  tdf: 'AHDL（.tdf）尚未支援：請改寫成 Verilog',
};

/** 埠的某一位元在 .qsf 裡的名字：led[3]；1 位元的純量埠就是 clk */
const bitName = (p: Design['ports'][number], off: number) => {
  if (p.width === 1 && p.lsb === 0 && !p.asc) return [p.name, `${p.name}[0]`];
  return [`${p.name}[${p.asc ? p.lsb - off : p.lsb + off}]`];
};

/** prefer：有多個 .qsf 時優先用這個檔名（不含副檔名）的，例如燒 blink.sof 就用 blink.qsf */
export function buildProject(files: FpgaFile[], topOverride = '', prefer = ''): Build {
  const report: ReportLine[] = [];
  const info = (msg: string) => report.push({ sev: 'info', msg });
  const warn = (msg: string, file?: string, line?: number) => report.push({ sev: 'warn', msg, file, line });
  const err = (msg: string, file?: string, line?: number) => report.push({ sev: 'error', msg, file, line });
  const done = (image: Image | null, top: string): Build => ({ ok: !!image && !report.some((r) => r.sev === 'error'), image, report, top, at: Date.now() });

  for (const f of files) if (UNSUPPORTED[ext(f.name)]) err(UNSUPPORTED[ext(f.name)], f.name);
  const qsfFiles = files.filter((f) => ext(f.name) === 'qsf' && f.text !== null);
  const pick = qsfFiles.findIndex((f) => baseName(f.name) === prefer);
  if (pick > 0) qsfFiles.unshift(...qsfFiles.splice(pick, 1));
  if (qsfFiles.length > 1) warn(`有 ${qsfFiles.length} 個 .qsf，這次使用 ${qsfFiles[0].name}（跟目前開啟 / 燒錄的檔案同名的優先）`);
  const qsf = qsfFiles[0] ? parseQsf(qsfFiles[0].text!) : null;
  qsf?.warnings.forEach((w) => warn(w, qsfFiles[0].name));

  // 元件型號
  if (qsf?.device) {
    const c = deviceCompat(qsf.device);
    if (c === 'bad') err(`專案的元件是 ${qsf.device}，這塊板子是 ${DEVICE}：請在 Quartus 的 Assignments → Device 改成 ${DEVICE}`, qsfFiles[0].name);
    else if (c === 'speed') warn(`元件速度等級 ${qsf.device} 與板子 ${DEVICE} 不同，時序可能不一樣`);
  } else if (qsf) warn(`.qsf 沒有指定 DEVICE，假設是 ${DEVICE}`);
  if (qsf?.family && !/flex\s*10k/i.test(qsf.family)) warn(`.qsf 的 FAMILY 是 ${qsf.family}，這塊板子是 FLEX10KE`);

  const src = files.filter((f) => isHdl(f.name) && f.text !== null).map((f) => ({ name: f.name, text: f.text! }));
  const top = topOverride || qsf?.top || '';
  if (!src.length) { err('專案裡沒有 Verilog 原始碼（.v）'); return done(null, top); }
  if (report.some((r) => r.sev === 'error')) return done(null, top);

  info(`Analysis & Synthesis：${src.map((f) => f.name).join('、')}`);
  let design: Design;
  try {
    design = elaborate(src, top || undefined);
  } catch (e) {
    if (e instanceof HdlError) err(e.message, e.file, e.line);
    else err(String(e));
    return done(null, top);
  }
  design.warnings.forEach((w) => warn(w));
  info(`最上層實體：${design.top}（${design.modules.join('、')}）・${design.sigs.length} 個訊號、${design.blocks.length} 個時序區塊`);
  const ffBits = design.sigs.filter((s) => s.isReg).reduce((n, s) => n + s.width, 0);
  info(`暫存器約 ${ffBits} 位元（EPF10K50E 有 2880 個邏輯單元）`);
  if (ffBits > 2880) err(`設計太大：需要約 ${ffBits} 個正反器，超過 EPF10K50E 的 2880 個邏輯單元`);

  // Fitter：腳位
  const bits: PinBit[] = [];
  const pins = qsf?.pins ?? {};
  const usedPin = new Map<number, string>();
  const known = new Set<string>();
  design.ports.forEach((p, pi) => {
    if (p.dir === 'inout') { warn(`雙向埠 ${p.name}（inout）尚未支援，會保持高阻抗`); return; }
    for (let off = 0; off < p.width; off++) {
      const names = bitName(p, off);
      names.forEach((n) => known.add(n));
      const nm = names.find((n) => n in pins);
      if (!nm) {
        if (p.dir === 'output') warn(`輸出 ${names[0]} 沒有指定腳位（Quartus 會自動分配到沒接東西的腳）`);
        else warn(`輸入 ${names[0]} 沒有指定腳位，當作 0`);
        continue;
      }
      const pin = pins[nm];
      if (pin < 1 || pin > 240) { err(`${nm}：PIN_${pin} 不存在（EPF10K50EQC240 只有 PIN_1 ~ PIN_240）`); continue; }
      if (usedPin.has(pin)) { err(`PIN_${pin} 同時指定給 ${usedPin.get(pin)} 和 ${nm}`); continue; }
      usedPin.set(pin, nm);
      const res = RES_BY_PIN.get(pin);
      if (!res) warn(`${nm} → PIN_${pin}：這隻腳在板子上沒有接任何東西`);
      else if (p.dir === 'output' && res.dir === 'in') { err(`輸出 ${nm} 被指定到 PIN_${pin}（${res.label}），那是輸入裝置的腳，會跟它對撞`); continue; }
      else if (p.dir === 'input' && res.dir === 'out') warn(`輸入 ${nm} 被指定到 PIN_${pin}（${res.label}），那隻腳接的是輸出裝置，讀到的會是 1`);
      bits.push({ port: pi, sig: p.sig, off, name: nm, pin, res, dir: p.dir });
    }
  });
  for (const n of Object.keys(pins)) if (!known.has(n)) warn(`.qsf 指定了 ${n}，但最上層實體 ${design.top} 沒有這個埠`);
  const clk = bits.filter((b) => b.res && (b.res.kind === 'clk50' || b.res.kind === 'clkslow'));
  for (const c of clk) if (design.ports[c.port].width !== 1) warn(`時脈 ${c.name} 在多位元的埠上，會當成一般輸入（時脈請用 1 位元的埠）`);
  info(`Fitter：${bits.length} 個 I/O 已配置${clk.length ? `・時脈 ${clk.map((c) => `${c.name}（${c.res!.label}）`).join('、')}` : '・沒有接任何時脈'}`);

  const ok = !report.some((r) => r.sev === 'error');
  if (ok) info(`Assembler：產生 ${design.top}.sof / ${design.top}.pof`);
  const snapshot = files.filter((f) => f.text !== null && (isHdl(f.name) || ext(f.name) === 'qsf'));
  return done(ok ? { name: design.top, top: design.top, design, bits, files: snapshot } : null, design.top);
}
