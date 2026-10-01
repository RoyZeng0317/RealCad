// 實驗桌上各儀器的擺放位置（BNC 線、視角預設都依此計算）
import * as THREE from 'three';

export const GEN = {
  pos: new THREE.Vector3(-2.3, 0, 0.5),
  rotY: 0.12,
  size: { w: 3.4, h: 1.4, d: 2.6 },
  bnc: new THREE.Vector2(1.2, -0.45), // 前面板座標
};

// 頻譜分析儀 SA-1010：疊放在函數波產生器上面（實驗室常見擺法），面板朝向一樣
export const SA = {
  pos: new THREE.Vector3(-2.3, 1.4, 0.4),
  rotY: 0.12,
  size: { w: 3.2, h: 1.3, d: 2.3 },
  bnc: new THREE.Vector2(1.22, -0.4), // RF IN（前面板座標）
};

export const SCOPE = {
  pos: new THREE.Vector3(1.95, 0, 0.1),
  rotY: -0.16,
  size: { w: 3.9, h: 2.3, d: 2.4 },
  bnc: new THREE.Vector2(0.75, -0.85),
  bnc2: new THREE.Vector2(1.2, -0.85), // CH2
};

export const PSU = {
  pos: new THREE.Vector3(-5.9, 0, 0.7),
  rotY: 0.28,
  size: { w: 2.6, h: 1.5, d: 2.2 },
  jackPlus: new THREE.Vector2(0.8, -0.4),
  jackGnd: new THREE.Vector2(0.97, -0.4),
  jackMinus: new THREE.Vector2(1.14, -0.4),
};

// 桌上型萬用電表 DM-5050（跟電源供應器一樣大，放在實驗桌左前方）：右側 2×2 香蕉插座 HI / mA / LO(COM) / 10A
export const DM = {
  pos: new THREE.Vector3(-7.0, 0, 3.9),
  rotY: 0.42,
  size: { w: 2.6, h: 1.5, d: 2.2 },
  jackHi: new THREE.Vector2(0.78, -0.08),
  jackMa: new THREE.Vector2(1.08, -0.08),
  jackLo: new THREE.Vector2(0.78, -0.42),
  jack10: new THREE.Vector2(1.08, -0.42),
};

// 電阻負載（放在電源前方桌面上，接線端子朝上）
export const LOAD = {
  pos: new THREE.Vector3(-4.7, 0, 3.0),
  rotY: 0.15,
};

// 負載板上的接線柱（負載本地座標）；紅黑測試線與 CH2 探棒都夾在這裡
export const LOAD_POSTS = {
  plus: new THREE.Vector3(-0.62, 0.3, 0.22),
  minus: new THREE.Vector3(0.62, 0.3, 0.22),
};

export const loadToWorld = (v: THREE.Vector3) =>
  v.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), LOAD.rotY).add(LOAD.pos);

// 大型麵包板（2 條 63 列端子排 + 3 條電源軌，直放；接線柱 Va/Vb/GND 在遠端）
export const BREADBOARD = {
  pos: new THREE.Vector3(-1.9, 0, 4.4),
  rotY: 0,
};

export const boardToWorld = (v: THREE.Vector3) =>
  v.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), BREADBOARD.rotY).add(BREADBOARD.pos);

type Inst = { pos: THREE.Vector3; rotY: number; size: { w: number; h: number; d: number } };

/** 前面板座標 (x, y, 往外 z) → 世界座標 */
export function panelToWorld(inst: Inst, x: number, y: number, out = 0): THREE.Vector3 {
  const local = new THREE.Vector3(x, inst.size.h / 2 + y, inst.size.d / 2 + out);
  return local.applyAxisAngle(new THREE.Vector3(0, 1, 0), inst.rotY).add(inst.pos);
}

export const VIEWS = {
  overview: { pos: new THREE.Vector3(-1.6, 6.6, 12.4), target: new THREE.Vector3(-1.6, 0.6, 1.6) },
  generator: { pos: panelToWorld(GEN, 0, 0.3, 4.4), target: panelToWorld(GEN, 0, 0, 0) },
  scope: { pos: panelToWorld(SCOPE, 0, 0.3, 5.0), target: panelToWorld(SCOPE, 0, 0, 0) },
  breadboard: {
    pos: new THREE.Vector3(BREADBOARD.pos.x, 3.6, BREADBOARD.pos.z + 2.6),
    target: new THREE.Vector3(BREADBOARD.pos.x, 0, BREADBOARD.pos.z + 0.25),
  },
  // 開發板區：麵包板右邊（麵包板本地 x 1.7 ~ 5.2）
  devboards: {
    pos: new THREE.Vector3(BREADBOARD.pos.x + 3.4, 4.0, BREADBOARD.pos.z + 2.1),
    target: new THREE.Vector3(BREADBOARD.pos.x + 3.3, 0, BREADBOARD.pos.z - 0.1),
  },
  // FPGA 實驗板（麵包板本地 x 6.25）
  fpga: {
    pos: new THREE.Vector3(BREADBOARD.pos.x + 6.25, 3.0, BREADBOARD.pos.z + 1.7),
    target: new THREE.Vector3(BREADBOARD.pos.x + 6.2, 0, BREADBOARD.pos.z - 0.1),
  },
  // 4×4 麵包板矩陣（側桌，麵包板本地 x 8.4 ~ 13.7、z -9.2 ~ 3.9），從斜上方看整片
  bbgrid: {
    pos: new THREE.Vector3(BREADBOARD.pos.x + 11.0, 15.5, BREADBOARD.pos.z + 5.0),
    target: new THREE.Vector3(BREADBOARD.pos.x + 11.0, 0, BREADBOARD.pos.z - 1.2),
  },
  // 2×2 麵包板組（再往右的小側桌，麵包板本地 x 14.6 ~ 16.95、z -5.9 ~ 0.6）
  bbgrid2: {
    pos: new THREE.Vector3(BREADBOARD.pos.x + 15.9, 7.5, BREADBOARD.pos.z + 3.2),
    target: new THREE.Vector3(BREADBOARD.pos.x + 15.9, 0, BREADBOARD.pos.z - 2.6),
  },
  dmm: { pos: panelToWorld(DM, 0, 0.3, 4.2), target: panelToWorld(DM, 0, 0, 0) },
  spectrum: { pos: panelToWorld(SA, 0, 0.2, 4.2), target: panelToWorld(SA, 0, 0, 0) },
  psu: { pos: panelToWorld(PSU, 0.6, 1.6, 4.8), target: panelToWorld(PSU, 0.6, -0.4, 0.9) },
};
