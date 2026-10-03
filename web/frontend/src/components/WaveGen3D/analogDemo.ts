// 類比零件範例：RC 充放電（示波器看電容電壓）、可變電阻控制電晶體開關 LED、變壓器降壓、中心抽頭變壓器全波整流
import { useBoard } from './boardStore.js';
import { useWaveLab } from './waveStore.js';
import { usePsuLab } from './psuStore.js';
import { LOAD_STEPS } from './psu.js';
import { TIME_DIVS, VOLT_DIVS } from './waveform.js';

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
