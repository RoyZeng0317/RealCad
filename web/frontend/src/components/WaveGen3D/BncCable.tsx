// 產生器 OUTPUT → 示波器 CH1 的 BNC 同軸線；輸出開啟時線上會有流動的訊號光點
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GEN, SCOPE, panelToWorld } from './layout.js';
import { useWaveLab } from './waveStore.js';

export function Plug({ at, rotY }: { at: THREE.Vector3; rotY: number }) {
  return (
    <group position={at} rotation={[0, rotY, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.12]} castShadow>
        <cylinderGeometry args={[0.085, 0.085, 0.14, 24]} />
        <meshStandardMaterial color="#d7dbe0" metalness={0.95} roughness={0.2} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.27]} castShadow>
        <cylinderGeometry args={[0.06, 0.075, 0.18, 20]} />
        <meshStandardMaterial color="#1b1d20" roughness={0.6} />
      </mesh>
    </group>
  );
}

export function BncCable() {
  const { curve, a, b } = useMemo(() => {
    const a = panelToWorld(GEN, GEN.bnc.x, GEN.bnc.y, 0);
    const b = panelToWorld(SCOPE, SCOPE.bnc.x, SCOPE.bnc.y, 0);
    const pts = [
      panelToWorld(GEN, GEN.bnc.x, GEN.bnc.y, 0.35),
      panelToWorld(GEN, GEN.bnc.x, GEN.bnc.y, 0.55),
      new THREE.Vector3((a.x * 2 + b.x) / 3, 0.05, Math.max(a.z, b.z) + 0.6),
      new THREE.Vector3((a.x + b.x * 2) / 3, 0.05, Math.max(a.z, b.z) + 0.5),
      panelToWorld(SCOPE, SCOPE.bnc.x, SCOPE.bnc.y, 0.75),
      panelToWorld(SCOPE, SCOPE.bnc.x, SCOPE.bnc.y, 0.35),
    ];
    return { curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal'), a, b };
  }, []);
  const geo = useMemo(() => new THREE.TubeGeometry(curve, 120, 0.035, 12, false), [curve]);

  const pulses = useRef<THREE.Mesh[]>([]);
  useFrame(({ clock }) => {
    const { gen } = useWaveLab.getState();
    const live = gen.power && gen.output;
    pulses.current.forEach((m, i) => {
      if (!m) return;
      m.visible = live;
      if (live) m.position.copy(curve.getPointAt((clock.elapsedTime * 0.35 + i / 4) % 1));
    });
  });

  return (
    <group>
      <mesh geometry={geo} castShadow>
        <meshStandardMaterial color="#15171a" roughness={0.55} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} ref={(m) => { if (m) pulses.current[i] = m; }}>
          <sphereGeometry args={[0.045, 12, 8]} />
          <meshBasicMaterial color="#ffd21f" toneMapped={false} />
        </mesh>
      ))}
      <Plug at={a} rotY={GEN.rotY} />
      <Plug at={b} rotY={SCOPE.rotY} />
    </group>
  );
}
