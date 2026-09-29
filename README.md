## RealCad
## Introduce
### This is a including: Schemtic, PCB Layout, 3D, Simlutor apps.

## 3D 函數波產生器實驗室（網頁版 Explore Demos，`/demos`）
首頁的 **Explore Demos** 直接進入整合工作區（舊的 `/wavegen` 會自動轉到 `/demos`），版面仿 `/editor`：
- 上方工具列：返回、視角（全景／函數產生器／示波器／電源／麵包板）、FG 輸出／電源輸出／示波器 RUN 快速開關、AUTO SET
- 左側元件庫：儀器（點了鏡頭會飛過去並切到對應控制分頁）、麵包板零件（電阻／1N400x／LT1117-3.3／杜邦線）、工具（選取／三用電表）、範例電路
- 中間 3D 實驗桌；右側檢視器：工具提示、三用電表、選取零件的工作點、即時讀值
- 下方可拖曳高度的面板：函數波產生器／示波器／電源供應器／電路節點（節點電壓與零件工作點）／操作說明；最下方狀態列
- 視窗較窄（手機）時左右側欄改成浮動抽屜（☰、ⓘ 開關）

網頁前端 `web/frontend` 新增 3D 實驗桌：函數波產生器 FG-2000 以 BNC 線接到示波器 DS-1100，旁邊是直流電源供應器 PS-3005 接電阻負載。
- 產生器：正弦／方波／三角／鋸齒／脈波（可調工作週期）／雜訊，頻率 0.1 Hz–10 MHz、振幅、直流偏移（輸出上限 ±10 V，超過會削峰）
- 示波器（雙通道 DS-1102）：CH1 接函數波產生器、CH2 用探棒量電源供應器輸出（可觸發 CH2 抓開關輸出時的上升曲線）；VOLTS/DIV、TIME/DIV（1-2-5 檔位）、垂直位置、上升緣觸發準位、AC/DC 耦合、RUN/STOP、AUTO SET，以及 Freq／Vpp／Vmax／Vmin／Vrms 自動量測
- 電源供應器 PS-3005：0–30 V／0–5 A，VOLTAGE／CURRENT 旋鈕、3.3/5/12 V 記憶預設、輸出開關，七段顯示器與 CV/CC 指示燈（負載電流超過限流時自動從定電壓 CV 切到定電流 CC）
- 電阻負載：紅黑測試線接到 25 W 鋁殼功率電阻（1 Ω–1 kΩ 可調／開路），依功率發熱發光；超過 350 °C 燒斷變開路，可在面板「更換電阻」
- 大型麵包板 RB-2（仿 JE25）：2 條 63 列端子排 + 3 條雙軌電源排 + Va/Vb/GND 接線柱，滑鼠移到孔上會標出相通的孔
- 麵包板電路模擬（瀏覽器內即時運算，不需後端）：在「麵包板」分頁選工具點孔放零件
  - 零件：色碼電阻（E12 10 Ω–1 MΩ，1/4 W）、1N4001–1N4007（依型號 PIV 50–1000 V）、LT1117-3.3（TO-220，1 GND／2 OUT／3 IN）、杜邦線（公對公，黑色方形塑膠殼）
  - 電源供應器 + 接麵包板 Va、− 接 GND（與負載電阻並聯，負載可調成開路）
  - 求解器：`circuit.ts`（MNA + 牛頓法），含電源 CV/CC、二極體 Shockley 模型與逆向崩潰、LT1117 穩壓／壓降不足／1 A 限流／熱關斷
  - 三用電表工具量任一孔對地電壓；選取零件看電壓、電流、功率、溫度；電阻過功率會燒斷、二極體燒毀變短路、LT1117 輸入超過 15 V 損壞
  - 「載入範例電路」：7 V → 1N4007 → LT1117-3.3 → 330 Ω，輸出 3.300 V
- 操作：3D 面板上的按鍵可直接點；旋鈕按住上下拖曳或滾輪轉動（Shift 微調）；右側 HTML 面板與 3D 面板共用同一份狀態
- 程式碼：`web/frontend/src/components/WaveGen3D/`（依功能拆分：`waveform.ts` 波形數學、`waveStore.ts` 狀態、`parts.tsx` 旋鈕/按鍵、`FunctionGenerator3D.tsx`、`Oscilloscope3D.tsx`、`BncCable.tsx`、`BananaLead.tsx`、`BoardLeads.tsx`、`ScopeProbe.tsx`、`psu.ts`／`psuStore.ts`／`psuDisplay.ts`／`PowerSupply3D.tsx`／`PowerLoad3D.tsx`／`PsuPanel.tsx` 電源與負載、`breadboardGrid.ts`／`boardModel.ts`／`boardParts.ts`／`boardStore.ts`／`circuit.ts`／`bench.ts`／`BoardParts3D.tsx`／`BoardPanel.tsx` 麵包板與電路模擬、`LabBench.tsx` 場景、`ControlPanel.tsx`），頁面入口 `web/frontend/src/pages/LabWorkspacePage.tsx`（工作區元件：`LabToolbar.tsx`、`LabSidebars.tsx`、`LabDock.tsx`、`GenPanel.tsx`、`ScopePanel.tsx`、`NodesPanel.tsx`、`labUi.ts`）
