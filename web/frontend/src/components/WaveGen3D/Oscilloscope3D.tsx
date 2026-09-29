// 3D 示波器：即時取樣函數波產生器輸出並畫在螢幕上（上升緣觸發、AUTO SET、自動量測）
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useWaveLab } from './waveStore.js';
import { sampleWave, findTrigger, measure, TIME_DIVS, VOLT_DIVS, H_DIVS } from './waveform.js';
import { createCanvasTexture, label, sectionBox, type PanelCtx } from './panelTexture.js';
import { drawScope } from './scopeDisplay.js';
import { Knob3D, Button3D, Led3D, Bnc3D } from './parts.js';
import { SCOPE } from './layout.js';

const { w: W, h: H, d: D } = SCOPE.size;
const SCREEN = { x: -0.75, y: 0.05, w: 2.0, h: 1.86 };
const PW = W - 0.1, PH = H - 0.1;
const N_SAMPLES = 800;

function drawPanel(p: PanelCtx) {
  p.ctx.fillStyle = '#3a4048';
  p.ctx.fillRect(0, 0, p.s(PW), p.s(PH));
  label(p, 'RealCad', -1.75, -1.03, 0.08, '#ffffff', 'left', 800);
  label(p, 'DS-1100  Digital Oscilloscope  100 MHz  1 GSa/s', -1.25, -1.03, 0.05, '#9fb3c8', 'left');
  sectionBox(p, 1.12, 0.38, 1.3, 0.6, 'VERTICAL');
  label(p, 'VOLTS/DIV', 0.75, 0.15, 0.05);
  label(p, 'POSITION', 1.5, 0.15, 0.05);
  sectionBox(p, 1.12, -0.31, 1.3, 0.58, 'HORIZONTAL · TRIGGER');
  label(p, 'TIME/DIV', 0.75, -0.53, 0.05);
  label(p, 'LEVEL', 1.5, -0.53, 0.05);
  label(p, 'CH1', 0.5, -0.85, 0.055, '#ffd21f', 'right', 800);
  label(p, '1MΩ  ≤300Vpk', 1.0, -0.85, 0.045, '#9fb3c8', 'left');
  label(p, 'POWER', 1.68, -1.0, 0.04, '#9fb3c8');
}

export function Oscilloscope3D() {
  const scope = useWaveLab((s) => s.scope);
  const { setScope, stepTimeDiv, stepVoltDiv, autoSet } = useWaveLab.getState();

  const panelTex = useMemo(() => createCanvasTexture(PW, PH, drawPanel), []);
  const screen = useMemo(() => createCanvasTexture(SCREEN.w, SCREEN.h, () => {}, 400), []);
  useEffect(() => () => { panelTex.dispose(); screen.dispose(); }, [panelTex, screen]);
  const samples = useRef<number[]>(new Array(N_SAMPLES).fill(0));

  useFrame(({ clock }) => {
    const { gen, scope: sc } = useWaveLab.getState();
    const timeDiv = TIME_DIVS[sc.timeDivIdx];
    const voltDiv = VOLT_DIVS[sc.voltDivIdx];
    const acShift = sc.coupling === 'AC' && gen.power && gen.output && gen.waveform !== 'noise' ? gen.offset : 0;
    let status: 'Trig\'d' | 'Auto' | 'Stop' = 'Stop';

    if (sc.running) {
      const now = clock.elapsedTime;
      // 觸發點放在螢幕水平中央；觸發準位是「螢幕上的電壓」，AC 耦合時要加回直流準位才是產生器的真實電壓
      const tTrig = findTrigger(gen, sc.trigLevel + acShift, now);
      status = tTrig === null ? 'Auto' : 'Trig\'d';
      const t0 = (tTrig ?? now) - (H_DIVS / 2) * timeDiv;
      const dt = (H_DIVS * timeDiv) / (N_SAMPLES - 1);
      for (let i = 0; i < N_SAMPLES; i++) samples.current[i] = sampleWave(gen, t0 + i * dt) - acShift;
    }
    const dt = (H_DIVS * timeDiv) / (N_SAMPLES - 1);
    const c = screen.image as HTMLCanvasElement;
    drawScope(c.getContext('2d')!, c.width, c.height, {
      samples: samples.current, timeDiv, voltDiv, scope: sc, status,
      meas: measure(samples.current, dt), powered: true,
    });
    screen.needsUpdate = true;
  });

  const z = D / 2;
  return (
    <group position={SCOPE.pos} rotation={[0, SCOPE.rotY, 0]}>
      <RoundedBox args={[W, H, D]} radius={0.08} smoothness={4} position={[0, H / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#2c3036" roughness={0.6} metalness={0.2} />
      </RoundedBox>
      {/* 後方散熱凸殼 */}
      <RoundedBox args={[W * 0.8, H * 0.75, 0.6]} radius={0.08} position={[0, H * 0.45, -D / 2 - 0.2]} castShadow>
        <meshStandardMaterial color="#25282d" roughness={0.7} />
      </RoundedBox>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <mesh key={`${sx}${sz}`} position={[sx * (W / 2 - 0.25), 0.02, sz * (D / 2 - 0.25)]}>
          <cylinderGeometry args={[0.09, 0.1, 0.04, 16]} />
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

        <Button3D position={[0.62, 0.86, 0.002]} size={[0.36, 0.15]} text="RUN/STOP"
          active activeColor={scope.running ? '#27b34a' : '#d23b3b'}
          onPress={() => setScope({ running: !scope.running })} />
        <Button3D position={[1.1, 0.86, 0.002]} size={[0.36, 0.15]} text="AUTO"
          color="#6b5a2a" onPress={autoSet} />
        <Button3D position={[1.58, 0.86, 0.002]} size={[0.36, 0.15]} text={scope.coupling}
          color="#55502a" onPress={() => setScope({ coupling: scope.coupling === 'DC' ? 'AC' : 'DC' })} />

        <Knob3D position={[0.75, 0.4, 0.002]} radius={0.18} capColor="#ffd21f"
          onStep={(s) => stepVoltDiv(-s)} />
        <Knob3D position={[1.5, 0.4, 0.002]} radius={0.12}
          onStep={(s, fine) => {
            const p = useWaveLab.getState().scope.position + s * (fine ? 0.02 : 0.1);
            setScope({ position: Math.max(-4, Math.min(4, Number(p.toFixed(2)))) });
          }} />
        <Knob3D position={[0.75, -0.28, 0.002]} radius={0.18}
          onStep={(s) => stepTimeDiv(-s)} />
        <Knob3D position={[1.5, -0.28, 0.002]} radius={0.12} capColor="#ff8a1f"
          onStep={(s, fine) => {
            const sc = useWaveLab.getState().scope;
            const step = VOLT_DIVS[sc.voltDivIdx] * (fine ? 0.04 : 0.2);
            setScope({ trigLevel: Number((sc.trigLevel + s * step).toPrecision(4)) });
          }} />

        <Bnc3D position={[SCOPE.bnc.x, SCOPE.bnc.y, 0.002]} />
        <Led3D position={[1.68, -0.88, 0.002]} on color="#39c8ff" />
      </group>
    </group>
  );
}
