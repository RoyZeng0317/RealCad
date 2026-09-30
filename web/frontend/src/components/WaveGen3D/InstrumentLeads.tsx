// 儀器接到麵包板的線：函數產生器 BNC → 紅 / 黑鱷魚夾線、示波器 CH1 / CH2 探棒（探針勾在孔上 + 接地夾）
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { GEN, SCOPE, panelToWorld, boardToWorld } from './layout.js';
import { useBoard, type LeadKind } from './boardStore.js';
import { holePos, type HoleKey } from './boardModel.js';
import { Plug } from './BncCable.js';
import { CH1_COLOR, CH2_COLOR } from './scopeDisplay.js';

const UP = new THREE.Vector3(0, 1, 0);
const at = (k: HoleKey) => boardToWorld(holePos(k));

function Tube({ pts, r, color }: { pts: THREE.Vector3[]; r: number; color: string }) {
  const geo = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 100, r, 10, false), [pts, r]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} castShadow raycast={() => null}>
      <meshStandardMaterial color={color} roughness={0.55} />
    </mesh>
  );
}

/** 小鱷魚夾 / 插針頭：夾在孔上方 */
function Clip({ p, color }: { p: THREE.Vector3; color: string }) {
  return (
    <group position={p}>
      <mesh position={[0, 0.05, 0]} castShadow raycast={() => null}>
        <boxGeometry args={[0.035, 0.1, 0.05]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.0, 0]} raycast={() => null}>
        <boxGeometry args={[0.012, 0.03, 0.03]} />
        <meshStandardMaterial color="#c9ced4" metalness={0.9} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** 從 BNC 接頭拉出來、沿桌面走到麵包板上方的路徑 */
function route(from: THREE.Vector3, rotY: number, to: THREE.Vector3): THREE.Vector3[] {
  const out = new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, rotY);
  return [
    from.clone().addScaledVector(out, 0.3),
    from.clone().addScaledVector(out, 0.6).setY(0.12),
    new THREE.Vector3((from.x + to.x) / 2, 0.1, Math.max(from.z, to.z) - 0.3),
    to.clone().add(new THREE.Vector3(0, 0.55, 0.15)),
  ];
}

function GenLead({ pins }: { pins: [HoleKey, HoleKey] }) {
  const g = useMemo(() => {
    const bnc = panelToWorld(GEN, GEN.bnc.x, GEN.bnc.y, 0);
    const p = at(pins[0]), n = at(pins[1]);
    const split = p.clone().add(n).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.45, 0.2));
    return {
      bnc, p, n,
      coax: [...route(bnc, GEN.rotY, split), split],
      red: [split, p.clone().add(new THREE.Vector3(0, 0.3, 0.05)), p.clone().setY(p.y + 0.1)],
      blk: [split, n.clone().add(new THREE.Vector3(0, 0.3, 0.05)), n.clone().setY(n.y + 0.1)],
    };
  }, [pins[0], pins[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      <Plug at={g.bnc} rotY={GEN.rotY} />
      <Tube pts={g.coax} r={0.03} color="#15171a" />
      <Tube pts={g.red} r={0.012} color="#c8201c" />
      <Tube pts={g.blk} r={0.012} color="#1c1e21" />
      <Clip p={g.p} color="#c8201c" />
      <Clip p={g.n} color="#1c1e21" />
    </group>
  );
}

function ScopeLead({ ch, pins }: { ch: 'ch1' | 'ch2'; pins: [HoleKey, HoleKey] }) {
  const g = useMemo(() => {
    const b = ch === 'ch1' ? SCOPE.bnc : SCOPE.bnc2;
    const bnc = panelToWorld(SCOPE, b.x, b.y, 0);
    const tip = at(pins[0]), gnd = at(pins[1]);
    const body = tip.clone().add(new THREE.Vector3(0, 0.2, 0.05)); // 探棒本體（筆型）立在探針上方
    return {
      bnc, tip, gnd, body,
      cable: [...route(bnc, SCOPE.rotY, body), body.clone().setY(body.y + 0.12)],
      ground: [body.clone().setY(body.y + 0.05), body.clone().lerp(gnd, 0.5).setY(body.y + 0.15), gnd.clone().setY(gnd.y + 0.1)],
    };
  }, [ch, pins[0], pins[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const color = ch === 'ch1' ? CH1_COLOR : CH2_COLOR;
  const { body, tip } = g;
  return (
    <group>
      <Plug at={g.bnc} rotY={SCOPE.rotY} />
      <Tube pts={g.cable} r={0.025} color="#2a2c30" />
      {/* 探棒本體（有通道顏色環）+ 探針 */}
      <mesh position={body.clone().setY(body.y + 0.03)} castShadow raycast={() => null}>
        <cylinderGeometry args={[0.022, 0.018, 0.2, 14]} />
        <meshStandardMaterial color="#26282c" roughness={0.5} />
      </mesh>
      <mesh position={body.clone().setY(body.y + 0.09)} raycast={() => null}>
        <cylinderGeometry args={[0.024, 0.024, 0.02, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      <mesh position={tip.clone().setY((tip.y + body.y - 0.07) / 2)} raycast={() => null}>
        <cylinderGeometry args={[0.004, 0.004, body.y - 0.07 - tip.y, 8]} />
        <meshStandardMaterial color="#c9ced4" metalness={0.9} roughness={0.3} />
      </mesh>
      <Tube pts={g.ground} r={0.008} color="#1c1e21" />
      <Clip p={g.gnd} color="#1c1e21" />
    </group>
  );
}

export function InstrumentLeads() {
  const leads = useBoard((s) => s.leads);
  return (
    <>
      {leads.fg && <GenLead pins={leads.fg} />}
      {(['ch1', 'ch2'] as LeadKind[]).map((k) => leads[k] && <ScopeLead key={k} ch={k as 'ch1' | 'ch2'} pins={leads[k]!} />)}
    </>
  );
}
