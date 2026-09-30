// 範例電路：Va → 1N4007（防反接）→ LT1117-3.3 → 330 Ω 負載，三用電表量 3.3 V 輸出
import type { BoardPart } from './boardParts.js';
import { useBoard } from './boardStore.js';
import { useWaveLab } from './waveStore.js';
import { TIME_DIVS, VOLT_DIVS } from './waveform.js';
import { usePsuLab } from './psuStore.js';
import { LOAD_STEPS } from './psu.js';
import { useDev } from './devboards/devStore.js';
import { DEV_BOARDS } from './devboards/boardDefs.js';
import { useFpga } from './devboards/fpga/fpgaStore.js';

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

/** 範例：Arduino Uno 讓外接 LED 閃爍（D13 → 220 Ω → 紅色 LED → GND），同時板載 L 燈也會閃 */
export function loadUnoBlink() {
  const dev = useDev.getState();
  (['esp32', 'stm32', 'pi5'] as const).forEach((k) => dev.conf[k].present && dev.setPresent(k, false));
  if (!dev.conf.uno.present) dev.setPresent('uno', true);
  dev.setCode('uno', DEV_BOARDS.uno.example);
  if (!useDev.getState().conf.uno.usb) dev.setUsb('uno', true);
  useBoard.getState().loadParts([
    { id: 'ex-w1', kind: 'wire', pins: ['h:uno:D13', 't:1:8:9'], color: '#e07a1a', gen: 0 },
    { id: 'ex-r1', kind: 'resistor', pins: ['t:1:8:7', 't:1:14:7'], value: 220, gen: 0 },
    { id: 'ex-led', kind: 'led', pins: ['t:1:14:6', 'b:2:1:14'], ledColor: 'red', gen: 0 },
    { id: 'ex-w2', kind: 'wire', pins: ['h:uno:GND_T', 'b:2:1:2'], color: '#1b1d20', gen: 0 },
  ]);
  useBoard.setState({ dmm: 't:1:14:5', tool: 'select', selectedId: 'ex-led' });
  dev.reboot('uno');
}

/** 錯誤示範：電源供應器 5 V 直接接到 ESP32 的 GPIO4（3.3 V 晶片不耐 5 V）→ 顯示 ERROR 並燒毀腳位 */
export function loadEsp32Mistake() {
  const dev = useDev.getState();
  (['uno', 'stm32', 'pi5'] as const).forEach((k) => dev.conf[k].present && dev.setPresent(k, false));
  if (!dev.conf.esp32.present) dev.setPresent('esp32', true);
  else dev.repair('esp32');
  dev.setCode('esp32', `// 讀 GPIO4 的電位並印出來
void setup() {
  Serial.begin(115200);
  pinMode(4, INPUT);
}

void loop() {
  Serial.print("GPIO4 = ");
  Serial.println(digitalRead(4));
  delay(500);
}
`);
  useBoard.getState().loadParts([
    { id: 'ex-w1', kind: 'wire', pins: ['p:Va', 'b:2:0:0'], color: '#d42a2a', gen: 0 },
    { id: 'ex-w2', kind: 'wire', pins: ['p:GND', 'b:2:1:0'], color: '#1b1d20', gen: 0 },
    { id: 'ex-w3', kind: 'wire', pins: ['b:2:0:8', 'h:esp32:IO4'], color: '#e0b010', gen: 0 },
    { id: 'ex-w4', kind: 'wire', pins: ['b:2:1:8', 'h:esp32:GND_0'], color: '#1b1d20', gen: 0 },
  ]);
  useBoard.setState({ dmm: 'b:2:0:10', tool: 'select', selectedId: null });
  const psu = usePsuLab.getState();
  psu.setPsu({ vSet: 5, iSet: 0.5, power: true, output: true });
  psu.setLoadIdx(LOAD_STEPS.length - 1);
  dev.select('esp32');
  dev.reboot('esp32');
}

/** 範例：Raspberry Pi 5 用 MicroPython 讓外接 LED 閃爍（GPIO17 → 220 Ω → 綠色 LED → GND） */
export function loadPi5Blink() {
  const dev = useDev.getState();
  (['uno', 'esp32', 'stm32'] as const).forEach((k) => useDev.getState().conf[k].present && dev.setPresent(k, false));
  if (!useDev.getState().conf.pi5.present) dev.setPresent('pi5', true);
  dev.setCode('pi5', DEV_BOARDS.pi5.example);
  if (!useDev.getState().conf.pi5.usb) dev.setUsb('pi5', true);
  useBoard.getState().loadParts([
    { id: 'ex-w1', kind: 'wire', pins: ['h:pi5:GPIO17', 't:1:20:9'], color: '#2aa84a', gen: 0 },
    { id: 'ex-r1', kind: 'resistor', pins: ['t:1:20:7', 't:1:26:7'], value: 220, gen: 0 },
    { id: 'ex-led', kind: 'led', pins: ['t:1:26:6', 'b:2:1:26'], ledColor: 'green', gen: 0 },
    { id: 'ex-w2', kind: 'wire', pins: ['h:pi5:GND_9', 'b:2:1:20'], color: '#1b1d20', gen: 0 },
  ]);
  useBoard.setState({ dmm: 't:1:26:5', tool: 'select', selectedId: 'ex-led' });
  dev.select('pi5');
  dev.reboot('pi5');
}

/** 範例：FLEX 10K FPGA 計數器（編譯 + JTAG 燒錄），J1 IO0 → 330 Ω → 麵包板上的綠色 LED 跟著計數閃 */
export function loadFpgaCounter() {
  const dev = useDev.getState();
  (['uno', 'esp32', 'stm32', 'pi5'] as const).forEach((k) => dev.conf[k].present && dev.setPresent(k, false));
  if (!dev.conf.fpga.present) dev.setPresent('fpga', true);
  else dev.repair('fpga');
  if (!useDev.getState().conf.fpga.usb) dev.setUsb('fpga', true);
  useBoard.getState().loadParts([
    { id: 'fx-w1', kind: 'wire', pins: ['h:fpga:IO0', 't:1:8:9'], color: '#2a7aff', gen: 0 },
    { id: 'fx-r1', kind: 'resistor', pins: ['t:1:8:7', 't:1:14:7'], value: 330, gen: 0 },
    { id: 'fx-led', kind: 'led', pins: ['t:1:14:6', 'b:2:1:14'], ledColor: 'green', gen: 0 },
    { id: 'fx-w2', kind: 'wire', pins: ['h:fpga:GND_39', 'b:2:1:2'], color: '#1b1d20', gen: 0 },
  ]);
  useBoard.setState({ dmm: 't:1:14:5', tool: 'select', selectedId: 'fx-led' });
  const f = useFpga.getState();
  f.loadExample();
  f.setProg({ mode: 'jtag', source: 'build' });
  f.compile();
  f.program(true);
}

/** 範例：函數產生器接麵包板做半波整流 — 10 Vpp 正弦 → 1N4007 → 1 kΩ 到地；CH1 看輸入、CH2 看電阻上的輸出（只剩正半週，少 0.7 V） */
export function loadRectifierDemo() {
  useBoard.getState().loadParts([
    { id: 'rx-d1', kind: 'diode', pins: ['t:1:20:2', 't:1:26:2'], model: '1N4007', gen: 0 },
    { id: 'rx-r1', kind: 'resistor', pins: ['t:1:26:3', 'b:1:1:26'], value: 1000, gen: 0 },
  ]);
  useBoard.setState({ tool: 'select', selectedId: null, dmm: 't:1:26:4', dmmBlack: 'p:GND' });
  const b = useBoard.getState();
  b.setLead('fg', ['t:1:20:0', 'b:1:1:20']);
  b.setLead('ch1', ['t:1:20:1', 'b:1:1:21']);
  b.setLead('ch2', ['t:1:26:1', 'b:1:1:27']);
  const w = useWaveLab.getState();
  w.setWaveform('sine');
  w.setGen({ frequency: 1000, amplitude: 10, offset: 0, power: true, output: true });
  w.setScope({ timeDivIdx: TIME_DIVS.indexOf(0.0002), voltDivIdx: VOLT_DIVS.indexOf(2), position: 1.5, ch2On: true, ch2VoltDivIdx: VOLT_DIVS.indexOf(2), ch2Position: -3, trigSource: 'CH1', trigLevel: 0, coupling: 'DC', running: true });
}
