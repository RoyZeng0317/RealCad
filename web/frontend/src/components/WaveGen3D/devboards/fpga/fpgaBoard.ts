// RealCad FLEX 10K 實驗板（EPF10K50EQC240-1）的板上資源與腳位表，以及範例 Quartus 專案
import { P } from '../../breadboardGrid.js';
import type { PinDef } from '../boardDefs.js';

export type ResKind = 'clk50' | 'clkslow' | 'key' | 'sw' | 'led' | 'seg0' | 'seg1' | 'io' | 'rst' | 'slide' | 'spk' | 'sd' | 'tf';
export interface Res { pin: number; kind: ResKind; index: number; label: string; dir: 'in' | 'out' | 'io' }

// 板上資源 → FPGA 腳位（本板自訂的腳位表，跟 Quartus 的 .qsf 一起使用）
const KEY_PINS = [7, 8, 9, 11];
const SW_PINS = [12, 13, 14, 15, 17, 18, 19, 20];
const LED_PINS = [21, 22, 23, 24, 25, 26, 28, 29];
const SEG0_PINS = [30, 31, 36, 37, 38, 39, 40, 41]; // a b c d e f g dp
const SEG1_PINS = [44, 45, 46, 47, 48, 49, 53, 54];
export const IO_PINS = [132, 133, 134, 135, 136, 138, 139, 140, 141, 142, 143, 144, 147, 148, 149, 150,
  151, 152, 153, 154, 156, 157, 158, 159, 160, 161, 162, 163, 164, 166, 167, 168];
const SEG = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
const RST_PIN = 10; // 紅色 RESET 按鍵（按下 = 0）
const SLIDE_PINS = [56, 57]; // 滑動開關 SLD0、SLD1
const SPK_PIN = 55; // 喇叭（蜂鳴器）
// SD / TF（microSD）卡座：SPI 模式的 CLK、CMD（MOSI）、DAT0（MISO）、DAT3（CS），CD = 卡片偵測（有插卡 = 0）
export const CARD_SIGS = ['CLK', 'CMD', 'DAT0', 'DAT3', 'CD'];
const SD_PINS = [60, 61, 62, 63, 64];
const TF_PINS = [65, 66, 67, 68, 69];
const cardDir = (i: number): 'in' | 'out' => (i === 2 || i === 4 ? 'in' : 'out');

export const RESOURCES: Res[] = [
  { pin: 91, kind: 'clk50', index: 0, label: 'CLK_50MHz', dir: 'in' },
  { pin: 92, kind: 'clkslow', index: 0, label: 'CLK_SEL（可調低頻時脈）', dir: 'in' },
  ...KEY_PINS.map((pin, i): Res => ({ pin, kind: 'key', index: i, label: `KEY${i}（按下 = 0）`, dir: 'in' })),
  ...SW_PINS.map((pin, i): Res => ({ pin, kind: 'sw', index: i, label: `SW${i}`, dir: 'in' })),
  ...LED_PINS.map((pin, i): Res => ({ pin, kind: 'led', index: i, label: `LED${i}`, dir: 'out' })),
  ...SEG0_PINS.map((pin, i): Res => ({ pin, kind: 'seg0', index: i, label: `HEX0_${SEG[i]}（低電位亮）`, dir: 'out' })),
  ...SEG1_PINS.map((pin, i): Res => ({ pin, kind: 'seg1', index: i, label: `HEX1_${SEG[i]}（低電位亮）`, dir: 'out' })),
  ...IO_PINS.map((pin, i): Res => ({ pin, kind: 'io', index: i, label: `J1 IO${i}`, dir: 'io' })),
  { pin: RST_PIN, kind: 'rst', index: 0, label: 'RESET（紅色按鍵，按下 = 0）', dir: 'in' },
  ...SLIDE_PINS.map((pin, i): Res => ({ pin, kind: 'slide', index: i, label: `SLD${i}（滑動開關）`, dir: 'in' })),
  { pin: SPK_PIN, kind: 'spk', index: 0, label: 'SPEAKER（喇叭，送方波發聲）', dir: 'out' },
  ...SD_PINS.map((pin, i): Res => ({ pin, kind: 'sd', index: i, label: `SD_${CARD_SIGS[i]}${i === 4 ? '（插卡 = 0）' : ''}`, dir: cardDir(i) })),
  ...TF_PINS.map((pin, i): Res => ({ pin, kind: 'tf', index: i, label: `TF_${CARD_SIGS[i]}${i === 4 ? '（插卡 = 0）' : ''}`, dir: cardDir(i) })),
];
export const RES_BY_PIN = new Map(RESOURCES.map((r) => [r.pin, r]));

export const SLOW_CLOCKS = [1, 2, 5, 10, 100, 1000];

/** J1 擴充排針（2 × 20，公針）：32 隻 IO + 5V × 2、3.3V × 2、GND × 4，用杜邦線接麵包板 */
export function fpgaHeaderPins(): PinDef[] {
  const pins: PinDef[] = [];
  const colX = [0.72, 0.72 + P];
  for (let r = 0; r < 20; r++) {
    for (let c = 0; c < 2; c++) {
      const n = r * 2 + c;
      const x = colX[c], z = (r - 9.5) * P;
      if (n < 32) pins.push({ id: `IO${n}`, label: `IO${n}`, kind: 'gpio', x, z, gpio: IO_PINS[n], ft: true, note: `FPGA PIN_${IO_PINS[n]}` });
      else if (n === 32 || n === 33) pins.push({ id: `5V_${n}`, label: '5V', kind: '5V', x, z, net: '5V' });
      else if (n === 34 || n === 35) pins.push({ id: `3V3_${n}`, label: '3.3V', kind: '3V3', x, z, net: '3V3' });
      else pins.push({ id: `GND_${n}`, label: 'GND', kind: 'GND', x, z, net: 'GND' });
    }
  }
  return pins;
}

const EXAMPLE_V = `// RealCad FLEX 10K 實驗板範例（EPF10K50EQC240-1）
// 8 位元計數器：低頻時脈計數，結果顯示在 LED 和兩位七段顯示器
//   紅色 RESET = 重置（按下 = 0）、SW0 = 1 暫停、SLD0 = 1 倒數、SW7 = 1 時 LED 改顯示指撥開關、
//   J1 IO0 輸出計數的最低位元（可接麵包板 LED）、按住 KEY1 喇叭發出 440 Hz
module counter (
  input            clk50,      // PIN_91：50 MHz
  input            clk_slow,   // PIN_92：CLK_SEL 可調低頻時脈
  input            rst_n,      // PIN_10：紅色 RESET 按鍵
  input            key1_n,     // PIN_8 ：KEY1
  input            sld0,       // PIN_56：滑動開關 SLD0
  input      [7:0] sw,         // SW0 ~ SW7
  output reg [7:0] led,        // LED0 ~ LED7
  output     [7:0] hex0,       // 七段顯示器 {dp,g,f,e,d,c,b,a}，低電位點亮
  output     [7:0] hex1,
  output           io0,        // PIN_132：J1 排針 IO0
  output           spk         // PIN_55 ：喇叭
);
  reg [7:0] count;

  always @(posedge clk_slow or negedge rst_n)
    if (!rst_n)      count <= 8'd0;
    else if (!sw[0]) count <= sld0 ? count - 8'd1 : count + 8'd1;

  always @(*)
    led = sw[7] ? sw : count;

  assign io0 = count[0];

  // 440 Hz：50 MHz ÷ (2 × 56818)
  reg [16:0] div;
  reg        tone;
  always @(posedge clk50)
    if (div == 17'd56817) begin div <= 17'd0; tone <= ~tone; end
    else div <= div + 17'd1;
  assign spk = tone & ~key1_n;

  seg7 u0 (.d(count[3:0]), .seg(hex0));
  seg7 u1 (.d(count[7:4]), .seg(hex1));
endmodule

// 16 進位 → 七段顯示器（共陽極，低電位亮）
module seg7 (input [3:0] d, output reg [7:0] seg);
  always @(*)
    case (d)
      4'h0: seg = 8'hC0;  4'h1: seg = 8'hF9;  4'h2: seg = 8'hA4;  4'h3: seg = 8'hB0;
      4'h4: seg = 8'h99;  4'h5: seg = 8'h92;  4'h6: seg = 8'h82;  4'h7: seg = 8'hF8;
      4'h8: seg = 8'h80;  4'h9: seg = 8'h90;  4'hA: seg = 8'h88;  4'hB: seg = 8'h83;
      4'hC: seg = 8'hC6;  4'hD: seg = 8'hA1;  4'hE: seg = 8'h86;  default: seg = 8'h8E;
    endcase
endmodule
`;

function exampleQsf() {
  const L = [
    '# Quartus II Settings File（RealCad FLEX 10K 實驗板範例）',
    'set_global_assignment -name FAMILY "FLEX10KE"',
    'set_global_assignment -name DEVICE EPF10K50EQC240-1',
    'set_global_assignment -name TOP_LEVEL_ENTITY counter',
    'set_location_assignment PIN_91 -to clk50',
    'set_location_assignment PIN_92 -to clk_slow',
    `set_location_assignment PIN_${RST_PIN} -to rst_n`,
    `set_location_assignment PIN_${KEY_PINS[1]} -to key1_n`,
    `set_location_assignment PIN_${SLIDE_PINS[0]} -to sld0`,
    `set_location_assignment PIN_${SPK_PIN} -to spk`,
    ...SW_PINS.map((p, i) => `set_location_assignment PIN_${p} -to sw[${i}]`),
    ...LED_PINS.map((p, i) => `set_location_assignment PIN_${p} -to led[${i}]`),
    ...SEG0_PINS.map((p, i) => `set_location_assignment PIN_${p} -to hex0[${i}]`),
    ...SEG1_PINS.map((p, i) => `set_location_assignment PIN_${p} -to hex1[${i}]`),
    `set_location_assignment PIN_${IO_PINS[0]} -to io0`,
  ];
  return L.join('\n') + '\n';
}

export const EXAMPLE_FILES = () => [
  { name: 'counter.v', text: EXAMPLE_V },
  { name: 'counter.qsf', text: exampleQsf() },
];

/** 產生整張板子的 .qsf 腳位範本（給使用者下載參考） */
export function boardPinTemplate(): string {
  return [
    '# RealCad FLEX 10K 實驗板（EPF10K50EQC240-1）腳位表',
    ...RESOURCES.map((r) => `# PIN_${r.pin}\t${r.label}`),
  ].join('\n') + '\n';
}
