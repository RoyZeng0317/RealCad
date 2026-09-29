// 3D 實驗桌場景：燈光、桌面、兩台儀器、BNC 線與視角切換的鏡頭動畫
import { useEffect, useRef, type ComponentRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import { FunctionGenerator3D } from './FunctionGenerator3D.js';
import { Oscilloscope3D } from './Oscilloscope3D.js';
import { BncCable } from './BncCable.js';
import { PowerSupply3D } from './PowerSupply3D.js';
import { PowerLoad3D } from './PowerLoad3D.js';
import { ScopeProbe } from './ScopeProbe.js';
import { LabBreadboard } from './LabBreadboard.js';
import { BoardLeads } from './BoardLeads.js';
import { useWaveLab } from './waveStore.js';
import { VIEWS } from './layout.js';

type OrbitImpl = ComponentRef<typeof OrbitControls>;

/** 按下視角按鈕時把鏡頭平滑飛到預設位置，飛到後就交還給使用者自由旋轉 */
function CameraRig({ controls }: { controls: RefObject<OrbitImpl | null> }) {
  const view = useWaveLab((s) => s.view);
  const nonce = useWaveLab((s) => s.viewNonce);
  const flying = useRef(false);
  const { camera } = useThree();

  useEffect(() => { flying.current = true; }, [view, nonce]);

  useFrame((_, delta) => {
    const c = controls.current;
    if (!flying.current || !c) return;
    const { pos, target } = VIEWS[view];
    const k = 1 - Math.exp(-delta * 4);
    camera.position.lerp(pos, k);
    c.target.lerp(target, k);
    c.update();
    if (camera.position.distanceTo(pos) < 0.02 && c.target.distanceTo(target) < 0.02) flying.current = false;
  });

  // 使用者自己拖曳時中斷飛行
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const stop = () => { flying.current = false; };
    c.addEventListener('start', stop);
    return () => c.removeEventListener('start', stop);
  }, [controls]);
  return null;
}

export function LabBench() {
  const controls = useRef<OrbitImpl>(null);
  const dragging = useWaveLab((s) => s.dragging);
  const knobHover = useWaveLab((s) => s.knobHover);

  return (
    <>
      <color attach="background" args={['#1a1d22']} />
      <fog attach="fog" args={['#1a1d22', 14, 30]} />
      <hemisphereLight args={['#dfe8ff', '#3a2e22', 0.7]} />
      <directionalLight
        position={[4, 9, 6]} intensity={1.6} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
        shadow-camera-left={-10} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8}
      />
      <directionalLight position={[-6, 4, 8]} intensity={0.5} />

      {/* 實驗桌 */}
      <mesh position={[-1.6, -0.1, 2.2]} receiveShadow>
        <boxGeometry args={[14, 0.2, 8.6]} />
        <meshStandardMaterial color="#8a6a4a" roughness={0.8} />
      </mesh>
      <mesh position={[-1.6, 0.001, 2.1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[13, 1.6]} />
        <meshStandardMaterial color="#2d5a3f" roughness={0.9} />
      </mesh>
      <mesh position={[0, -3.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#121418" />
      </mesh>
      <ContactShadows position={[-1.6, 0.002, 2.2]} scale={18} blur={2.2} opacity={0.5} far={3} />

      <FunctionGenerator3D />
      <Oscilloscope3D />
      <BncCable />
      <PowerSupply3D />
      <PowerLoad3D />
      <ScopeProbe />
      <LabBreadboard />
      <BoardLeads />

      <OrbitControls
        ref={controls}
        makeDefault
        enabled={!dragging}
        enableZoom={!knobHover}
        enableDamping
        minDistance={2}
        maxDistance={20}
        maxPolarAngle={Math.PI * 0.49}
        target={VIEWS.overview.target.toArray() as [number, number, number]}
      />
      <CameraRig controls={controls} />
    </>
  );
}

