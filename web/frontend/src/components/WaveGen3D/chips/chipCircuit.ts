// 麵包板 IC 的電氣模型（給電路求解器）：
//   ATmega328P：VCC–GND 之間的耗電、GPIO 輸出（戴維寧：輸出內阻 25 Ω）、內建上拉、RESET 內建上拉
//   CH340G：VCC–GND 耗電、TXD / DTR# / RTS# 平常輸出高電位、RXD 內建上拉
import type { Element } from '../circuit.js';
import type { BoardPart } from '../boardParts.js';
import { MODE } from '../devboards/sketchRun.js';
import { chipRt, type ChipRt } from './chipStore.js';
import { AT, CH } from './chipDefs.js';

export function chipElements(parts: BoardPart[], rt: Record<string, ChipRt>, net: (h: string) => string): Element[] {
  const els: Element[] = [];
  for (const p of parts) {
    if (p.kind !== 'atmega' && p.kind !== 'ch340') continue;
    const n = (i: number) => net(p.pins[i]);
    const r = chipRt({ rt }, p.id);
    const src = (tag: string, i: number, gnd: number, v: number, ohm: number) =>
      els.push({ kind: 'src', id: `${p.id}:${tag}`, p: n(i), n: n(gnd), v, r: ohm });
    if (p.kind === 'atmega') {
      // 晶片耗電約 5 mA（5 V 時）；兩個 GND 腳在晶片內部相通
      els.push({ kind: 'res', id: p.id, a: n(AT.VCC), b: n(AT.GND), r: 1000 });
      els.push({ kind: 'res', id: `${p.id}:gnd`, a: n(AT.GND), b: n(AT.GND2), r: 0.5 });
      if (r.vcc < 1.8) continue;
      src('rst', AT.RESET, AT.GND, r.vcc, 50000);
      for (const [k, st] of Object.entries(r.pins)) {
        const i = +k;
        if (st.mode === MODE.OUTPUT) src(`p${i}`, i, AT.GND, st.level * r.vcc, 25);
        else if (st.mode === MODE.INPUT_PULLUP) src(`p${i}`, i, AT.GND, r.vcc, 35000);
      }
    } else {
      els.push({ kind: 'res', id: p.id, a: n(CH.VCC), b: n(CH.GND), r: 500 });
      if (r.vcc < 3.0) continue;
      src('txd', CH.TXD, CH.GND, r.vcc, 100);
      src('dtr', CH.DTR, CH.GND, r.dtrLow ? 0 : r.vcc, 100);
      src('rts', CH.RTS, CH.GND, r.vcc, 100);
      src('rxd', CH.RXD, CH.GND, r.vcc, 50000);
    }
  }
  return els;
}
