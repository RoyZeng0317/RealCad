// 類比零件範例：RC 充放電（示波器看電容電壓）、可變電阻控制電晶體開關 LED、變壓器降壓、中心抽頭變壓器全波整流、電晶體特性曲線、電池 LED 燈、LDR 小夜燈、NE555（CH224K 供電閃爍燈 / 示波器看波形）
import { useBoard } from './boardStore.js';
import { useWaveLab } from './waveStore.js';
import { usePsuLab } from './psuStore.js';
import { LOAD_STEPS } from './psu.js';
import { TIME_DIVS, VOLT_DIVS } from './waveform.js';
import { clearXyPersist } from './scopeDisplay.js';
import type { BoardPart, CapModel } from './boardParts.js';

/** 產生器方波 2 Hz → 1 kΩ → 100 µF：CH1 看輸入方波、CH2 看電容慢慢充電 / 放電（τ = RC ≈ 0.1 s） */
export function loadRcDemo() {
  useBoard.getState().loadParts([
    { id: 'rc-r1', kind: 'resistor', pins: ['t:1:20:3', 't:1:30:3'], value: 1000, gen: 0 },
    { id: 'rc-c1', kind: 'cap', pins: ['t:1:30:1', 'b:1:1:30'], capModel: '100u50', gen: 0 },
  ]);
  useBoard.setState({ tool: 'select', selectedId: 'rc-c1', dmm: null, dmmBlack: 'p:GND' });
  const b = useBoard.getState();
  b.setLead('fg', ['t:1:20:0', 'b:1:1:8']);
  b.setLead('ch1', ['t:1:20:4', 'b:1:1:14']);
  b.setLead('ch2', ['t:1:30:4', 'b:1:1:38']);
  b.setLead('sa', null);
  const w = useWaveLab.getState();
  w.setWaveform('square');
  w.setGen({ frequency: 2, amplitude: 4, offset: 0, power: true, output: true });
  w.setScope({ timeDivIdx: TIME_DIVS.indexOf(0.1), voltDivIdx: VOLT_DIVS.indexOf(1), position: 1.5, ch2On: true, ch2VoltDivIdx: VOLT_DIVS.indexOf(1), ch2Position: -2, trigSource: 'CH1', trigLevel: 0, coupling: 'DC', running: true });
}

/**
 * 電源 5 V：10 kΩ 可變電阻當分壓器 → 10 kΩ → 2N3904 基極；集極接 LED（經 330 Ω 到 5 V）。
 * 旋鈕往腳 1（接 5 V）轉，基極電壓升高 → 電晶體導通 → LED 亮
 */
export function loadBjtDemo() {
  useBoard.getState().loadParts([
    { id: 'q-w1', kind: 'wire', pins: ['p:Va', 'b:1:0:0'], color: '#d42a2a', gen: 0 },
    { id: 'q-w2', kind: 'wire', pins: ['p:GND', 'b:1:1:1'], color: '#1b1d20', gen: 0 },
    { id: 'q-vr', kind: 'pot', pins: ['t:1:10:2', 't:1:11:2', 't:1:12:2'], value: 10e3, pos: 0.9, gen: 0 },
    { id: 'q-w3', kind: 'wire', pins: ['t:1:10:0', 'b:1:0:10'], color: '#d42a2a', gen: 0 },
    { id: 'q-w4', kind: 'wire', pins: ['t:1:12:0', 'b:1:1:13'], color: '#1b1d20', gen: 0 },
    { id: 'q-rb', kind: 'resistor', pins: ['t:1:11:4', 't:1:20:4'], value: 10e3, gen: 0 },
    // 2N3904：第 20 列 E、第 21 列 B、第 22 列 C（程式裡列號從 0 算）
    { id: 'q-q1', kind: 'bjt', pins: ['t:1:19:2', 't:1:20:2', 't:1:21:2'], bjtModel: '2N3904', gen: 0 },
    { id: 'q-w5', kind: 'wire', pins: ['t:1:19:0', 'b:1:1:19'], color: '#1b1d20', gen: 0 },
    { id: 'q-led', kind: 'led', pins: ['t:1:26:3', 't:1:21:3'], ledColor: 'green', gen: 0 },
    { id: 'q-rc', kind: 'resistor', pins: ['b:1:0:26', 't:1:26:4'], value: 330, gen: 0 },
  ]);
  useBoard.setState({ tool: 'select', selectedId: 'q-vr', dmm: 't:1:20:0', dmmBlack: 'p:GND' });
  const b = useBoard.getState();
  (['fg', 'ch1', 'ch2', 'sa', 'dm'] as const).forEach((k) => b.setLead(k, null));
  const psu = usePsuLab.getState();
  psu.setPsu({ vSet: 5, iSet: 0.5, power: true, output: true });
  psu.setLoadIdx(LOAD_STEPS.length - 1);
}

/**
 * 函數產生器 1 kHz 正弦 10 Vpp → 2 : 1 變壓器一次側（P1 第 21 列 e 欄、P2 第 24 列 e 欄）；二次側接 1 kΩ 負載
 * CH1 看一次側、CH2 看二次側（接地夾夾在 S2，兩側隔離所以要各自找參考點）→ 二次側振幅約一半、同相位（同名端 P1、S1）
 */
export function loadXfmrDemo() {
  useBoard.getState().loadParts([
    { id: 'tx-t1', kind: 'xfmr', pins: ['t:1:20:4', 't:1:23:4', 't:1:20:5', 't:1:23:5'], xfmrModel: '2:1', gen: 0 },
    { id: 'tx-rl', kind: 'resistor', pins: ['t:1:20:7', 't:1:23:7'], value: 1000, gen: 0 },
  ]);
  useBoard.setState({ tool: 'select', selectedId: 'tx-t1', dmm: null, dmmBlack: 'p:GND' });
  const b = useBoard.getState();
  b.setLead('fg', ['t:1:20:0', 't:1:23:0']);
  b.setLead('ch1', ['t:1:20:2', 't:1:23:2']);
  b.setLead('ch2', ['t:1:20:9', 't:1:23:9']);
  (['sa', 'dm'] as const).forEach((k) => b.setLead(k, null));
  const w = useWaveLab.getState();
  w.setWaveform('sine');
  w.setGen({ frequency: 1000, amplitude: 10, offset: 0, power: true, output: true });
  w.setScope({ timeDivIdx: TIME_DIVS.indexOf(2e-4), voltDivIdx: VOLT_DIVS.indexOf(2), position: 0, ch2On: true, ch2VoltDivIdx: VOLT_DIVS.indexOf(2), ch2Position: 0, trigSource: 'CH1', trigLevel: 0, coupling: 'DC', running: true });
}

/**
 * 12 V 中心抽頭變壓器（6-0-6 V，插 110 V 市電）全波整流：A、B 各接一顆 1N4007，陰極接在一起當 +，
 * 100 µF 濾波 + 1 kΩ 負載接到 COM。CH1 看 A 對 COM 的交流、CH2 看整流濾波後的直流（含漣波）
 */
export function loadCtxDemo() {
  useBoard.getState().loadParts([
    { id: 'ct-t1', kind: 'ctx', pins: ['t:1:10:2', 't:1:12:2', 't:1:14:2'], ctxModel: '12', plugged: true, gen: 0 },
    { id: 'ct-d1', kind: 'diode', pins: ['t:1:10:4', 't:1:20:4'], model: '1N4007', gen: 0 },
    { id: 'ct-d2', kind: 'diode', pins: ['t:1:14:3', 't:1:20:3'], model: '1N4007', gen: 0 },
    { id: 'ct-w1', kind: 'wire', pins: ['t:1:20:2', 't:1:20:7'], color: '#d42a2a', gen: 0 },
    { id: 'ct-w2', kind: 'wire', pins: ['t:1:12:4', 't:1:12:5'], color: '#1b1d20', gen: 0 },
    { id: 'ct-c1', kind: 'cap', pins: ['t:1:20:8', 't:1:12:8'], capModel: '100u50', gen: 0 },
    { id: 'ct-rl', kind: 'resistor', pins: ['t:1:20:6', 't:1:12:6'], value: 1000, gen: 0 },
  ]);
  useBoard.setState({ tool: 'select', selectedId: 'ct-t1', dmm: null, dmmBlack: 'p:GND' });
  const b = useBoard.getState();
  b.setLead('ch1', ['t:1:10:1', 't:1:12:1']);
  b.setLead('ch2', ['t:1:20:9', 't:1:12:9']);
  (['fg', 'sa', 'dm'] as const).forEach((k) => b.setLead(k, null));
  useWaveLab.getState().setScope({ timeDivIdx: TIME_DIVS.indexOf(5e-3), voltDivIdx: VOLT_DIVS.indexOf(5), position: 0, ch2On: true, ch2VoltDivIdx: VOLT_DIVS.indexOf(5), ch2Position: 0, trigSource: 'CH1', trigLevel: 0, coupling: 'DC', running: true });
}

/**
 * 電晶體特性曲線（IC–VCE 輸出特性，曲線描繪器）：
 *   基極：電源供應器 5 V → 100 kΩ 可變電阻分壓 → RB 100 kΩ → 2N3904 基極（轉旋鈕改 IB，約 0 ~ 40 µA）
 *   集極：函數產生器三角波 0 ~ 10 V 直接掃 VCE；射極經 RE 100 Ω 接地 → RE 上的電壓 = IE × 100 Ω ≈ IC（10 mV = 0.1 mA）
 *   示波器 XY：X = CH1（集極電壓 ≈ VCE），Y = CH2（射極電壓 ∝ IC，0.1 V/div = 1 mA/div）；開殘影，轉旋鈕就留下一整族曲線
 */
export function loadCurveDemo() {
  useBoard.getState().loadParts([
    { id: 'cv-w1', kind: 'wire', pins: ['p:Va', 'b:1:0:0'], color: '#d42a2a', gen: 0 },
    { id: 'cv-w2', kind: 'wire', pins: ['p:GND', 'b:1:1:1'], color: '#1b1d20', gen: 0 },
    // 可變電阻 100 kΩ：第 11 列腳 1（接 5 V）、第 12 列 W、第 13 列腳 3（接地）
    { id: 'cv-vr', kind: 'pot', pins: ['t:1:10:2', 't:1:11:2', 't:1:12:2'], value: 100e3, pos: 0.5, gen: 0 },
    { id: 'cv-w3', kind: 'wire', pins: ['t:1:10:0', 'b:1:0:10'], color: '#d42a2a', gen: 0 },
    { id: 'cv-w4', kind: 'wire', pins: ['t:1:12:0', 'b:1:1:13'], color: '#1b1d20', gen: 0 },
    { id: 'cv-rb', kind: 'resistor', pins: ['t:1:11:4', 't:1:20:4'], value: 100e3, gen: 0 },
    // 2N3904：第 20 列 E、第 21 列 B、第 22 列 C
    { id: 'cv-q1', kind: 'bjt', pins: ['t:1:19:2', 't:1:20:2', 't:1:21:2'], bjtModel: '2N3904', rot: 1, gen: 0 },
    { id: 'cv-re', kind: 'resistor', pins: ['t:1:19:0', 'b:1:1:19'], value: 100, gen: 0 },
  ]);
  useBoard.setState({ tool: 'select', selectedId: 'cv-vr', dmm: 't:1:20:0', dmmBlack: 'p:GND' });
  const b = useBoard.getState();
  b.setLead('fg', ['t:1:21:0', 'b:1:1:30']);
  b.setLead('ch1', ['t:1:21:4', 'b:1:1:36']);
  b.setLead('ch2', ['t:1:19:4', 'b:1:1:40']);
  (['sa', 'dm'] as const).forEach((k) => b.setLead(k, null));
  const psu = usePsuLab.getState();
  psu.setPsu({ vSet: 5, iSet: 0.1, power: true, output: true });
  psu.setLoadIdx(LOAD_STEPS.length - 1);
  const w = useWaveLab.getState();
  w.setWaveform('triangle');
  w.setGen({ frequency: 100, amplitude: 10, offset: 5, power: true, output: true });
  w.setScope({ timeDivIdx: TIME_DIVS.indexOf(2e-3), voltDivIdx: VOLT_DIVS.indexOf(1), position: 0, ch2On: true, ch2VoltDivIdx: VOLT_DIVS.indexOf(0.1), ch2Position: -4, trigSource: 'CH1', trigLevel: 5, coupling: 'DC', running: true, xy: true, persist: true });
  clearXyPersist();
}

/** 清掉儀器的線、關掉電源供應器與產生器輸出（電池電路不需要它們） */
function benchOff() {
  const b = useBoard.getState();
  (['fg', 'ch1', 'ch2', 'sa', 'dm'] as const).forEach((k) => b.setLead(k, null));
  usePsuLab.getState().setPsu({ output: false });
  useWaveLab.getState().setGen({ output: false });
}

/** 9 V 電池 → 470 Ω 限流電阻 → 紅色 LED → 回到電池 −：I = (9 − 2) / 470 ≈ 15 mA */
export function loadBattLedDemo() {
  useBoard.getState().loadParts([
    { id: 'bl-bt', kind: 'batt', pins: ['t:1:30:0', 't:1:34:0'], battModel: '9V', gen: 0 },
    { id: 'bl-r1', kind: 'resistor', pins: ['t:1:30:3', 't:1:38:3'], value: 470, gen: 0 },
    { id: 'bl-led', kind: 'led', pins: ['t:1:38:4', 't:1:42:4'], ledColor: 'red', gen: 0 },
    { id: 'bl-w1', kind: 'wire', pins: ['t:1:42:2', 't:1:34:2'], color: '#1b1d20', gen: 0 },
  ]);
  useBoard.setState({ tool: 'select', selectedId: 'bl-bt', dmm: 't:1:38:0', dmmBlack: 't:1:34:1' });
  benchOff();
}

/**
 * LDR 小夜燈（天黑自動亮）：9 V 電池、BC547、GL5528 光敏電阻
 *   47 kΩ（+ → 基極）與光敏電阻（基極 → 地）分壓：亮的時候 LDR 阻值小 → 基極電壓低 → BC547 截止、LED 熄
 *   變暗時 LDR 阻值變大 → 基極電壓升到 0.6 V 以上 → BC547 導通 → LED（經 470 Ω）亮
 */
export function loadNightLightDemo() {
  useBoard.getState().loadParts([
    { id: 'nl-bt', kind: 'batt', pins: ['t:1:5:0', 't:1:8:0'], battModel: '9V', gen: 0 },
    { id: 'nl-w1', kind: 'wire', pins: ['t:1:5:2', 'b:1:0:4'], color: '#d42a2a', gen: 0 },
    { id: 'nl-w2', kind: 'wire', pins: ['t:1:8:2', 'b:1:1:7'], color: '#1b1d20', gen: 0 },
    // BC547：平面朝自己由左到右 C、B、E → 第 21 列 C、第 22 列 B、第 23 列 E（pins 存 [E, B, C]）
    { id: 'nl-q1', kind: 'bjt', pins: ['t:1:22:2', 't:1:21:2', 't:1:20:2'], bjtModel: 'BC547', rot: 1, gen: 0 },
    { id: 'nl-r1', kind: 'resistor', pins: ['b:1:0:19', 't:1:21:0'], value: 47e3, gen: 0 },
    { id: 'nl-ldr', kind: 'ldr', pins: ['t:1:21:4', 'b:1:1:25'], ldrModel: 'GL5528', lux: 300, gen: 0 },
    { id: 'nl-w3', kind: 'wire', pins: ['t:1:22:0', 'b:1:1:22'], color: '#1b1d20', gen: 0 },
    { id: 'nl-rc', kind: 'resistor', pins: ['b:1:0:12', 't:1:12:3'], value: 470, gen: 0 },
    { id: 'nl-led', kind: 'led', pins: ['t:1:12:4', 't:1:20:4'], ledColor: 'yellow', gen: 0 },
  ]);
  useBoard.setState({ tool: 'select', selectedId: 'nl-ldr', dmm: 't:1:21:1', dmmBlack: 'b:1:1:31' });
  benchOff();
}

/**
 * NE555 無穩態接法（IC 放在第 21–24 列，第 1 腳在 e 欄）：
 *   第 1 腳 GND、第 8 腳 VCC、第 4 腳 RESET 接 VCC、第 5 腳 CTRL 接 0.01 µF 到地
 *   VCC → R1 → 第 7 腳 DIS → R2 → 第 6 腳 THR（= 第 2 腳 TRIG）→ C → 地
 *   f ≈ 1.44 / ((R1 + 2·R2)·C)；第 3 腳 OUT → 470 Ω → LED → 地
 */
function ne555Astable(tag: string, r1: number, r2: number, cap: CapModel): BoardPart[] {
  return [
    { id: `${tag}-u1`, kind: 'ne555', pins: ['t:1:20:4', 't:1:21:4', 't:1:22:4', 't:1:23:4', 't:1:23:5', 't:1:22:5', 't:1:21:5', 't:1:20:5'], gen: 0 },
    { id: `${tag}-wg`, kind: 'wire', pins: ['t:1:20:0', 'b:1:1:20'], color: '#1b1d20', gen: 0 },
    { id: `${tag}-wv`, kind: 'wire', pins: ['t:1:20:9', 'b:1:0:21'], color: '#d42a2a', gen: 0 },
    { id: `${tag}-wr`, kind: 'wire', pins: ['t:1:23:3', 'b:1:0:24'], color: '#d42a2a', gen: 0 },
    { id: `${tag}-r1`, kind: 'resistor', pins: ['b:1:0:25', 't:1:21:7'], value: r1, gen: 0 },
    { id: `${tag}-r2`, kind: 'resistor', pins: ['t:1:21:8', 't:1:22:8'], value: r2, gen: 0 },
    { id: `${tag}-wt`, kind: 'wire', pins: ['t:1:21:2', 't:1:22:9'], color: '#2a6fd4', gen: 0 },
    { id: `${tag}-c1`, kind: 'cap', pins: ['t:1:22:7', 'b:1:1:27'], capModel: cap, gen: 0 },
    { id: `${tag}-c2`, kind: 'cap', pins: ['t:1:23:7', 'b:1:1:28'], capModel: '103', gen: 0 },
    { id: `${tag}-ro`, kind: 'resistor', pins: ['t:1:22:1', 't:1:30:1'], value: 470, gen: 0 },
    { id: `${tag}-led`, kind: 'led', pins: ['t:1:30:3', 't:1:33:3'], ledColor: 'red', gen: 0 },
    { id: `${tag}-wl`, kind: 'wire', pins: ['t:1:33:0', 'b:1:1:31'], color: '#1b1d20', gen: 0 },
  ];
}

/**
 * CH224K（PD 65 W 充電器協商 9 V）供電的 NE555 LED 閃爍燈：R1 1 kΩ、R2 10 kΩ、C 47 µF → 約 1.5 Hz，LED 真的一閃一閃
 *   CH224K 的 PG 接綠色 LED（經 2.2 kΩ 到 VOUT）：協商成功時 PG 拉低 → 綠燈亮
 */
export function loadNe555BlinkDemo() {
  useBoard.getState().loadParts([
    { id: 'pd-m1', kind: 'ch224', pins: ['t:1:3:2', 't:1:4:2', 't:1:5:2'], pdVolt: 9, charger: 'pd65', plugged: true, gen: 0 },
    { id: 'pd-wv', kind: 'wire', pins: ['t:1:3:0', 'b:1:0:3'], color: '#d42a2a', gen: 0 },
    { id: 'pd-wg', kind: 'wire', pins: ['t:1:4:0', 'b:1:1:4'], color: '#1b1d20', gen: 0 },
    { id: 'pd-rpg', kind: 'resistor', pins: ['b:1:0:9', 't:1:8:0'], value: 2200, gen: 0 },
    { id: 'pd-led', kind: 'led', pins: ['t:1:8:4', 't:1:5:4'], ledColor: 'green', gen: 0 },
    ...ne555Astable('nb', 1000, 10e3, '47u25'),
  ]);
  useBoard.setState({ tool: 'select', selectedId: 'nb-u1', dmm: 't:1:22:0', dmmBlack: 'b:1:1:32' });
  benchOff();
}

/** 電源供應器 5 V 的 NE555：R1 1 kΩ、R2 10 kΩ、C 0.1 µF → 約 690 Hz；CH1 看 OUT（方波）、CH2 看電容（在 1/3 與 2/3 VCC 之間充放電） */
export function loadNe555ScopeDemo() {
  useBoard.getState().loadParts([
    { id: 'ns-w1', kind: 'wire', pins: ['p:Va', 'b:1:0:0'], color: '#d42a2a', gen: 0 },
    { id: 'ns-w2', kind: 'wire', pins: ['p:GND', 'b:1:1:1'], color: '#1b1d20', gen: 0 },
    ...ne555Astable('ns', 1000, 10e3, '104'),
  ]);
  useBoard.setState({ tool: 'select', selectedId: 'ns-u1', dmm: null, dmmBlack: 'p:GND' });
  const b = useBoard.getState();
  b.setLead('ch1', ['t:1:22:0', 'b:1:1:36']);
  b.setLead('ch2', ['t:1:22:6', 'b:1:1:40']);
  (['fg', 'sa', 'dm'] as const).forEach((k) => b.setLead(k, null));
  const psu = usePsuLab.getState();
  psu.setPsu({ vSet: 5, iSet: 0.2, power: true, output: true });
  psu.setLoadIdx(LOAD_STEPS.length - 1);
  useWaveLab.getState().setGen({ output: false });
  useWaveLab.getState().setScope({ timeDivIdx: TIME_DIVS.indexOf(5e-4), voltDivIdx: VOLT_DIVS.indexOf(2), position: -2, ch2On: true, ch2VoltDivIdx: VOLT_DIVS.indexOf(1), ch2Position: -3, trigSource: 'CH1', trigLevel: 2, coupling: 'DC', running: true, xy: false });
}
