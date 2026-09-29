## RealCad
## Introduce
### This is a including: Schemtic, PCB Layout, 3D, Simlutor apps.

## 3D 函數波產生器模擬器（網頁版 `/wavegen`）
網頁前端 `web/frontend` 新增 3D 實驗桌：函數波產生器 FG-2000 以 BNC 線接到示波器 DS-1100，旁邊是直流電源供應器 PS-3005 接電阻負載。
- 產生器：正弦／方波／三角／鋸齒／脈波（可調工作週期）／雜訊，頻率 0.1 Hz–10 MHz、振幅、直流偏移（輸出上限 ±10 V，超過會削峰）
- 示波器（雙通道 DS-1102）：CH1 接函數波產生器、CH2 用探棒量電源供應器輸出（可觸發 CH2 抓開關輸出時的上升曲線）；VOLTS/DIV、TIME/DIV（1-2-5 檔位）、垂直位置、上升緣觸發準位、AC/DC 耦合、RUN/STOP、AUTO SET，以及 Freq／Vpp／Vmax／Vmin／Vrms 自動量測
- 電源供應器 PS-3005：0–30 V／0–5 A，VOLTAGE／CURRENT 旋鈕、3.3/5/12 V 記憶預設、輸出開關，七段顯示器與 CV/CC 指示燈（負載電流超過限流時自動從定電壓 CV 切到定電流 CC）
- 電阻負載：紅黑測試線接到 25 W 鋁殼功率電阻（1 Ω–1 kΩ 可調／開路），依功率發熱發光；超過 350 °C 燒斷變開路，可在面板「更換電阻」
- 大型麵包板 RB-2（仿 JE25）：2 條 63 列端子排 + 3 條雙軌電源排 + Va/Vb/GND 接線柱，滑鼠移到孔上會標出相通的孔
- 操作：3D 面板上的按鍵可直接點；旋鈕按住上下拖曳或滾輪轉動（Shift 微調）；右側 HTML 面板與 3D 面板共用同一份狀態
- 程式碼：`web/frontend/src/components/WaveGen3D/`（依功能拆分：`waveform.ts` 波形數學、`waveStore.ts` 狀態、`parts.tsx` 旋鈕/按鍵、`FunctionGenerator3D.tsx`、`Oscilloscope3D.tsx`、`BncCable.tsx`、`psu.ts`／`psuStore.ts`／`psuDisplay.ts`／`PowerSupply3D.tsx`／`PowerLoad3D.tsx`／`PsuPanel.tsx` 電源與負載、`LabBench.tsx` 場景、`ControlPanel.tsx`），頁面入口 `web/frontend/src/pages/WaveGenPage.tsx`
