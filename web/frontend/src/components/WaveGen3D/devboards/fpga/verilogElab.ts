// Verilog 展開（elaboration）+ 產生模擬程式碼：
//   把多個 module 依實例化關係攤平成一張訊號表，組合邏輯依相依順序排好，時序邏輯按觸發邊緣分組。
//   產生的 JS 只包含「訊號陣列索引 + 數字常數 + 固定的輔助函式」，所有名字都在這裡轉成索引，
//   不會把使用者寫的任何文字放進程式碼，所以開別人的專案也不會執行任意 JavaScript。
import { HdlError, parseVerilog, type VExpr, type VStmt, type VModule, type VDecl } from './verilogLang.js';

export interface Sig {
  name: string; // 階層名稱，例如 u1.count
  width: number;
  lsb: number; // 宣告時的 lsb 編號（[7:0] → 0）
  asc: boolean; // [0:7] 這種遞增寫法
  isReg: boolean;
  init: number;
}
export interface Mem { name: string; width: number; base: number; depth: number }
export interface Port { name: string; dir: 'input' | 'output' | 'inout'; width: number; lsb: number; asc: boolean; sig: number }
export interface SeqBlock { edges: { sig: number; edge: 'pos' | 'neg' }[]; code: string; line: number }
export interface Design {
  top: string;
  modules: string[];
  sigs: Sig[];
  mems: Mem[];
  ports: Port[];
  settleCode: string;
  initCode: string;
  blocks: SeqBlock[];
  warnings: string[];
}

interface Scope {
  prefix: string;
  sigs: Map<string, number>;
  mems: Map<string, number>;
  params: Map<string, number>;
  mod: VModule;
}

const MAXW = 32;

class Elab {
  sigs: Sig[] = [];
  mems: Mem[] = [];
  combs: { code: string; reads: Set<string>; writes: Set<string>; line: number; file: string; desc: string }[] = [];
  blocks: SeqBlock[] = [];
  initCode: string[] = [];
  warnings: string[] = [];
  used = new Set<string>();
  private tmp = 0;
  private file = '';

  constructor(private mods: Map<string, VModule>) {}

  fail(msg: string, line: number): never { throw new HdlError(msg, line, this.file); }

  // ---- 常數運算（參數、範圍、次數）----
  constEval(e: VExpr, sc: Scope): number {
    switch (e.k) {
      case 'num': return e.n.value;
      case 'id': {
        if (sc.params.has(e.name)) return sc.params.get(e.name)!;
        this.fail(`「${e.name}」不是常數（範圍、參數只能用數字或 parameter）`, e.line);
      }
      // eslint-disable-next-line no-fallthrough
      case 'un': {
        const a = this.constEval(e.a, sc);
        return e.op === '-' ? -a : e.op === '!' ? (a ? 0 : 1) : e.op === '~' ? ~a >>> 0 : a;
      }
      case 'bin': {
        const a = this.constEval(e.a, sc), b = this.constEval(e.b, sc);
        switch (e.op) {
          case '+': return a + b; case '-': return a - b; case '*': return a * b;
          case '/': return b ? Math.trunc(a / b) : 0; case '%': return b ? a % b : 0; case '**': return a ** b;
          case '<<': return a * 2 ** b; case '>>': return Math.floor(a / 2 ** b);
          case '&': return (a & b) >>> 0; case '|': return (a | b) >>> 0; case '^': return (a ^ b) >>> 0;
          case '==': return +(a === b); case '!=': return +(a !== b); case '<': return +(a < b); case '>': return +(a > b);
          case '<=': return +(a <= b); case '>=': return +(a >= b); case '&&': return +(a && b); case '||': return +(a || b);
        }
        this.fail(`常數運算不支援 ${e.op}`, e.line);
      }
      // eslint-disable-next-line no-fallthrough
      case 'cond': return this.constEval(e.c, sc) ? this.constEval(e.a, sc) : this.constEval(e.b, sc);
      case 'call': return Math.ceil(Math.log2(Math.max(1, this.constEval(e.args[0], sc))));
    }
    this.fail('這裡需要常數', (e as { line: number }).line ?? 0);
  }

  // ---- 展開模組 ----
  elab(mod: VModule, prefix: string, overrides: { name?: string; value: number }[], depth: number): Scope {
    if (depth > 32) this.fail('模組實例化太深（是不是自己實例化自己？）', mod.line);
    this.file = mod.file;
    const sc: Scope = { prefix, sigs: new Map(), mems: new Map(), params: new Map(), mod };
    const paramItems = mod.items.filter((x) => x.k === 'param') as Extract<VModule['items'][number], { k: 'param' }>[];
    const pub = paramItems.filter((p) => !p.local);
    for (const p of paramItems) {
      const byName = overrides.find((o) => o.name === p.name);
      const byPos = !byName && !p.local ? overrides.filter((o) => !o.name)[pub.indexOf(p)] : undefined;
      sc.params.set(p.name, byName ? byName.value : byPos ? byPos.value : this.constEval(p.value, sc));
    }
    for (const o of overrides) if (o.name && !sc.params.has(o.name)) this.fail(`${mod.name} 沒有參數 ${o.name}`, mod.line);

    // 宣告（同名的 input + reg 合併）
    const decls = new Map<string, VDecl>();
    for (const it of mod.items) {
      if (it.k !== 'decl') continue;
      const d = it.d;
      const prev = decls.get(d.name);
      if (prev) {
        const isPortPlus = ['input', 'output', 'inout'].includes(prev.kind) !== ['input', 'output', 'inout'].includes(d.kind);
        if (!isPortPlus) this.fail(`「${d.name}」重複宣告`, d.line);
        const port = ['input', 'output', 'inout'].includes(prev.kind) ? prev : d;
        decls.set(d.name, { ...port, isReg: prev.isReg || d.isReg, range: prev.range ?? d.range, init: prev.init ?? d.init });
      } else decls.set(d.name, d);
    }
    for (const p of mod.ports) if (!decls.has(p)) this.fail(`埠 ${p} 沒有宣告方向（input / output）`, mod.line);
    for (const d of decls.values()) {
      let width = 1, lsb = 0, asc = false;
      if (d.range) {
        const m = this.constEval(d.range.msb, sc), l = this.constEval(d.range.lsb, sc);
        width = Math.abs(m - l) + 1;
        lsb = l;
        asc = m < l;
      }
      if (d.kind === 'integer') { width = 32; lsb = 0; asc = false; }
      if (width > MAXW) this.fail(`「${d.name}」有 ${width} 位元，模擬器最多支援 ${MAXW} 位元`, d.line);
      if (d.arr) {
        const a = this.constEval(d.arr.msb, sc), b = this.constEval(d.arr.lsb, sc);
        const depthN = Math.abs(a - b) + 1;
        if (depthN > 65536) this.fail(`記憶體 ${d.name} 太大（最多 65536 個字組）`, d.line);
        sc.mems.set(d.name, this.mems.length);
        this.mems.push({ name: prefix + d.name, width, base: Math.min(a, b), depth: depthN });
        continue;
      }
      if (d.kind === 'inout') this.warnings.push(`${prefix}${d.name}：inout 當成輸出處理（不支援三態）`);
      const init = d.init ? this.constEval(d.init, sc) : 0;
      sc.sigs.set(d.name, this.sigs.length);
      this.sigs.push({ name: prefix + d.name, width, lsb, asc, isReg: d.isReg, init: this.mask(init, width) });
    }

    for (const it of mod.items) {
      this.file = mod.file;
      if (it.k === 'assign') {
        const reads = new Set<string>(), writes = new Set<string>();
        const code = this.asgCode(it.lhs, it.rhs, false, sc, reads, writes);
        this.combs.push({ code, reads, writes, line: it.line, file: mod.file, desc: `assign（${mod.file} 第 ${it.line} 行）` });
      } else if (it.k === 'always') {
        const reads = new Set<string>(), writes = new Set<string>();
        if (it.sens === 'star') {
          const code = this.stmtCode(it.body, sc, reads, writes, false);
          this.combs.push({ code, reads, writes, line: it.line, file: mod.file, desc: `always @(*)（${mod.file} 第 ${it.line} 行）` });
        } else {
          const edges = it.sens.map((s) => {
            const i = sc.sigs.get(s.sig);
            if (i === undefined) this.fail(`敏感列表裡的「${s.sig}」沒有宣告`, it.line);
            this.used.add(`s${i}`);
            return { sig: i, edge: s.edge as 'pos' | 'neg' };
          });
          const code = this.stmtCode(it.body, sc, reads, writes, true);
          this.blocks.push({ edges, code, line: it.line });
        }
      } else if (it.k === 'initial') {
        this.initCode.push(this.stmtCode(it.body, sc, new Set(), new Set(), false));
      } else if (it.k === 'inst') {
        this.instance(it, sc, depth);
      }
    }
    return sc;
  }

  instance(it: Extract<VModule['items'][number], { k: 'inst' }>, sc: Scope, depth: number) {
    const child = this.mods.get(it.mod);
    if (!child) this.fail(`找不到模組 ${it.mod}（檔案有一起上傳嗎？）`, it.line);
    const ov = it.params.map((p) => ({ name: p.name, value: this.constEval(p.value, sc) }));
    const parentFile = this.file;
    const csc = this.elab(child, `${sc.prefix}${it.name}.`, ov, depth + 1);
    this.file = parentFile;
    const named = it.conns.some((c) => c.port);
    it.conns.forEach((c, idx) => {
      const port = named ? c.port! : child.ports[idx];
      if (!port) this.fail(`${it.mod} 只有 ${child.ports.length} 個埠`, it.line);
      if (!child.ports.includes(port)) this.fail(`${it.mod} 沒有埠 ${port}`, it.line);
      if (!c.e) return;
      const d = child.items.find((x) => x.k === 'decl' && x.d.name === port && ['input', 'output', 'inout'].includes(x.d.kind));
      const dir = d && d.k === 'decl' ? d.d.kind : 'input';
      const childSig: VExpr = { k: 'id', name: port, line: it.line };
      const reads = new Set<string>(), writes = new Set<string>();
      let code: string;
      if (dir === 'input') {
        // 子模組的 input = 父模組的運算式
        const rhs = this.exprCode(c.e, sc, reads, this.selfWidth(c.e, sc));
        const ci = csc.sigs.get(port)!;
        code = `v[${ci}]=M(${rhs},${this.sigs[ci].width});`;
        writes.add(`s${ci}`);
      } else {
        // 父模組的訊號 = 子模組的 output
        const tmpScope: Scope = { ...csc };
        const rhs = this.exprCode(childSig, tmpScope, reads, this.sigs[csc.sigs.get(port)!].width);
        code = this.lhsCode(c.e, rhs, false, sc, writes);
      }
      this.combs.push({ code, reads, writes, line: it.line, file: this.file, desc: `${it.name}.${port} 連線（${this.file} 第 ${it.line} 行）` });
    });
  }

  mask(v: number, w: number) { return w >= 32 ? v >>> 0 : v & (2 ** w - 1); }

  // ---- 寬度 ----
  /** rom[i] 在語法上跟 bit select 長得一樣，名稱是記憶體時改成字組存取 */
  asMem(e: VExpr, sc: Scope): VExpr {
    return e.k === 'bit' && sc.mems.has(e.name) ? { k: 'mem', name: e.name, idx: e.idx, line: e.line } : e;
  }
  selfWidth(e: VExpr, sc: Scope): number {
    e = this.asMem(e, sc);
    switch (e.k) {
      case 'num': return e.n.width ?? 32;
      case 'id': return sc.params.has(e.name) ? 32 : this.sigOf(e.name, sc, e.line).width;
      case 'bit': return 1;
      case 'part': return Math.abs(this.constEval(e.msb, sc) - this.constEval(e.lsb, sc)) + 1;
      case 'ipart': return this.constEval(e.width, sc);
      case 'mem': return e.sel ? 1 : this.mems[this.memOf(e.name, sc, e.line)].width;
      case 'concat': return e.items.reduce((s, x) => s + this.selfWidth(x, sc), 0);
      case 'repl': return this.constEval(e.count, sc) * e.items.reduce((s, x) => s + this.selfWidth(x, sc), 0);
      case 'un': return ['!', '&', '|', '^', '~&', '~|', '~^'].includes(e.op) ? 1 : this.selfWidth(e.a, sc);
      case 'bin':
        if (['==', '!=', '<', '>', '<=', '>=', '&&', '||'].includes(e.op)) return 1;
        if (['<<', '>>', '**'].includes(e.op)) return this.selfWidth(e.a, sc);
        return Math.max(this.selfWidth(e.a, sc), this.selfWidth(e.b, sc));
      case 'cond': return Math.max(this.selfWidth(e.a, sc), this.selfWidth(e.b, sc));
      case 'call': return 32;
    }
  }
  sigOf(name: string, sc: Scope, line: number) {
    const i = sc.sigs.get(name);
    if (i === undefined) {
      if (sc.mems.has(name)) this.fail(`「${name}」是記憶體，要加索引 ${name}[i]`, line);
      this.fail(`「${name}」沒有宣告（${sc.mod.name}）`, line);
    }
    return this.sigs[i];
  }
  sigIdx(name: string, sc: Scope, line: number) { this.sigOf(name, sc, line); return sc.sigs.get(name)!; }
  memOf(name: string, sc: Scope, line: number) {
    const i = sc.mems.get(name);
    if (i === undefined) this.fail(`「${name}」不是記憶體陣列`, line);
    return i;
  }
  /** 位元編號 → 從 LSB 算起的位移 */
  offExpr(s: Sig, idxCode: string) { return s.asc ? `(${s.lsb}-(${idxCode}))` : `((${idxCode})-${s.lsb})`; }
  offConst(s: Sig, idx: number) { return s.asc ? s.lsb - idx : idx - s.lsb; }

  // ---- 運算式 → JS ----
  exprCode(e: VExpr, sc: Scope, reads: Set<string>, ctx: number): string {
    const w = (x: VExpr) => this.selfWidth(x, sc);
    e = this.asMem(e, sc);
    switch (e.k) {
      case 'num': return String(e.n.value);
      case 'id': {
        if (sc.params.has(e.name)) return String(sc.params.get(e.name)!);
        const i = this.sigIdx(e.name, sc, e.line);
        reads.add(`s${i}`);
        return `v[${i}]`;
      }
      case 'bit': {
        const i = this.sigIdx(e.name, sc, e.line);
        reads.add(`s${i}`);
        const s = this.sigs[i];
        if (this.isConst(e.idx, sc)) {
          const off = this.offConst(s, this.constEval(e.idx, sc));
          if (off < 0 || off >= s.width) this.fail(`${e.name}[${this.constEval(e.idx, sc)}] 超出範圍`, e.line);
          return `((v[${i}]>>>${off})&1)`;
        }
        return `H.bit(v[${i}],${this.offExpr(s, this.exprCode(e.idx, sc, reads, 32))},${s.width})`;
      }
      case 'part': {
        const i = this.sigIdx(e.name, sc, e.line);
        reads.add(`s${i}`);
        const s = this.sigs[i];
        const m = this.constEval(e.msb, sc), l = this.constEval(e.lsb, sc);
        const lo = Math.min(this.offConst(s, m), this.offConst(s, l)), width = Math.abs(m - l) + 1;
        if (lo < 0 || lo + width > s.width) this.fail(`${e.name}[${m}:${l}] 超出範圍`, e.line);
        return `M(v[${i}]/${2 ** lo},${width})`;
      }
      case 'ipart': {
        const i = this.sigIdx(e.name, sc, e.line);
        reads.add(`s${i}`);
        const s = this.sigs[i];
        const width = this.constEval(e.width, sc);
        const base = this.exprCode(e.base, sc, reads, 32);
        const start = e.dir === '+' ? base : `(${base})-${width - 1}`;
        return `H.part(v[${i}],${this.offExpr(s, start)},${width})`;
      }
      case 'mem': {
        const k = this.memOf(e.name, sc, e.line);
        reads.add(`m${k}`);
        const word = `H.mr(m[${k}],(${this.exprCode(e.idx, sc, reads, 32)})-${this.mems[k].base})`;
        if (!e.sel) return word;
        return `H.bit(${word},${this.exprCode(e.sel, sc, reads, 32)},${this.mems[k].width})`;
      }
      case 'concat': {
        let code = '0';
        for (const it of e.items) {
          const iw = w(it);
          code = `(${code}*${2 ** iw}+M(${this.exprCode(it, sc, reads, iw)},${iw}))`;
        }
        if (w(e) > MAXW) this.fail(`合併後 ${w(e)} 位元，超過模擬上限 ${MAXW}`, e.line);
        return code;
      }
      case 'repl': {
        const n = this.constEval(e.count, sc);
        const inner: VExpr = { k: 'concat', items: e.items, line: e.line };
        const iw = w(inner);
        if (n * iw > MAXW) this.fail(`重複後 ${n * iw} 位元，超過模擬上限 ${MAXW}`, e.line);
        const ic = this.exprCode(inner, sc, reads, iw);
        return `H.rep(${ic},${iw},${n})`;
      }
      case 'un': {
        const aw = w(e.a);
        switch (e.op) {
          case '!': return `(M(${this.exprCode(e.a, sc, reads, aw)},${aw})===0?1:0)`;
          case '~': { const cw = Math.max(ctx, aw); return `M(~(${this.exprCode(e.a, sc, reads, cw)}),${cw})`; }
          case '-': { const cw = Math.max(ctx, aw); return `M(-(${this.exprCode(e.a, sc, reads, cw)}),${cw})`; }
          case '+': return this.exprCode(e.a, sc, reads, ctx);
          case '&': return `(M(${this.exprCode(e.a, sc, reads, aw)},${aw})===${2 ** aw - 1}?1:0)`;
          case '~&': return `(M(${this.exprCode(e.a, sc, reads, aw)},${aw})===${2 ** aw - 1}?0:1)`;
          case '|': return `(M(${this.exprCode(e.a, sc, reads, aw)},${aw})!==0?1:0)`;
          case '~|': return `(M(${this.exprCode(e.a, sc, reads, aw)},${aw})!==0?0:1)`;
          case '^': return `H.par(M(${this.exprCode(e.a, sc, reads, aw)},${aw}))`;
          case '~^': return `(1-H.par(M(${this.exprCode(e.a, sc, reads, aw)},${aw})))`;
        }
        this.fail(`不支援運算子 ${e.op}`, e.line);
      }
      // eslint-disable-next-line no-fallthrough
      case 'bin': {
        const aw = w(e.a), bw = w(e.b);
        if (['==', '!=', '<', '>', '<=', '>='].includes(e.op)) {
          const cw = Math.max(aw, bw);
          const op = e.op === '==' ? '===' : e.op === '!=' ? '!==' : e.op;
          return `(M(${this.exprCode(e.a, sc, reads, cw)},${cw})${op}M(${this.exprCode(e.b, sc, reads, cw)},${cw})?1:0)`;
        }
        if (e.op === '&&' || e.op === '||') {
          return `((M(${this.exprCode(e.a, sc, reads, aw)},${aw})!==0)${e.op}(M(${this.exprCode(e.b, sc, reads, bw)},${bw})!==0)?1:0)`;
        }
        const cw = Math.min(MAXW, Math.max(ctx, aw, ['<<', '>>', '**'].includes(e.op) ? 0 : bw));
        const a = this.exprCode(e.a, sc, reads, cw);
        if (e.op === '<<' || e.op === '>>') {
          const b = this.exprCode(e.b, sc, reads, bw);
          return e.op === '<<' ? `H.shl(${a},${b},${cw})` : `H.shr(M(${a},${cw}),${b})`;
        }
        const b = this.exprCode(e.b, sc, reads, cw);
        switch (e.op) {
          case '+': return `M(${a}+${b},${cw})`;
          case '-': return `M(${a}-${b},${cw})`;
          case '*': return `M(Math.imul(${a},${b}),${cw})`;
          case '/': return `H.div(M(${a},${cw}),M(${b},${cw}))`;
          case '%': return `H.mod(M(${a},${cw}),M(${b},${cw}))`;
          case '**': return `M(${a}**${b},${cw})`;
          case '&': return `M((${a})&(${b}),${cw})`;
          case '|': return `M((${a})|(${b}),${cw})`;
          case '^': return `M((${a})^(${b}),${cw})`;
          case '~^': return `M(~((${a})^(${b})),${cw})`;
        }
        this.fail(`不支援運算子 ${e.op}`, e.line);
      }
      // eslint-disable-next-line no-fallthrough
      case 'cond': {
        const cw = w(e.c);
        return `(M(${this.exprCode(e.c, sc, reads, cw)},${cw})!==0?${this.exprCode(e.a, sc, reads, ctx)}:${this.exprCode(e.b, sc, reads, ctx)})`;
      }
      case 'call': return String(this.constEval(e, sc));
    }
  }
  isConst(e: VExpr, sc: Scope): boolean {
    switch (e.k) {
      case 'num': return true;
      case 'id': return sc.params.has(e.name);
      case 'un': return this.isConst(e.a, sc);
      case 'bin': return this.isConst(e.a, sc) && this.isConst(e.b, sc);
      case 'cond': return this.isConst(e.c, sc) && this.isConst(e.a, sc) && this.isConst(e.b, sc);
      case 'call': return true;
      default: return false;
    }
  }

  // ---- 指定 ----
  /** 把 val（已經算好的 JS 運算式）寫進 lhs；nb = 非阻隔指定（<=），先記到 nb 清單、等所有區塊跑完才一起更新 */
  lhsCode(lhs: VExpr, val: string, nb: boolean, sc: Scope, writes: Set<string>): string {
    const put = (i: number, off: string, width: number, v: string) =>
      nb ? `nb.push(${i},${off},${width},${v});` : `v[${i}]=H.ins(v[${i}],${v},${off},${width});`;
    lhs = this.asMem(lhs, sc);
    switch (lhs.k) {
      case 'id': {
        const i = this.sigIdx(lhs.name, sc, lhs.line);
        writes.add(`s${i}`);
        const wdt = this.sigs[i].width;
        return nb ? `nb.push(${i},0,${wdt},M(${val},${wdt}));` : `v[${i}]=M(${val},${wdt});`;
      }
      case 'bit': {
        const i = this.sigIdx(lhs.name, sc, lhs.line);
        writes.add(`s${i}`);
        const s = this.sigs[i];
        const off = this.isConst(lhs.idx, sc) ? String(this.offConst(s, this.constEval(lhs.idx, sc))) : this.offExpr(s, this.exprCode(lhs.idx, sc, new Set(), 32));
        return put(i, off, 1, `M(${val},1)`);
      }
      case 'part': {
        const i = this.sigIdx(lhs.name, sc, lhs.line);
        writes.add(`s${i}`);
        const s = this.sigs[i];
        const m = this.constEval(lhs.msb, sc), l = this.constEval(lhs.lsb, sc);
        const lo = Math.min(this.offConst(s, m), this.offConst(s, l)), width = Math.abs(m - l) + 1;
        if (lo < 0 || lo + width > s.width) this.fail(`${lhs.name}[${m}:${l}] 超出範圍`, lhs.line);
        return put(i, String(lo), width, `M(${val},${width})`);
      }
      case 'ipart': {
        const i = this.sigIdx(lhs.name, sc, lhs.line);
        writes.add(`s${i}`);
        const s = this.sigs[i];
        const width = this.constEval(lhs.width, sc);
        const base = this.exprCode(lhs.base, sc, new Set(), 32);
        const start = lhs.dir === '+' ? base : `(${base})-${width - 1}`;
        return put(i, this.offExpr(s, start), width, `M(${val},${width})`);
      }
      case 'mem': {
        if (lhs.sel) this.fail('不支援對記憶體字組的單一位元寫入', lhs.line);
        const k = this.memOf(lhs.name, sc, lhs.line);
        writes.add(`m${k}`);
        const idx = `(${this.exprCode(lhs.idx, sc, new Set(), 32)})-${this.mems[k].base}`;
        const v = `M(${val},${this.mems[k].width})`;
        return nb ? `nb.push(${-1 - k},${idx},0,${v});` : `H.mw(m[${k}],${idx},${v});`;
      }
      case 'concat': {
        const t = `t${this.tmp++}`;
        let code = `{const ${t}=${val};`;
        let shift = 0;
        for (let j = lhs.items.length - 1; j >= 0; j--) {
          const it = lhs.items[j];
          const iw = this.selfWidth(it, sc);
          code += this.lhsCode(it, `M(${t}/${2 ** shift},${iw})`, nb, sc, writes);
          shift += iw;
        }
        return code + '}';
      }
    }
    this.fail('等號左邊必須是訊號', (lhs as { line: number }).line);
  }
  asgCode(lhs: VExpr, rhs: VExpr, nb: boolean, sc: Scope, reads: Set<string>, writes: Set<string>): string {
    const lw = this.selfWidth(lhs, sc);
    return this.lhsCode(lhs, this.exprCode(rhs, sc, reads, lw), nb, sc, writes);
  }

  stmtCode(s: VStmt, sc: Scope, reads: Set<string>, writes: Set<string>, seq: boolean): string {
    switch (s.k) {
      case 'nop': return '';
      case 'block': return s.body.map((x) => this.stmtCode(x, sc, reads, writes, seq)).join('');
      case 'asg':
        if (s.nb && !seq) this.warnings.push(`${sc.mod.file} 第 ${s.line} 行：組合邏輯（always @*）裡用了 <=，當成 = 處理`);
        return this.asgCode(s.lhs, s.rhs, s.nb && seq, sc, reads, writes);
      case 'if': {
        const cw = this.selfWidth(s.c, sc);
        return `if(M(${this.exprCode(s.c, sc, reads, cw)},${cw})!==0){${this.stmtCode(s.a, sc, reads, writes, seq)}}` +
          (s.b ? `else{${this.stmtCode(s.b, sc, reads, writes, seq)}}` : '');
      }
      case 'case': {
        const ew = Math.max(this.selfWidth(s.e, sc), ...s.items.flatMap((it) => it.labels.map((l) => this.selfWidth(l, sc))));
        const t = `c${this.tmp++}`;
        let code = `{const ${t}=M(${this.exprCode(s.e, sc, reads, ew)},${ew});`;
        s.items.forEach((it, idx) => {
          const conds = it.labels.map((l, j) => {
            const lc = `M(${this.exprCode(l, sc, reads, ew)},${ew})`;
            const mk = it.masks[j];
            return mk === null ? `${t}===${lc}` : `((${t}&${mk})>>>0)===((${lc}&${mk})>>>0)`;
          });
          code += `${idx ? 'else ' : ''}if(${conds.join('||')}){${this.stmtCode(it.body, sc, reads, writes, seq)}}`;
        });
        if (s.dflt) code += `${s.items.length ? 'else' : ''}{${this.stmtCode(s.dflt, sc, reads, writes, seq)}}`;
        return code + '}';
      }
      case 'for': {
        const g = `g${this.tmp++}`;
        const cw = this.selfWidth(s.c, sc);
        return `{let ${g}=0;${this.stmtCode(s.init, sc, reads, writes, false)}while(M(${this.exprCode(s.c, sc, reads, cw)},${cw})!==0){if(++${g}>65536)H.loop(${s.line});` +
          `${this.stmtCode(s.body, sc, reads, writes, seq)}${this.stmtCode(s.step, sc, reads, writes, false)}}}`;
      }
    }
  }

  /** 組合邏輯依相依關係排序（寫入者在讀取者前面），有迴圈就報錯 */
  orderCombs(): string {
    const n = this.combs.length;
    const writers = new Map<string, number[]>();
    this.combs.forEach((c, i) => c.writes.forEach((w) => writers.set(w, [...(writers.get(w) ?? []), i])));
    const deps = this.combs.map((c, i) => {
      const d = new Set<number>();
      c.reads.forEach((r) => (writers.get(r) ?? []).forEach((j) => { if (j !== i) d.add(j); }));
      return d;
    });
    const state = new Array(n).fill(0);
    const order: number[] = [];
    const visit = (i: number, path: number[]) => {
      if (state[i] === 2) return;
      if (state[i] === 1) {
        const cyc = path.slice(path.indexOf(i)).map((j) => this.combs[j].desc);
        throw new HdlError(`組合邏輯迴圈（沒有經過暫存器的回授）：${cyc.join(' → ')}`, this.combs[i].line, this.combs[i].file);
      }
      state[i] = 1;
      deps[i].forEach((j) => visit(j, [...path, i]));
      state[i] = 2;
      order.push(i);
    };
    for (let i = 0; i < n; i++) visit(i, []);
    return order.map((i) => this.combs[i].code).join('\n');
  }
}

/** 解析所有 .v 檔、以 top 為最上層展開 */
export function elaborate(files: { name: string; text: string }[], top?: string): Design {
  const mods = new Map<string, VModule>();
  for (const f of files) {
    for (const m of parseVerilog(f.text, f.name)) {
      if (mods.has(m.name)) throw new HdlError(`模組 ${m.name} 重複定義（${mods.get(m.name)!.file} 和 ${f.name}）`, m.line, f.name);
      mods.set(m.name, m);
    }
  }
  if (!mods.size) throw new HdlError('沒有找到任何 module', 1);
  // 沒指定 top：找沒有被其他模組實例化的那一個
  let topName = top;
  if (!topName) {
    const inst = new Set([...mods.values()].flatMap((m) => m.items.filter((x) => x.k === 'inst').map((x) => (x as { mod: string }).mod)));
    const roots = [...mods.keys()].filter((n) => !inst.has(n));
    if (roots.length !== 1) throw new HdlError(`無法判斷最上層模組（候選：${roots.join('、') || '無'}），請在 .qsf 設定 TOP_LEVEL_ENTITY 或在下拉選單選擇`, 1);
    topName = roots[0];
  }
  const topMod = mods.get(topName);
  if (!topMod) throw new HdlError(`找不到最上層模組 ${topName}`, 1);
  const el = new Elab(mods);
  const sc = el.elab(topMod, '', [], 0);
  const ports: Port[] = topMod.ports.map((p) => {
    const d = topMod.items.find((x) => x.k === 'decl' && x.d.name === p && ['input', 'output', 'inout'].includes(x.d.kind));
    const i = sc.sigs.get(p)!;
    const s = el.sigs[i];
    return { name: p, dir: d && d.k === 'decl' ? d.d.kind as Port['dir'] : 'input', width: s.width, lsb: s.lsb, asc: s.asc, sig: i };
  });
  // 輸出埠沒有被驅動：提醒
  const written = new Set<string>();
  el.combs.forEach((c) => c.writes.forEach((w) => written.add(w)));
  const seqWritten = el.blocks.map((b) => b.code);
  for (const p of ports) {
    if (p.dir === 'input') continue;
    if (!written.has(`s${p.sig}`) && !seqWritten.some((c) => c.includes(`nb.push(${p.sig},`) || c.includes(`v[${p.sig}]=`))) {
      el.warnings.push(`輸出埠 ${p.name} 沒有被任何邏輯驅動（會一直是 0）`);
    }
  }
  return {
    top: topName, modules: [...mods.keys()], sigs: el.sigs, mems: el.mems, ports,
    settleCode: el.orderCombs(), initCode: el.initCode.join('\n'), blocks: el.blocks, warnings: el.warnings,
  };
}
