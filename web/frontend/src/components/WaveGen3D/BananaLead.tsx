// 香蕉插頭測試線：從電源供應器（或桌上型萬用電表）的插座拉到指定端點；stack=1 代表疊插在第一支插頭後面
// 線上光點速度 ∝ 電流（getCurrent 每幀呼叫）
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PSU, panelToWorld } from './layout.js';

type Inst = Parameters<typeof panelToWorld>[0];

export function BananaLead({ from, end, above, color, reverse, stack = 0, getCurrent, inst = PSU }: {
  from: THREE.Vector2;
  end: THREE.Vector3; // 世界座標：線的終點
  above: THREE.Vector3; // 世界座標：終點上方的過渡點（決定線從哪個方向插進去）
  color: string;
  reverse?: boolean;
  stack?: 0 | 1;
  getCurrent: () => number;
  inst?: Inst;
}) {
  const plugOut = 0.18 + stack * 0.2;
  const { curve, geo, plugAt } = useMemo(() => {
    const out = panelToWorld(inst, from.x, from.y, 0.6 + stack * 0.3);
    const pts = [
      panelToWorld(inst, from.x, from.y, plugOut + 0.1),
      out,
      new THREE.Vector3().lerpVectors(out, above, 0.45).setY(0.05),
      above,
      end.clone().add(new THREE.Vector3(0, 0.05, 0)),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    return { curve, geo: new THREE.TubeGeometry(curve, 100, 0.025, 10, false), plugAt: panelToWorld(inst, from.x, from.y, 0) };
  }, [from, end, above, stack, plugOut, inst]);
  useEffect(() => () => geo.dispose(), [geo]);

  const dots = useRef<THREE.Mesh[]>([]);
  const phase = useRef(0);
  useFrame((_, dt) => {
    const i = Math.abs(getCurrent());
    phase.current = (phase.current + dt * (0.05 + i * 0.12)) % 1;
    dots.current.forEach((m, k) => {
      if (!m) return;
      m.visible = i > 1e-4;
      const u = (phase.current + k / 3) % 1;
      m.position.copy(curve.getPointAt(reverse ? 1 - u : u));
    });
  });

  return (
    <group>
      <mesh geometry={geo} castShadow>
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <group position={plugAt} rotation={[0, inst.rotY, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, plugOut]} castShadow>
          <cylinderGeometry args={[0.045, 0.055, 0.2, 16]} />
          <meshStandardMaterial color={color} roughness={0.45} />
        </mesh>
      </group>
      {[0, 1, 2].map((k) => (
        <mesh key={k} ref={(m) => { if (m) dots.current[k] = m; }}>
          <sphereGeometry args={[0.035, 10, 8]} />
          <meshBasicMaterial color="#9fe8ff" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
