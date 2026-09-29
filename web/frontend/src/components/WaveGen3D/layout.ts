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
};

type Inst = typeof GEN;

/** 前面板座標 (x, y, 往外 z) → 世界座標 */
export function panelToWorld(inst: Inst, x: number, y: number, out = 0): THREE.Vector3 {
  const local = new THREE.Vector3(x, inst.size.h / 2 + y, inst.size.d / 2 + out);
  return local.applyAxisAngle(new THREE.Vector3(0, 1, 0), inst.rotY).add(inst.pos);
}

export const VIEWS = {
  overview: { pos: new THREE.Vector3(0.2, 4.2, 8.4), target: new THREE.Vector3(0, 0.9, 0.4) },
  // 目標點往右偏，讓儀器避開畫面右側的 HTML 控制面板
  generator: { pos: panelToWorld(GEN, 0.9, 0.3, 4.2), target: panelToWorld(GEN, 0.9, 0, 0) },
  scope: { pos: panelToWorld(SCOPE, 0.9, 0.3, 4.8), target: panelToWorld(SCOPE, 0.9, 0, 0) },
};
