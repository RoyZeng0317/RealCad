// CH224K USB PD 誘騙（取電）模組：USB-C 母座接 PD 充電器，CH224K 跟充電器協商出要的電壓，從排針輸出
//   CH224K 本身是 ESSOP-10 貼片 IC，沒辦法直接插麵包板 → 跟實際一樣做成小模組：排針 3 隻 VOUT、GND、PG
//   選電壓：模組上 CFG1 對地電阻（6.8 kΩ = 9 V、24 kΩ = 12 V、56 kΩ = 15 V、空接 = 20 V），5 V 用 CFG1 拉高
//   充電器不支援要求的電壓 → 退回 5 V，PG（電源良好，開汲極、低電位有效）不會拉低
//   輸出電流超過充電器那一檔的額定 → 充電器過流保護關閉輸出（要重插 USB-C 線才會恢復）
import type { Element } from './circuit.js';
import type { BoardPart } from './boardParts.js';

export const PD_VOLTS = [5, 9, 12, 15, 20] as const;
export type PdVolt = (typeof PD_VOLTS)[number];
/** CFG1 對地電阻（模組上的設定電阻）→ 要求電壓 */
export const CFG1_RES: Record<PdVolt, string> = { 5: 'CFG1 拉高（電平設定）', 9: '6.8 kΩ', 12: '24 kΩ', 15: '56 kΩ', 20: '空接（NC）' };

/** 充電器：每一檔電壓能給的最大電流（A）；沒有的電壓就不支援 */
export const CHARGERS = {
  usb5: { name: '一般 USB 充電器 5 V / 2 A（不支援 PD）', pdo: { 5: 2 } as Partial<Record<PdVolt, number>> },
  pd20: { name: 'PD 20 W（5 / 9 / 12 V）', pdo: { 5: 3, 9: 2.22, 12: 1.67 } as Partial<Record<PdVolt, number>> },
  pd65: { name: 'PD 65 W（5–20 V，3.25 A）', pdo: { 5: 3, 9: 3, 12: 3, 15: 3, 20: 3.25 } as Partial<Record<PdVolt, number>> },
  pd100: { name: 'PD 100 W（5–20 V，5 A 線材）', pdo: { 5: 3, 9: 3, 12: 3, 15: 3, 20: 5 } as Partial<Record<PdVolt, number>> },
};
export type ChargerId = keyof typeof CHARGERS;
export const CHARGER_IDS = Object.keys(CHARGERS) as ChargerId[];

export const CHP = { VOUT: 0, GND: 1, PG: 2 };
export const CH224_PINS: [string, string][] = [['VOUT', 'VBUS 輸出（協商到的電壓）'], ['GND', '接地'], ['PG', '電源良好：協商成功時拉低（開汲極）']];

/** 協商結果 */
export function negotiate(p: BoardPart): { v: number; imax: number; ok: boolean } {
  const want = (p.pdVolt ?? 12) as PdVolt;
  const pdo = CHARGERS[p.charger ?? 'pd65'].pdo;
  if (pdo[want] !== undefined) return { v: want, imax: pdo[want]!, ok: true };
  return { v: 5, imax: pdo[5] ?? 2, ok: false };
}

export function ch224Elements(parts: BoardPart[], net: (h: string) => string): Element[] {
  const els: Element[] = [];
  for (const p of parts) {
    if (p.kind !== 'ch224' || p.burnt || p.plugged === false) continue;
    const n = (i: number) => net(p.pins[i]);
    const r = negotiate(p);
    // 充電器 + USB-C 線：輸出內阻約 50 mΩ
    els.push({ kind: 'src', id: p.id, p: n(CHP.VOUT), n: n(CHP.GND), v: r.v, r: 0.05 });
    // PG：開汲極，成功時對地導通
    if (r.ok) els.push({ kind: 'res', id: `${p.id}:pg`, a: n(CHP.PG), b: n(CHP.GND), r: 30 });
  }
  return els;
}
