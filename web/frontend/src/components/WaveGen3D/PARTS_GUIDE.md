# 自己新增麵包板零件教學

這份教學用這次加的 **可變電阻、電解電容、電感、電晶體** 當範例，說明一顆零件從「定義」到「畫在 3D 上、能被模擬、能存檔」要改哪些檔案。
由淺到深三個練習，建議照順序做。

---

## 0. 一顆零件會經過哪些檔案

| 順序 | 檔案 | 負責什麼 |
| --- | --- | --- |
| 1 | `boardParts.ts` | 零件種類 `PartKind`、型號 / 數值清單、額定值、熱模型 `THERMAL`、名稱 `partLabel()` |
| 2 | `boardStore.ts` | 放置工具 `Tool`、放置時用的參數（例如 `capModel`）、`clickHole()` 點孔後怎麼產生零件 |
| 3 | `bench.ts` | `benchElements()`：把零件翻譯成電路元件（電阻、二極體、電容、電晶體…） |
| 4 | `circuit.ts` | 電路求解器：每種元件怎麼「蓋」進 MNA 矩陣（只有新的**電氣行為**才需要改這裡） |
| 5 | `transient.ts` | 有電容 / 電感時的暫態模擬（一般不用改） |
| 6 | `AnalogParts3D.tsx` | 3D 外觀 |
| 7 | `AnalogPanels.tsx` | 左側放置參數、右側選取後的工作點卡片 |
| 8 | `BoardPanel.tsx` | 左側元件庫清單 `PART_ITEMS`、提示 `TOOL_HINT`、名稱 `TOOL_NAME` |
| 9 | `project/projectDoc.ts` | 存檔 / 開檔時的驗證（不認識的零件會被丟掉） |

> 規則：改完一定要跑 `npx tsc`、開網頁實際放一顆、再跑快捷鍵回歸測試（CLUADE.md 第 11 條）。

---

## 練習 1：加一個電容型號（只改 1 行）

想加 **220 µF / 16 V**？打開 `boardParts.ts`，找到 `CAP_MODELS`，照格式加一行：

```ts
export const CAP_MODELS = {
  '100u50': { c: 100e-6, v: 50, name: '100 µF / 50 V', d: 8, h: 11.5, color: '#1d3f8a' },
  '47u25': { c: 47e-6, v: 25, name: '47 µF / 25 V', d: 6.3, h: 11, color: '#121418' },
  '220u16': { c: 220e-6, v: 16, name: '220 µF / 16 V', d: 8, h: 11.5, color: '#121418' }, // ← 新增
} as const;
```

- `c`：電容量（F），`220e-6` 就是 220 µF
- `v`：耐壓（V），超過就會損壞
- `d`、`h`：外殼直徑、高度（mm，3D 用）；`color`：外殼顏色

存檔後左側按鈕、右側切換、3D 尺寸、存檔驗證**全部自動出現**，因為其他地方都是讀 `CAP_MODELS` 這張表。

同樣道理：
- 可變電阻加 50 kΩ → `POT_VALUES` 加 `50e3`
- 電感加 4.7 mH → `IND_VALUES` 加 `4.7e-3`
- 電晶體加一顆 → `BJT_MODELS` 照格式加（`pol: 1` 是 NPN、`-1` 是 PNP，`is / bf / br` 可以從廠商的 SPICE 模型抄）
- 變壓器加一種匝數比 → `XFMR_MODELS` 加一行（`n` = 一次側匝數 / 二次側匝數，例如 `'5:1': { n: 5, name: '5 : 1（降壓）' }`）；電感、線圈電阻由 `xfmrParams()` 依 n 自動算

---

## 練習 2：理解電路怎麼算（看就好，不用改）

`circuit.ts` 用 **MNA（節點電壓法）**：每個節點寫一條「流出的電流總和 = 0」，全部組成矩陣一起解。元件只要會兩件事：

```ts
G(a, b, g)   // 在 a、b 之間放一個電導 g（= 1/R）
I(a, b, i)   // 有一個固定電流 i 從 a 經過元件流到 b
```

例如電容（後向尤拉法，每一步 dt 秒）：

```ts
// i = C/dt · (v − v前一步)  →  電導 C/dt  +  固定電流 −C/dt·v前
const g = e.c / dt;
G(e.a, e.b, g);
I(e.a, e.b, -g * (vc[e.id] ?? 0));
```

可變電阻根本不用改求解器：`bench.ts` 把它拆成兩顆串聯電阻（`R·pos` 和 `R·(1−pos)`）就好。
**能用現有元件組出來的零件，就不要改 `circuit.ts`。**

---

## 練習 3：新增一種全新零件（例：5.1 V 齊納二極體 1N4733）

齊納二極體 = 一般二極體 + 「反向 5.1 V 會崩潰導通」。`circuit.ts` 的二極體已經有 `bv`（崩潰電壓）參數，所以**只要把 `bv` 設成 5.1** 就有齊納特性，不用改求解器。

### 3-1 `boardParts.ts`：定義

```ts
export type PartKind = 'resistor' | ... | 'bjt' | 'zener';   // 加 'zener'

// THERMAL 加一行（DO-41 1 W，約 3 W 會燒）
zener: { rth: 70, tau: 5, burn: 230 },

// partLabel() 加一行
if (p.kind === 'zener') return '齊納二極體 1N4733（5.1 V）';
```

### 3-2 `boardStore.ts`：放置工具

```ts
export type Tool = 'select' | ... | 'bjt' | 'zener' | 'erase' | LeadKind;

// clickHole() 最後「兩點零件」那段加一行
: s.tool === 'zener' ? { id: newId('zener'), kind: 'zener', pins, gen: 0 }
```

### 3-3 `bench.ts`：翻譯成電路元件

在 `benchElements()` 的類比零件區加：

```ts
if (p.kind === 'zener') els.push({ kind: 'diode', id: p.id, a, k: b, bv: 5.1 });
```

### 3-4 `AnalogParts3D.tsx`：3D 外觀

最快的做法是「複製一個長得像的」：齊納二極體長得跟 1N4007 很像，只是橘色玻璃管。
到 `BoardParts3D.tsx` 複製 `Diode3D`，改名 `Zener3D`、顏色改 `'#d9822b'`，然後在 `BoardParts3D()` 的清單加一行：

```tsx
if (p.kind === 'zener') return <Zener3D key={p.id} part={p} selected={sel} />;
```

### 3-5 `BoardPanel.tsx`：元件庫與提示

```ts
// PART_ITEMS
{ tool: 'zener', name: '齊納二極體', sub: '1N4733・5.1 V / 1 W', icon: '▷⌐' },
// TOOL_HINT
zener: '先點陽極的孔，再點陰極（有色環那端）的孔。反向接時兩端會穩定在 5.1 V。',
// TOOL_NAME
zener: '齊納二極體',
```

### 3-6 `project/projectDoc.ts`：讓存檔認得它

```ts
const kind = oneOf(o.kind, [..., 'bjt', 'zener'] as const, 'wire');
const PIN_COUNT = { ..., bjt: 3, zener: 2 };
```

### 3-7 驗證

```powershell
cd web\frontend
npx tsc -p .                 # 型別檢查：漏改的地方 TypeScript 會直接告訴你（例如 THERMAL 少了 zener）
npm run dev                  # 開網頁：放 1 kΩ + 齊納（反接）到 12 V，三用電表量齊納兩端應該 ≈ 5.1 V
node scripts/shortcuts-regression.mjs http://localhost:5173/demos   # 快捷鍵回歸測試，要看到「✔ 全部通過」
```

> 小技巧：先改 `PartKind` 再跑 `npx tsc`，TypeScript 會把「所有需要處理新零件的地方」列成錯誤清單，照著清單改就不會漏。

---

## TSX 速記（寫 3D 外觀 / 面板會用到）

```tsx
// 元件 = 回傳畫面的函式；props 用 { } 解構
export function Zener3D({ part, selected }: { part: BoardPart; selected: Sel }) {
  const lay = useMemo(() => axialLayout(part.pins[0], part.pins[1], 0.17), [part.pins]); // 只有腳位改變才重算
  return (
    <group {...usePartEvents(part)}>          {/* 讓零件可以被點選、拖曳 */}
      <Rod a={lay.bodyA} b={lay.bodyB} r={0.03} color="#d9822b" />
      {part.burnt && <mesh>...</mesh>}         {/* 條件顯示：&& 左邊成立才畫右邊 */}
    </group>
  );
}
```

- `{ }` 裡面寫 JavaScript 運算式，`{/* */}` 是註解
- `useMemo`：算一次存起來，依賴陣列裡的值變了才重算
- 面板不要用文字輸入框（`<input type="text">`）；真的要用，按 Enter 時一定要 `blur()`，不然快捷鍵會失效（見 `SHORTCUTS.md`）
