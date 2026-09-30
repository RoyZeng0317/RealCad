// 開發板（四塊微控制器 + Altera FLEX 10K FPGA 實驗板）的腳位、尺寸與電氣規格（依真實板子的排針位置，單位：孔距 P = 2.54 mm）
import { P } from '../breadboardGrid.js';
import type { Language } from './compile.js';
import { fpgaHeaderPins } from './fpga/fpgaBoard.js';

export type DevKind = 'uno' | 'esp32' | 'stm32' | 'pi5' | 'fpga';
export const DEV_KINDS: DevKind[] = ['uno', 'esp32', 'stm32', 'pi5', 'fpga'];

export type PinKind = 'gpio' | '5V' | '3V3' | 'GND' | 'NC';

export interface PinDef {
  id: string; // 唯一 id（也是 HoleKey 的一部分）
  label: string; // 板子上印的字
  kind: PinKind;
  x: number; // 板子本地座標（單位：世界座標）
  z: number;
  gpio?: number; // 程式裡用的腳位號碼
  net?: string; // 跟其他腳相通（例如 Uno 的 SDA = A4）
  adc?: boolean;
  pwm?: boolean;
  ft?: boolean; // 5 V 耐壓（STM32 FT 腳）
  inputOnly?: boolean;
  iMax?: number; // 這隻腳特別的電流上限（STM32 PC13–15 只有 3 mA）
  note?: string;
}

export interface DevBoardDef {
  kind: DevKind;
  name: string;
  mcu: string;
  size: { w: number; d: number }; // 長 × 寬
  pcb: string; // PCB 顏色
  female: boolean; // 母座（Uno）或公針（其他）
  slot: { x: number; z: number }; // 放在實驗桌上的位置（麵包板本地座標）
  vcc: 5 | 3.3;
  rOut: number; // GPIO 輸出內阻 Ω
  iMax: number; // GPIO 最大電流 A
  vih: number; vil: number; // 數位輸入判斷門檻
  pullR: number; // 內建上拉 / 下拉電阻
  adcBits: number; adcRef: number; // 0 = 沒有 ADC
  lim5V: number; lim3V3: number; // 5 V（USB）/ 3.3 V 穩壓器可供電流 A
  intBits: 16 | 32;
  lang: string;
  language: Language; // c = Arduino 風格 C、python = MicroPython、verilog = FPGA（Quartus 專案，另外的流程）
  consts: Record<string, number>;
  led?: { gpio: number; activeLow?: boolean; color: string; label: string };
  pins: PinDef[];
  example: string;
  sensor?: { x: number; z: number; w: number; d: number }; // 排針感應區（沒給就是整塊板子；FPGA 板上還有開關按鍵要點）
}

const pin = (id: string, label: string, kind: PinKind, x: number, z: number, extra: Partial<PinDef> = {}): PinDef =>
  ({ id, label, kind, x: x * P, z: z * P, ...extra });

// ---------- Arduino Uno R3（27 × 21 孔距，USB 在左側）----------
function unoPins(): PinDef[] {
  const pins: PinDef[] = [];
  const top = -9.6, bot = 9.6, L = -13.5;
  const h1 = ['SCL', 'SDA', 'AREF', 'GND', '13', '12', '11', '10', '9', '8'];
  h1.forEach((l, i) => {
    const x = L + 6.9 + i;
    if (l === 'GND') pins.push(pin('GND_T', 'GND', 'GND', x, top, { net: 'GND' }));
    else if (l === 'AREF') pins.push(pin('AREF', 'AREF', 'NC', x, top, { note: '類比參考電壓（模擬中未使用）' }));
    else if (l === 'SCL') pins.push(pin('SCL', 'SCL', 'gpio', x, top, { net: 'A5', note: '與 A5 相通' }));
    else if (l === 'SDA') pins.push(pin('SDA', 'SDA', 'gpio', x, top, { net: 'A4', note: '與 A4 相通' }));
    else pins.push(pin(`D${l}`, l, 'gpio', x, top, { gpio: +l, pwm: [9, 10, 11].includes(+l) }));
  });
  ['7', '6', '5', '4', '3', '2', '1', '0'].forEach((l, i) => {
    pins.push(pin(`D${l}`, l, 'gpio', L + 17.9 + i, top, {
      gpio: +l, pwm: [3, 5, 6].includes(+l), note: l === '0' ? 'RX（序列埠）' : l === '1' ? 'TX（序列埠）' : undefined,
    }));
  });
  const pw: [string, string, PinKind, string?][] = [
    ['NC', 'NC', 'NC'], ['IOREF', 'IOREF', '5V', '5V'], ['RESET', 'RESET', 'NC'], ['3V3', '3.3V', '3V3'],
    ['5V', '5V', '5V'], ['GND_1', 'GND', 'GND'], ['GND_2', 'GND', 'GND'], ['VIN', 'Vin', 'NC'],
  ];
  pw.forEach(([id, l, k, net], i) => pins.push(pin(id, l, k, L + 9.9 + i, bot, { net: net ?? (k === 'GND' ? 'GND' : undefined), note: id === 'VIN' ? '外部 7–12 V 輸入（本模擬用 USB 供電）' : undefined })));
  for (let i = 0; i < 6; i++) pins.push(pin(`A${i}`, `A${i}`, 'gpio', L + 18.9 + i, bot, { gpio: 14 + i, adc: true }));
  return pins;
}

// ---------- ESP32 DevKitC V4（38 腳，兩排相距 10 孔距）----------
function esp32Pins(): PinDef[] {
  const pins: PinDef[] = [];
  const j2 = ['3V3', 'EN', 'VP', 'VN', '34', '35', '32', '33', '25', '26', '27', '14', '12', 'GND', '13', 'D2', 'D3', 'CMD', '5V'];
  const j3 = ['GND', '23', '22', 'TX', 'RX', '21', 'GND', '19', '18', '5', '17', '16', '4', '0', '2', '15', 'D1', 'D0', 'CLK'];
  const alias: Record<string, number> = { VP: 36, VN: 39, TX: 1, RX: 3, D2: 9, D3: 10, CMD: 11, D1: 8, D0: 7, CLK: 6 };
  const adc = new Set([0, 2, 4, 12, 13, 14, 15, 25, 26, 27, 32, 33, 34, 35, 36, 39]);
  let g = 0;
  const add = (l: string, i: number, z: number) => {
    const x = i - 9;
    if (l === 'GND') pins.push(pin(`GND_${g++}`, 'GND', 'GND', x, z, { net: 'GND' }));
    else if (l === '3V3') pins.push(pin('3V3', '3V3', '3V3', x, z));
    else if (l === '5V') pins.push(pin('5V', '5V', '5V', x, z));
    else if (l === 'EN') pins.push(pin('EN', 'EN', 'NC', x, z, { note: '重置（Enable）' }));
    else {
      const n = alias[l] ?? +l;
      const flash = n >= 6 && n <= 11;
      pins.push(pin(`IO${n}`, l, flash ? 'NC' : 'gpio', x, z, {
        gpio: flash ? undefined : n, adc: adc.has(n), pwm: !flash && n < 34, inputOnly: n >= 34,
        note: flash ? 'GPIO6–11 接內部 SPI Flash，不能使用' : n >= 34 ? '只能當輸入' : n === 1 ? 'TX0（USB 序列埠）' : n === 3 ? 'RX0（USB 序列埠）' : n === 2 ? '板載藍色 LED' : undefined,
      }));
    }
  };
  j2.forEach((l, i) => add(l, i, 5));
  j3.forEach((l, i) => add(l, i, -5));
  return pins;
}

// ---------- STM32F103C8T6「Blue Pill」（40 腳，兩排相距 6 孔距）----------
function stm32Pins(): PinDef[] {
  const pins: PinDef[] = [];
  const top = ['B12', 'B13', 'B14', 'B15', 'A8', 'A9', 'A10', 'A11', 'A12', 'A15', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', '5V', 'GND', '3V3'];
  const bot = ['VB', 'C13', 'C14', 'C15', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B0', 'B1', 'B10', 'B11', 'R', '3V3', 'GND', 'GND'];
  const ft = (port: string, n: number) => (port === 'A' && n >= 8) || (port === 'B' && ((n >= 2 && n <= 4) || n >= 6));
  let g = 0, v = 0;
  const add = (l: string, i: number, z: number) => {
    const x = i - 9.5;
    if (l === 'GND') pins.push(pin(`GND_${g++}`, 'G', 'GND', x, z, { net: 'GND' }));
    else if (l === '3V3') pins.push(pin(`3V3_${v++}`, '3.3', '3V3', x, z, { net: '3V3' }));
    else if (l === '5V') pins.push(pin('5V', '5V', '5V', x, z));
    else if (l === 'VB') pins.push(pin('VB', 'VB', 'NC', x, z, { note: 'VBAT（RTC 電池）' }));
    else if (l === 'R') pins.push(pin('R', 'R', 'NC', x, z, { note: 'NRST 重置' }));
    else {
      const port = l[0], n = +l.slice(1);
      const code = (port === 'A' ? 0 : port === 'B' ? 16 : 32) + n;
      pins.push(pin(`P${l}`, l, 'gpio', x, z, {
        gpio: code, ft: ft(port, n), adc: (port === 'A' && n <= 7) || (port === 'B' && n <= 1),
        pwm: (port === 'A' && [0, 1, 2, 3, 6, 7, 8, 9, 10].includes(n)) || (port === 'B' && [0, 1, 6, 7, 8, 9].includes(n)),
        iMax: port === 'C' ? 0.003 : undefined,
        note: l === 'C13' ? '板載 LED（低電位點亮），最大 3 mA' : port === 'C' ? '最大 3 mA' : ft(port, n) ? '5 V 耐壓（FT）' : undefined,
      }));
    }
  };
  top.forEach((l, i) => add(l, i, -3));
  bot.forEach((l, i) => add(l, i, 3));
  return pins;
}

// ---------- Raspberry Pi 5（40 腳 GPIO 排針，奇數腳內排、偶數腳外排）----------
function pi5Pins(): PinDef[] {
  const map: (string | number)[] = [
    '3V3', '5V', 2, '5V', 3, 'GND', 4, 14, 'GND', 15, 17, 18, 27, 'GND', 22, 23, '3V3', 24, 10, 'GND',
    9, 25, 11, 8, 'GND', 7, 0, 1, 5, 'GND', 6, 12, 13, 'GND', 19, 16, 26, 20, 'GND', 21,
  ];
  const note: Record<number, string> = { 2: 'SDA1', 3: 'SCL1', 14: 'TXD', 15: 'RXD', 12: 'PWM0', 13: 'PWM1', 18: 'PWM0', 19: 'PWM1', 0: 'ID_SD（保留給 HAT EEPROM）', 1: 'ID_SC（保留給 HAT EEPROM）' };
  return map.map((m, i) => {
    const phys = i + 1;
    const x = -10.5 + Math.floor(i / 2);
    const z = phys % 2 ? -8.6 : -9.6;
    if (typeof m === 'number') {
      return pin(`GPIO${m}`, String(m), 'gpio', x, z, { gpio: m, pwm: [12, 13, 18, 19].includes(m), note: `實體腳 ${phys}${note[m] ? '・' + note[m] : ''}` });
    }
    const k: PinKind = m === 'GND' ? 'GND' : m === '5V' ? '5V' : '3V3';
    return pin(`${m}_${phys}`, m, k, x, z, { net: m, note: `實體腳 ${phys}` });
  });
}

const BLINK = (pinExpr: string, extra = '') => `// Blink：每 0.5 秒切換一次，並從序列埠印出次數
${extra}int count = 0;

void setup() {
  pinMode(${pinExpr}, OUTPUT);
  Serial.begin(115200);
  Serial.println("Hello from RealCad Lab!");
}

void loop() {
  digitalWrite(${pinExpr}, HIGH);
  delay(500);
  digitalWrite(${pinExpr}, LOW);
  delay(500);
  count++;
  Serial.print("blink ");
  Serial.println(count);
}
`;

const stmConsts: Record<string, number> = {};
for (const [p, base] of [['A', 0], ['B', 16], ['C', 32]] as const) for (let n = 0; n < 16; n++) stmConsts[`P${p}${n}`] = base + n;

export const DEV_BOARDS: Record<DevKind, DevBoardDef> = {
  uno: {
    kind: 'uno', name: 'Arduino Uno R3', mcu: 'ATmega328P・5 V・16 MHz', size: { w: 27 * P, d: 21 * P }, pcb: '#0f6e8c', female: true,
    slot: { x: 2.35, z: -0.95 }, vcc: 5, rOut: 25, iMax: 0.04, vih: 3.0, vil: 1.5, pullR: 35000, adcBits: 10, adcRef: 5,
    lim5V: 0.5, lim3V3: 0.15, intBits: 16, lang: 'Arduino C++', language: 'c',
    consts: { LED_BUILTIN: 13, A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, SDA: 18, SCL: 19 },
    led: { gpio: 13, color: '#ffb020', label: 'L' },
    pins: unoPins(),
    example: BLINK('LED_BUILTIN'),
  },
  esp32: {
    kind: 'esp32', name: 'ESP32 DevKitC', mcu: 'ESP32-WROOM-32・3.3 V・240 MHz', size: { w: 21.6 * P, d: 11 * P }, pcb: '#1b1b1f', female: false,
    slot: { x: 2.35, z: 0.9 }, vcc: 3.3, rOut: 30, iMax: 0.04, vih: 2.475, vil: 0.825, pullR: 45000, adcBits: 12, adcRef: 3.3,
    lim5V: 0.5, lim3V3: 0.6, intBits: 32, lang: 'Arduino-ESP32', language: 'c',
    consts: { LED_BUILTIN: 2, A0: 36, A3: 39, A4: 32, A5: 33, A6: 34, A7: 35, T0: 4 },
    led: { gpio: 2, color: '#2a7aff', label: 'IO2' },
    pins: esp32Pins(),
    example: BLINK('LED_BUILTIN'),
  },
  stm32: {
    kind: 'stm32', name: 'STM32 Blue Pill', mcu: 'STM32F103C8T6・3.3 V・72 MHz', size: { w: 21 * P, d: 9 * P }, pcb: '#1846a0', female: false,
    slot: { x: 4.35, z: 0.9 }, vcc: 3.3, rOut: 40, iMax: 0.025, vih: 2.0, vil: 1.0, pullR: 40000, adcBits: 12, adcRef: 3.3,
    lim5V: 0.5, lim3V3: 0.3, intBits: 32, lang: 'STM32duino', language: 'c',
    consts: { LED_BUILTIN: 45, ...stmConsts },
    led: { gpio: 45, activeLow: true, color: '#3cff5a', label: 'PC13' },
    pins: stm32Pins(),
    example: BLINK('PC13', '// Blue Pill 的板載 LED 在 PC13，低電位（LOW）才會亮\n'),
  },
  pi5: {
    kind: 'pi5', name: 'Raspberry Pi 5', mcu: 'BCM2712・GPIO 3.3 V', size: { w: 33.5 * P, d: 22 * P }, pcb: '#2a7a3a', female: false,
    slot: { x: 4.4, z: -0.9 }, vcc: 3.3, rOut: 50, iMax: 0.016, vih: 2.0, vil: 0.8, pullR: 50000, adcBits: 0, adcRef: 0,
    lim5V: 1.6, lim3V3: 0.8, intBits: 32, lang: 'MicroPython（machine 模組・BCM 編號）', language: 'python',
    consts: {},
    pins: pi5Pins(),
    example: `# Raspberry Pi 5（MicroPython）：GPIO17 = 實體第 11 腳
from machine import Pin
import time

led = Pin(17, Pin.OUT)
count = 0

while True:
    led.on()
    time.sleep(0.5)
    led.off()
    time.sleep(0.5)
    count += 1
    print(f"blink {count}")
`,
  },
  fpga: {
    kind: 'fpga', name: 'FLEX 10K FPGA 實驗板', mcu: 'Altera EPF10K50EQC240-1・3.3 V I/O・50 MHz', size: { w: 1.8, d: 2.2 }, pcb: '#1d5c3a', female: false,
    slot: { x: 6.25, z: -0.2 }, vcc: 3.3, rOut: 25, iMax: 0.024, vih: 2.0, vil: 0.8, pullR: 50000, adcBits: 0, adcRef: 0,
    lim5V: 1.0, lim3V3: 0.5, intBits: 32, lang: 'Verilog HDL（Quartus II 專案）', language: 'verilog',
    consts: {},
    pins: fpgaHeaderPins(),
    example: '',
    sensor: { x: 0.745, z: 0, w: 0.3, d: 0.98 },
  },
};

export const devPin = (kind: DevKind, id: string) => DEV_BOARDS[kind].pins.find((p) => p.id === id);
export const devPinByGpio = (kind: DevKind, gpio: number) => DEV_BOARDS[kind].pins.find((p) => p.kind === 'gpio' && p.gpio === gpio);
/** 別名腳（Uno 的 SDA/SCL）→ 真正有 GPIO 編號的那隻腳 */
export const devPinOwner = (kind: DevKind, p: PinDef) => (p.net && p.gpio === undefined ? DEV_BOARDS[kind].pins.find((q) => q.id === p.net) ?? p : p);
/** 腳位所屬的網路（同一塊板子上 GND、5V、3V3 各自相通） */
export const devNet = (kind: DevKind, p: PinDef) =>
  `H:${kind}:${p.kind === 'GND' ? 'GND' : p.kind === '5V' ? '5V' : p.kind === '3V3' ? '3V3' : p.net ?? p.id}`;
/** 排針頂端高度（麵包板本地座標，桌面 = 0） */
export const PCB_TOP = 0.07;
export const pinTopY = (d: DevBoardDef) => PCB_TOP + (d.female ? 0.15 : 0.13);
