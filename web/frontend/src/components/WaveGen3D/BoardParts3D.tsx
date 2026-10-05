// 麵包板上零件的 3D 模型：色碼電阻、1N400x 二極體、LT1117-3.3（TO-220）、跳線（DIP IC 在 chips/Chip3D.tsx），以及熱模型（發熱、燒毀、熱關斷）
// 所有座標都是麵包板本地座標（放在 LabBreadboard 的 group 裡）
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useBoard } from './boardStore.js';
import { useWaveLab } from './waveStore.js';
import { BREADBOARD } from './layout.js';
import { useDev } from './devboards/devStore.js';
import { getBench, useBench } from './bench.js';
import { dmmReading } from './scopeLink.js';
import { holePos, type HoleKey } from './boardModel.js';
import { type BoardPart, colorBands, THERMAL, LDO_TSD_ON, LDO_TSD_OFF, LED_SPEC } from './boardParts.js';
import { createCanvasTexture, FONT } from './panelTexture.js';
import { P, TOP_Y } from './breadboardGrid.js';
import { Chip3D } from './chips/Chip3D.js';
import { Pot3D, Cap3D, Ind3D, Bjt3D, Xfmr3D, Ctx3D, Ldr3D, Batt3D } from './AnalogParts3D.js';
import { elementWave } from './scopeLink.js';
import { Ne5553D, Ch2243D } from './IcParts3D.js';
import { negotiate } from './ch224.js';

const UP = new THREE.Vector3(0, 1, 0);
/** 選取狀態：true = 選取（藍）、'bad' = 拖曳到不能放的位置（紅） */
export type Sel = boolean | 'bad';
const AMBIENT = 25;
export const LEAD = '#c9ced4';

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
      // 變壓器在交流下才有電流：用暫態模擬一個週期的平均銅損（直流解看不到）
      const wave = !p.burnt && (p.kind === 'ctx' || p.kind === 'xfmr') ? elementWave(p.id) : null;
      const pw = p.burnt ? 0 : wave && wave.every(Boolean) ? wave.reduce((a, r) => a + r!.p, 0) / wave.length : Math.abs(bench.sol.el[p.id]?.p ?? 0);
      const t0 = partTemp(p);
      const target = AMBIENT + pw * th.rth;
      const t = target + (t0 - target) * Math.exp(-dt / th.tau);
      temps.set(tkey(p), t);
      if (!p.burnt && t > th.burn) burnt.push(p.id);
      // CH224K：輸出電流超過充電器那一檔的額定 → 充電器關閉輸出（等於拔線，要重插才恢復）
      if (p.kind === 'ch224' && p.plugged !== false && Math.abs(bench.sol.el[p.id]?.i ?? 0) > negotiate(p).imax * 1.05) {
        useBoard.getState().updatePart(p.id, { plugged: false, tripped: true });
      }
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
export function Rod({ a, b, r, color, metal = false, mat }: {
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

export function Bent({ pts, r, color }: { pts: THREE.Vector3[]; r: number; color: string }) {
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
export function useHeatMaterial(part: BoardPart, base: string, selected: Sel) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: base, roughness: 0.55 }), [base]);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => {
    const t = partTemp(part);
    const heat = THREE.MathUtils.clamp((t - 120) / 200, 0, 1);
    mat.color.set(part.burnt ? '#2a2420' : base);
    if (selected === 'bad') { mat.emissive.set('#ff2a2a'); mat.emissiveIntensity = 0.8; }
    else if (selected) { mat.emissive.set('#2f8cff'); mat.emissiveIntensity = 0.35; }
    else { mat.emissive.setRGB(1, 0.3, 0.05); mat.emissiveIntensity = part.burnt ? 0 : heat * 1.5; }
  });
  return mat;
}

/**
 * 零件的滑鼠事件：選取工具下點一下 = 選取；按住拖曳 = 移到別的孔（放開才生效，不合法會自動取消）
 */
export function usePartEvents(part: BoardPart) {
  return {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      if (useBoard.getState().tool !== 'select' || e.nativeEvent.button !== 0) return;
      e.stopPropagation();
      // 抓住離滑鼠最近的那隻腳（杜邦線就是抓那一端）
      const local = e.point.clone().sub(BREADBOARD.pos).applyAxisAngle(UP, -BREADBOARD.rotY);
      let grab = 0, best = Infinity;
      part.pins.forEach((h, i) => { const p = holePos(h); const d = Math.hypot(p.x - local.x, p.z - local.z); if (d < best) { best = d; grab = i; } });
      const board = useBoard.getState();
      board.startDrag(part.id, grab);
      useDev.getState().select(null);
      useWaveLab.getState().setDragging(true); // 拖曳時不要轉動視角
      const x0 = e.nativeEvent.clientX, y0 = e.nativeEvent.clientY;
      const move = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 5) {
          useBoard.getState().markDragMoved();
          document.body.style.cursor = useBoard.getState().drag?.valid ? 'grabbing' : 'not-allowed';
        }
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        useBoard.getState().endDrag(true);
        useWaveLab.getState().setDragging(false);
        document.body.style.cursor = 'auto';
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (e.delta > 4) return;
      // 刪除模式：點到零件就直接刪掉
      if (useBoard.getState().tool === 'erase') { e.stopPropagation(); useBoard.getState().removePart(part.id); return; }
      if (useBoard.getState().tool !== 'select') return; // 放置工具時讓點擊穿透到下面的孔
      e.stopPropagation();
      useBoard.getState().selectPart(part.id);
      useDev.getState().select(null);
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

export function Resistor3D({ part, selected }: { part: BoardPart; selected: Sel }) {
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

export function Diode3D({ part, selected }: { part: BoardPart; selected: Sel }) {
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

/** 5 mm LED：本體立在兩隻腳的中間，亮度 ∝ 模擬出來的電流（20 mA = 全亮） */
export function Led3D({ part, selected }: { part: BoardPart; selected: Sel }) {
  const color = LED_SPEC[part.ledColor ?? 'red'].hex;
  const g = useMemo(() => {
    const [A, B] = part.pins.map(holePos);
    const base = A.clone().add(B).multiplyScalar(0.5).setY(TOP_Y + 0.07);
    const dir = new THREE.Vector3(B.x - A.x, 0, B.z - A.z).normalize();
    const footA = base.clone().addScaledVector(dir, -0.012), footB = base.clone().addScaledVector(dir, 0.012);
    return {
      base,
      leads: [
        [A.clone().setY(TOP_Y - 0.02), A.clone().setY(TOP_Y + 0.03), footA],
        [B.clone().setY(TOP_Y - 0.02), B.clone().setY(TOP_Y + 0.03), footB],
      ],
    };
  }, [part.pins]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.85, roughness: 0.15 }), [color]);
  useEffect(() => () => mat.dispose(), [mat]);
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const i = part.burnt ? 0 : Math.max(0, getBench().sol.el[part.id]?.i ?? 0);
    const k = Math.min(1, i / 0.02);
    mat.color.set(part.burnt ? '#2a2420' : color);
    mat.emissive.set(selected === 'bad' ? '#ff2a2a' : selected ? '#2f8cff' : color);
    mat.emissiveIntensity = selected ? 0.4 : k * 2.2;
    if (light.current) light.current.intensity = k * 0.6;
  });
  return (
    <group {...usePartEvents(part)}>
      {g.leads.map((pts, i) => <Bent key={i} pts={pts} r={0.005} color={LEAD} />)}
      <group position={g.base}>
        <mesh position={[0, 0.006, 0]} material={mat}>
          <cylinderGeometry args={[0.05, 0.05, 0.012, 24]} />
        </mesh>
        <mesh position={[0, 0.05, 0]} material={mat} castShadow>
          <cylinderGeometry args={[0.044, 0.044, 0.08, 24]} />
        </mesh>
        <mesh position={[0, 0.09, 0]} material={mat}>
          <sphereGeometry args={[0.044, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <pointLight ref={light} color={color} distance={0.8} intensity={0} position={[0, 0.12, 0]} />
      </group>
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

export function Ldo3D({ part, selected }: { part: BoardPart; selected: Sel }) {
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

export function Wire3D({ part, selected }: { part: BoardPart; selected: Sel }) {
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
          emissive={selected === 'bad' ? '#ff2a2a' : selected ? '#2f8cff' : '#000'} emissiveIntensity={selected ? 0.6 : 0} />
      </mesh>
      <DupontEnd at={g.A} dir={g.dA} />
      <DupontEnd at={g.B} dir={g.dB} />
    </group>
  );
}

/** 三用電表探棒：插在孔（或接線柱、排針）上的彩色探棒尖 */
function Probe({ at, color }: { at: HoleKey; color: string }) {
  return (
    <group position={holePos(at)}>
      <mesh position={[0, 0.09, 0]} rotation={[Math.PI, 0, 0]} raycast={() => null}>
        <coneGeometry args={[0.018, 0.1, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.19, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.02, 0.02, 0.1, 12]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
    </group>
  );
}

/** 放置中：第一點的黃色標記；三用電表：紅棒、黑棒與讀值 */
export function BoardMarkers() {
  const pending = useBoard((s) => s.pending);
  const dmm = useBoard((s) => s.dmm);
  const black = useBoard((s) => s.dmmBlack);
  useBench(); // 電路或產生器改變時重新讀值
  const v = dmmReading(dmm, black);
  return (
    <>
      {pending && (
        <mesh position={holePos(pending).setY(holePos(pending).y + 0.004)} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <ringGeometry args={[P * 0.3, P * 0.62, 20]} />
          <meshBasicMaterial color="#ffd21f" toneMapped={false} />
        </mesh>
      )}
      {black && <Probe at={black} color="#17181b" />}
      {dmm && <Probe at={dmm} color="#d42a2a" />}
      {dmm && (
        <group position={holePos(dmm)}>
          <Html zIndexRange={[10, 0]} position={[0, 0.3, 0]} center style={{ pointerEvents: 'none' }}>
            <div style={{
              whiteSpace: 'nowrap', background: '#101418', color: '#7dffb0', fontFamily: 'Consolas, monospace',
              fontSize: 13, padding: '3px 8px', borderRadius: 6, border: '1px solid #2c5a3c',
            }}>
              DMM {v === null ? (black ? '-- (未接)' : '-- (黑棒未插)') : `${v.toFixed(3)} V`}
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
  const drag = useBoard((s) => s.drag);
  return (
    <>
      {parts.map((orig) => {
        // 拖曳中的零件畫在預覽位置；放不下的位置用紅色
        const dragging = drag && drag.moved && drag.id === orig.id;
        const p = dragging ? { ...orig, pins: drag.pins } : orig;
        const sel: Sel = dragging && !drag.valid ? 'bad' : p.id === selectedId;
        if (p.kind === 'resistor') return <Resistor3D key={p.id} part={p} selected={sel} />;
        if (p.kind === 'diode') return <Diode3D key={p.id} part={p} selected={sel} />;
        if (p.kind === 'led') return <Led3D key={p.id} part={p} selected={sel} />;
        if (p.kind === 'ldo') return <Ldo3D key={p.id} part={p} selected={sel} />;
        if (p.kind === 'atmega' || p.kind === 'ch340') return <Chip3D key={p.id} part={p} selected={sel} />;
        if (p.kind === 'pot') return <Pot3D key={p.id} part={p} selected={sel} />;
        if (p.kind === 'cap') return <Cap3D key={p.id} part={p} selected={sel} />;
        if (p.kind === 'ind') return <Ind3D key={p.id} part={p} selected={sel} />;
        if (p.kind === 'bjt') return <Bjt3D key={p.id} part={p} selected={sel} />;
        if (p.kind === 'xfmr') return <Xfmr3D key={p.id} part={p} selected={sel} />;
        if (p.kind === 'ctx') return <Ctx3D key={p.id} part={p} selected={sel} />;
        if (p.kind === 'ldr') return <Ldr3D key={p.id} part={p} selected={sel} />;
        if (p.kind === 'batt') return <Batt3D key={p.id} part={p} selected={sel} />;
        if (p.kind === 'ne555') return <Ne5553D key={p.id} part={p} selected={sel} />;
        if (p.kind === 'ch224') return <Ch2243D key={p.id} part={p} selected={sel} />;
        return <Wire3D key={p.id} part={p} selected={sel} />;
      })}
      <BoardMarkers />
    </>
  );
}
