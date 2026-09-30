// FPGA 實驗板狀態：Quartus 專案檔、編譯結果、Programmer（JTAG → SRAM / EPC2 設定晶片）、板上開關按鍵與時脈
//   FPGA 是 SRAM 架構：JTAG 燒進去的電路斷電就消失；燒進 EPC2（.pof）的會在每次上電時自動載入
import { create } from 'zustand';
import { buildProject, ext, baseName, type Build, type FpgaFile, type Image } from './fpgaBuild.js';
import { sniffDevice, deviceCompat, DEVICE } from './qsf.js';
import { EXAMPLE_FILES } from './fpgaBoard.js';

export type ProgMode = 'jtag' | 'as';
export interface Epc { files: FpgaFile[]; top: string; name: string }
export interface FpgaConf { files: FpgaFile[]; active: string; top: string; slowHz: number; sw: number; epc: Epc | null }
export interface ProgState { mode: ProgMode; source: string; progress: number | null; log: string[] }

export const MAX_FILE = 400_000;
export const exampleConf = (): FpgaConf => ({
  files: EXAMPLE_FILES().map((f) => ({ ...f, size: f.text.length })), active: 'counter.v', top: '', slowHz: 2, sw: 0, epc: null,
});

interface FpgaState extends FpgaConf {
  keys: number; // 目前按住的按鍵（bit i = KEYi 按下）
  build: Build | null;
  sram: Image | null; // FPGA 目前的電路（CONF_DONE = 1）
  nonce: number; // 每次重新設定 +1，執行期看到就重建模擬器
  prog: ProgState;
  runtimeError: string | null;
  stats: { rate: number; cycles: number; slowTicks: number };
  addFiles: (files: FpgaFile[]) => void;
  removeFile: (name: string) => void;
  setText: (name: string, text: string) => void;
  setActive: (name: string) => void;
  setTop: (top: string) => void;
  setSlowHz: (hz: number) => void;
  toggleSw: (i: number) => void;
  setKey: (i: number, down: boolean) => void;
  compile: (prefer?: string) => Build;
  setProg: (p: Partial<ProgState>) => void;
  program: (powered: boolean) => void;
  /** 上電（從 EPC2 載入）/ 斷電（SRAM 清空）/ 按 nCONFIG */
  powerChange: (on: boolean) => void;
  reconfigure: () => void;
  loadExample: () => void;
  loadConf: (c: FpgaConf) => void;
  patch: (p: Partial<FpgaState>) => void;
}

let timer: ReturnType<typeof setInterval> | null = null;
const imageFromEpc = (epc: Epc) => buildProject(epc.files, epc.top).image;

export const useFpga = create<FpgaState>((set, get) => ({
  ...exampleConf(),
  keys: 0,
  build: null,
  sram: null,
  nonce: 0,
  prog: { mode: 'jtag', source: 'build', progress: null, log: [] },
  runtimeError: null,
  stats: { rate: 0, cycles: 0, slowTicks: 0 },

  addFiles: (files) => set((s) => {
    const names = new Set(files.map((f) => f.name));
    const list = [...s.files.filter((f) => !names.has(f.name)), ...files];
    const firstText = files.find((f) => f.text !== null);
    // 上傳了 .sof / .pof 就把 Programmer 的來源切過去
    const bin = files.find((f) => ['sof', 'pof'].includes(ext(f.name)));
    return {
      files: list, active: firstText?.name ?? s.active,
      prog: bin ? { ...s.prog, source: bin.name, mode: ext(bin.name) === 'pof' ? 'as' : 'jtag' } : s.prog,
    };
  }),
  removeFile: (name) => set((s) => {
    const files = s.files.filter((f) => f.name !== name);
    return { files, active: s.active === name ? files.find((f) => f.text !== null)?.name ?? '' : s.active, prog: s.prog.source === name ? { ...s.prog, source: 'build' } : s.prog };
  }),
  setText: (name, text) => set((s) => ({ files: s.files.map((f) => (f.name === name ? { ...f, text, size: text.length } : f)) })),
  setActive: (active) => set({ active }),
  setTop: (top) => set({ top }),
  setSlowHz: (slowHz) => set({ slowHz }),
  toggleSw: (i) => set((s) => ({ sw: s.sw ^ (1 << i) })),
  setKey: (i, down) => set((s) => ({ keys: down ? s.keys | (1 << i) : s.keys & ~(1 << i) })),
  compile: (prefer) => {
    const b = buildProject(get().files, get().top, prefer ?? baseName(get().active));
    set({ build: b });
    return b;
  },
  setProg: (p) => set((s) => ({ prog: { ...s.prog, ...p } })),

  program: (powered) => {
    const s = get();
    if (s.prog.progress !== null) return;
    const log: string[] = ['硬體：USB-Blaster [USB-0]', `模式：${s.prog.mode === 'jtag' ? 'JTAG（FPGA SRAM）' : 'Active Serial（EPC2 設定晶片）'}`];
    const fail = (m: string) => set((st) => ({ prog: { ...st.prog, log: [...log, `✖ ${m}`] } }));
    if (!powered) return fail('找不到裝置：板子沒有上電（JTAG 鏈上沒有回應）');
    // 來源：這次編譯的結果，或上傳的 .sof / .pof
    let image: Image | null = null;
    const src = s.prog.source;
    if (src === 'build') {
      const b = s.build && s.build.image ? s.build : get().compile();
      if (!b.ok || !b.image) return fail('編譯失敗，沒有可以燒錄的檔案（看「編譯報告」）');
      image = b.image;
      log.push(`檔案：output_files/${image.name}.${s.prog.mode === 'jtag' ? 'sof' : 'pof'}`);
    } else {
      const f = s.files.find((x) => x.name === src);
      if (!f) return fail(`找不到 ${src}`);
      const e = ext(f.name);
      if (s.prog.mode === 'jtag' && e !== 'sof') return fail(`JTAG 模式要用 .sof（${f.name} 請改用 Active Serial 模式）`);
      if (s.prog.mode === 'as' && e !== 'pof') return fail(`Active Serial 模式要用 .pof（${f.name} 請改用 JTAG 模式）`);
      log.push(`檔案：${f.name}（${(f.size / 1024).toFixed(1)} KB）`);
      if (f.device) {
        const c = deviceCompat(f.device);
        if (c === 'bad') return fail(`元件不符：檔案是給 ${f.device}，板子上是 ${DEVICE}`);
        log.push(`元件：${f.device}${c === 'speed' ? '（速度等級不同，仍可燒錄）' : ''}`);
      } else log.push('元件：檔案裡沒有找到型號，略過檢查');
      // .sof / .pof 是 Intel 的封閉格式，模擬器用同一專案的 Verilog 原始碼重建電路
      const b = get().compile(baseName(f.name));
      if (!b.ok || !b.image) return fail('需要同一個 Quartus 專案的 .v 原始碼與 .qsf 一起上傳，模擬器才能重建電路（看「編譯報告」）');
      image = b.image;
      log.push(`由原始碼重建電路：${image.top}`);
    }
    const img = image;
    const total = s.prog.mode === 'jtag' ? 12 : 30;
    let step = 0;
    set((st) => ({ prog: { ...st.prog, progress: 0, log } }));
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      step++;
      const st = get();
      if (step < total) { set({ prog: { ...st.prog, progress: step / total } }); return; }
      clearInterval(timer!);
      timer = null;
      if (st.prog.mode === 'jtag') {
        set({ sram: img, nonce: st.nonce + 1, runtimeError: null, prog: { ...st.prog, progress: null, log: [...st.prog.log, '✔ Configure 成功（100%）・CONF_DONE = 1・斷電後會消失'] } });
      } else {
        set({ epc: { files: img.files, top: img.top, name: img.name }, prog: { ...st.prog, progress: null, log: [...st.prog.log, '✔ Program / Verify 成功（100%）・重新上電或按 nCONFIG 後 FPGA 會從 EPC2 載入'] } });
      }
    }, 100);
  },

  powerChange: (on) => {
    const s = get();
    if (!on) { if (s.sram) set({ sram: null, runtimeError: null }); return; }
    if (s.epc) set({ sram: imageFromEpc(s.epc), nonce: s.nonce + 1, runtimeError: null });
  },
  reconfigure: () => {
    const s = get();
    set({ sram: s.epc ? imageFromEpc(s.epc) : null, nonce: s.nonce + 1, runtimeError: null });
  },
  loadExample: () => set({ ...exampleConf(), build: null }),
  loadConf: (c) => set((s) => ({ ...c, build: null, sram: null, nonce: s.nonce + 1, runtimeError: null, keys: 0, prog: { mode: 'jtag', source: 'build', progress: null, log: [] } })),
  patch: (p) => set(p),
}));

/** 讀使用者選的檔案：文字檔讀內容，.sof / .pof 只記大小與裡面記錄的元件型號 */
export async function readFpgaFiles(list: FileList | File[]): Promise<{ files: FpgaFile[]; skipped: string[] }> {
  const files: FpgaFile[] = [], skipped: string[] = [];
  for (const f of Array.from(list)) {
    const e = ext(f.name);
    if (['sof', 'pof'].includes(e)) {
      const buf = new Uint8Array(await f.arrayBuffer());
      files.push({ name: f.name, text: null, size: f.size, device: sniffDevice(buf) });
    } else if (['v', 'sv', 'vh', 'vlg', 'verilog', 'qsf', 'qpf', 'vhd', 'vhdl', 'bdf', 'gdf', 'tdf', 'txt'].includes(e)) {
      if (f.size > MAX_FILE) { skipped.push(`${f.name}（超過 ${MAX_FILE / 1000} KB）`); continue; }
      files.push({ name: f.name, text: await f.text(), size: f.size });
    } else skipped.push(`${f.name}（不支援的檔案類型）`);
  }
  return { files, skipped };
}
