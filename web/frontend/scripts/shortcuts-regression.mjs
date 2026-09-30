// 快捷鍵回歸測試（S 選取 / W 杜邦線 / X 刪除模式 / Esc / 中文輸入法）——每次修改介面後都要跑，全部 OK 才能合併
//   快捷鍵失效已經發生過多次，歷史與原因見 src/components/WaveGen3D/SHORTCUTS.md
//
// 用法：
//   1. npm run dev（或 npm run build && npm run preview）
//   2. npm i -D playwright（第一次才需要；已經有 Chromium 的環境可設 CHROMIUM_PATH 並改裝 playwright-core）
//   3. node scripts/shortcuts-regression.mjs http://localhost:5173/demos
// 結束代碼 0 = 全部通過，1 = 有失敗（會列出是哪一個情境）
let pw;
try { pw = await import('playwright'); } catch { pw = await import('playwright-core'); }
const url = process.argv[2] ?? 'http://localhost:5173/demos';
const browser = await pw.chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('dialog', (d) => d.accept());
await p.goto(url);
await p.waitForTimeout(3000);

const tool = async () => (await p.locator('aside').nth(1).innerText()).match(/工具：([^\n]*)/)?.[1];
const focus = () => p.evaluate(() => { const a = document.activeElement; return a ? a.tagName + (a.getAttribute('type') ? `:${a.getAttribute('type')}` : '') : 'none'; });
// 中文輸入法：key = "Process"、keyCode 229，只有 code 是實體按鍵
const ime = (code) => p.evaluate((c) => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Process', code: c, keyCode: 229, bubbles: true })), code);
const menu = async (item) => {
  await p.getByRole('button', { name: '檔案', exact: true }).first().click();
  await p.getByRole('button', { name: item }).first().click();
  await p.waitForTimeout(1500);
};

let fails = 0;
/** 按 W、X、S、中文輸入法 W，工具要依序變成 杜邦線、刪除、選取、杜邦線 */
async function expectShortcuts(label) {
  await p.keyboard.press('s'); await p.waitForTimeout(100);
  const r = [];
  for (const k of ['w', 'x', 's']) { await p.keyboard.press(k); await p.waitForTimeout(120); r.push(await tool()); }
  await ime('KeyW'); await p.waitForTimeout(120); r.push(await tool());
  await p.keyboard.press('s');
  const ok = r.join(',') === '杜邦線,刪除,選取,杜邦線';
  if (!ok) fails++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}｜焦點 ${await focus()}｜${r.join(',')}`);
}
/** 在打字的地方：字母要打進去（工具不變），而且工具列要顯示「快捷鍵暫停」 */
async function expectTyping(label) {
  const before = await tool();
  await p.keyboard.press('w'); await p.waitForTimeout(120);
  const hint = await p.getByText(/輸入中・快捷鍵暫停/).count();
  const ok = (await tool()) === before && hint > 0;
  await p.keyboard.press('Backspace');
  if (!ok) fails++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}｜焦點 ${await focus()}｜工具維持 ${before}、提示 ${hint ? '有' : '沒有'}`);
}

await expectShortcuts('剛開頁面');
await menu(/半波整流/);
await expectShortcuts('載入範例（儀器接到麵包板）');
await p.getByRole('button', { name: '示波器', exact: true }).first().click();
await p.getByRole('button', { name: '± 對調' }).first().click();
await expectShortcuts('按過面板按鈕（± 對調）');
await p.getByRole('button', { name: /三用電表/ }).first().click();
await expectShortcuts('切到三用電表工具');
await p.getByRole('button', { name: '函數波產生器' }).first().click();
const slider = p.locator('input[type=range]').first();
await slider.focus(); await slider.press('ArrowRight');
await expectShortcuts('用過滑桿');
await menu(/ATmega328P \+ CH340/);
await p.getByRole('button', { name: '程式碼', exact: true }).first().click();
const editor = p.locator('textarea').first();
await editor.click(); await p.keyboard.press('End');
await expectTyping('游標在程式編輯器裡');
await p.keyboard.press('Escape'); await p.waitForTimeout(150);
await expectShortcuts('在程式編輯器按 Esc 之後');
await editor.click();
await p.getByText(/輸入中・快捷鍵暫停/).click(); await p.waitForTimeout(150);
await expectShortcuts('按工具列「快捷鍵暫停」提示之後');
await editor.click();
await p.mouse.click(800, 350); await p.waitForTimeout(200);
await expectShortcuts('從編輯器點回 3D 畫面');
await p.getByRole('button', { name: /^▭/ }).first().click();
const rbox = p.getByLabel('電阻值').first();
await rbox.click(); await expectTyping('游標在電阻值數值框');
await rbox.fill('1k'); await rbox.press('Enter'); await p.waitForTimeout(150);
await expectShortcuts('電阻值按 Enter 之後');
await menu(/FLEX 10K FPGA：計數器/); await p.waitForTimeout(2000);
await p.getByRole('button', { name: /FLEX 10K FPGA 實驗板/ }).first().click();
await p.locator('select').filter({ has: p.locator('option[value="1000"]') }).selectOption('10');
await expectShortcuts('用過下拉選單（CLK_SEL）');

console.log(fails ? `\n✖ ${fails} 個情境失敗` : '\n✔ 全部通過');
if (errs.length) console.log('頁面錯誤：\n' + errs.join('\n'));
await browser.close();
process.exit(fails || errs.length ? 1 : 0);
