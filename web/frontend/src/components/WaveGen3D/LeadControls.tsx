// 函數產生器 / 示波器面板上的「接線」區塊：顯示目前接到哪裡、一鍵切到接線工具、拔掉改回直接連接
import { useBoard, LEAD_NAME, type LeadKind } from './boardStore.js';
import { holeName } from './boardModel.js';
import { useLabUi } from './labUi.js';
import { useBench } from './bench.js';
import { getTransfers, probeConnected } from './scopeLink.js';
import { chip, row, help } from './panelUi.js';

const DEFAULT: Record<LeadKind, string> = {
  fg: '目前：BNC 線直接接示波器 CH1',
  ch1: '目前：BNC 線直接接函數產生器輸出',
  ch2: '目前：探棒夾在電源供應器的負載接線柱上',
};
const ENDS: Record<LeadKind, [string, string]> = { fg: ['紅 +', '黑 −'], ch1: ['探針', '接地夾'], ch2: ['探針', '接地夾'] };

export function LeadControl({ kind }: { kind: LeadKind }) {
  const lead = useBoard((s) => s.leads[kind]);
  const placing = useBoard((s) => s.tool === kind);
  useBench(); // 電路改變時重新檢查探棒有沒有接到電路
  const s = useBoard.getState();
  const start = () => { s.setTool(kind); useLabUi.getState().focus('breadboard'); };
  const tr = kind === 'fg' ? null : getTransfers()[kind];
  return (
    <>
      <p style={help}>
        {lead ? `${ENDS[kind][0]}：${holeName(lead[0])}　${ENDS[kind][1]}：${holeName(lead[1])}` : DEFAULT[kind]}
        {placing && `　（接線中：在麵包板上先點${ENDS[kind][0]}，再點${ENDS[kind][1]}）`}
      </p>
      {lead && kind !== 'fg' && !probeConnected(tr) && <p style={{ ...help, color: '#ffd9a0' }}>探針插的點沒有接到電路，示波器只會看到一條平線</p>}
      <div style={row}>
        <button style={chip(placing, '#0086b3', '#12345a')} onClick={start}>{lead ? '重新接線' : `接到麵包板（${LEAD_NAME[kind]}）`}</button>
        {lead && <button style={chip(false, '', '#3a1a2a')} onClick={() => s.setLead(kind, null)}>拔掉，改回原本接法</button>}
      </div>
    </>
  );
}
