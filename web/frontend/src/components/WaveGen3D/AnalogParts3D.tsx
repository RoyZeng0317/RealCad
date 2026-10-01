// 類比零件的 3D 模型：可變電阻（旋鈕可以用滑鼠轉）、電解電容、電感、TO-92 電晶體
// 座標都是麵包板本地座標（跟 BoardParts3D 一樣放在 LabBreadboard 的 group 裡）
import { useEffect, useMemo, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useBoard } from './boardStore.js';
import { useWaveLab } from './waveStore.js';
import { holePos } from './boardModel.js';
import { CAP_MODELS, type BoardPart } from './boardParts.js';
import { createCanvasTexture, FONT } from './panelTexture.js';
import { TOP_Y } from './breadboardGrid.js';
import { Rod, Bent, LEAD, useHeatMaterial, usePartEvents, type Sel } from './BoardParts3D.js';

const MM = 0.0177; // 1 mm 換成場景單位（孔距 2.54 mm = 0.045）

/** 兩腳立式零件（電容、電感）：腳從兩個孔往中間收，本體立在中間 */
function radialLeads(part: BoardPart, spread: number) {
  const [A, B] = part.pins.map(holePos);
  const base = A.clone().add(B).multiplyScalar(0.5).setY(TOP_Y + 0.05);
  const dir = new THREE.Vector3(B.x - A.x, 0, B.z - A.z).normalize();
  const fa = base.clone().addScaledVector(dir, -spread), fb = base.clone().addScaledVector(dir, spread);
  return {
    base, dir,
    leads: [
      [A.clone().setY(TOP_Y - 0.02), A.clone().setY(TOP_Y + 0.025), fa],
      [B.clone().setY(TOP_Y - 0.02), B.clone().setY(TOP_Y + 0.025), fb],
    ],
  };
}

/** 三腳零件（可變電阻、電晶體）：中間腳的位置、腳位排列方向（+1 = 往 z 正方向） */
function tripleLayout(part: BoardPart) {
  const pins = part.pins.map(holePos);
  return { pins, c: pins[1], dz: Math.sign(pins[2].z - pins[0].z) || 1 };
}

// ---- 可變電阻：藍色方形本體 + 白色旋鈕；在旋鈕上拖曳（上下）或滾輪就能轉 ----
export function Pot3D({ part, selected }: { part: BoardPart; selected: Sel }) {
  const { pins, c, dz } = useMemo(() => tripleLayout(part), [part.pins]); // eslint-disable-line react-hooks/exhaustive-deps
  const mat = useHeatMaterial(part, '#2a5fd0', selected);
  const [hover, setHover] = useState(false);
  const bodyY = TOP_Y + 0.03, H = 0.11;
  // 旋鈕角度：pos 0 → −135°、1 → +135°（腳 1 → 腳 3 方向）
  const angle = (((part.pos ?? 0.5) - 0.5) * 1.5 * Math.PI) * dz;
  const setPos = (v: number) => useBoard.getState().updatePart(part.id, { pos: Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000 });
  const cur = () => useBoard.getState().parts.find((p) => p.id === part.id)?.pos ?? 0.5;

  const onKnobDown = (e: ThreeEvent<PointerEvent>) => {
    if (useBoard.getState().tool !== 'select' || e.nativeEvent.button !== 0) return;
    e.stopPropagation();
    useWaveLab.getState().setDragging(true);
    let lastY = e.nativeEvent.clientY;
    const move = (ev: PointerEvent) => {
      setPos(cur() + ((lastY - ev.clientY) / 300) * (ev.shiftKey ? 0.2 : 1));
      lastY = ev.clientY;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      useWaveLab.getState().setDragging(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const onWheel = (e: ThreeEvent<WheelEvent>) => {
    e.stopPropagation();
    setPos(cur() + (e.nativeEvent.deltaY < 0 ? 1 : -1) * (e.nativeEvent.shiftKey ? 0.01 : 0.05));
  };

  return (
    <group {...usePartEvents(part)}>
      {pins.map((p, i) => <Rod key={i} a={p.clone().setY(TOP_Y - 0.02)} b={p.clone().setY(bodyY)} r={0.007} color={LEAD} metal />)}
      <mesh position={[c.x, bodyY + H / 2, c.z]} castShadow material={mat}>
        <boxGeometry args={[0.17, H, 0.17]} />
      </mesh>
      {/* 旋鈕（白色）+ 一字槽指示目前位置 */}
      <group position={[c.x, bodyY + H, c.z]} rotation={[0, angle, 0]}
        onPointerDown={onKnobDown} onWheel={onWheel}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); useWaveLab.getState().setKnobHover(true); document.body.style.cursor = 'ns-resize'; }}
        onPointerOut={() => { setHover(false); useWaveLab.getState().setKnobHover(false); document.body.style.cursor = 'auto'; }}>
        <mesh position={[0, 0.02, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.065, 0.04, 24]} />
          <meshStandardMaterial color={hover ? '#ffffff' : '#e8e8e2'} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.041, 0]}>
          <boxGeometry args={[0.012, 0.004, 0.1]} />
          <meshStandardMaterial color="#333" />
        </mesh>
        <mesh position={[0, 0.042, -0.045]}>
          <boxGeometry args={[0.014, 0.004, 0.014]} />
          <meshBasicMaterial color="#ff4a2a" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

// ---- 電解電容：圓柱本體、− 極那邊有白色條紋、頂部防爆紋；損壞時頂部鼓起 ----
export function Cap3D({ part, selected }: { part: BoardPart; selected: Sel }) {
  const m = CAP_MODELS[part.capModel ?? '100u50'];
  const r = (m.d / 2) * MM, h = m.h * MM;
  const g = useMemo(() => radialLeads(part, Math.min(r * 0.6, 0.03)), [part.pins, r]); // eslint-disable-line react-hooks/exhaustive-deps
  const mat = useHeatMaterial(part, m.color, selected);
  // 條紋朝向 − 腳（第 2 腳）
  const stripeAngle = Math.atan2(g.dir.x, g.dir.z);
  return (
    <group {...usePartEvents(part)}>
      {g.leads.map((pts, i) => <Bent key={i} pts={pts} r={0.005} color={LEAD} />)}
      <group position={g.base}>
        <mesh position={[0, h / 2, 0]} castShadow material={mat}>
          <cylinderGeometry args={[r, r, h, 28]} />
        </mesh>
        {!part.burnt && (
          <mesh position={[0, h / 2, 0]} rotation={[0, stripeAngle - 0.5, 0]}>
            <cylinderGeometry args={[r * 1.01, r * 1.01, h * 0.96, 16, 1, true, 0, 1]} />
            <meshStandardMaterial color="#d8dde3" side={THREE.DoubleSide} />
          </mesh>
        )}
        {/* 頂部：鋁蓋 + K 字防爆紋；燒毀時鼓起 */}
        <mesh position={[0, h + 0.001, 0]} scale={[1, part.burnt ? 3 : 1, 1]}>
          <sphereGeometry args={[r * 0.97, 24, 8, 0, Math.PI * 2, 0, Math.PI / (part.burnt ? 2.2 : 8)]} />
          <meshStandardMaterial color={part.burnt ? '#6a5a40' : '#c9ced4'} metalness={0.8} roughness={0.35} />
        </mesh>
        {!part.burnt && (
          <mesh position={[0, h + 0.004, 0]} rotation={[0, 0.6, 0]}>
            <boxGeometry args={[r * 1.6, 0.002, 0.006]} />
            <meshStandardMaterial color="#555" />
          </mesh>
        )}
      </group>
    </group>
  );
}

// ---- 電感（工字電感）：黑色磁芯 + 銅色線圈 ----
export function Ind3D({ part, selected }: { part: BoardPart; selected: Sel }) {
  const g = useMemo(() => radialLeads(part, 0.025), [part.pins]); // eslint-disable-line react-hooks/exhaustive-deps
  const core = useHeatMaterial(part, '#22252a', selected);
  const big = (part.value ?? 1e-3) >= 5e-3;
  const r = big ? 0.075 : 0.06, h = big ? 0.15 : 0.12;
  return (
    <group {...usePartEvents(part)}>
      {g.leads.map((pts, i) => <Bent key={i} pts={pts} r={0.005} color={LEAD} />)}
      <group position={g.base}>
        <mesh position={[0, 0.008, 0]} castShadow material={core}><cylinderGeometry args={[r, r, 0.016, 24]} /></mesh>
        <mesh position={[0, h / 2, 0]} castShadow>
          <cylinderGeometry args={[r * 0.82, r * 0.82, h - 0.03, 24]} />
          <meshStandardMaterial color={part.burnt ? '#3a2a1a' : '#b8732e'} metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh position={[0, h - 0.008, 0]} castShadow material={core}><cylinderGeometry args={[r, r, 0.016, 24]} /></mesh>
      </group>
    </group>
  );
}

function bjtFace(name: string) {
  return createCanvasTexture(0.1, 0.09, (p) => {
    p.ctx.fillStyle = '#16181b';
    p.ctx.fillRect(0, 0, p.s(0.1), p.s(0.09));
    p.ctx.fillStyle = '#e8eef5';
    p.ctx.textAlign = 'center';
    p.ctx.textBaseline = 'middle';
    p.ctx.font = `700 ${p.s(0.019)}px ${FONT}`;
    p.ctx.fillText(name, p.x(0), p.y(0.015));
    p.ctx.font = `600 ${p.s(0.014)}px ${FONT}`;
    p.ctx.fillStyle = '#9fb3c8';
    p.ctx.fillText('E  B  C', p.x(0), p.y(-0.025));
  }, 2400);
}

// ---- 電晶體 TO-92：半圓柱本體，平面朝自己時腳位由左到右 E、B、C ----
export function Bjt3D({ part, selected }: { part: BoardPart; selected: Sel }) {
  const model = part.bjtModel ?? '2N3904';
  const { pins, c, dz } = useMemo(() => tripleLayout(part), [part.pins]); // eslint-disable-line react-hooks/exhaustive-deps
  const mat = useHeatMaterial(part, '#1a1b1e', selected);
  const tex = useMemo(() => bjtFace(model), [model]);
  useEffect(() => () => tex.dispose(), [tex]);
  const bodyY = TOP_Y + 0.07, R = 0.05, H = 0.09;
  // 平面法線 = (−dz, 0, 0)：看著平面時 E（第 1 腳）在左邊
  const flip = dz > 0;
  return (
    <group {...usePartEvents(part)}>
      {pins.map((p, i) => <Rod key={i} a={p.clone().setY(TOP_Y - 0.02)} b={p.clone().setY(bodyY)} r={0.005} color={LEAD} metal />)}
      <group position={[c.x, bodyY, c.z]} rotation={[0, flip ? Math.PI : 0, 0]}>
        <mesh position={[0, H / 2, 0]} castShadow material={mat}>
          <cylinderGeometry args={[R, R, H, 24, 1, false, Math.PI, Math.PI]} />
        </mesh>
        <mesh position={[0.0005, H / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={mat}>
          <planeGeometry args={[2 * R, H]} />
        </mesh>
        <mesh position={[0.002, H / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[2 * R * 0.95, H * 0.9]} />
          <meshBasicMaterial map={part.burnt ? null : tex} color={part.burnt ? '#2a2420' : '#ffffff'} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
