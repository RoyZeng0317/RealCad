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
- **檔案選單與 .rc 專案檔**：檔案（新增／開啟／儲存／另存新檔／重新命名／範例）、編輯（復原／重做／刪除／清空）、檢視、說明；Ctrl+S、Ctrl+Shift+S、Ctrl+O、Ctrl+Z、Ctrl+Y；可把 .rc 檔拖進頁面開啟；有未儲存變更時關閉頁面會提醒
- **編輯麵包板**：選取工具下按住零件拖曳到別的孔（杜邦線是拖其中一端，不能放的位置顯示紅色、放開會自動取消）；快捷鍵 **S** 選取、**W** 杜邦線、**X**（或 Delete）刪除選取的零件、Esc 取消；上方工具列（視角按鈕後面）也有同樣的「選取 / 杜邦線 / 刪除 / 復原 / 重做」按鈕。快捷鍵以實體按鍵判斷，英文鍵盤、中文輸入法的英文或中文模式都能用
  - `.rc` 格式（`project/rcFormat.ts`）：8 bytes 簽章 `RCLAB 1A 0D 0A` + 版本 + 旗標 + IV + AES-256-GCM 加密的 gzip JSON，只有本網站能開啟；內容被改過會驗證失敗、拒絕開啟；開檔時每個欄位都重新驗證（`project/projectDoc.ts`）
  - 支援 File System Access API 的瀏覽器（Chrome、Edge）會直接覆寫原檔，其他瀏覽器改用下載
- **開發板**（`devboards/`）：Arduino Uno R3、ESP32 DevKitC、STM32 Blue Pill、Raspberry Pi 5，依真實排針位置建模，用杜邦線從排針接到麵包板
  - Uno／ESP32／STM32：內建 C 子集直譯器（`sketchLang.ts`／`sketchRun.ts`，不使用 eval）：pinMode／digitalWrite／digitalRead／analogWrite／analogRead／delay／millis／Serial.print(ln)、if／for／while／switch、函式、陣列、#define；Uno 的 int 為 16 位元
  - Raspberry Pi 5：**MicroPython** 子集直譯器（`pyLang.ts`／`pyRun.ts`，不使用 eval）：`from machine import Pin, PWM`、`Pin(17, Pin.OUT)`、`.on()/.off()/.value()/.toggle()`、`Pin(27, Pin.IN, Pin.PULL_UP)`、`PWM(Pin(18), freq=1000, duty_u16=…)`、`time.sleep / sleep_ms / ticks_ms`、math、random、print、f-string、if／for／while／def／try、list／dict／串列生成式；腳位用 BCM 編號（Pi 5 沒有 ADC）。編輯器 Tab 縮排 4 格、Enter 自動保留縮排
  - 註：實體 Pi 5 跑的是完整 Python（CPython），這裡依需求採用 MicroPython 的 `machine` 模組寫法
  - GPIO 以戴維寧等效接進電路求解器（輸出內阻、內建上拉／下拉、USB 5V／3.3V 供電），digitalRead／analogRead 讀的是模擬出來的電壓
  - 接線錯誤會顯示 ERROR：GPIO 過電流、3.3 V 板子被接 5 V、負電壓、5V／3V3 短路（USB 保險絲跳脫）、3V3 被倒灌、沒上電卻有電壓、ESP32 Flash 腳；持續 0.3 秒以上腳位會燒毀
  - 開發板 GND 沒跟麵包板 GND 接在一起時兩邊不共地（只有 1 MΩ 漏電），可以模擬「忘記共地」
  - 下方「程式碼」分頁（上傳並執行 Ctrl+Enter、停止、重新開機、範例）、「序列埠」分頁看輸出
- **FPGA 實驗板**（`devboards/fpga/`）：Altera FLEX 10KE **EPF10K50EQC240-1**（QFP240）+ EPC2 設定晶片、50 MHz 振盪器、JTAG 座、8 LED、兩位七段顯示器（共陽極）、8 位指撥開關、4 顆按鍵、nCONFIG 鍵、J1 2×20 排針（IO0–31 可用杜邦線接麵包板，5 V 耐壓）、Type-C 電源座 + PWR 電源滑動開關、喇叭、紅色 RESET 鍵、2 個滑動開關（SLD0／SLD1）、SD 與 TF（microSD）卡座
  - 上傳 Quartus 專案檔（按鈕或拖曳）：`.v`（Verilog）、`.qsf`（腳位 `set_location_assignment`、`TOP_LEVEL_ENTITY`、`DEVICE`）、`.qpf`、`.sof`、`.pof`；VHDL／`.bdf` 會提示先在 Quartus 轉成 Verilog
  - 編譯：Verilog-2001 可合成子集解析 + 展開（`verilogLang.ts`／`verilogElab.ts`：module／parameter／wire／reg／assign／always @(*)／posedge／negedge 非同步重置／if／case／casez／for／模組實例化／記憶體陣列／$clog2），產生的模擬程式只含索引與數字常數（不執行使用者文字）；報告含錯誤檔名與行號、型號檢查、腳位衝突、輸出接到開關腳等 Fitter 檢查
  - Programmer：JTAG（`.sof` → FPGA SRAM，斷電消失）與 Active Serial（`.pof` → EPC2，每次上電自動載入）；`.sof`／`.pof` 是 Intel 封閉格式，燒錄時從檔案讀出元件型號比對（不符就像 Quartus 一樣拒絕），電路由同專案原始碼重建
  - 板上腳位：CLK_50MHz = PIN_91（盡量快跑並顯示實際模擬速度）、CLK_SEL = PIN_92（1 Hz–1 kHz 可調）、KEY0–3 = PIN_7/8/9/11（按下 = 0）、SW0–7 = PIN_12–20、LED0–7 = PIN_21–29、HEX0／HEX1 = PIN_30–41／44–54（低電位亮）、J1 IO0–31 = PIN_132–168、RESET = PIN_10（按下 = 0）、SLD0／SLD1 = PIN_56／57、SPEAKER = PIN_55、SD 卡 CLK／CMD／DAT0／DAT3／CD = PIN_60–64、TF 卡 = PIN_65–69（CD 有插卡 = 0）（完整表在 Pin Planner「板子腳位總表」）
  - 喇叭：量測喇叭腳在模擬時間內的切換頻率，用瀏覽器的 Web Audio 發出方波（20 Hz–20 kHz 才發聲，可在卡片上靜音）；範例按住 KEY1 會發出 440 Hz（50 MHz 除頻，實際多快聽到取決於電腦的模擬速度）
  - 記憶卡：點卡座或卡片插拔，設計可以讀 CD 腳判斷有沒有插卡；SPI 腳位已配置，卡片內容的讀寫尚未模擬（DAT0 固定讀到 1）
  - 輸出以每幀的高電位比例呈現（PWM／快速切換的 LED 會顯示亮度）；專案檔與 EPC2 內容會存進 `.rc`
- **儀器接到麵包板**（`scopeLink.ts`、`InstrumentLeads.tsx`、`LeadControls.tsx`）：左側「工具」或產生器／示波器面板的「接到麵包板」
  - 函數產生器輸出線：BNC → 紅（+）／黑（−）夾到孔、接線柱或開發板排針，產生器成為電路裡的訊號源（輸出內阻 50 Ω）
  - 示波器 CH1／CH2 探棒：探針勾在要量的點、接地夾夾在地；CH1 沒接探棒時用 BNC 直接看產生器輸出端，CH2 沒接探棒時照舊量電源供應器
  - 麵包板零件都沒有電容電感，所以把產生器電壓從最低掃到最高（41 點），每點求一次直流解，得到「產生器電壓 → 探棒電壓」轉換曲線，示波器依時間查表畫出波形（二極體削波等非線性都正確）；觸發、AC 耦合、自動量測都作用在量到的波形上
  - 產生器黑線（−）與示波器接地夾都經過儀器外殼接大地、彼此相通（共地）；產生器 − 沒直接接回電路時，電流可經由示波器接地夾流回產生器（跟真的實驗室一樣）
- **頻譜分析儀 SA-1010**（`spectrum.ts`、`saSignal.ts`、`saDisplay.ts`、`SpectrumAnalyzer3D.tsx`、`SaPanel.tsx`）：疊在函數產生器上，DC – 100 MHz
  - 沒接探棒時用短 BNC 線直接量產生器輸出（輸入 50 Ω 時產生器 50 Ω 內阻分壓 −6 dB，跟真機一樣）；左側「頻譜分析儀探棒」接到麵包板就量那兩點（整流、削波產生的諧波都看得到）
  - 取一個週期做 FFT 得到各次諧波，依 RBW 展開成高斯形狀，加上 −140 dBm/Hz 雜訊底線；CENTER / SPAN / REF / RBW、dBm / dBV、50 Ω / 1 MΩ、RUN / HOLD
  - 標記：峰值搜尋、下一個峰值；快速設定「對準基頻」「看前 10 次諧波」；下方面板有前 10 次諧波表（dBc）與 THD；設定跟著 .rc 專案存
  - 三用電表與「電路節點」的電壓在產生器接上時顯示一個週期的平均值；接線存進 `.rc`，面板可一鍵拔掉改回原本接法
  - 範例：「函數產生器 → 麵包板：半波整流」（10 Vpp 正弦 → 1N4007 → 1 kΩ，CH1 看輸入、CH2 看只剩正半週的輸出）
- **快捷鍵**（`shortcuts.ts`）：S 選取、W 杜邦線、X 刪除模式、Delete 刪除選取的零件、Esc 取消；支援英文鍵盤與中文輸入法。游標在文字框或程式編輯器時字母會打進去，工具列會顯示「⌨ 輸入中・快捷鍵暫停」，按 Esc 或點提示就恢復
  - 快捷鍵曾反覆失效，歷次原因與修改規範見 `web/frontend/src/components/WaveGen3D/SHORTCUTS.md`；每次修改後執行 `node web/frontend/scripts/shortcuts-regression.mjs http://localhost:5173/demos`（需要 `npm i -D playwright`），全部通過才能合併
- 新零件：5 mm LED（紅／黃／綠／藍／白，亮度依電流，超過約 100 mA 會燒毀）
- 麵包板 IC（`chips/`）：**ATmega328P-PU**（DIP-28）與 **CH340G** USB 轉序列（DIP-16 轉接板 + Micro USB 線），點端子排的孔放置，跨在中間的溝上（第 1 腳在 e 欄）
  - ATmega328P：VCC（7）／AVCC（20）接 2.7–5.5 V、GND（8、22）接地才會動；寫 Arduino C（沿用 C 子集直譯器，Arduino 腳位編號 D0–D13、A0–A5），GPIO 以戴維寧等效接進電路求解器；RESET（1）拉低會重置；燒進 Flash 的程式斷電不會消失，跟著 `.rc` 存檔
  - 上傳要經過 CH340：TXD（2）→ ATmega 第 2 腳 RXD、RXD（3）← 第 3 腳 TXD、共地、CH340 VCC（16）上電；缺少時顯示仿 avrdude 的錯誤（找不到序列埠、not in sync、TX/RX 接反、沒共地）；DTR#（13）接 RESET 會在上傳時自動重置
  - 序列埠輸出只有 ATmega TXD 接到有上電的 CH340 RXD 才看得到（下方「序列埠」分頁選 ATmega328P）；滑鼠移到 IC 上顯示腳位名稱與電壓
  - 範例：檔案選單「麵包板 Arduino：ATmega328P + CH340 上傳 Blink」（5 V 電源、D13 → 330 Ω → LED，載入後自動上傳）

網頁前端 `web/frontend` 新增 3D 實驗桌：函數波產生器 FG-2000 以 BNC 線接到示波器 DS-1100，旁邊是直流電源供應器 PS-3005 接電阻負載。
- 產生器：正弦／方波／三角／鋸齒／脈波（可調工作週期）／雜訊，頻率 0.1 Hz–10 MHz、振幅、直流偏移（輸出上限 ±10 V，超過會削峰）
- 示波器（雙通道 DS-1102）：CH1 接函數波產生器、CH2 用探棒量電源供應器輸出（可觸發 CH2 抓開關輸出時的上升曲線）；VOLTS/DIV、TIME/DIV（1-2-5 檔位）、垂直位置、上升緣觸發準位、AC/DC 耦合、RUN/STOP、AUTO SET，以及 Freq／Vpp／Vmax／Vmin／Vrms 自動量測
- 電源供應器 PS-3005：0–30 V／0–5 A，VOLTAGE／CURRENT 旋鈕、3.3/5/12 V 記憶預設、輸出開關，七段顯示器與 CV/CC 指示燈（負載電流超過限流時自動從定電壓 CV 切到定電流 CC）
- 電阻負載：紅黑測試線接到 25 W 鋁殼功率電阻（1 Ω–1 kΩ 可調／開路），依功率發熱發光；超過 350 °C 燒斷變開路，可在面板「更換電阻」
- 大型麵包板 RB-2（仿 JE25）：2 條 63 列端子排 + 3 條雙軌電源排 + Va/Vb/GND 接線柱，滑鼠移到孔上會標出相通的孔
- 麵包板電路模擬（瀏覽器內即時運算，不需後端）：在「麵包板」分頁選工具點孔放零件
  - 零件：色碼電阻（1/4 W；數值框可直接輸入 0.1 Ω–10 MΩ，例如 330、4.7k、4k7、1M，也可從 E12 清單挑；放好的電阻選取後也能改值）、1N4001–1N4007（依型號 PIV 50–1000 V）、LT1117-3.3（TO-220，1 GND／2 OUT／3 IN）、杜邦線（公對公，黑色方形塑膠殼）
  - 電源供應器 + 接麵包板 Va、− 接 GND（與負載電阻並聯，負載可調成開路）
  - 求解器：`circuit.ts`（MNA + 牛頓法），含電源 CV/CC、二極體 Shockley 模型與逆向崩潰、LT1117 穩壓／壓降不足／1 A 限流／熱關斷
  - 三用電表有紅、黑兩支探棒（輪流點孔、接線柱或開發板排針放置，黑棒預設插在 GND），讀值 = 紅棒 − 黑棒，可以量任兩點之間的電壓；選取零件看電壓、電流、功率、溫度；電阻過功率會燒斷、二極體燒毀變短路、LT1117 輸入超過 15 V 損壞
  - 範例（檔案選單或左側元件庫）：3.3 V 穩壓電路（7 V → 1N4007 → LT1117-3.3 → 330 Ω，輸出 3.300 V）、Arduino Uno LED 閃爍、Raspberry Pi 5 MicroPython LED 閃爍、錯誤示範（5 V 接到 ESP32 GPIO）、FLEX 10K FPGA 計數器（七段顯示器 + J1 IO0 接麵包板 LED）
- 操作：3D 面板上的按鍵可直接點；旋鈕按住上下拖曳或滾輪轉動（Shift 微調）；右側 HTML 面板與 3D 面板共用同一份狀態
- 程式碼：`web/frontend/src/components/WaveGen3D/`（依功能拆分：`waveform.ts` 波形數學、`waveStore.ts` 狀態、`parts.tsx` 旋鈕/按鍵、`FunctionGenerator3D.tsx`、`Oscilloscope3D.tsx`、`BncCable.tsx`、`BananaLead.tsx`、`BoardLeads.tsx`、`ScopeProbe.tsx`、`psu.ts`／`psuStore.ts`／`psuDisplay.ts`／`PowerSupply3D.tsx`／`PowerLoad3D.tsx`／`PsuPanel.tsx` 電源與負載、`breadboardGrid.ts`／`boardModel.ts`／`boardParts.ts`／`boardStore.ts`／`circuit.ts`／`bench.ts`／`BoardParts3D.tsx`／`BoardPanel.tsx` 麵包板與電路模擬、`LabBench.tsx` 場景），頁面入口 `web/frontend/src/pages/LabWorkspacePage.tsx`（工作區元件：`LabToolbar.tsx`、`LabSidebars.tsx`、`LabDock.tsx`、`GenPanel.tsx`、`ScopePanel.tsx`、`NodesPanel.tsx`、`labUi.ts`）
