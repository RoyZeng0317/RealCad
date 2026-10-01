// 4×4 麵包板矩陣與 2×2 麵包板組的底板與側桌（條帶本身跟主麵包板一起在 LabBreadboard 畫，孔的點擊 / 滑鼠提示共用同一套）
import { useEffect, useMemo } from 'react';
import { createCanvasTexture, label } from './panelTexture.js';
import { PLATE, GRID_BOARDS, GRID_PLATE, GROUPS, groupArea, gridCenter, boardName, type BoardGroup } from './breadboardGrid.js';

function GridPlate({ g }: { g: number }) {
  const tex = useMemo(() => createCanvasTexture(GRID_PLATE.w, GRID_PLATE.d, (p) => {
    p.ctx.fillStyle = '#f3efe4';
    p.ctx.fillRect(0, 0, p.s(GRID_PLATE.w), p.s(GRID_PLATE.d));
    label(p, boardName(g), 0, GRID_PLATE.d / 2 - 0.055, 0.075, '#2a56d4', 'center', 800);
    label(p, '830', 0, -GRID_PLATE.d / 2 + 0.055, 0.06, '#777', 'center', 700);
  }), [g]);
  useEffect(() => () => tex.dispose(), [tex]);
  const c = gridCenter(g);
  return (
    <group position={[c.x, 0, c.z]}>
      <mesh position={[0, PLATE.h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[GRID_PLATE.w, PLATE.h, GRID_PLATE.d]} />
        <meshStandardMaterial color="#ece6d6" roughness={0.7} />
      </mesh>
      <mesh position={[0, PLATE.h + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[GRID_PLATE.w, GRID_PLATE.d]} />
        <meshStandardMaterial map={tex} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** 一張側桌（桌面在 y = 0，跟主實驗桌同高）；座標是主麵包板本地座標 */
function SideTable({ gr }: { gr: BoardGroup }) {
  const a = groupArea(gr), m = 0.5;
  const w = a.x1 - a.x0 + 2 * m, d = a.z1 - a.z0 + 2 * m;
  const cx = (a.x0 + a.x1) / 2, cz = (a.z0 + a.z1) / 2;
  return (
    <group>
      <mesh position={[cx, -0.1, cz]} receiveShadow raycast={() => null}>
        <boxGeometry args={[w, 0.2, d]} />
        <meshStandardMaterial color="#7d6043" roughness={0.8} />
      </mesh>
      <mesh position={[cx, 0.001, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={() => null}>
        <planeGeometry args={[w - 0.4, d - 0.4]} />
        <meshStandardMaterial color="#2d5a3f" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** 4×4 與 2×2 兩張側桌 + 20 片底板 */
export function BreadboardGrid3D() {
  return (
    <group>
      {GROUPS.map((gr) => <SideTable key={gr.first} gr={gr} />)}
      {Array.from({ length: GRID_BOARDS }, (_, g) => <GridPlate key={g} g={g} />)}
    </group>
  );
}
