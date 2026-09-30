// 3D 大型麵包板（仿 JE25：黑色底板 + 2 條端子排 + 3 條電源軌 + Va/Vb/GND 接線柱）
// 滑鼠移到孔上會把「電氣相通的那一組孔」標成綠色，並顯示說明與節點電壓；點孔放零件/量測（見 boardStore 的工具）
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { createCanvasTexture, label, FONT, type PanelCtx } from './panelTexture.js';
import { BREADBOARD } from './layout.js';
import { POST_XS, POST_Z, postKey, holeKeyOf, type PostName } from './boardModel.js';
import { useBoard } from './boardStore.js';
import { useBench } from './bench.js';
import { BoardParts3D, BoardThermal } from './BoardParts3D.js';
import { DevBoards3D } from './devboards/DevBoard3D.js';
import { DevRuntime } from './devboards/DevRuntime.js';
import { FpgaRuntime } from './devboards/fpga/FpgaRuntime.js';
import { ChipRuntime } from './chips/ChipRuntime.js';
import {
  P, ROWS, STRIPS, STRIP_LEN, STRIP_Z, STRIP_H, PLATE, TOP_Y, TERM_W, BUS_W, COLS,
  termColX, rowZ, BUS_SLOTS, busZ, busRailX, hitHole, describeHit, type HoleHit,
} from './breadboardGrid.js';

const PX = 900; // 麵包板貼圖解析度（像素/單位），孔要畫得清楚
const POSTS: [PostName, string][] = [['Va', '#c8201c'], ['Vb', '#e0b010'], ['GND', '#16181b']];

function hole(p: PanelCtx, x: number, zRel: number) {
  const s = P * 0.52;
  p.ctx.fillStyle = '#8b877c';
  p.ctx.fillRect(p.x(x) - p.s(s * 0.62), p.y(-zRel) - p.s(s * 0.62), p.s(s * 1.24), p.s(s * 1.24));
  p.ctx.fillStyle = '#1a1a1a';
  p.ctx.fillRect(p.x(x) - p.s(s / 2), p.y(-zRel) - p.s(s / 2), p.s(s), p.s(s));
}

function drawTerm(p: PanelCtx) {
  p.ctx.fillStyle = '#f3efe4';
  p.ctx.fillRect(0, 0, p.s(TERM_W), p.s(STRIP_LEN));
  p.ctx.fillStyle = '#d6cfbd'; // IC 跨接溝
  p.ctx.fillRect(p.x(-P * 0.7), 0, p.s(P * 1.4), p.s(STRIP_LEN));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < 10; c++) hole(p, termColX(c), rowZ(r));
    if (r === 0 || (r + 1) % 5 === 0) {
      label(p, String(r + 1), -6.3 * P, -rowZ(r), P * 0.55, '#555', 'center', 600);
      label(p, String(r + 1), 6.3 * P, -rowZ(r), P * 0.55, '#555', 'center', 600);
    }
  }
  for (let c = 0; c < 10; c++) {
    label(p, COLS[c], termColX(c), -rowZ(-0.9), P * 0.6, '#555', 'center', 700);
    label(p, COLS[c], termColX(c), -rowZ(ROWS - 0.1), P * 0.6, '#555', 'center', 700);
  }
}

function drawBus(p: PanelCtx) {
  p.ctx.fillStyle = '#f3efe4';
  p.ctx.fillRect(0, 0, p.s(BUS_W), p.s(STRIP_LEN));
  p.ctx.lineWidth = p.s(P * 0.12);
  for (const [x, color] of [[-1.45 * P, '#d42a2a'], [1.45 * P, '#2a56d4']] as const) {
    p.ctx.strokeStyle = color;
    p.ctx.beginPath();
    p.ctx.moveTo(p.x(x), p.y(STRIP_LEN / 2 - P * 1.4));
    p.ctx.lineTo(p.x(x), p.y(-STRIP_LEN / 2 + P * 1.4));
    p.ctx.stroke();
  }
  for (const s of BUS_SLOTS) for (const rail of [0, 1] as const) hole(p, busRailX(rail), busZ(s));
  for (const zRel of [busZ(-2), busZ(61)]) {
    label(p, '+', -1.0 * P, -zRel, P * 0.9, '#d42a2a', 'center', 800);
    label(p, '−', 1.0 * P, -zRel, P * 0.9, '#2a56d4', 'center', 800);
  }
}

function drawPlate(p: PanelCtx) {
  p.ctx.fillStyle = '#121315';
  p.ctx.fillRect(0, 0, p.s(PLATE.w), p.s(PLATE.d));
  label(p, 'RealCad', -1.0, 1.62, 0.07, '#ffffff', 'left', 800);
  label(p, 'BREADBOARD', -1.0, 1.5, 0.075, '#ffffff', 'left', 800);
  label(p, '— RB-2 · 2 × 830 —', -1.0, 1.39, 0.05, '#c9ced4', 'left', 700);
  for (const [name] of POSTS) {
    label(p, name === 'GND' ? '⏚' : name, POST_XS[name], -POST_Z - 0.17, 0.075, '#ffffff', 'center', 700);
  }
}

function BindingPost({ name, color }: { name: PostName; color: string }) {
  const [hover, setHover] = useState(false);
  return (
    <group
      position={[POST_XS[name], PLATE.h, POST_Z]}
      onClick={(e) => { if (e.delta > 4) return; e.stopPropagation(); useBoard.getState().clickHole(postKey(name)); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); useBoard.getState().setHoverHole(postKey(name)); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHover(false); useBoard.getState().setHoverHole(null); document.body.style.cursor = 'auto'; }}
    >
      {hover && (
        <Html zIndexRange={[10, 0]} position={[0, 0.3, 0]} center style={{ pointerEvents: 'none' }}>
          <div style={tipStyle}>{name} 接線柱{name === 'Va' ? '（接電源 +）' : name === 'GND' ? '（接電源 −，0 V）' : '（未接電源，可接跳線）'}</div>
        </Html>
      )}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.085, 0.085, 0.04, 6]} />
        <meshStandardMaterial color="#c9ced4" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.065, 0.075, 0.16, 20]} />
        <meshStandardMaterial color={color} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.201, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.004, 12]} />
        <meshStandardMaterial color="#b8a060" metalness={0.9} roughness={0.3} />
      </mesh>
    </group>
  );
}

const hitKey = (h: HoleHit | null) => (h ? JSON.stringify(h) : '');
const tipStyle: CSSProperties = {
  whiteSpace: 'nowrap', background: 'rgba(18,21,26,0.92)', color: '#e6ebf1', fontSize: 12,
  padding: '4px 8px', borderRadius: 6, border: '1px solid #2c333c', fontFamily: FONT,
};

/** 目前滑鼠指到的孔 → 相通範圍的綠色標示框（板子本地座標） */
function highlightRect(h: HoleHit) {
  const s = STRIPS.filter((st) => st.kind === h.kind)[h.strip];
  if (h.kind === 'term') {
    return {
      x: s.x + (h.col < 5 ? -3 : 3) * P, z: STRIP_Z + rowZ(h.row), w: 5 * P, d: 0.9 * P,
      hx: s.x + termColX(h.col), hz: STRIP_Z + rowZ(h.row),
    };
  }
  return {
    x: s.x + busRailX(h.rail), z: STRIP_Z + (busZ(0) + busZ(58)) / 2, w: 0.9 * P, d: 58.9 * P,
    hx: s.x + busRailX(h.rail), hz: STRIP_Z + busZ(h.slot),
  };
}

export function LabBreadboard() {
  const group = useRef<THREE.Group>(null);
  const [hover, setHover] = useState<HoleHit | null>(null);
  const lastKey = useRef('');

  const tex = useMemo(() => ({
    term: createCanvasTexture(TERM_W, STRIP_LEN, drawTerm, PX),
    bus: createCanvasTexture(BUS_W, STRIP_LEN, drawBus, PX),
    plate: createCanvasTexture(PLATE.w, PLATE.d, drawPlate),
  }), []);
  useEffect(() => () => Object.values(tex).forEach((t) => t.dispose()), [tex]);

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!group.current) return;
    const local = group.current.worldToLocal(e.point.clone());
    const h = hitHole(local.x, local.z);
    const k = hitKey(h);
    if (k !== lastKey.current) {
      lastKey.current = k;
      setHover(h);
      useBoard.getState().setHoverHole(h ? holeKeyOf(h) : null);
      if (!useBoard.getState().drag) document.body.style.cursor = h ? 'crosshair' : 'auto';
    }
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4 || !group.current) return; // 拖曳視角時不算點擊
    const local = group.current.worldToLocal(e.point.clone());
    const h = hitHole(local.x, local.z);
    if (h) useBoard.getState().clickHole(holeKeyOf(h));
  };
  const onOut = () => {
    lastKey.current = '';
    setHover(null);
    useBoard.getState().setHoverHole(null);
    if (!useBoard.getState().drag) document.body.style.cursor = 'auto';
  };

  const hl = hover ? highlightRect(hover) : null;
  const bench = useBench();
  const hoverV = hover ? bench.holeV(holeKeyOf(hover)) : null;

  return (
    <group ref={group} position={BREADBOARD.pos} rotation={[0, BREADBOARD.rotY, 0]}>
      {/* 黑色底板 */}
      <mesh position={[0, PLATE.h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[PLATE.w, PLATE.h, PLATE.d]} />
        <meshStandardMaterial color="#141517" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, PLATE.h + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[PLATE.w, PLATE.d]} />
        <meshStandardMaterial map={tex.plate} roughness={0.6} />
      </mesh>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <mesh key={`${sx}${sz}`} position={[sx * (PLATE.w / 2 - 0.15), -0.01, sz * (PLATE.d / 2 - 0.15)]}>
          <cylinderGeometry args={[0.08, 0.08, 0.02, 12]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      )))}

      {/* 端子排與電源軌 */}
      {STRIPS.map((s, i) => (
        <group key={i} position={[s.x, PLATE.h, STRIP_Z]}>
          <mesh position={[0, STRIP_H / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[s.w, STRIP_H, STRIP_LEN]} />
            <meshStandardMaterial color="#ece6d6" roughness={0.7} />
          </mesh>
          <mesh position={[0, STRIP_H + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}
            onPointerMove={onMove} onPointerOut={onOut} onClick={onClick}>
            <planeGeometry args={[s.w, STRIP_LEN]} />
            <meshStandardMaterial map={s.kind === 'term' ? tex.term : tex.bus} roughness={0.75} />
          </mesh>
        </group>
      ))}

      {POSTS.map(([name, color]) => <BindingPost key={name} name={name} color={color} />)}
      <BoardParts3D />
      <BoardThermal />
      <DevBoards3D />
      <DevRuntime />
      <FpgaRuntime />
      <ChipRuntime />

      {hl && hover && (
        <>
          <mesh position={[hl.x, TOP_Y + 0.003, hl.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <planeGeometry args={[hl.w, hl.d]} />
            <meshBasicMaterial color="#39ff6a" transparent opacity={0.35} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh position={[hl.hx, TOP_Y + 0.004, hl.hz]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <ringGeometry args={[P * 0.32, P * 0.5, 20]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
          <Html zIndexRange={[10, 0]} position={[hl.hx, TOP_Y + 0.05, hl.hz]} center style={{ pointerEvents: 'none', transform: 'translateY(-26px)' }}>
            <div style={tipStyle}>
              {describeHit(hover)}
              {hoverV !== null && <span style={{ color: '#7dffb0' }}>　{hoverV.toFixed(3)} V</span>}
            </div>
          </Html>
        </>
      )}
    </group>
  );
}
