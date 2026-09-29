// 電源供應器 → 麵包板的紅黑測試線（疊插在負載測試線後面）：+ 接 Va 接線柱、− 接 GND 接線柱
import { useMemo } from 'react';
import * as THREE from 'three';
import { PSU, boardToWorld } from './layout.js';
import { BananaLead } from './BananaLead.js';
import { POST_XS, POST_TOP, POST_Z, type PostName } from './boardModel.js';
import { usePsuLab, loadResistance } from './psuStore.js';
import { getBench } from './bench.js';

/** 流進麵包板的電流 = 電源總電流 − 負載電流 */
const boardCurrent = () => {
  const b = getBench();
  const r = loadResistance(usePsuLab.getState());
  return b.psu.i - (isFinite(r) ? b.psu.v / r : 0);
};

function PostLead({ from, post, color, reverse }: { from: THREE.Vector2; post: PostName; color: string; reverse?: boolean }) {
  const { end, above } = useMemo(() => ({
    end: boardToWorld(new THREE.Vector3(POST_XS[post], POST_TOP, POST_Z)),
    above: boardToWorld(new THREE.Vector3(POST_XS[post] - 0.05, POST_TOP + 0.45, POST_Z - 0.25)),
  }), [post]);
  return <BananaLead from={from} end={end} above={above} color={color} reverse={reverse} stack={1} getCurrent={boardCurrent} />;
}

export function BoardLeads() {
  return (
    <>
      <PostLead from={PSU.jackPlus} post="Va" color="#c8201c" />
      <PostLead from={PSU.jackMinus} post="GND" color="#1c1e21" reverse />
    </>
  );
}
