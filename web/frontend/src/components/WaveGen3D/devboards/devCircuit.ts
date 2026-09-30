// 開發板的電氣模型（給電路求解器）與接線錯誤檢查：過電流、過電壓、5V/3V3 短路或倒灌、沒上電卻有電壓
import type { Element, Solution } from '../circuit.js';
import { DEV_BOARDS, DEV_KINDS, devNet, type DevKind } from './boardDefs.js';
import { MODE } from './sketchRun.js';
import { isPowered, type DevConf, type DevRt, type Issue } from './devStore.js';

export interface DevState { conf: Record<DevKind, DevConf>; rt: Record<DevKind, DevRt> }
export interface Damage { kind: DevKind; key: string; pin?: string; trip?: boolean }

/** 板子的元件：USB 5V / 3.3V 電源、GPIO 輸出（戴維寧）、內建上拉/下拉、板子 GND 經 1 MΩ 漏電接到實驗桌地 */
export function devElements(s: DevState, merge: (n: string) => string, ground: string): Element[] {
  const els: Element[] = [];
  for (const k of DEV_KINDS) {
    if (!s.conf[k].present) continue;
    const d = DEV_BOARDS[k];
    const gnd = merge(`H:${k}:GND`);
    // 沒有把開發板 GND 跟麵包板 GND 接在一起時，兩邊只經過 USB 隔離的漏電相連 → 模擬「忘記共地」
    els.push({ kind: 'res', id: `dev:${k}:leak`, a: gnd, b: ground, r: 1e6 });
    if (!isPowered(s, k)) continue;
    els.push({ kind: 'src', id: `dev:${k}:5V`, p: merge(`H:${k}:5V`), n: gnd, v: 5, r: 0.1 });
    els.push({ kind: 'src', id: `dev:${k}:3V3`, p: merge(`H:${k}:3V3`), n: gnd, v: 3.3, r: 0.15 });
    const rt = s.rt[k];
    for (const p of d.pins) {
      if (p.kind !== 'gpio' || p.gpio === undefined || rt.dead.includes(p.id)) continue;
      const st = rt.pins[p.id];
      if (!st) continue;
      const net = merge(devNet(k, p));
      if (st.mode === MODE.OUTPUT) els.push({ kind: 'src', id: `dev:${k}:${p.id}`, p: net, n: gnd, v: st.level * d.vcc, r: d.rOut });
      else if (st.mode === MODE.INPUT_PULLUP) els.push({ kind: 'src', id: `dev:${k}:${p.id}`, p: net, n: gnd, v: d.vcc, r: d.pullR });
      else if (st.mode === MODE.INPUT_PULLDOWN) els.push({ kind: 'src', id: `dev:${k}:${p.id}`, p: net, n: gnd, v: 0, r: d.pullR });
    }
  }
  return els;
}

const mA = (i: number) => `${(i * 1000).toFixed(1)} mA`;

/** 求解後檢查每塊板子：回傳顯示用的問題清單與「持續一段時間就會造成損壞」的項目 */
export function devIssues(s: DevState, sol: Solution, merge: (n: string) => string): { issues: Record<DevKind, Issue[]>; damage: Damage[] } {
  const issues = Object.fromEntries(DEV_KINDS.map((k) => [k, [] as Issue[]])) as Record<DevKind, Issue[]>;
  const damage: Damage[] = [];
  for (const k of DEV_KINDS) {
    if (!s.conf[k].present) continue;
    const d = DEV_BOARDS[k];
    const on = isPowered(s, k);
    const gndV = sol.nodeV[merge(`H:${k}:GND`)] ?? 0;
    const vOf = (net: string) => (net in sol.nodeV ? sol.nodeV[net] - gndV : null);
    const add = (i: Issue, dmg?: Omit<Damage, 'kind' | 'key'>) => {
      issues[k].push(i);
      if (dmg) damage.push({ kind: k, key: i.key, ...dmg });
    };

    // GPIO：電流、電壓
    const seen = new Set<string>();
    for (const p of d.pins) {
      if (p.kind !== 'gpio') continue;
      const net = merge(devNet(k, p));
      if (seen.has(net + p.id)) continue;
      seen.add(net + p.id);
      const r = sol.el[`dev:${k}:${p.id}`];
      const lim = p.iMax ?? d.iMax;
      if (r && Math.abs(r.i) > lim) {
        add({ key: `${p.id}:I`, pin: p.id, severity: 'error',
          msg: `腳位 ${p.label} 電流 ${mA(Math.abs(r.i))} 超過上限 ${mA(lim)}（短路、接到電源，或 LED 沒串限流電阻？）` },
        Math.abs(r.i) > lim * 1.5 ? { pin: p.id } : undefined);
      }
      const v = vOf(net);
      if (v === null) continue;
      const vmax = p.ft ? 5.5 : d.vcc + 0.5;
      if (v > vmax) {
        add({ key: `${p.id}:OV`, pin: p.id, severity: 'error',
          msg: `腳位 ${p.label} 被加上 ${v.toFixed(2)} V，超過耐壓 ${vmax.toFixed(1)} V${d.vcc === 3.3 && !p.ft ? '（3.3 V 板子不能直接接 5 V 訊號）' : ''}` }, { pin: p.id });
      } else if (v < -0.5) {
        add({ key: `${p.id}:NV`, pin: p.id, severity: 'error', msg: `腳位 ${p.label} 是負電壓 ${v.toFixed(2)} V（接反了？）` }, { pin: p.id });
      } else if (!on && v > 0.5) {
        add({ key: `${p.id}:UP`, pin: p.id, severity: 'warn', msg: `板子沒上電，但腳位 ${p.label} 有 ${v.toFixed(2)} V（電流會經保護二極體倒灌）` });
      }
    }
    // 其他不能接的腳（例如 ESP32 的 Flash 腳）
    for (const p of d.pins) {
      if (p.kind !== 'NC' || !p.note?.includes('Flash')) continue;
      const v = vOf(merge(devNet(k, p)));
      if (v !== null && Math.abs(v) > 0.2) add({ key: `${p.id}:FL`, pin: p.id, severity: 'warn', msg: `${p.label}：${p.note}` });
    }
    if (!on) continue;
    // 電源腳：5 V（USB）過電流 → 保險絲跳脫；3.3 V 穩壓器過載或被倒灌
    const p5 = sol.el[`dev:${k}:5V`], p3 = sol.el[`dev:${k}:3V3`];
    if (p5 && p5.i > d.lim5V) add({ key: '5V:I', severity: 'error', msg: `5V 電流 ${mA(p5.i)} 超過 USB 上限 ${mA(d.lim5V)}（5V 跟 GND 短路？）→ 保險絲跳脫` }, { trip: true });
    if (p5 && p5.i < -0.05) add({ key: '5V:R', severity: 'warn', msg: `外部電源往板子的 5V 腳倒灌 ${mA(-p5.i)}（USB 與外部電源不要同時接 5V）` });
    if (p3 && p3.i > d.lim3V3) add({ key: '3V3:I', severity: 'error', msg: `3.3V 輸出 ${mA(p3.i)} 超過穩壓器上限 ${mA(d.lim3V3)}（3V3 跟 GND 短路？）` }, { trip: p3.i > d.lim3V3 * 3 });
    const v3 = vOf(merge(`H:${k}:3V3`));
    if (p3 && v3 !== null && v3 > 3.6) add({ key: '3V3:OV', severity: 'error', msg: `3V3 腳被外部拉到 ${v3.toFixed(2)} V（把 5V 接到 3V3 了？）` }, { trip: true });
  }
  return { issues, damage };
}
