// 類比零件的 3D 模型：可變電阻（旋鈕可以用滑鼠轉）、電解電容、電感、TO-92 電晶體、EI 鐵芯變壓器、中心抽頭電源變壓器、光敏電阻、電池
// 座標都是麵包板本地座標（跟 BoardParts3D 一樣放在 LabBreadboard 的 group 裡）
import { useEffect, useMemo, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useBoard } from './boardStore.js';
import { useWaveLab } from './waveStore.js';
import { holePos } from './boardModel.js';
import { CAP_MODELS, XFMR_MODELS, CTX_MODELS, CTX_IRATED, MAINS_VRMS, BATT_MODELS, LUX_MIN, LUX_MAX, bjtPinout, type BoardPart } from './boardParts.js';
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

function bjtFace(name: string, pinText = 'E  B  C') {
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
    p.ctx.fillText(pinText, p.x(0), p.y(-0.025));
  }, 2400);
}

// ---- 電晶體 TO-92：半圓柱本體，平面朝自己時腳位由左到右 E、B、C ----
// ---- 電晶體 TO-92：半圓柱本體，平面（印字面）永遠朝向使用者（實驗桌前方 +z），由左到右 E、B、C ----
//   三隻腳插在同一欄連續三列（前後排列），所以跟實際插麵包板一樣把腳往左右撥開：本體轉正面朝前，腳從底部分開再彎進孔裡
export function Bjt3D({ part, selected }: { part: BoardPart; selected: Sel }) {
  const model = part.bjtModel ?? '2N3904';
  const { pins, c } = useMemo(() => tripleLayout(part), [part.pins]); // eslint-disable-line react-hooks/exhaustive-deps
  const mat = useHeatMaterial(part, '#1a1b1e', selected);
  const bodyY = TOP_Y + 0.1, R = 0.05, H = 0.09;
  // 本體朝向：rot 每格 90°（0 = 平面朝 +z、1 = 再轉 90° 平面朝 +x，預設 1）；檢視器的「旋轉 90°」按鈕可以換
  const yaw = -Math.PI / 2 + (part.rot ?? 1) * (Math.PI / 2);
  // 平面法線 n、看著平面時的右手方向 r：腳從本體底部（平面後方一點）往左右分開
  const n = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), r = new THREE.Vector3(n.z, 0, -n.x);
  // 腳不能交叉打結：每隻腳的出腳位置依「它的孔在 r 方向的哪一邊」排（孔在左就從左邊出），
  // 平面朝前 / 後時孔在 r 方向上重疊，就照 E、B、C 由左到右；印字也照實際腳的順序印
  const order = useMemo(() => {
    const s = pins.map((p) => (p.x - c.x) * r.x + (p.z - c.z) * r.z);
    if (Math.max(...s) - Math.min(...s) < 1e-6) return bjtPinout(model) === 'CBE' ? [2, 1, 0] : [0, 1, 2]; // BC547：由左到右 C、B、E
    const sorted = [0, 1, 2].sort((a, b) => s[a] - s[b]);
    return [0, 1, 2].map((i) => sorted.indexOf(i)); // 第 i 隻腳在左→右的第幾個位置
  }, [pins, c, part.rot, model]); // eslint-disable-line react-hooks/exhaustive-deps
  const legs = useMemo(() => pins.map((p, i) => {
    const foot = c.clone().setY(bodyY).addScaledVector(r, (order[i] - 1) * 0.032).addScaledVector(n, -0.015);
    return [
      p.clone().setY(TOP_Y - 0.02), p.clone().setY(TOP_Y + 0.02),
      new THREE.Vector3((p.x + foot.x) / 2, TOP_Y + 0.06, (p.z + foot.z) / 2), foot,
    ];
  }), [pins, c, bodyY, part.rot, order]); // eslint-disable-line react-hooks/exhaustive-deps
  // 印字：依左→右實際的腳排出 E / B / C
  const pinText = [0, 1, 2].sort((a, b) => order[a] - order[b]).map((i) => 'EBC'[i]).join('  ');
  const tex = useMemo(() => bjtFace(model, pinText), [model, pinText]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group {...usePartEvents(part)}>
      {legs.map((pts, i) => <Bent key={i} pts={pts} r={0.005} color={LEAD} />)}
      {/* 本體在本地座標是平面朝 +x；轉 −90° 後平面朝 +z（使用者），再依 rot 每格轉 90° */}
      <group position={[c.x, bodyY, c.z]} rotation={[0, yaw, 0]}>
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

// ---- 變壓器：EI 矽鋼片鐵芯 + 中間的線圈（黃色絕緣膠帶），4 隻腳跨在溝槽兩側 ----
//   左排（e 欄）一次側 P1、P2，右排（f 欄）二次側 S1、S2；圓點標在同名端 P1、S1
function xfmrTop(ratio: string) {
  return createCanvasTexture(0.16, 0.1, (p) => {
    p.ctx.fillStyle = '#e8c23a';
    p.ctx.fillRect(0, 0, p.s(0.16), p.s(0.1));
    p.ctx.fillStyle = '#2a2208';
    p.ctx.textAlign = 'center';
    p.ctx.textBaseline = 'middle';
    p.ctx.font = `800 ${p.s(0.026)}px ${FONT}`;
    p.ctx.fillText(ratio, p.x(0), p.y(0.018));
    p.ctx.font = `600 ${p.s(0.013)}px ${FONT}`;
    p.ctx.fillText('PRI  ·  SEC', p.x(0), p.y(-0.022));
  }, 2400);
}

export function Xfmr3D({ part, selected }: { part: BoardPart; selected: Sel }) {
  const pins = useMemo(() => part.pins.map(holePos), [part.pins]); // eslint-disable-line react-hooks/exhaustive-deps
  const core = useHeatMaterial(part, '#5b6068', selected);
  const c = useMemo(() => pins.reduce((a, b) => a.clone().add(b), new THREE.Vector3()).multiplyScalar(1 / 4), [pins]);
  const sx = Math.abs(pins[2].x - pins[0].x) + 0.1, sz = Math.abs(pins[1].z - pins[0].z) + 0.08;
  const baseY = TOP_Y + 0.035, H = 0.2;
  const ratio = XFMR_MODELS[part.xfmrModel ?? '2:1'].n >= 1 ? `${XFMR_MODELS[part.xfmrModel ?? '2:1'].n} : 1` : `1 : ${1 / XFMR_MODELS[part.xfmrModel ?? '2:1'].n}`;
  const tex = useMemo(() => xfmrTop(ratio), [ratio]);
  useEffect(() => () => tex.dispose(), [tex]);
  // 腳：從孔直直往上進本體底部（底座是黑色塑膠骨架）
  const legs = useMemo(() => pins.map((p) => [p.clone().setY(TOP_Y - 0.02), p.clone().setY(baseY + 0.01)]), [pins, baseY]);
  // 同名端圓點：P1、S1 旁邊的骨架上
  const dots = [pins[0], pins[2]].map((p) => new THREE.Vector3(p.x + Math.sign(p.x - c.x) * 0.012, baseY + 0.022, p.z));
  return (
    <group {...usePartEvents(part)}>
      {legs.map(([a, b], i) => <Rod key={i} a={a} b={b} r={0.006} color={LEAD} metal />)}
      <group position={[c.x, baseY, c.z]}>
        {/* 塑膠骨架底座 */}
        <mesh position={[0, 0.01, 0]} castShadow>
          <boxGeometry args={[sx, 0.02, sz]} />
          <meshStandardMaterial color="#1b1d20" roughness={0.7} />
        </mesh>
        {/* EI 鐵芯：前後兩片矽鋼片疊（線圈兩側露出），上面一條 I 片 */}
        {[-1, 1].map((k) => (
          <mesh key={k} position={[0, 0.02 + H / 2, k * (sz / 2 - 0.018)]} castShadow material={core}>
            <boxGeometry args={[sx * 0.92, H, 0.036]} />
          </mesh>
        ))}
        <mesh position={[0, 0.02 + H - 0.015, 0]} castShadow material={core}>
          <boxGeometry args={[sx * 0.92, 0.03, sz - 0.03]} />
        </mesh>
        {/* 線圈（黃色絕緣膠帶包著），頂面印匝數比 */}
        <mesh position={[0, 0.02 + (H - 0.03) / 2, 0]} castShadow>
          <boxGeometry args={[sx * 0.86, H - 0.03, sz - 0.07]} />
          <meshStandardMaterial color={part.burnt ? '#3a2a1a' : '#e0b830'} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.02 + H + 0.0005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[Math.min(sx * 0.8, 0.16), Math.min(sz * 0.6, 0.1)]} />
          <meshBasicMaterial map={part.burnt ? null : tex} color={part.burnt ? '#2a2420' : '#ffffff'} toneMapped={false} />
        </mesh>
      </group>
      {dots.map((d, i) => (
        <mesh key={i} position={d} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.007, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  );
}

// ---- 中心抽頭電源變壓器：立式 EI 鐵芯 + 固定腳架，放在引線那一欄的外側；
//   3 條絕緣引線（黃 A、黑 COM、黃 B）彎進麵包板，另一側是灰色電源線與 110 V 插頭 ----
function ctxLabel(vs: number) {
  return createCanvasTexture(0.3, 0.2, (p) => {
    p.ctx.fillStyle = '#e8c23a';
    p.ctx.fillRect(0, 0, p.s(0.3), p.s(0.2));
    p.ctx.fillStyle = '#2a2208';
    p.ctx.textAlign = 'center';
    p.ctx.textBaseline = 'middle';
    p.ctx.font = `800 ${p.s(0.036)}px ${FONT}`;
    p.ctx.fillText(`${MAINS_VRMS}V → ${vs}V CT`, p.x(0), p.y(0.05));
    p.ctx.font = `700 ${p.s(0.03)}px ${FONT}`;
    p.ctx.fillText(`${vs / 2}-0-${vs / 2} V  ${CTX_IRATED * 1000}mA`, p.x(0), p.y(-0.005));
    p.ctx.font = `600 ${p.s(0.022)}px ${FONT}`;
    p.ctx.fillText('A · COM · B', p.x(0), p.y(-0.055));
  }, 2400);
}

export function Ctx3D({ part, selected }: { part: BoardPart; selected: Sel }) {
  const vs = CTX_MODELS[part.ctxModel ?? '12'].vs;
  const core = useHeatMaterial(part, '#5b6068', selected);
  const W = 0.46, D = 0.4, H = 0.4;
  const g = useMemo(() => {
    const pins = part.pins.map(holePos);
    const [, s, r] = part.pins[0].split(':');
    const cx = (holePos(`t:${s}:${r}:4`).x + holePos(`t:${s}:${r}:5`).x) / 2;
    const out = Math.sign(pins[0].x - cx) || -1; // 往端子排外側擺本體
    const body = new THREE.Vector3(pins[0].x + out * (W / 2 + 0.14), TOP_Y, pins[1].z);
    const leads = pins.map((p, i) => {
      const exit = new THREE.Vector3(body.x - out * (W / 2 + 0.005), TOP_Y + 0.1, body.z + (i - 1) * 0.08);
      return [p.clone().setY(TOP_Y - 0.02), p.clone().setY(TOP_Y + 0.03), new THREE.Vector3((p.x + exit.x) / 2, TOP_Y + 0.09, (p.z + exit.z) / 2), exit];
    });
    const cordStart = new THREE.Vector3(body.x + out * (W / 2 + 0.005), TOP_Y + 0.12, body.z);
    const plug = new THREE.Vector3(body.x + out * (W / 2 + 0.45), TOP_Y + 0.03, body.z + 0.25);
    const cord = [cordStart, cordStart.clone().add(new THREE.Vector3(out * 0.12, -0.04, 0)),
      new THREE.Vector3((cordStart.x + plug.x) / 2 + out * 0.05, TOP_Y + 0.02, body.z + 0.1), plug];
    return { body, leads, cord, plug, out };
  }, [part.pins]); // eslint-disable-line react-hooks/exhaustive-deps
  const tex = useMemo(() => ctxLabel(vs), [vs]);
  useEffect(() => () => tex.dispose(), [tex]);
  const colors = ['#e0b010', '#1b1d20', '#e0b010'];
  return (
    <group {...usePartEvents(part)}>
      {g.leads.map((pts, i) => <Bent key={i} pts={pts} r={0.008} color={colors[i]} />)}
      <Bent pts={g.cord} r={0.012} color="#3a3d42" />
      {/* 110 V 插頭（台灣兩扁腳） */}
      <group position={g.plug} rotation={[0, g.out > 0 ? 0 : Math.PI, 0]}>
        <mesh castShadow><boxGeometry args={[0.07, 0.05, 0.06]} /><meshStandardMaterial color="#e8e8e2" roughness={0.6} /></mesh>
        {[-1, 1].map((k) => (
          <mesh key={k} position={[0.05, 0, k * 0.013]}><boxGeometry args={[0.04, 0.02, 0.004]} /><meshStandardMaterial color="#c9ced4" metalness={0.8} roughness={0.3} /></mesh>
        ))}
      </group>
      <group position={g.body}>
        {/* 固定腳架（L 型鐵片） */}
        <mesh position={[0, 0.006, 0]} castShadow>
          <boxGeometry args={[W + 0.12, 0.012, D * 0.55]} />
          <meshStandardMaterial color="#9aa0a8" metalness={0.7} roughness={0.4} />
        </mesh>
        {/* EI 鐵芯：左右兩疊矽鋼片夾住線圈 */}
        {[-1, 1].map((k) => (
          <mesh key={k} position={[0, 0.012 + H / 2, k * (D / 2 - 0.03)]} castShadow material={core}>
            <boxGeometry args={[W, H, 0.06]} />
          </mesh>
        ))}
        <mesh position={[0, 0.012 + H - 0.03, 0]} castShadow material={core}><boxGeometry args={[W, 0.06, D - 0.06]} /></mesh>
        <mesh position={[0, 0.012 + 0.03, 0]} castShadow material={core}><boxGeometry args={[W, 0.06, D - 0.06]} /></mesh>
        {/* 線圈（黃色絕緣膠帶），正面貼規格貼紙 */}
        <mesh position={[0, 0.012 + H / 2, 0]} castShadow>
          <boxGeometry args={[W + 0.04, H - 0.12, D - 0.12]} />
          <meshStandardMaterial color={part.burnt ? '#3a2a1a' : '#e0b830'} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.012 + H + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[W * 0.9, D * 0.6]} />
          <meshBasicMaterial map={part.burnt ? null : tex} color={part.burnt ? '#2a2420' : '#ffffff'} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

// ---- 光敏電阻：白色陶瓷圓片 + 橘色鋸齒 CdS 感光層，正面朝上；照度越高上方光暈越亮 ----
//   在光敏電阻上滾滾輪：調整照度（每格 ×1.26，Shift 微調）
function ldrFace() {
  return createCanvasTexture(0.1, 0.1, (p) => {
    const c = p.ctx, s = p.s(0.1);
    c.fillStyle = '#f2ece0';
    c.beginPath(); c.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#c4561c';
    c.lineWidth = s * 0.06;
    c.beginPath();
    for (let k = 0; k <= 6; k++) {
      const y = s * (0.2 + k * 0.1);
      c.moveTo(s * 0.22, y); c.lineTo(s * 0.78, y);
    }
    c.stroke();
    c.fillStyle = '#9aa0a8';
    c.fillRect(s * 0.12, s * 0.15, s * 0.1, s * 0.7);
    c.fillRect(s * 0.78, s * 0.15, s * 0.1, s * 0.7);
  }, 2400);
}

export function Ldr3D({ part, selected }: { part: BoardPart; selected: Sel }) {
  const g = useMemo(() => radialLeads(part, 0.02), [part.pins]); // eslint-disable-line react-hooks/exhaustive-deps
  const edge = useHeatMaterial(part, '#e8e0d0', selected);
  const tex = useMemo(() => ldrFace(), []);
  useEffect(() => () => tex.dispose(), [tex]);
  const lux = part.lux ?? 100;
  const glow = Math.max(0, Math.min(1, (Math.log10(lux) + 1) / 5)); // 0.1 lux → 0、10000 lux → 1
  const y = 0.09, R = 0.045;
  const onWheel = (e: ThreeEvent<WheelEvent>) => {
    e.stopPropagation();
    const cur = useBoard.getState().parts.find((p) => p.id === part.id)?.lux ?? 100;
    const k = 10 ** ((e.nativeEvent.deltaY < 0 ? 1 : -1) * (e.nativeEvent.shiftKey ? 0.02 : 0.1));
    useBoard.getState().updatePart(part.id, { lux: Number(Math.max(LUX_MIN, Math.min(LUX_MAX, cur * k)).toPrecision(3)) });
  };
  // 腳往上接到圓片底部
  const legs = g.leads.map((pts) => [...pts, pts[2].clone().setY(TOP_Y + y)]);
  return (
    <group {...usePartEvents(part)} onWheel={onWheel}>
      {legs.map((pts, i) => <Bent key={i} pts={pts} r={0.004} color={LEAD} />)}
      <group position={[g.base.x, TOP_Y + y, g.base.z]}>
        <mesh position={[0, 0.012, 0]} castShadow material={edge}><cylinderGeometry args={[R, R, 0.024, 28]} /></mesh>
        <mesh position={[0, 0.0245, 0]} rotation={[-Math.PI / 2, 0, Math.atan2(g.dir.x, g.dir.z)]}>
          <circleGeometry args={[R * 0.96, 28]} />
          <meshBasicMaterial map={part.burnt ? null : tex} color={part.burnt ? '#2a2420' : '#ffffff'} toneMapped={false} />
        </mesh>
        {/* 照到的光：上方淡黃色光暈 */}
        {!part.burnt && glow > 0.05 && (
          <mesh position={[0, 0.06, 0]}>
            <sphereGeometry args={[R * (0.8 + glow), 20, 12]} />
            <meshBasicMaterial color="#fff2a8" transparent opacity={0.08 + 0.3 * glow} depthWrite={false} toneMapped={false} />
          </mesh>
        )}
      </group>
    </group>
  );
}

// ---- 電池：本體放在兩隻腳旁邊（真實尺寸），紅線接 +、黑線接 − ----
function battLabel(name: string, v: number, color: string) {
  return createCanvasTexture(0.3, 0.12, (p) => {
    p.ctx.fillStyle = color;
    p.ctx.fillRect(0, 0, p.s(0.3), p.s(0.12));
    p.ctx.fillStyle = '#ffffff';
    p.ctx.textAlign = 'center';
    p.ctx.textBaseline = 'middle';
    p.ctx.font = `800 ${p.s(0.045)}px ${FONT}`;
    p.ctx.fillText(`${v} V`, p.x(0.06), p.y(0));
    p.ctx.font = `700 ${p.s(0.024)}px ${FONT}`;
    p.ctx.fillText(name.replace(/ \d.*$/, ''), p.x(-0.075), p.y(0));
    p.ctx.font = `800 ${p.s(0.04)}px ${FONT}`;
    p.ctx.fillText('+', p.x(0.13), p.y(0));
    p.ctx.fillText('−', p.x(-0.13), p.y(0));
  }, 2400);
}

export function Batt3D({ part, selected }: { part: BoardPart; selected: Sel }) {
  const id = part.battModel ?? '9V';
  const m = BATT_MODELS[id];
  const [w, h, l] = m.size.map((x) => x * MM); // 寬、高、長（長邊沿 + → − 方向）
  const shell = useHeatMaterial(part, m.color, selected);
  const g = useMemo(() => {
    const [A, B] = part.pins.map(holePos);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    let dir = new THREE.Vector3(B.x - A.x, 0, B.z - A.z);
    dir = dir.lengthSq() < 1e-9 ? new THREE.Vector3(0, 0, 1) : dir.normalize();
    let n = new THREE.Vector3(dir.z, 0, -dir.x);
    // 本體擺到端子排外側（往遠離中間溝槽的方向），不要壓在零件上
    const [t, s, r] = part.pins[0].split(':');
    if (t === 't') {
      const cx = (holePos(`t:${s}:${r}:4`).x + holePos(`t:${s}:${r}:5`).x) / 2;
      if (Math.sign(n.x || 1) !== Math.sign((A.x - cx) || -1)) n = n.multiplyScalar(-1);
    }
    const body = mid.clone().addScaledVector(n, w / 2 + 0.16).setY(TOP_Y + h / 2);
    const plus = body.clone().addScaledVector(dir, -l / 2 - 0.004), minus = body.clone().addScaledVector(dir, l / 2 + 0.004);
    const lead = (hole: THREE.Vector3, end: THREE.Vector3) => [hole.clone().setY(TOP_Y - 0.02), hole.clone().setY(TOP_Y + 0.03),
      new THREE.Vector3((hole.x + end.x) / 2, TOP_Y + h + 0.04, (hole.z + end.z) / 2), end.clone().setY(TOP_Y + h * 0.6)];
    return { body, yaw: Math.atan2(dir.x, dir.z), leads: [lead(A, plus), lead(B, minus)] };
  }, [part.pins, w, h, l]); // eslint-disable-line react-hooks/exhaustive-deps
  const tex = useMemo(() => battLabel(m.name, m.v, m.color), [m.name, m.v, m.color]);
  useEffect(() => () => tex.dispose(), [tex]);
  const round = id === 'AA' || id === '18650';
  const coin = id === 'CR2032';
  return (
    <group {...usePartEvents(part)}>
      <Bent pts={g.leads[0]} r={0.008} color="#d42a2a" />
      <Bent pts={g.leads[1]} r={0.008} color="#1b1d20" />
      <group position={g.body} rotation={[0, g.yaw, 0]}>
        {round ? (
          <>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow material={shell}><cylinderGeometry args={[w / 2, w / 2, l, 24]} /></mesh>
            {/* + 極凸點（在 −z 那端，對應 + 腳） */}
            <mesh position={[0, 0, -l / 2 - 0.006]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[w / 6, w / 6, 0.012, 16]} /><meshStandardMaterial color="#c9ced4" metalness={0.8} roughness={0.3} /></mesh>
          </>
        ) : coin ? (
          <>
            {/* 鈕扣電池座（黑色）+ 銀色電池 */}
            <mesh position={[0, -h / 2 + 0.01, 0]} castShadow><boxGeometry args={[w + 0.06, 0.02, l + 0.06]} /><meshStandardMaterial color="#1b1d20" /></mesh>
            <mesh position={[0, 0.01, 0]} castShadow material={shell}><cylinderGeometry args={[w / 2, w / 2, h, 32]} /></mesh>
          </>
        ) : (
          <>
            <mesh castShadow material={shell}><boxGeometry args={[w, h, l]} /></mesh>
            {id === '9V' && [-1, 1].map((k) => (
              <mesh key={k} position={[k * w * 0.22, h / 2 + 0.012, -l / 2 + 0.05]}><cylinderGeometry args={[0.022, 0.022, 0.024, k > 0 ? 6 : 16]} /><meshStandardMaterial color="#c9ced4" metalness={0.8} roughness={0.3} /></mesh>
            ))}
          </>
        )}
        <mesh position={[0, (round ? w / 2 : coin ? h / 2 + 0.01 : h / 2) + 0.002, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
          <planeGeometry args={[l * 0.85, Math.min(w * 0.85, l * 0.4)]} />
          <meshBasicMaterial map={part.burnt ? null : tex} color={part.burnt ? '#3a2a1a' : '#ffffff'} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
