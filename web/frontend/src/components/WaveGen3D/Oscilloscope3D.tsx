// 3D 示波器（雙通道）：CH1 接函數波產生器、CH2 用探棒量電源供應器輸出（兩個通道都可以改用探棒量麵包板）；上升緣觸發（可選 CH1/CH2）、AUTO SET、自動量測
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useWaveLab } from './waveStore.js';
import { getBench } from './bench.js';
import { DcTrace } from './ch2Signal.js';
import { sampleWave, findTrigger, findTriggerFn, measure, TIME_DIVS, VOLT_DIVS, H_DIVS, type Measurements } from './waveform.js';
import { getTransfers, probeAt, channelLead } from './scopeLink.js';
import { createCanvasTexture, label, sectionBox, type PanelCtx } from './panelTexture.js';
import { drawScope, CH1_COLOR, CH2_COLOR, type ScopeStatus } from './scopeDisplay.js';
import { Knob3D, Button3D, Led3D, Bnc3D } from './parts.js';
import { SCOPE } from './layout.js';

const { w: W, h: H, d: D } = SCOPE.size;
const SCREEN = { x: -0.75, y: 0.05, w: 2.0, h: 1.86 };
const PW = W - 0.1, PH = H - 0.1;
const N_SAMPLES = 800;
// 垂直區兩個通道的旋鈕位置：[VOLTS/DIV x, POSITION x]
const COL1 = [0.66, 0.97], COL2 = [1.3, 1.61];

/** 最新一次畫面的量測結果（下方面板的 MEASURE 表格讀這裡） */
export const scopeMeas: { ch1: Measurements | null; ch2: Measurements | null } = { ch1: null, ch2: null };

function drawPanel(p: PanelCtx) {
  p.ctx.fillStyle = '#3a4048';
  p.ctx.fillRect(0, 0, p.s(PW), p.s(PH));
  label(p, 'RealCad', -1.75, -1.03, 0.08, '#ffffff', 'left', 800);
  label(p, 'DS-1102  2-CH Digital Oscilloscope  100 MHz  1 GSa/s', -1.25, -1.03, 0.045, '#9fb3c8', 'left');
  sectionBox(p, 1.12, 0.38, 1.3, 0.62, 'VERTICAL');
  label(p, 'CH1', (COL1[0] + COL1[1]) / 2, 0.6, 0.06, CH1_COLOR, 'center', 800);
  for (const [a, b] of [COL1, COL2]) {
    label(p, 'V/DIV', a, 0.19, 0.04);
    label(p, 'POS', b, 0.19, 0.04);
  }
  sectionBox(p, 1.12, -0.31, 1.3, 0.58, 'HORIZONTAL · TRIGGER');
  label(p, 'TIME/DIV', 0.75, -0.53, 0.05);
  label(p, 'LEVEL', 1.5, -0.53, 0.05);
  label(p, 'CH1', SCOPE.bnc.x, -0.68, 0.05, CH1_COLOR, 'center', 800);
  label(p, 'CH2', SCOPE.bnc2.x, -0.68, 0.05, CH2_COLOR, 'center', 800);
  label(p, '1MΩ  ≤300Vpk', 1.42, -0.8, 0.035, '#9fb3c8', 'left');
  label(p, 'POWER', 1.63, -0.98, 0.035, '#9fb3c8', 'right');
}

const stepPos = (cur: number, s: number, fine: boolean) =>
  Math.max(-4, Math.min(4, Number((cur + s * (fine ? 0.02 : 0.1)).toFixed(2))));

export function Oscilloscope3D() {
  const scope = useWaveLab((s) => s.scope);
  const { setScope, stepTimeDiv, stepVoltDiv, stepCh2VoltDiv, autoSet } = useWaveLab.getState();

  const panelTex = useMemo(() => createCanvasTexture(PW, PH, drawPanel), []);
  const screen = useMemo(() => createCanvasTexture(SCREEN.w, SCREEN.h, () => {}, 400), []);
  useEffect(() => () => { panelTex.dispose(); screen.dispose(); }, [panelTex, screen]);
  const s1 = useRef<number[]>(new Array(N_SAMPLES).fill(0));
  const s2 = useRef<number[]>(new Array(N_SAMPLES).fill(0));
  const psuTrace = useMemo(() => new DcTrace(), []);
  const status = useRef<ScopeStatus>('Auto');

  useFrame(({ clock }) => {
    const { gen, scope: sc } = useWaveLab.getState();
    const now = clock.elapsedTime;
    psuTrace.update(now, getBench().psu.v);

    const timeDiv = TIME_DIVS[sc.timeDivIdx];
    const span = H_DIVS * timeDiv;
    const dt = span / (N_SAMPLES - 1);
    // 通道接到麵包板時：波形 = 轉換曲線（產生器電壓 → 探棒電壓）套在產生器波形上
    const tr = getTransfers();
    const on1 = channelLead('ch1') ? tr.ch1 : null, on2 = channelLead('ch2') ? tr.ch2 : null;
    const v1 = (t: number) => (on1 ? probeAt(on1, t) : sampleWave(gen, t));
    const v2 = on2 ? (t: number) => probeAt(on2, t) : null;
    const live = gen.power && gen.output && gen.waveform !== 'noise';
    const period = 1 / gen.frequency;
    let mean1 = gen.offset;
    if (on1) { mean1 = 0; for (let i = 0; i < 64; i++) mean1 += v1((i + 0.5) * period / 64) / 64; }
    const acShift = sc.coupling === 'AC' && live ? mean1 : 0;

    if (!sc.running) {
      status.current = 'Stop';
    } else {
      // 觸發點放在螢幕水平中央；沒有觸發（Auto）時畫面右緣 = 現在
      let tTrig: number | null;
      if (sc.trigSource === 'CH2' && v2) {
        tTrig = live ? findTriggerFn(v2, period, sc.trigLevel, now) : null;
      } else if (sc.trigSource === 'CH2') {
        // 電源是直流，只有開關輸出/換負載的瞬間有邊緣：抓最近一次上升穿越，畫面保留 5 秒（類似 Normal 觸發模式）方便觀察
        tTrig = psuTrace.lastRisingCrossing(sc.trigLevel, now);
        if (tTrig !== null && now - tTrig > Math.max(5, span * 2)) tTrig = null;
      } else {
        // CH1 觸發準位是「螢幕上的電壓」，AC 耦合時要加回直流準位才是產生器的真實電壓
        tTrig = on1 ? (live ? findTriggerFn(v1, period, sc.trigLevel + acShift, now) : null) : findTrigger(gen, sc.trigLevel + acShift, now);
      }
      status.current = tTrig === null ? 'Auto' : 'Trig\'d';
      const t0 = tTrig !== null ? tTrig - span / 2 : now - span;
      for (let i = 0; i < N_SAMPLES; i++) {
        const t = t0 + i * dt;
        s1.current[i] = v1(t) - acShift;
        s2.current[i] = v2 ? v2(t) : psuTrace.sample(Math.min(t, now));
      }
    }

    const c = screen.image as HTMLCanvasElement;
    scopeMeas.ch1 = measure(s1.current, dt);
    scopeMeas.ch2 = sc.ch2On ? measure(s2.current, dt) : null;
    drawScope(c.getContext('2d')!, c.width, c.height, {
      ch1: { samples: s1.current, voltDiv: VOLT_DIVS[sc.voltDivIdx], position: sc.position, meas: scopeMeas.ch1 },
      ch2: sc.ch2On && scopeMeas.ch2
        ? { samples: s2.current, voltDiv: VOLT_DIVS[sc.ch2VoltDivIdx], position: sc.ch2Position, meas: scopeMeas.ch2 }
        : null,
      timeDiv, scope: sc, status: status.current,
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

        {/* 上方功能鍵 */}
        <Button3D position={[0.6, 0.86, 0.002]} size={[0.28, 0.14]} text="RUN/STOP"
          active activeColor={scope.running ? '#27b34a' : '#d23b3b'}
          onPress={() => setScope({ running: !scope.running })} />
        <Button3D position={[0.92, 0.86, 0.002]} size={[0.28, 0.14]} text="AUTO"
          color="#6b5a2a" onPress={autoSet} />
        <Button3D position={[1.24, 0.86, 0.002]} size={[0.28, 0.14]} text={`CH1 ${scope.coupling}`}
          color="#55502a" onPress={() => setScope({ coupling: scope.coupling === 'DC' ? 'AC' : 'DC' })} />
        <Button3D position={[1.56, 0.86, 0.002]} size={[0.28, 0.14]} text={`TRIG ${scope.trigSource}`}
          color="#6b4a2a" onPress={() => setScope({ trigSource: scope.trigSource === 'CH1' ? 'CH2' : 'CH1' })} />

        {/* VERTICAL：CH1、CH2 各一組 VOLTS/DIV + POSITION */}
        <Knob3D position={[COL1[0], 0.38, 0.002]} radius={0.13} capColor={CH1_COLOR}
          onStep={(s) => stepVoltDiv(-s)} />
        <Knob3D position={[COL1[1], 0.38, 0.002]} radius={0.08}
          onStep={(s, fine) => setScope({ position: stepPos(useWaveLab.getState().scope.position, s, fine) })} />
        <Button3D position={[(COL2[0] + COL2[1]) / 2, 0.6, 0.002]} size={[0.3, 0.1]} text="CH2"
          active={scope.ch2On} activeColor="#1a9fc4" onPress={() => setScope({ ch2On: !scope.ch2On })} />
        <Knob3D position={[COL2[0], 0.38, 0.002]} radius={0.13} capColor={CH2_COLOR}
          onStep={(s) => stepCh2VoltDiv(-s)} />
        <Knob3D position={[COL2[1], 0.38, 0.002]} radius={0.08}
          onStep={(s, fine) => setScope({ ch2Position: stepPos(useWaveLab.getState().scope.ch2Position, s, fine) })} />

        {/* MEASURE：螢幕上切換 基本 → CH1 全部參數 → CH2 全部參數 */}
        <Button3D position={[1.12, -0.12, 0.002]} size={[0.26, 0.1]} text={scope.measPage === 0 ? 'MEAS' : `MEAS ${scope.measPage}`}
          active={scope.measPage !== 0} activeColor="#1f7f9f" color="#3a4a5a"
          onPress={() => setScope({ measPage: ((scope.measPage + 1) % 3) as 0 | 1 | 2 })} />
        <Knob3D position={[0.75, -0.28, 0.002]} radius={0.18}
          onStep={(s) => stepTimeDiv(-s)} />
        <Knob3D position={[1.5, -0.28, 0.002]} radius={0.12} capColor="#ff8a1f"
          onStep={(s, fine) => {
            const sc = useWaveLab.getState().scope;
            const vd = VOLT_DIVS[sc.trigSource === 'CH2' ? sc.ch2VoltDivIdx : sc.voltDivIdx];
            setScope({ trigLevel: Number((sc.trigLevel + s * vd * (fine ? 0.04 : 0.2)).toPrecision(4)) });
          }} />

        <Bnc3D position={[SCOPE.bnc.x, SCOPE.bnc.y, 0.002]} />
        <Bnc3D position={[SCOPE.bnc2.x, SCOPE.bnc2.y, 0.002]} />
        <Led3D position={[1.7, -0.98, 0.002]} on color="#39c8ff" />
      </group>
    </group>
  );
}
