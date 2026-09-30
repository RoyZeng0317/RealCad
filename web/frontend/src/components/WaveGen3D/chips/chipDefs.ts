// 可以插在麵包板上的 IC：ATmega328P-PU（DIP-28）與 CH340G USB 轉序列（DIP-16 轉接板）
//   DIP 跨在端子排中間的溝上：第 1 腳在 e 欄，逆時針排列（1 ~ N/2 沿 e 欄往下，N/2+1 ~ N 沿 f 欄往回）
import type { HoleKey } from '../boardModel.js';
import { isValidHole } from '../boardModel.js';

export type ChipKind = 'atmega' | 'ch340';
export interface ChipPin { name: string; note?: string }

const pins = (list: [string, string?][]): ChipPin[] => list.map(([name, note]) => ({ name, note }));

export const ATMEGA_PINS = pins([
  ['PC6/RESET', '重置（低電位有效，內建上拉）'], ['PD0/RXD', 'D0・序列埠接收'], ['PD1/TXD', 'D1・序列埠傳送'], ['PD2', 'D2'],
  ['PD3', 'D3・PWM'], ['PD4', 'D4'], ['VCC', '電源 1.8–5.5 V'], ['GND'], ['PB6/XTAL1', '石英振盪器（本模擬用內部 8 MHz）'],
  ['PB7/XTAL2', '石英振盪器'], ['PD5', 'D5・PWM'], ['PD6', 'D6・PWM'], ['PD7', 'D7'], ['PB0', 'D8'],
  ['PB1', 'D9・PWM'], ['PB2/SS', 'D10・PWM'], ['PB3/MOSI', 'D11・PWM'], ['PB4/MISO', 'D12'], ['PB5/SCK', 'D13'],
  ['AVCC', '類比電源，要接 VCC'], ['AREF', '類比參考電壓'], ['GND'], ['PC0', 'A0（D14）'], ['PC1', 'A1（D15）'],
  ['PC2', 'A2（D16）'], ['PC3', 'A3（D17）'], ['PC4/SDA', 'A4（D18）'], ['PC5/SCL', 'A5（D19）'],
]);

export const CH340_PINS = pins([
  ['GND'], ['TXD', '序列資料輸出 → 接 MCU 的 RXD'], ['RXD', '序列資料輸入 ← 接 MCU 的 TXD'], ['V3', '5 V 供電時接 0.1 µF 到地'],
  ['UD+', 'USB D+（已接到電腦）'], ['UD-', 'USB D−（已接到電腦）'], ['XI', '12 MHz 石英（轉接板上已焊）'], ['XO', '12 MHz 石英'],
  ['CTS#'], ['DSR#'], ['RI#'], ['DCD#'], ['DTR#', '上傳時拉低 → 接 RESET 自動重置'], ['RTS#'], ['R232'], ['VCC', '電源 5 V（或 3.3 V）'],
]);

export const CHIP_PINS: Record<ChipKind, ChipPin[]> = { atmega: ATMEGA_PINS, ch340: CH340_PINS };
export const CHIP_NAME: Record<ChipKind, string> = { atmega: 'ATmega328P-PU', ch340: 'CH340G USB 轉序列' };

// 腳位索引（0 起算 = 第 1 腳）
export const AT = { RESET: 0, RXD: 1, TXD: 2, VCC: 6, GND: 7, AVCC: 19, AREF: 20, GND2: 21 };
export const CH = { GND: 0, TXD: 1, RXD: 2, DTR: 12, RTS: 13, VCC: 15 };

/** Arduino 腳位編號（D0–D13、A0–A5 = 14–19）→ DIP 腳位索引 */
export const ARDUINO_TO_DIP = [1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 22, 23, 24, 25, 26, 27];
export const PWM_PINS = [3, 5, 6, 9, 10, 11];

/** 點一個孔放 DIP：取那一列、跨在 e/f 欄；回傳每隻腳的孔（逆時針） */
export function dipPins(k: HoleKey, count: number): HoleKey[] | null {
  const [t, s, r] = k.split(':');
  if (t !== 't') return null;
  const half = count / 2, row = +r;
  const out: HoleKey[] = [];
  for (let i = 0; i < half; i++) out.push(`t:${s}:${row + i}:4`);
  for (let i = half - 1; i >= 0; i--) out.push(`t:${s}:${row + i}:5`);
  return out.every(isValidHole) ? out : null;
}

export const ATMEGA_EXAMPLE = `// ATmega328P（麵包板上的裸晶片，Arduino 腳位編號）
// D13 = 第 19 腳：接 330 Ω + LED 到 GND 就會閃爍；序列埠經過 CH340 傳到電腦
int count = 0;

void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.println("ATmega328P ready");
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
  count++;
  Serial.print("blink ");
  Serial.println(count);
}
`;
