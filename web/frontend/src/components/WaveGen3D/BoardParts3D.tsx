// 麵包板上零件的 3D 模型：色碼電阻、1N400x 二極體、LT1117-3.3（TO-220）、跳線，以及熱模型（發熱、燒毀、熱關斷）
// 所有座標都是麵包板本地座標（放在 LabBreadboard 的 group 裡）
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useBoard } from './boardStore.js';
import { getBench } from './bench.js';
import { holePos, type HoleKey } from './boardModel.js';
import { type BoardPart, colorBands, THERMAL, LDO_TSD_ON, LDO_TSD_OFF } from './boardParts.js';
import { createCanvasTexture, FONT } from './panelTexture.js';
import { P, TOP_Y } from './breadboardGrid.js';

const UP = new THREE.Vector3(0, 1, 0);
const AMBIENT = 25;
const LEAD = '#c9ced4';

// ---- 熱模型：每個零件的溫度（key = id#gen，更換零件後從室溫重來） ----
const temps = new Map<string, number>();
const tkey = (p: BoardPart) => `${p.id}#${p.gen}`;
export const partTemp = (p: BoardPart) => temps.get(tkey(p)) ?? AMBIENT;

/** 不渲染任何東西，只負責每幀更新零件溫度、判斷燒毀與 LT1117 熱關斷 */
export function BoardThermal() {
  const last = useRef(0);
  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const { parts, tsd, setThermal } = useBoard.getState();
    const bench = getBench();
    const burnt: string[] = [...bench.overVoltage];
    const nextTsd: Record<string, boolean> = {};
    let tsdChanged = false;
    for (const p of parts) {
      if (p.kind === 'wire') continue;
      const th = THERMAL[p.kind];
      const pw = p.burnt ? 0 : Math.abs(bench.sol.el[p.id]?.p ?? 0);
      const t0 = partTemp(p);
      const target = AMBIENT + pw * th.rth;
      const t = target + (t0 - target) * Math.exp(-dt / th.tau);
      temps.set(tkey(p), t);
      if (!p.burnt && t > th.burn) burnt.push(p.id);
      if (p.kind === 'ldo') {
        const on = tsd[p.id] ? t > LDO_TSD_OFF : t > LDO_TSD_ON;
        nextTsd[p.id] = on;
        if (on !== !!tsd[p.id]) tsdChanged = true;
      }
    }
    const fresh = burnt.filter((id) => !parts.find((p) => p.id === id)?.burnt);
    if (fresh.length || tsdChanged || clock.elapsedTime - last.current > 0.25) {
      last.current = clock.elapsedTime;
      const out: Record<string, number> = {};
      for (const p of parts) if (p.kind !== 'wire') out[p.id] = Math.round(partTemp(p));
      setThermal(out, tsdChanged ? nextTsd : tsd, fresh);
    }
  });
  return null;
}

// ---- 共用幾何 ----
function Rod({ a, b, r, color, metal = false, mat }: {
  a: THREE.Vector3; b: THREE.Vector3; r: number; color?: string; metal?: boolean; mat?: THREE.Material;
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
    <mesh position={pos} quaternion={quat} castShadow material={mat}>
      <cylinderGeometry args={[r, r, len, 14]} />
      {!mat && <meshStandardMaterial color={color} metalness={metal ? 0.9 : 0.1} roughness={metal ? 0.3 : 0.5} />}
    </mesh>
  );
}

function Bent({ pts, r, color }: { pts: THREE.Vector3[]; r: number; color: string }) {
  const geo = useMemo(
    () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.3), 48, r, 8, false),
    [pts, r],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} castShadow>
      <meshStandardMaterial color={color} metalness={0.8} roughness={0.35} />
    </mesh>
  );
}

/** 依溫度把本體染成發熱紅光／燒黑 */
function useHeatMaterial(part: BoardPart, base: string, selected: boolean) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: base, roughness: 0.55 }), [base]);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => {
    const t = partTemp(part);
    const heat = THREE.MathUtils.clamp((t - 120) / 200, 0, 1);
    mat.color.set(part.burnt ? '#2a2420' : base);
    if (selected) { mat.emissive.set('#2f8cff'); mat.emissiveIntensity = 0.35; }
    else { mat.emissive.setRGB(1, 0.3, 0.05); mat.emissiveIntensity = part.burnt ? 0 : heat * 1.5; }
  });
  return mat;
}

function usePartEvents(part: BoardPart) {
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (e.delta > 4) return;
      if (useBoard.getState().tool !== 'select') return; // 放置工具時讓點擊穿透到下面的孔
      e.stopPropagation();
      useBoard.getState().selectPart(part.id);
    },
  };
}

/**
 * 軸向兩腳零件（電阻、二極體）的擺法：兩孔距離夠就臥式（本體平躺在中間），
 * 太近就立式（本體立在第一腳上方、第二腳彎回來）
 */
function axialLayout(a: HoleKey, b: HoleKey, bodyLen: number) {
  const A = holePos(a), B = holePos(b);
  const d = Math.hypot(B.x - A.x, B.z - A.z);
  if (d >= bodyLen + 0.06) {
    const h = 0.07;
    const mid = A.clone().add(B).multiplyScalar(0.5).setY(TOP_Y + h);
    const dir = B.clone().sub(A).setY(0).normalize();
    const s = mid.clone().addScaledVector(dir, -bodyLen / 2), e = mid.clone().addScaledVector(dir, bodyLen / 2);
    return {
      bodyA: s, bodyB: e,
      leads: [
        [A.clone().setY(TOP_Y - 0.02), A.clone().setY(TOP_Y + h * 0.6), s.clone().addScaledVector(dir, -0.012).setY(TOP_Y + h)],
        [B.clone().setY(TOP_Y - 0.02), B.clone().setY(TOP_Y + h * 0.6), e.clone().addScaledVector(dir, 0.012).setY(TOP_Y + h)],
      ],
    };
  }
  const s = A.clone().setY(TOP_Y + 0.04), e = A.clone().setY(TOP_Y + 0.04 + bodyLen);
  const top = e.clone().setY(e.y + 0.05);
  return {
    bodyA: s, bodyB: e,
    leads: [
      [A.clone().setY(TOP_Y - 0.02), s],
      [e, top, top.clone().lerp(B.clone().setY(top.y), 0.8), B.clone().setY(TOP_Y + 0.08), B.clone().setY(TOP_Y - 0.02)],
    ],
  };
}

export function Resistor3D({ part, selected }: { part: BoardPart; selected: boolean }) {
  const L = 0.24, R = 0.034;
  const lay = useMemo(() => axialLayout(part.pins[0], part.pins[1], L), [part.pins]);
  const mat = useHeatMaterial(part, '#d9c29a', selected);
  const bands = colorBands(part.value!);
  const at = (t: number) => lay.bodyA.clone().lerp(lay.bodyB, t);
  return (
    <group {...usePartEvents(part)}>
      {lay.leads.map((pts, i) => <Bent key={i} pts={pts} r={0.006} color={LEAD} />)}
      <Rod a={lay.bodyA} b={lay.bodyB} r={R} mat={mat} />
      {/* 兩端較粗的端帽 */}
      <Rod a={at(0)} b={at(0.16)} r={R * 1.15} mat={mat} />
      <Rod a={at(0.84)} b={at(1)} r={R * 1.15} mat={mat} />
      {!part.burnt && bands.map((c, i) => {
        const t = [0.2, 0.33, 0.46, 0.8][i];
        return <Rod key={i} a={at(t - 0.035)} b={at(t + 0.035)} r={R * (i === 0 || i === 3 ? 1.17 : 1.03)} color={c} />;
      })}
    </group>
  );
}

export function Diode3D({ part, selected }: { part: BoardPart; selected: boolean }) {
  const L = 0.17, R = 0.03;
  const lay = useMemo(() => axialLayout(part.pins[0], part.pins[1], L), [part.pins]);
  const mat = useHeatMaterial(part, '#15171a', selected);
  const at = (t: number) => lay.bodyA.clone().lerp(lay.bodyB, t);
  return (
    <group {...usePartEvents(part)}>
      {lay.leads.map((pts, i) => <Bent key={i} pts={pts} r={0.006} color={LEAD} />)}
      <Rod a={lay.bodyA} b={lay.bodyB} r={R} mat={mat} />
      {/* 陰極環（銀色）在第二腳那端 */}
      <Rod a={at(0.8)} b={at(0.92)} r={R * 1.02} color="#d8dde3" />
    </group>
  );
}

function ldoFaceTexture() {
  return createCanvasTexture(0.2, 0.17, (p) => {
    p.ctx.fillStyle = '#16181b';
    p.ctx.fillRect(0, 0, p.s(0.2), p.s(0.17));
    p.ctx.fillStyle = '#e8eef5';
    p.ctx.textAlign = 'center';
    p.ctx.textBaseline = 'middle';
    p.ctx.font = `800 ${p.s(0.036)}px ${FONT}`;
    p.ctx.fillText('LT1117', p.x(0), p.y(0.04));
    p.ctx.font = `700 ${p.s(0.03)}px ${FONT}`;
    p.ctx.fillText('CT-3.3', p.x(0), p.y(0.0));
    p.ctx.font = `600 ${p.s(0.02)}px ${FONT}`;
    p.ctx.fillStyle = '#9fb3c8';
    p.ctx.fillText('1 GND  2 OUT  3 IN', p.x(0), p.y(-0.055));
  }, 1200);
}

export function Ldo3D({ part, selected }: { part: BoardPart; selected: boolean }) {
  const pins = useMemo(() => part.pins.map(holePos), [part.pins]);
  const mat = useHeatMaterial(part, '#1d1f23', selected);
  const tex = useMemo(ldoFaceTexture, []);
  useEffect(() => () => tex.dispose(), [tex]);
  const c = pins[1];
  const bodyY = TOP_Y + 0.1;
  // 跟真實 TO-220 一樣：看著正面時腳位由左到右是 1、2、3，所以正面朝向由腳位排列方向決定
  const frontPlusX = pins[2].z < pins[0].z;
  return (
    <group {...usePartEvents(part)}>
      {pins.map((p, i) => (
        <group key={i}>
          <Rod a={p.clone().setY(TOP_Y - 0.02)} b={p.clone().setY(bodyY)} r={0.008} color={LEAD} metal />
        </group>
      ))}
      <group position={[c.x, bodyY, c.z]} rotation={[0, frontPlusX ? 0 : Math.PI, 0]}>
        <mesh position={[0, 0.085, 0]} castShadow material={mat}>
          <boxGeometry args={[0.08, 0.17, 0.2]} />
        </mesh>
        <mesh position={[0.0405, 0.085, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.2, 0.17]} />
          <meshBasicMaterial map={part.burnt ? null : tex} color={part.burnt ? '#2a2420' : '#ffffff'} toneMapped={false} />
        </mesh>
        {/* 背面散熱金屬片（接 VOUT），上方有鎖螺絲的孔 */}
        <mesh position={[-0.05, 0.14, 0]} castShadow>
          <boxGeometry args={[0.02, 0.28, 0.2]} />
          <meshStandardMaterial color="#cfd4da" metalness={0.9} roughness={0.25} />
        </mesh>
        <mesh position={[-0.039, 0.22, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.03, 0.03, 0.022, 20]} />
          <meshStandardMaterial color="#0b0c0e" />
        </mesh>
      </group>
    </group>
  );
}

// 杜邦線（公對公）：兩端是黑色方形塑膠殼 + 金屬針，針插進孔（或接線柱頂端的孔），中間是軟線拱起來
const DUP = { w: P * 0.92, len: 0.24, pin: 0.05 };

function DupontEnd({ at, dir }: { at: THREE.Vector3; dir: THREE.Vector3 }) {
  // 塑膠殼稍微朝線的方向傾斜，看起來像真的插在板子上被線拉著
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, dir), [dir]);
  return (
    <group position={at} quaternion={quat}>
      <mesh position={[0, -DUP.pin / 2, 0]}>
        <boxGeometry args={[0.012, DUP.pin, 0.012]} />
        <meshStandardMaterial color="#d9c27a" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[0, DUP.len / 2, 0]} castShadow>
        <boxGeometry args={[DUP.w, DUP.len, DUP.w]} />
        <meshStandardMaterial color="#141414" roughness={0.6} />
      </mesh>
      {/* 殼上的卡榫小窗 */}
      <mesh position={[DUP.w / 2 + 0.0005, DUP.len * 0.35, 0]}>
        <boxGeometry args={[0.001, DUP.len * 0.25, DUP.w * 0.5]} />
        <meshStandardMaterial color="#6a6a6a" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}

export function Wire3D({ part, selected }: { part: BoardPart; selected: boolean }) {
  const g = useMemo(() => {
    const [A, B] = part.pins.map(holePos);
    const d = Math.hypot(B.x - A.x, B.z - A.z);
    const flat = new THREE.Vector3(B.x - A.x, 0, B.z - A.z).normalize();
    // 塑膠殼往對方傾斜 12°
    const tilt = (s: number) => new THREE.Vector3(0, 1, 0).addScaledVector(flat, s * 0.2).normalize();
    const dA = tilt(1), dB = tilt(-1);
    const topA = A.clone().addScaledVector(dA, DUP.len), topB = B.clone().addScaledVector(dB, DUP.len);
    const h = 0.12 + d * 0.22; // 杜邦線比較長、比較軟，拱得比較高
    const mid = topA.clone().add(topB).multiplyScalar(0.5);
    mid.y = Math.max(topA.y, topB.y) + h;
    const pts = [
      topA, topA.clone().addScaledVector(dA, 0.08),
      topA.clone().lerp(mid, 0.55).setY(mid.y - h * 0.15), mid,
      topB.clone().lerp(mid, 0.55).setY(mid.y - h * 0.15),
      topB.clone().addScaledVector(dB, 0.08), topB,
    ];
    return { A, B, dA, dB, pts };
  }, [part.pins]);
  const geo = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(g.pts, false, 'centripetal'), 80, 0.011, 8, false), [g]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group {...usePartEvents(part)}>
      <mesh geometry={geo} castShadow>
        <meshStandardMaterial color={part.color} roughness={0.45}
          emissive={selected ? '#2f8cff' : '#000'} emissiveIntensity={selected ? 0.6 : 0} />
      </mesh>
      <DupontEnd at={g.A} dir={g.dA} />
      <DupontEnd at={g.B} dir={g.dB} />
    </group>
  );
}

/** 放置中：第一點的黃色標記；三用電表：紅棒位置與讀值 */
export function BoardMarkers() {
  const pending = useBoard((s) => s.pending);
  const dmm = useBoard((s) => s.dmm);
  useBoard((s) => s.parts);
  const bench = getBench();
  const v = dmm ? bench.holeV(dmm) : null;
  return (
    <>
      {pending && (
        <mesh position={holePos(pending).setY(holePos(pending).y + 0.004)} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <ringGeometry args={[P * 0.3, P * 0.62, 20]} />
          <meshBasicMaterial color="#ffd21f" toneMapped={false} />
        </mesh>
      )}
      {dmm && (
        <group position={holePos(dmm)}>
          <mesh position={[0, 0.09, 0]} rotation={[Math.PI, 0, 0]} raycast={() => null}>
            <coneGeometry args={[0.018, 0.1, 12]} />
            <meshStandardMaterial color="#d42a2a" />
          </mesh>
          <Html position={[0, 0.16, 0]} center style={{ pointerEvents: 'none' }}>
            <div style={{
              whiteSpace: 'nowrap', background: '#101418', color: '#7dffb0', fontFamily: 'Consolas, monospace',
              fontSize: 13, padding: '3px 8px', borderRadius: 6, border: '1px solid #2c5a3c',
            }}>
              DMM {v === null ? '-- (未接)' : `${v.toFixed(3)} V`}
            </div>
          </Html>
        </group>
      )}
    </>
  );
}

export function BoardParts3D() {
  const parts = useBoard((s) => s.parts);
  const selectedId = useBoard((s) => s.selectedId);
  return (
    <>
      {parts.map((p) => {
        const sel = p.id === selectedId;
        if (p.kind === 'resistor') return <Resistor3D key={p.id} part={p} selected={sel} />;
        if (p.kind === 'diode') return <Diode3D key={p.id} part={p} selected={sel} />;
        if (p.kind === 'ldo') return <Ldo3D key={p.id} part={p} selected={sel} />;
        return <Wire3D key={p.id} part={p} selected={sel} />;
      })}
      <BoardMarkers />
    </>
  );
}
