// Explore Demos：整合函數波產生器、示波器、電源供應器與麵包板的 3D 實驗室工作區
// 版面仿 /editor：上方工具列、左側元件庫、中間 3D 場景、右側檢視器、下方可調高度面板與狀態列
import type { CSSProperties } from 'react';
import { Canvas } from '@react-three/fiber';
import { LabBench } from '../components/WaveGen3D/LabBench.js';
import { VIEWS } from '../components/WaveGen3D/layout.js';
import { LabToolbar } from '../components/WaveGen3D/LabToolbar.js';
import { LabLibrary, LabInspector } from '../components/WaveGen3D/LabSidebars.js';
import { LabDock, LabStatusBar } from '../components/WaveGen3D/LabDock.js';
import { useLabUi } from '../components/WaveGen3D/labUi.js';
import { useBoardKeys } from '../components/WaveGen3D/BoardPanel.js';
import { T } from '../components/WaveGen3D/panelUi.js';

export function LabWorkspacePage() {
  const leftOpen = useLabUi((s) => s.leftOpen);
  const rightOpen = useLabUi((s) => s.rightOpen);
  useBoardKeys();

  return (
    <div style={page}>
      <LabToolbar />
      <div style={workspace}>
        {leftOpen && <LabLibrary />}
        <div style={main}>
          <div style={canvasWrap}>
            <Canvas
              shadows
              dpr={[1, 2]}
              camera={{ position: VIEWS.overview.pos.toArray() as [number, number, number], fov: 40, near: 0.1, far: 100 }}
            >
              <LabBench />
            </Canvas>
          </div>
          <LabDock />
        </div>
        {rightOpen && <LabInspector />}
      </div>
      <LabStatusBar />
    </div>
  );
}

const page: CSSProperties = {
  position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: T.bg, color: T.text, overflow: 'hidden',
};
const workspace: CSSProperties = { flex: 1, display: 'flex', minHeight: 0, position: 'relative' };
const main: CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 };
const canvasWrap: CSSProperties = { flex: 1, position: 'relative', minHeight: 0 };
