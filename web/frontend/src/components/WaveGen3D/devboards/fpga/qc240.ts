// EPF10K50E 240-pin QFP（QC240）的 240 隻腳定義，以及元件規格（依 docs/dsf10k-1299404.md：FLEX 10K Data Sheet v4.2）
//
//   datasheet 給的規則（本檔照這些規則整理）：
//   - Table 1：EPF10K50 有 2,880 個 LE、360 個 LAB、10 個 EAB、20,480 RAM 位元（每個 EAB 2,048 位元）
//   - Table 4：240-pin QFP 最多 189 隻使用者 I/O（含 6 隻專用輸入）
//   - 「Dedicated Inputs」：6 隻專用輸入（全域時脈、清除、預設、輸出致能等控制訊號，含 ClockLock 一節的專用時脈腳 GCLK0 / GCLK1）；也可當一般資料輸入，但不能輸出
//   - DEV_CLRn（全晶片清除）、DEV_OE（全晶片輸出致能）是雙用途腳：沒開啟這兩個選項時就是一般 I/O
//   - Table 12 註 (1)：240-pin QFP 不支援 MultiVolt，沒有獨立的 VCCIO 腳（只有 VCC / GND）
//   - 設定腳（nCONFIG、nSTATUS、CONF_DONE、DCLK、DATA0、MSEL0/1、nCE、nCEO）與 JTAG（TCK、TMS、TDI、TDO、TRST）不是使用者 I/O
//
//   ⚠ datasheet 本身沒有逐腳的 QC240 pin-out 表（Altera 另外發 .pin 檔），所以「哪一號是 VCC / GND / 設定腳」是本實驗板依上面規則
//     自訂的，並且保證板上已經用到的腳（LED、七段、指撥開關、按鍵、J1…）都是 I/O。拿到官方 pin-out 時只要改這個檔案的表格即可。

export type PinType = 'io' | 'dual' | 'ded' | 'gclk' | 'vcc' | 'gnd' | 'config' | 'jtag';

/** 元件規格（datasheet Table 1、Table 4；時序見 timing 參數） */
export const SPEC = {
  les: 2880, labs: 360, eabs: 10, eabBits: 2048, ramBits: 20480, userIo: 189, pins: 240,
  /** EAB 可以設定成的寬 × 深（每種都是 2,048 位元） */
  eabShapes: [[1, 2048], [2, 1024], [4, 512], [8, 256]] as [number, number][],
};

export const VCC_PINS = [4, 16, 32, 42, 58, 70, 81, 93, 106, 120, 131, 145, 165, 170, 183, 195, 208, 221, 234];
export const GND_PINS = [6, 27, 35, 50, 59, 74, 87, 100, 112, 125, 137, 155, 169, 174, 189, 202, 214, 227];
export const CONFIG_PINS: Record<number, string> = {
  1: 'MSEL0', 2: 'MSEL1', 3: 'nCE', 175: 'nCONFIG', 176: 'nSTATUS', 177: 'DCLK', 178: 'DATA0', 179: 'CONF_DONE', 180: 'nCEO',
};
export const JTAG_PINS: Record<number, string> = { 115: 'TCK', 116: 'TMS', 117: 'TDI', 118: 'TDO', 119: 'TRST' };
export const DED_PINS: Record<number, string> = { 90: 'DEDICATED_INPUT1', 92: 'DEDICATED_INPUT2', 210: 'DEDICATED_INPUT3', 212: 'DEDICATED_INPUT4' };
export const GCLK_PINS: Record<number, string> = { 91: 'GCLK0', 211: 'GCLK1' };
export const DUAL_PINS: Record<number, string> = { 209: 'DEV_CLRn', 213: 'DEV_OE' };

const VCC = new Set(VCC_PINS), GND = new Set(GND_PINS);

export function pinType(n: number): PinType {
  if (VCC.has(n)) return 'vcc';
  if (GND.has(n)) return 'gnd';
  if (n in CONFIG_PINS) return 'config';
  if (n in JTAG_PINS) return 'jtag';
  if (n in GCLK_PINS) return 'gclk';
  if (n in DED_PINS) return 'ded';
  if (n in DUAL_PINS) return 'dual';
  return 'io';
}

/** 腳的名稱（給報告、腳位表用） */
export function pinName(n: number): string {
  const t = pinType(n);
  if (t === 'vcc') return 'VCC';
  if (t === 'gnd') return 'GND';
  if (t === 'config') return CONFIG_PINS[n];
  if (t === 'jtag') return JTAG_PINS[n];
  if (t === 'gclk') return GCLK_PINS[n];
  if (t === 'ded') return DED_PINS[n];
  if (t === 'dual') return `I/O（${DUAL_PINS[n]}）`;
  return 'I/O';
}

/** 使用者可以指定訊號的腳（I/O + 雙用途 + 專用輸入 + 全域時脈），應該剛好 189 隻 */
export const USER_PINS = Array.from({ length: 240 }, (_, i) => i + 1).filter((n) => ['io', 'dual', 'ded', 'gclk'].includes(pinType(n)));
/** 只能當輸入的腳（專用輸入、全域時脈） */
export const inputOnly = (n: number) => pinType(n) === 'ded' || pinType(n) === 'gclk';

// ---- -1 速度等級時序（datasheet Table 71、75、76：EPF10K50V，-1 Speed Grade，單位 ns）----
export const TIMING = {
  tCO: 0.5, // 暫存器 clock-to-output
  tSU: 0.8, // 暫存器 setup
  tLUT: 0.9, // 查表（LUT）延遲
  tCGEN: 0.4, // 進位鏈產生
  tCICO: 0.2, // 進位鏈每一位元
  tLABCARRY: 0.3, // 進位鏈跨 LAB（每 8 個 LE）
  tSAMELAB: 0.2, tSAMEROW: 2.8, // 繞線
  tCH: 2.0, tCL: 2.0, // 時脈最小高 / 低準位時間 → 上限 250 MHz
  tEABREAD: 5.8, // EAB 讀取（Table 6：256 × 8 RAM read 172 MHz）
};
