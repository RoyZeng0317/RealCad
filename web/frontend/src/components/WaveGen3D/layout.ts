// 實驗桌上各儀器的擺放位置（BNC 線、視角預設都依此計算）
import * as THREE from 'three';

export const GEN = {
  pos: new THREE.Vector3(-2.3, 0, 0.5),
  rotY: 0.12,
  size: { w: 3.4, h: 1.4, d: 2.6 },
  bnc: new THREE.Vector2(1.2, -0.45), // 前面板座標
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
  // 目標點往右偏，讓儀器避開畫面右側的 HTML 控制面板
  generator: { pos: panelToWorld(GEN, 0.9, 0.3, 4.2), target: panelToWorld(GEN, 0.9, 0, 0) },
  scope: { pos: panelToWorld(SCOPE, 0.9, 0.3, 4.8), target: panelToWorld(SCOPE, 0.9, 0, 0) },
  breadboard: {
    pos: new THREE.Vector3(BREADBOARD.pos.x + 0.75, 3.3, BREADBOARD.pos.z + 2.3),
    target: new THREE.Vector3(BREADBOARD.pos.x + 0.75, 0, BREADBOARD.pos.z + 0.25),
  },
  psu: { pos: panelToWorld(PSU, 1.0, 1.6, 4.6), target: panelToWorld(PSU, 1.0, -0.4, 0.9) },
};
