// 儀器接到麵包板的線：函數產生器、頻譜分析儀 BNC → 紅 / 黑鱷魚夾線；示波器 CH1 / CH2 探棒（探針勾在孔上 + 接地夾）；
// 桌上型萬用電表：香蕉插頭紅黑測試線（電流檔時紅色插頭改插 mA / 10A 插座）
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { GEN, SCOPE, SA, DM, panelToWorld, boardToWorld } from './layout.js';
import { useBoard, type LeadKind } from './boardStore.js';
import { holePos, type HoleKey } from './boardModel.js';
import { Plug } from './BncCable.js';
import { BananaLead } from './BananaLead.js';
import { useDm, isCurrentMode, SHUNT } from './dmStore.js';
import { getBench, meterV } from './bench.js';
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

/** 端點標籤：CH1 +、CH1 −、FG + … 浮在夾子上方，一眼看出正負極與通道 */
function Tag({ p, text, color, y = 0.2 }: { p: THREE.Vector3; text: string; color: string; y?: number }) {
  return (
    <Html zIndexRange={[10, 0]} position={[p.x, p.y + y, p.z]} center style={{ pointerEvents: 'none' }}>
      <div style={{
        whiteSpace: 'nowrap', background: 'rgba(10,10,26,0.9)', color, fontSize: 12, fontWeight: 800,
        fontFamily: 'Consolas, monospace', padding: '1px 6px', borderRadius: 5, border: `1px solid ${color}`,
      }}>{text}</div>
    </Html>
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

type Inst = typeof GEN | typeof SA;

/** BNC → 分岔成紅（+）/ 黑（−）兩條鱷魚夾線：函數產生器輸出、頻譜分析儀輸入都用這種線 */
function ClipLead({ pins, inst, tag }: { pins: [HoleKey, HoleKey]; inst: Inst; tag: string }) {
  const g = useMemo(() => {
    const bnc = panelToWorld(inst, inst.bnc.x, inst.bnc.y, 0);
    const p = at(pins[0]), n = at(pins[1]);
    const split = p.clone().add(n).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.45, 0.2));
    return {
      bnc, p, n,
      coax: [...route(bnc, inst.rotY, split), split],
      red: [split, p.clone().add(new THREE.Vector3(0, 0.3, 0.05)), p.clone().setY(p.y + 0.1)],
      blk: [split, n.clone().add(new THREE.Vector3(0, 0.3, 0.05)), n.clone().setY(n.y + 0.1)],
    };
  }, [inst, pins[0], pins[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      <Plug at={g.bnc} rotY={inst.rotY} />
      <Tube pts={g.coax} r={0.03} color="#15171a" />
      <Tube pts={g.red} r={0.012} color="#c8201c" />
      <Tube pts={g.blk} r={0.012} color="#1c1e21" />
      <Clip p={g.p} color="#c8201c" />
      <Clip p={g.n} color="#1c1e21" />
      <Tag p={g.p} text={`${tag} +`} color="#ff6a5a" y={tag === 'SA' ? 0.34 : 0.2} />
      <Tag p={g.n} text={`${tag} −`} color="#c8c8c8" y={tag === 'SA' ? 0.34 : 0.2} />
    </group>
  );
}

function ScopeLead({ ch, pins }: { ch: 'ch1' | 'ch2'; pins: [HoleKey, HoleKey] }) {
  const inst = SCOPE;
  const g = useMemo(() => {
    const b = ch === 'ch1' ? SCOPE.bnc : SCOPE.bnc2;
    const bnc = panelToWorld(inst, b.x, b.y, 0);
    const tip = at(pins[0]), gnd = at(pins[1]);
    const body = tip.clone().add(new THREE.Vector3(0, 0.2, 0.05)); // 探棒本體（筆型）立在探針上方
    return {
      bnc, tip, gnd, body,
      cable: [...route(bnc, inst.rotY, body), body.clone().setY(body.y + 0.12)],
      ground: [body.clone().setY(body.y + 0.05), body.clone().lerp(gnd, 0.5).setY(body.y + 0.15), gnd.clone().setY(gnd.y + 0.1)],
    };
  }, [ch, inst, pins[0], pins[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const color = ch === 'ch1' ? CH1_COLOR : CH2_COLOR;
  const { body, tip } = g;
  return (
    <group>
      <Plug at={g.bnc} rotY={inst.rotY} />
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
      <Tag p={tip} text={`${ch.toUpperCase()} +`} color={color} y={ch === 'ch1' ? 0.46 : 0.36} />
      <Tag p={g.gnd} text={`${ch.toUpperCase()} −`} color="#c8c8c8" />
    </group>
  );
}

/** 桌上型萬用電表的紅黑測試線：香蕉插頭 → 鱷魚夾；線上光點速度 ∝ 電流檔量到的電流 */
function DmLeads({ pins }: { pins: [HoleKey, HoleKey] }) {
  const dm = useDm((s) => s.dm);
  const cur = isCurrentMode(dm.mode);
  const red = !cur ? DM.jackHi : dm.jack === 'mA' ? DM.jackMa : DM.jack10;
  const g = useMemo(() => pins.map((h) => {
    const p = at(h);
    return { p, end: p.clone().setY(p.y + 0.1), above: p.clone().add(new THREE.Vector3(-0.15, 0.45, 0.1)) };
  }), [pins[0], pins[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const amps = () => {
    const s = useDm.getState().dm;
    return isCurrentMode(s.mode) ? (meterV(getBench(), pins[0], pins[1]) ?? 0) / SHUNT[s.jack] : 0;
  };
  return (
    <group>
      <BananaLead inst={DM} from={red} end={g[0].end} above={g[0].above} color="#c8201c" getCurrent={amps} />
      <BananaLead inst={DM} from={DM.jackLo} end={g[1].end} above={g[1].above} color="#1c1e21" reverse getCurrent={amps} />
      <Clip p={g[0].p} color="#c8201c" />
      <Clip p={g[1].p} color="#1c1e21" />
      <Tag p={g[0].p} text="DM +" color="#ff6a5a" y={0.26} />
      <Tag p={g[1].p} text="DM −" color="#c8c8c8" y={0.26} />
    </group>
  );
}

export function InstrumentLeads() {
  const leads = useBoard((s) => s.leads);
  return (
    <>
      {leads.fg && <ClipLead pins={leads.fg} inst={GEN} tag="FG" />}
      {leads.sa && <ClipLead pins={leads.sa} inst={SA} tag="SA" />}
      {leads.dm && <DmLeads pins={leads.dm} />}
      {(['ch1', 'ch2'] as LeadKind[]).map((k) => leads[k] && <ScopeLead key={k} ch={k as 'ch1' | 'ch2'} pins={leads[k]!} />)}
    </>
  );
}
