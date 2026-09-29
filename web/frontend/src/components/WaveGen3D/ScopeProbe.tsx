// 示波器 CH2 探棒：從示波器 CH2 拉到負載板，探針勾在紅色（+）接線柱、接地夾夾在黑色（−）接線柱 → 量電源供應器輸出電壓
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { SCOPE, LOAD, LOAD_POSTS, loadToWorld, panelToWorld } from './layout.js';
import { Plug } from './BncCable.js';

const UP = new THREE.Vector3(0, 1, 0);

/** 沿著 a→b 擺一根圓柱 */
function Rod({ a, b, r0, r1 = r0, color, metal = false }: {
  a: THREE.Vector3; b: THREE.Vector3; r0: number; r1?: number; color: string; metal?: boolean;
}) {
  const { pos, quat, len } = useMemo(() => {
    const d = b.clone().sub(a);
    return {
      pos: a.clone().add(b).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()),
      len: d.length(),
    };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} castShadow>
      <cylinderGeometry args={[r1, r0, len, 16]} />
      <meshStandardMaterial color={color} metalness={metal ? 0.9 : 0.1} roughness={metal ? 0.25 : 0.5} />
    </mesh>
  );
}

function Tube({ pts, radius, color }: { pts: THREE.Vector3[]; radius: number; color: string }) {
  const geo = useMemo(
    () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 140, radius, 10, false),
    [pts, radius],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} castShadow>
      <meshStandardMaterial color={color} roughness={0.55} />
    </mesh>
  );
}

export function ScopeProbe() {
  const g = useMemo(() => {
    const rot = (v: THREE.Vector3) => v.clone().applyAxisAngle(UP, LOAD.rotY);
    const tip = loadToWorld(LOAD_POSTS.plus.clone().add(new THREE.Vector3(0.075, -0.1, 0)));
    const dir = rot(new THREE.Vector3(0.55, 0.8, -0.25)).normalize();
    const at = (k: number) => tip.clone().addScaledVector(dir, k);
    const gndEnd = loadToWorld(LOAD_POSTS.minus.clone().add(new THREE.Vector3(-0.075, -0.1, 0)));
    const gndStart = at(0.14);
    const bnc = (out: number) => panelToWorld(SCOPE, SCOPE.bnc2.x, SCOPE.bnc2.y, out);
    return {
      tip, at, gndEnd,
      cable: [
        at(0.46), at(0.8),
        new THREE.Vector3(-3.6, 0.05, 2.4),
        new THREE.Vector3(-0.6, 0.05, 2.45),
        new THREE.Vector3(1.6, 0.05, 2.35),
        bnc(0.75), bnc(0.35),
      ],
      gnd: [
        gndStart,
        new THREE.Vector3().lerpVectors(gndStart, gndEnd, 0.5).add(new THREE.Vector3(0, 0.12, 0.1)),
        gndEnd,
      ],
      plugAt: bnc(0),
    };
  }, []);

  return (
    <group>
      {/* 探針勾 + 探棒本體（灰色握把、黑色尾端） */}
      <Rod a={g.tip} b={g.at(0.07)} r0={0.008} color="#d8dde3" metal />
      <Rod a={g.at(0.07)} b={g.at(0.14)} r0={0.02} r1={0.03} color="#9aa3ad" />
      <Rod a={g.at(0.14)} b={g.at(0.36)} r0={0.032} color="#6b737d" />
      <Rod a={g.at(0.36)} b={g.at(0.46)} r0={0.03} r1={0.02} color="#1b1d20" />
      {/* 接地夾線 */}
      <Tube pts={g.gnd} radius={0.01} color="#111" />
      <Rod a={g.gndEnd} b={g.gndEnd.clone().add(new THREE.Vector3(0, 0.07, 0))} r0={0.018} color="#111" />
      {/* 探棒同軸線 → 示波器 CH2 */}
      <Tube pts={g.cable} radius={0.03} color="#2a3a44" />
      <Plug at={g.plugAt} rotY={SCOPE.rotY} />
    </group>
  );
}
