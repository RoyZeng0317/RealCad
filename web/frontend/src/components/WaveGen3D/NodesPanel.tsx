// 下方面板「電路節點」分頁：麵包板電路的節點電壓與每個零件的工作點（類似 SPICE 的 .op 結果）
import { useBoard } from './boardStore.js';
import { useBench, fgDc } from './bench.js';
import { dmmReading } from './scopeLink.js';
import { partLabel } from './boardParts.js';
import { holeName } from './boardModel.js';
import { Section, T, help } from './panelUi.js';

const td = { padding: '3px 8px', borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' as const };

export function NodesPanel() {
  const parts = useBoard((s) => s.parts);
  const temps = useBoard((s) => s.temps);
  const select = useBoard((s) => s.selectPart);
  const bench = useBench();

  // 每個網路取一個有零件腳的孔當名稱
  const netNames = new Map<string, [string, string]>();
  for (const p of parts) for (const h of p.pins) {
    const n = bench.netOfHole(h);
    if (!netNames.has(n)) netNames.set(n, [holeName(h), h]);
  }
  // 函數產生器接在麵包板上時，節點電壓顯示一個週期的平均值（跟三用電表一樣）
  const ac = !!fgDc();
  const nodes = [...netNames.entries()]
    .map(([n, [name, hole]]) => ({ n, name, v: ac ? dmmReading(hole, 'p:GND') ?? undefined : bench.sol.nodeV[n] }))
    .filter((x): x is { n: string; name: string; v: number } => x.v !== undefined)
    .sort((a, b) => b.v - a.v);
  const comps = parts.filter((p) => p.kind !== 'wire');

  return (
    <>
      <Section title={`節點電壓（${nodes.length}）`}>
        {ac && <p style={help}>函數產生器接在麵包板上：節點電壓是一個週期的平均值；下方零件工作點以產生器的平均輸出電壓計算，瞬間波形請用示波器看。</p>}
        {nodes.length === 0 ? <p style={help}>麵包板上還沒有電路。從左側元件庫放零件，或按「載入範例電路」。</p> : (
          <table style={{ borderCollapse: 'collapse', fontSize: 12, fontFamily: T.mono }}>
            <tbody>
              {nodes.map((x) => (
                <tr key={x.n}>
                  <td style={{ ...td, color: T.muted }}>{x.n === bench.netOfHole('p:GND') ? 'GND' : x.n === bench.netOfHole('p:Va') ? 'Va（電源 +）' : x.name}</td>
                  <td style={{ ...td, color: '#7dffb0', textAlign: 'right' }}>{x.v.toFixed(3)} V</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section title={`零件工作點（${comps.length}）`}>
        {comps.length === 0 ? <p style={help}>沒有零件。</p> : (
          <table style={{ borderCollapse: 'collapse', fontSize: 12, fontFamily: T.mono }}>
            <thead>
              <tr style={{ color: T.muted }}>
                <td style={td}>零件</td><td style={td}>V</td><td style={td}>I</td><td style={td}>P</td><td style={td}>溫度</td>
              </tr>
            </thead>
            <tbody>
              {comps.map((p) => {
                const r = bench.sol.el[p.id];
                return (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => select(p.id)}>
                    <td style={{ ...td, color: p.burnt ? '#ff4d3a' : T.text }}>{partLabel(p)}{p.burnt ? '（損壞）' : ''}</td>
                    <td style={{ ...td, color: T.value }}>{(r?.v ?? 0).toFixed(3)}</td>
                    <td style={{ ...td, color: T.value }}>{((r?.i ?? 0) * 1000).toFixed(2)} mA</td>
                    <td style={{ ...td, color: T.value }}>{((r?.p ?? 0) * 1000).toFixed(1)} mW</td>
                    <td style={{ ...td, color: (temps[p.id] ?? 25) > 120 ? '#ff8a1f' : T.value }}>{temps[p.id] ?? 25} °C</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}

export function HelpPanel() {
  return (
    <>
      <Section title="視角操作">
        <p style={help}>左鍵拖曳旋轉、滾輪縮放、右鍵平移。上方工具列或左側元件庫點儀器，鏡頭會飛過去。</p>
      </Section>
      <Section title="儀器操作">
        <p style={help}>頻譜分析儀（疊在函數產生器上）：PEAK 峰值搜尋、NEXT PK 下一個峰值、FUND 對準基頻、HARM×10 看前 10 次諧波；CENTER / SPAN / REF 三顆旋鈕。下方「頻譜分析儀」分頁有諧波表與 THD，左側「頻譜分析儀探棒」可改量麵包板上的兩點。</p>
        <p style={help}>3D 面板上的按鍵可以直接點；旋鈕用「按住上下拖曳」或「滑鼠滾輪」轉動，按住 Shift 微調。下方面板與 3D 面板是同一份狀態。</p>
      </Section>
      <Section title="開發板">
        <p style={help}>左側「開發板」加入 Arduino Uno / ESP32 / STM32 Blue Pill / Raspberry Pi 5，用杜邦線從排針接到麵包板。下方「程式碼」分頁寫程式後按「上傳並執行」，「序列埠」看輸出。接錯（例如 5 V 接到 3.3 V 晶片的腳、GPIO 短路、LED 沒串電阻）板子上方會出現 ERROR，持續太久腳位會燒毀。</p>
      </Section>
      <Section title="FPGA 實驗板（EPF10K50EQC240-1）">
        <p style={help}>「程式碼」分頁切到 FPGA：上傳 Quartus 專案的 .v 與 .qsf（也可拖曳），按「編譯」看報告，再到 Programmer 用 JTAG（.sof，斷電消失）或 Active Serial（.pof 燒進 EPC2，開機自動載入）燒錄。上傳的 .sof / .pof 會檢查元件型號，電路由同專案原始碼重建。板上有 8 LED、兩位七段顯示器、8 位指撥開關、4 顆按鍵、紅色 RESET（PIN_10）、滑動開關 SLD0／SLD1、喇叭（PIN_55，會真的發聲）、SD／TF 卡座（點卡座插拔）、PWR 電源開關與 Type-C，CLK_50MHz（PIN_91）與可調 CLK_SEL（PIN_92）；J1 排針 IO0–31 可以接麵包板。</p>
      </Section>
      <Section title="檔案">
        <p style={help}>上方「檔案」選單可以新增、開啟、儲存 .rc 專案（Ctrl+S / Ctrl+O），也可以直接把 .rc 檔拖進頁面開啟。.rc 是本網站專屬格式，其他程式無法開啟。</p>
      </Section>
      <Section title="麵包板">
        <p style={help}>左側選零件後點孔放置：電阻 / 二極體 / 杜邦線點兩個孔，LT1117 點第 1 腳。滑鼠移到孔上會標出相通的孔與電壓。Esc 取消、Delete 刪除選取的零件。</p>
      </Section>
    </>
  );
}
