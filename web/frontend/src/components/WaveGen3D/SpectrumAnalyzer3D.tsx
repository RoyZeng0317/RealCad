// 3D 頻譜分析儀 SA-1010（疊在函數波產生器上面）：螢幕、PEAK / NEXT / RUN-HOLD / 快速設定按鍵、CENTER / SPAN / REF 旋鈕、RF IN BNC
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { useSa } from './saStore.js';
import { getSaInput, peakSearch, nextPeak, saPreset, markerLevel } from './saSignal.js';
import { buildTrace, thd, startFreq, stopFreq, TRACE_POINTS, SA_FMAX } from './spectrum.js';
import { drawSa } from './saDisplay.js';
import { createCanvasTexture, label, sectionBox, type PanelCtx } from './panelTexture.js';
import { Knob3D, Button3D, Led3D, Bnc3D } from './parts.js';
import { SA, GEN, panelToWorld } from './layout.js';
import { Plug } from './BncCable.js';

const { w: W, h: H, d: D } = SA.size;
const SCREEN = { x: -0.62, y: 0.02, w: 1.8, h: 1.06 };
const PW = W - 0.1, PH = H - 0.1;
const REFRESH = 0.1; // 秒；RUN 時每 0.1 秒掃一次

function drawPanel(p: PanelCtx) {
  p.ctx.fillStyle = '#34393f';
  p.ctx.fillRect(0, 0, p.s(PW), p.s(PH));
  label(p, 'RealCad', -1.5, 0.56, 0.065, '#ffffff', 'left', 800);
  label(p, 'SA-1010  Spectrum Analyzer  DC – 100 MHz', -1.02, 0.56, 0.04, '#9fb3c8', 'left');
  sectionBox(p, 1.0, 0.33, 1.0, 0.36, 'MARKER · SWEEP');
  label(p, 'CENTER', 0.62, -0.25, 0.04);
  label(p, 'SPAN', 1.0, -0.25, 0.04);
  label(p, 'REF', 1.38, -0.25, 0.04);
  label(p, 'RF IN 50Ω', SA.bnc.x, -0.57, 0.04, '#f5c518', 'center', 700);
  label(p, '+10 dBm MAX', 0.82, -0.47, 0.032, '#ff8a6a', 'center', 700);
  label(p, 'POWER', 0.62, -0.57, 0.035, '#9fb3c8');
}

/** Span 走 1-2-5 檔位 */
function stepSpan(cur: number, s: number) {
  const steps: number[] = [];
  for (let e = 1; e <= 8; e++) for (const m of [1, 2, 5]) steps.push(m * 10 ** e);
  steps.push(SA_FMAX);
  let i = steps.findIndex((x) => x >= cur * 0.999);
  if (i < 0) i = steps.length - 1;
  return steps[Math.max(0, Math.min(steps.length - 1, i + s))];
}

/** 沒接頻譜分析儀紅黑測試線、產生器也沒接麵包板時：產生器 OUT → SA RF IN 的短 BNC 線 */
function SaCable() {
  const { geo, a, b } = useMemo(() => {
    const a = panelToWorld(GEN, GEN.bnc.x, GEN.bnc.y, 0);
    const b = panelToWorld(SA, SA.bnc.x, SA.bnc.y, 0);
    const pts = [
      panelToWorld(GEN, GEN.bnc.x, GEN.bnc.y, 0.35),
      panelToWorld(GEN, GEN.bnc.x + 0.25, GEN.bnc.y - 0.05, 0.7),
      panelToWorld(SA, SA.bnc.x + 0.35, SA.bnc.y - 0.3, 0.8),
      panelToWorld(SA, SA.bnc.x, SA.bnc.y, 0.35),
    ];
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 60, 0.03, 10, false);
    return { geo, a, b };
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group>
      <mesh geometry={geo} castShadow raycast={() => null}>
        <meshStandardMaterial color="#1b1d21" roughness={0.55} />
      </mesh>
      <Plug at={a} rotY={GEN.rotY} />
      <Plug at={b} rotY={SA.rotY} />
    </group>
  );
}

export function SpectrumAnalyzer3D({ cable }: { cable: boolean }) {
  const sa = useSa((s) => s.sa);
  const setSa = useSa.getState().setSa;

  const panelTex = useMemo(() => createCanvasTexture(PW, PH, drawPanel), []);
  const screen = useMemo(() => createCanvasTexture(SCREEN.w, SCREEN.h, () => {}, 420), []);
  useEffect(() => () => { panelTex.dispose(); screen.dispose(); }, [panelTex, screen]);
  const trace = useRef<Float32Array>(new Float32Array(TRACE_POINTS).fill(-200));
  const last = useRef(-1);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    if (now - last.current < REFRESH) return;
    last.current = now;
    const s = useSa.getState().sa;
    const inp = getSaInput();
    if (s.running) trace.current = buildTrace(inp.harmonics, s, inp.noiseV2PerHz);
    // 標記讀值：在諧波上讀諧波準位，否則讀軌跡（雜訊底線）
    let marker = markerLevel();
    if (!marker && s.marker !== null) {
      const f0 = startFreq(s), f1 = stopFreq(s);
      const i = Math.round(((s.marker - f0) / (f1 - f0 || 1)) * (TRACE_POINTS - 1));
      if (i >= 0 && i < TRACE_POINTS) marker = { f: s.marker, db: trace.current[i] };
    }
    const c = screen.image as HTMLCanvasElement;
    drawSa(c.getContext('2d')!, c.width, c.height, {
      trace: trace.current, s, marker, thd: thd(inp.harmonics), source: inp.source,
    });
    screen.needsUpdate = true;
  });

  const z = D / 2;
  return (
    <>
      <group position={SA.pos} rotation={[0, SA.rotY, 0]}>
        <RoundedBox args={[W, H, D]} radius={0.06} smoothness={4} position={[0, H / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#5a6068" roughness={0.55} metalness={0.2} />
        </RoundedBox>
        {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * (W / 2 - 0.25), 0.015, sz * (D / 2 - 0.25)]}>
            <cylinderGeometry args={[0.08, 0.09, 0.03, 16]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        )))}

        <group position={[0, H / 2, z]}>
          <mesh position={[0, 0, 0.002]}>
            <planeGeometry args={[PW, PH]} />
            <meshStandardMaterial map={panelTex} roughness={0.7} />
          </mesh>
          <mesh position={[SCREEN.x, SCREEN.y, 0.012]}>
            <boxGeometry args={[SCREEN.w + 0.08, SCREEN.h + 0.08, 0.024]} />
            <meshStandardMaterial color="#0c0e11" roughness={0.3} />
          </mesh>
          <mesh position={[SCREEN.x, SCREEN.y, 0.025]}>
            <planeGeometry args={[SCREEN.w, SCREEN.h]} />
            <meshBasicMaterial map={screen} toneMapped={false} />
          </mesh>

          <Button3D position={[0.7, 0.38, 0.002]} size={[0.3, 0.12]} text="PEAK" color="#2a6b4a" onPress={peakSearch} />
          <Button3D position={[1.05, 0.38, 0.002]} size={[0.3, 0.12]} text="NEXT PK" color="#2a5a6b" onPress={nextPeak} />
          <Button3D position={[1.38, 0.38, 0.002]} size={[0.26, 0.12]} text={sa.running ? 'RUN' : 'HOLD'}
            active activeColor={sa.running ? '#27b34a' : '#d23b3b'} onPress={() => setSa({ running: !sa.running })} />
          <Button3D position={[0.7, 0.22, 0.002]} size={[0.3, 0.1]} text="FUND" color="#6b5a2a" onPress={() => saPreset('fund')} />
          <Button3D position={[1.05, 0.22, 0.002]} size={[0.3, 0.1]} text="HARM×10" color="#6b4a2a" onPress={() => saPreset('harm')} />
          <Button3D position={[1.38, 0.22, 0.002]} size={[0.26, 0.1]} text={sa.unit} color="#474d56"
            onPress={() => setSa({ unit: sa.unit === 'dBm' ? 'dBV' : 'dBm' })} />

          <Knob3D position={[0.62, -0.06, 0.002]} radius={0.12} capColor="#ffd21f"
            onStep={(s, fine) => {
              const c = useSa.getState().sa;
              setSa({ center: c.center + s * c.span * (fine ? 0.01 : 0.1) });
            }} />
          <Knob3D position={[1.0, -0.06, 0.002]} radius={0.12}
            onStep={(s) => setSa({ span: stepSpan(useSa.getState().sa.span, s) })} />
          <Knob3D position={[1.38, -0.06, 0.002]} radius={0.1} capColor="#c48bff"
            onStep={(s, fine) => setSa({ ref: useSa.getState().sa.ref + s * (fine ? 1 : 10) })} />

          <Bnc3D position={[SA.bnc.x, SA.bnc.y, 0.002]} />
          <Led3D position={[0.62, -0.46, 0.002]} on color="#39ff6a" />
        </group>
      </group>
      {cable && <SaCable />}
    </>
  );
}
