// 範例：麵包板上的「自己組的 Arduino」— ATmega328P + CH340G + LED，電源供應器 5 V
//   接法：VCC/AVCC → +5 V、兩個 GND → 地、D13（第 19 腳）→ 330 Ω → LED → GND、
//   CH340 TXD → 第 2 腳 RXD、RXD ← 第 3 腳 TXD、DTR# → 第 1 腳 RESET，載入後自動上傳 Blink
import type { BoardPart } from '../boardParts.js';
import { useBoard } from '../boardStore.js';
import { usePsuLab } from '../psuStore.js';
import { LOAD_STEPS } from '../psu.js';
import { useChips } from './chipStore.js';
import { dipPins, ATMEGA_EXAMPLE } from './chipDefs.js';

const RED = '#d42a2a', BLK = '#1b1d20', YEL = '#e0b010', GRN = '#2aa84a', BLU = '#2a6fd4';
const V5 = (slot: number) => `b:1:0:${slot}`, GND = (slot: number) => `b:1:1:${slot}`;
const w = (id: string, a: string, b: string, color: string): BoardPart => ({ id, kind: 'wire', pins: [a, b], color, gen: 0 });

export function loadAtmegaDemo() {
  const at = dipPins('t:0:10:4', 28)!; // 第 1 腳在第 11 列
  const ch = dipPins('t:0:40:4', 16)!; // 第 1 腳在第 41 列
  const row = (h: string) => +h.split(':')[2];
  const L = (pin: number, pins: string[], col = 0) => `t:0:${row(pins[pin])}:${col}`; // 左半邊（a–e）同一列
  const R = (pin: number, pins: string[], col = 9) => `t:0:${row(pins[pin])}:${col}`; // 右半邊（f–j）同一列
  const parts: BoardPart[] = [
    w('ad-psu+', 'p:Va', V5(0), RED), w('ad-psu-', 'p:GND', GND(1), BLK),
    { id: 'ad-atmega', kind: 'atmega', pins: at, code: ATMEGA_EXAMPLE, flash: '', gen: 0 },
    w('ad-vcc', L(6, at), V5(14), RED), w('ad-gnd', L(7, at), GND(15), BLK),
    w('ad-avcc', R(19, at), V5(20), RED), w('ad-gnd2', R(21, at), GND(21), BLK),
    { id: 'ad-r1', kind: 'resistor', pins: [R(18, at, 8), 't:0:30:8'], value: 330, gen: 0 },
    { id: 'ad-led', kind: 'led', pins: ['t:0:30:6', GND(27)], ledColor: 'green', gen: 0 },
    { id: 'ad-ch340', kind: 'ch340', pins: ch, gen: 0 },
    w('ad-chgnd', L(0, ch), GND(39), BLK), w('ad-chvcc', R(15, ch), V5(38), RED),
    w('ad-tx', L(1, ch), L(1, at), YEL), w('ad-rx', L(2, ch, 1), L(2, at, 1), GRN),
    w('ad-dtr', R(12, ch), L(0, at), BLU),
  ];
  useBoard.getState().loadParts(parts);
  useBoard.setState({ dmm: 't:0:30:9', tool: 'select', selectedId: 'ad-atmega' });
  const psu = usePsuLab.getState();
  psu.setPsu({ vSet: 5, iSet: 0.5, power: true, output: true });
  psu.setLoadIdx(LOAD_STEPS.length - 1);
  useChips.getState().setTab('ad-atmega');
  setTimeout(() => useChips.getState().upload('ad-atmega'), 300);
}
