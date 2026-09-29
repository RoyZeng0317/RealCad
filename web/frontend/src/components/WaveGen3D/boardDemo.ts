// 範例電路：Va → 1N4007（防反接）→ LT1117-3.3 → 330 Ω 負載，三用電表量 3.3 V 輸出
import type { BoardPart } from './boardParts.js';
import { useBoard } from './boardStore.js';
import { usePsuLab } from './psuStore.js';
import { LOAD_STEPS } from './psu.js';

export function loadDemoCircuit() {
  const parts: BoardPart[] = [
    { id: 'demo-w1', kind: 'wire', pins: ['p:Va', 'b:1:0:0'], color: '#d42a2a', gen: 0 },
    { id: 'demo-w2', kind: 'wire', pins: ['p:GND', 'b:1:1:1'], color: '#1b1d20', gen: 0 },
    { id: 'demo-d1', kind: 'diode', pins: ['b:1:0:36', 't:1:30:0'], model: '1N4007', gen: 0 },
    // LT1117：第 29 列 GND、第 30 列 OUT、第 31 列 IN（程式裡列號從 0 算）
    { id: 'demo-u1', kind: 'ldo', pins: ['t:1:28:2', 't:1:29:2', 't:1:30:2'], gen: 0 },
    { id: 'demo-w3', kind: 'wire', pins: ['t:1:28:0', 'b:1:1:24'], color: '#1b1d20', gen: 0 },
    { id: 'demo-r1', kind: 'resistor', pins: ['t:1:29:0', 'b:1:1:12'], value: 330, gen: 0 },
  ];
  useBoard.getState().loadParts(parts);
  useBoard.setState({ dmm: 't:1:29:4', tool: 'select', selectedId: 'demo-u1' });
  const psu = usePsuLab.getState();
  psu.setPsu({ vSet: 7, iSet: 0.5, power: true, output: true });
  psu.setLoadIdx(LOAD_STEPS.length - 1); // 負載電阻改成開路，電源只供麵包板
}
