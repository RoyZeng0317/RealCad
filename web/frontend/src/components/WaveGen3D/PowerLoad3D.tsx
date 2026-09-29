// 電阻負載板 + 紅黑測試線：可調電阻（旋鈕切換 E6 檔位）、依功率發熱發光，過熱燒斷變開路
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { usePsuLab, loadResistance } from './psuStore.js';
import { solvePsu, stepTemperature, AMBIENT, BURN_TEMP, RATED_POWER } from './psu.js';
import { createCanvasTexture, label, type PanelCtx } from './panelTexture.js';
import { formatSI } from './waveform.js';
import { Knob3D } from './parts.js';
import { PSU, LOAD, panelToWorld } from './layout.js';

const BOARD = { w: 1.5, h: 0.08, d: 1.0 };
const POST_Y = BOARD.h + 0.22;
const POSTS = { plus: new THREE.Vector3(-0.62, POST_Y, 0.22), minus: new THREE.Vector3(0.62, POST_Y, 0.22) };
const LABEL = { w: 1.4, h: 0.16 };
const RES = { w: 0.9, h: 0.26, d: 0.34, z: -0.18 };

const loadToWorld = (v: THREE.Vector3) =>
  v.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), LOAD.rotY).add(LOAD.pos);

function BindingPost({ at, color }: { at: THREE.Vector3; color: string }) {
  return (
    <group position={[at.x, BOARD.h, at.z]}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.06, 20]} />
        <meshStandardMaterial color="#c9ced4" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.14, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.07, 0.16, 20]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** 紅/黑測試線：從電源香蕉插座拉到負載接線柱，線上光點速度 ∝ 電流 */
function Lead({ from, to, color, reverse }: { from: THREE.Vector2; to: THREE.Vector3; color: string; reverse?: boolean }) {
  const { curve, geo, plugAt } = useMemo(() => {
    // 路徑：插座往前 → 垂到桌面 → 從接線柱正上方插進去（避開電阻本體與負載板）
    const end = loadToWorld(to);
    const above = loadToWorld(to.clone().add(new THREE.Vector3(Math.sign(to.x) * 0.1, 0.45, -0.05)));
    const out = panelToWorld(PSU, from.x, from.y, 0.6);
    const pts = [
      panelToWorld(PSU, from.x, from.y, 0.28),
      out,
      new THREE.Vector3().lerpVectors(out, above, 0.45).setY(0.05),
      above,
      end.clone().add(new THREE.Vector3(0, 0.05, 0)),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    return { curve, geo: new THREE.TubeGeometry(curve, 80, 0.025, 10, false), plugAt: panelToWorld(PSU, from.x, from.y, 0) };
  }, [from, to]);
  useEffect(() => () => geo.dispose(), [geo]);

  const dots = useRef<THREE.Mesh[]>([]);
  const phase = useRef(0);
  useFrame((_, dt) => {
    const st = usePsuLab.getState();
    const { i } = solvePsu(st.psu, loadResistance(st));
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
      {/* 插在電源上的香蕉插頭 */}
      <group position={plugAt} rotation={[0, PSU.rotY, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.18]} castShadow>
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

function drawLabel(p: PanelCtx, r: number, burnt: boolean) {
  p.ctx.fillStyle = '#e9e2cf';
  p.ctx.fillRect(0, 0, p.s(LABEL.w), p.s(LABEL.h));
  label(p, 'LOAD', -0.66, 0, 0.07, '#333', 'left', 800);
  label(p, burnt ? 'BURNT – OPEN' : isFinite(r) ? `R = ${formatSI(r, 'Ω', 2)}` : 'R = OPEN',
    0, 0, 0.08, burnt ? '#c01818' : '#111', 'center', 800);
  label(p, `${RATED_POWER} W`, 0.66, 0, 0.06, '#333', 'right', 700);
}

export function PowerLoad3D() {
  const r = usePsuLab(loadResistance);
  const burnt = usePsuLab((s) => s.burnt);
  const stepLoad = usePsuLab((s) => s.stepLoad);

  const labelTex = useMemo(() => createCanvasTexture(LABEL.w, LABEL.h, () => {}, 400), []);
  useEffect(() => () => labelTex.dispose(), [labelTex]);
  useEffect(() => {
    const c = labelTex.image as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    drawLabel({
      ctx, x: (u) => (u + LABEL.w / 2) * 400, y: (u) => (LABEL.h / 2 - u) * 400, s: (u) => u * 400,
    }, r, burnt);
    labelTex.needsUpdate = true;
  }, [r, burnt, labelTex]);

  // 熱模型：每幀更新溫度，外殼依溫度從鋁金色 → 暗紅 → 橘紅發光
  // 本體與散熱鰭片共用同一個材質，發熱/燒黑時整顆電阻一起變色
  const body = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.7, roughness: 0.35 }), []);
  useEffect(() => () => body.dispose(), [body]);
  const glow = useRef<THREE.PointLight>(null);
  const temp = useRef(AMBIENT);
  const lastPush = useRef(0);
  const nonce = usePsuLab((s) => s.resistorNonce);
  useEffect(() => { temp.current = AMBIENT; }, [nonce]); // 「更換電阻」後從室溫重新開始
  useFrame(({ clock }, dt) => {
    const st = usePsuLab.getState();
    const { p } = solvePsu(st.psu, loadResistance(st));
    temp.current = stepTemperature(temp.current, p, Math.min(dt, 0.1));
    const nowBurnt = st.burnt || temp.current > BURN_TEMP;
    const heat = THREE.MathUtils.clamp((temp.current - 90) / 220, 0, 1);
    body.color.set(nowBurnt ? '#2a2420' : '#c9a24a');
    body.emissive.setRGB(1, 0.25 + heat * 0.25, 0.05);
    body.emissiveIntensity = nowBurnt ? 0 : heat * 1.6;
    if (glow.current) glow.current.intensity = nowBurnt ? 0 : heat * 1.2;
    if (clock.elapsedTime - lastPush.current > 0.25 || nowBurnt !== st.burnt) {
      lastPush.current = clock.elapsedTime;
      st.setThermal(Math.round(temp.current), nowBurnt);
    }
  });

  return (
    <>
      <group position={LOAD.pos} rotation={[0, LOAD.rotY, 0]}>
        <mesh position={[0, BOARD.h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[BOARD.w, BOARD.h, BOARD.d]} />
          <meshStandardMaterial color="#5b3f26" roughness={0.8} />
        </mesh>
        {/* 鋁殼功率電阻：本體 + 散熱鰭片 + 兩端引腳 */}
        <group position={[0, BOARD.h + RES.h / 2, RES.z]}>
          <mesh castShadow material={body}>
            <boxGeometry args={[RES.w * 0.8, RES.h, RES.d * 0.6]} />
          </mesh>
          {[-2, -1, 0, 1, 2].map((k) => (
            <mesh key={k} position={[0, 0, (k * RES.d) / 5]} castShadow material={body}>
              <boxGeometry args={[RES.w * 0.72, RES.h * 0.9, 0.02]} />
            </mesh>
          ))}
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * RES.w * 0.46, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.015, 0.015, RES.w * 0.14, 8]} />
              <meshStandardMaterial color="#d8dde3" metalness={0.9} roughness={0.3} />
            </mesh>
          ))}
          <pointLight ref={glow} color="#ff6a2a" distance={2.5} intensity={0} position={[0, 0.3, 0]} />
        </group>

        <BindingPost at={POSTS.plus} color="#c8201c" />
        <BindingPost at={POSTS.minus} color="#16181b" />

        {/* 可調電阻旋鈕（朝上），往右轉 = 電阻變大 */}
        <group position={[0, BOARD.h, 0.22]} rotation={[-Math.PI / 2, 0, 0]}>
          <Knob3D position={[0, 0, 0]} radius={0.14} capColor="#e9e2cf" onStep={(s) => stepLoad(s > 0 ? 1 : -1)} />
        </group>

        <mesh position={[0, BOARD.h + 0.001, 0.41]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[LABEL.w, LABEL.h]} />
          <meshBasicMaterial map={labelTex} toneMapped={false} />
        </mesh>
      </group>

      <Lead from={PSU.jackPlus} to={POSTS.plus} color="#c8201c" />
      <Lead from={PSU.jackMinus} to={POSTS.minus} color="#1c1e21" reverse />
    </>
  );
}
