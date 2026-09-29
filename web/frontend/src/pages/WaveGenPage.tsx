// /wavegen：3D 函數波產生器 + 示波器實驗桌
import { Canvas } from '@react-three/fiber';
import { useNavigate } from 'react-router-dom';
import { LabBench } from '../components/WaveGen3D/LabBench.js';
import { ControlPanel } from '../components/WaveGen3D/ControlPanel.js';
import { VIEWS } from '../components/WaveGen3D/layout.js';

export function WaveGenPage() {
  const navigate = useNavigate();
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#1a1d22' }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: VIEWS.overview.pos.toArray() as [number, number, number], fov: 40, near: 0.1, far: 100 }}
      >
        <LabBench />
      </Canvas>
      <button
        onClick={() => navigate('/')}
        style={{
          position: 'absolute', top: 16, left: 16, padding: '6px 12px', borderRadius: 8,
          border: '1px solid #2c333c', background: 'rgba(18,21,26,0.92)', color: '#e6ebf1', cursor: 'pointer',
        }}
      >
        ← 返回
      </button>
      <ControlPanel />
    </div>
  );
}
