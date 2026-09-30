// 函數產生器 / 示波器面板上的「接線」區塊：顯示 + 端、− 端各接在哪裡，可以兩端一起重接、只改一端、或 ± 對調，拔掉就改回原本接法
import { useBoard, LEAD_NAME, type LeadKind } from './boardStore.js';
import { holeName } from './boardModel.js';
import { useLabUi } from './labUi.js';
import { useBench } from './bench.js';
import { getTransfers, probeConnected } from './scopeLink.js';
import { chip, row, help } from './panelUi.js';

/** 3D 標籤與提示用的簡稱 */
export const LEAD_TAG: Record<LeadKind, string> = { fg: 'FG', ch1: 'CH1', ch2: 'CH2' };
const DEFAULT: Record<LeadKind, string> = {
  fg: '目前：BNC 線直接接示波器 CH1',
  ch1: '目前：BNC 線直接接函數產生器輸出',
  ch2: '目前：探棒夾在電源供應器的負載接線柱上',
};
const ENDS: Record<LeadKind, [string, string]> = { fg: ['紅線', '黑線'], ch1: ['探針', '接地夾'], ch2: ['探針', '接地夾'] };

export function LeadControl({ kind }: { kind: LeadKind }) {
  const lead = useBoard((s) => s.leads[kind]);
  const placing = useBoard((s) => s.tool === kind);
  useBench(); // 電路改變時重新檢查探棒有沒有接到電路
  const s = useBoard.getState();
  const start = (end?: 0 | 1) => { s.startLead(kind, end); useLabUi.getState().focus('breadboard'); };
  const tr = kind === 'fg' ? null : getTransfers()[kind];
  const tag = LEAD_TAG[kind];
  return (
    <>
      {lead ? (
        <p style={help}>
          <b style={{ color: '#ff8a7a' }}>{tag} +</b>（{ENDS[kind][0]}）：{holeName(lead[0])}<br />
          <b style={{ color: '#c8c8c8' }}>{tag} −</b>（{ENDS[kind][1]}）：{holeName(lead[1])}
          {kind !== 'fg' && <><br />螢幕顯示 {tag} + 對 {tag} − 的電壓</>}
        </p>
      ) : <p style={help}>{DEFAULT[kind]}</p>}
      {placing && <p style={{ ...help, color: '#ffd21f' }}>接線中：請看右上「工具」的提示，在麵包板上點孔</p>}
      {lead && kind !== 'fg' && !probeConnected(tr) && <p style={{ ...help, color: '#ffd9a0' }}>探針插的點沒有接到電路，示波器只會看到一條平線</p>}
      <div style={row}>
        <button style={chip(placing, '#0086b3', '#12345a')} onClick={() => start()}>{lead ? '兩端重新接線' : `接到麵包板（${LEAD_NAME[kind]}）`}</button>
        {lead && <button style={chip(false, '', '#3a1a2a')} onClick={() => s.setLead(kind, null)}>拔掉，改回原本接法</button>}
      </div>
      {lead && (
        <div style={row}>
          <button style={chip(false)} onClick={() => start(0)}>只改 + 端</button>
          <button style={chip(false)} onClick={() => start(1)}>只改 − 端</button>
          <button style={chip(false)} onClick={() => s.setLead(kind, [lead[1], lead[0]])}>± 對調</button>
        </div>
      )}
    </>
  );
}
