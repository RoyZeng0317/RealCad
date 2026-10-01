// 實驗室工作區的介面狀態：下方面板目前的分頁、左右側欄開關
import { create } from 'zustand';
import { useWaveLab, type ViewPreset } from './waveStore.js';
import { useDev } from './devboards/devStore.js';

export type DockTab = 'generator' | 'scope' | 'spectrum' | 'psu' | 'nodes' | 'code' | 'serial' | 'help';

interface LabUiState {
  dockTab: DockTab;
  leftOpen: boolean;
  rightOpen: boolean;
  setDockTab: (t: DockTab) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  /** 點左側儀器：鏡頭飛過去、下方面板切到該儀器 */
  focus: (v: ViewPreset) => void;
}

const DOCK_OF: Partial<Record<ViewPreset, DockTab>> = { generator: 'generator', scope: 'scope', spectrum: 'spectrum', psu: 'psu', breadboard: 'nodes', devboards: 'code', fpga: 'code' };
const wide = typeof window === 'undefined' || window.innerWidth >= 1000;

export const useLabUi = create<LabUiState>((set) => ({
  dockTab: 'generator',
  leftOpen: wide,
  rightOpen: wide,
  setDockTab: (dockTab) => set({ dockTab }),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
  focus: (v) => {
    useWaveLab.getState().setView(v);
    const t = DOCK_OF[v];
    if (t) set({ dockTab: t });
    if (v === 'fpga' && useDev.getState().conf.fpga.present) useDev.getState().setCodeTab('fpga');
  },
}));
