## RealCad
## Introduce
### This is a including: Schemtic, PCB Layout, 3D, Simlutor apps.

## 3D 函數波產生器模擬器（網頁版 `/wavegen`）
網頁前端 `web/frontend` 新增 3D 實驗桌：函數波產生器 FG-2000 以 BNC 線接到示波器 DS-1100。
- 產生器：正弦／方波／三角／鋸齒／脈波（可調工作週期）／雜訊，頻率 0.1 Hz–10 MHz、振幅、直流偏移（輸出上限 ±10 V，超過會削峰）
- 示波器：VOLTS/DIV、TIME/DIV（1-2-5 檔位）、垂直位置、上升緣觸發準位、AC/DC 耦合、RUN/STOP、AUTO SET，以及 Freq／Vpp／Vmax／Vmin／Vrms 自動量測
- 操作：3D 面板上的按鍵可直接點；旋鈕按住上下拖曳或滾輪轉動（Shift 微調）；右側 HTML 面板與 3D 面板共用同一份狀態
- 程式碼：`web/frontend/src/components/WaveGen3D/`（依功能拆分：`waveform.ts` 波形數學、`waveStore.ts` 狀態、`parts.tsx` 旋鈕/按鍵、`FunctionGenerator3D.tsx`、`Oscilloscope3D.tsx`、`BncCable.tsx`、`LabBench.tsx` 場景、`ControlPanel.tsx`），頁面入口 `web/frontend/src/pages/WaveGenPage.tsx`
