// MicroPython 子集的詞法 + 語法分析（Raspberry Pi 5 用）：縮排區塊、f-string、關鍵字參數、串列生成式、鏈式比較
// 純函式產生 AST，不使用 eval
import { SketchError } from './sketchLang.js';

type TokT = 'name' | 'num' | 'str' | 'fstr' | 'op' | 'nl' | 'indent' | 'dedent' | 'eof';
interface Tok { t: TokT; v: string; n?: number; float?: boolean; line: number; parts?: FPart[] }

export type FPart = string | { e: PyExpr; spec: string; conv: string };

const OPS = [
  '**=', '//=', '>>=', '<<=', '...',
  '**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '->',
  '+', '-', '*', '/', '%', '@', '=', '<', '>', '&', '|', '^', '~', '(', ')', '[', ']', '{', '}', ',', ':', '.', ';',
];
const KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise',
  'return', 'try', 'while', 'with', 'yield',
]);

function readString(src: string, i: number, line: number): { s: string; end: number; lines: number; raw: boolean; f: boolean } {
  let k = i, raw = false, f = false;
  while (/[rRbBfFuU]/.test(src[k])) { if (/[rR]/.test(src[k])) raw = true; if (/[fF]/.test(src[k])) f = true; k++; }
  const q = src[k];
  const triple = src.startsWith(q.repeat(3), k);
  const close = triple ? q.repeat(3) : q;
  k += close.length;
  let s = '', lines = 0;
  while (k < src.length && !src.startsWith(close, k)) {
    const c = src[k];
    if (c === '\n') {
      if (!triple) throw new SketchError('字串沒有結尾的引號', line);
      lines++;
    }
    if (c === '\\' && !raw) {
      const e = src[k + 1];
      if (e === '\n') { lines++; k += 2; continue; }
      s += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e === '0' ? '\0' : e;
      k += 2;
      continue;
    }
    s += c;
    k++;
  }
  if (k >= src.length) throw new SketchError('字串沒有結尾的引號', line);
  return { s, end: k + close.length, lines, raw, f };
}

function tokenize(src: string, baseLine = 1): Tok[] {
  const toks: Tok[] = [];
  const stack = [0];
  let i = 0, line = baseLine, depth = 0, atStart = true;
  src = src.replace(/\r\n?/g, '\n');
  while (i < src.length) {
    if (atStart && depth === 0) {
      let col = 0, k = i;
      while (k < src.length && (src[k] === ' ' || src[k] === '\t')) { col += src[k] === '\t' ? 4 : 1; k++; }
      if (src[k] === '\n' || src[k] === '#' || k >= src.length) {
        while (k < src.length && src[k] !== '\n') k++;
        i = k + 1; line++;
        continue;
      }
      if (col > stack[stack.length - 1]) { stack.push(col); toks.push({ t: 'indent', v: '', line }); }
      while (col < stack[stack.length - 1]) { stack.pop(); toks.push({ t: 'dedent', v: '', line }); }
      if (col !== stack[stack.length - 1]) throw new SketchError('縮排對不齊（跟上面任何一層都不一樣）', line);
      i = k;
      atStart = false;
    }
    const c = src[i];
    if (c === '\n') {
      line++; i++;
      if (depth === 0) { if (toks.length && toks[toks.length - 1].t !== 'nl') toks.push({ t: 'nl', v: '', line: line - 1 }); atStart = true; }
      continue;
    }
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '\\' && src[i + 1] === '\n') { i += 2; line++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(\d[\d_]*\.?[\d_]*|\.\d[\d_]*)([eE][+-]?\d+)?)/.exec(src.slice(i))!;
      const raw = m[0].replace(/_/g, '');
      let n: number, float = false;
      if (/^0[xX]/.test(raw)) n = parseInt(raw.slice(2), 16);
      else if (/^0[bB]/.test(raw)) n = parseInt(raw.slice(2), 2);
      else if (/^0[oO]/.test(raw)) n = parseInt(raw.slice(2), 8);
      else { n = parseFloat(raw); float = /[.eE]/.test(raw); }
      toks.push({ t: 'num', v: raw, n, float, line });
      i += m[0].length;
      continue;
    }
    const strStart = /^[rRbBfFuU]{0,2}['"]/.exec(src.slice(i, i + 3));
    if (strStart && (c === '"' || c === "'" || /[rRbBfFuU]/.test(c))) {
      const r = readString(src, i, line);
      toks.push(r.f ? { t: 'fstr', v: r.s, line, parts: parseFString(r.s, line) } : { t: 'str', v: r.s, line });
      line += r.lines;
      i = r.end;
      continue;
    }
    if (/[A-Za-z_]/.test(c) || c.charCodeAt(0) > 127) {
      const m = /^[A-Za-z_\u0080-￿][\w\u0080-￿]*/.exec(src.slice(i))!;
      toks.push({ t: 'name', v: m[0], line });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new SketchError(`無法辨識的字元「${c}」`, line);
    if ('([{'.includes(op)) depth++;
    if (')]}'.includes(op)) depth = Math.max(0, depth - 1);
    toks.push({ t: 'op', v: op, line });
    i += op.length;
  }
  if (toks.length && toks[toks.length - 1].t !== 'nl') toks.push({ t: 'nl', v: '', line });
  while (stack.length > 1) { stack.pop(); toks.push({ t: 'dedent', v: '', line }); }
  toks.push({ t: 'eof', v: '', line });
  return toks;
}

/** f"溫度 {t:.1f} °C" → ['溫度 ', {e, spec:'.1f'}, ' °C'] */
function parseFString(s: string, line: number): FPart[] {
  const parts: FPart[] = [];
  let lit = '', i = 0;
  while (i < s.length) {
    if (s.startsWith('{{', i)) { lit += '{'; i += 2; continue; }
    if (s.startsWith('}}', i)) { lit += '}'; i += 2; continue; }
    if (s[i] === '{') {
      let depth = 1, k = i + 1;
      while (k < s.length && depth) { if (s[k] === '{') depth++; else if (s[k] === '}') depth--; if (depth) k++; }
      if (depth) throw new SketchError('f-string 的 { } 沒有成對', line);
      const inner = s.slice(i + 1, k);
      let expr = inner, spec = '', conv = '';
      const m = /^(.*?)(?:!([rsa]))?(?::([^:]*))?$/.exec(inner);
      if (m) { expr = m[1]; conv = m[2] ?? ''; spec = m[3] ?? ''; }
      if (lit) parts.push(lit);
      lit = '';
      parts.push({ e: parseExprText(expr, line), spec, conv });
      i = k + 1;
      continue;
    }
    lit += s[i++];
  }
  if (lit) parts.push(lit);
  return parts;
}

// ---- AST ----
export type PyExpr =
  | { k: 'num'; v: number; float: boolean; line: number }
  | { k: 'str'; v: string; line: number }
  | { k: 'fstr'; parts: FPart[]; line: number }
  | { k: 'const'; v: null | boolean; line: number }
  | { k: 'name'; id: string; line: number }
  | { k: 'list'; items: PyExpr[]; line: number }
  | { k: 'tuple'; items: PyExpr[]; line: number }
  | { k: 'dict'; keys: PyExpr[]; vals: PyExpr[]; line: number }
  | { k: 'comp'; e: PyExpr; target: PyExpr; iter: PyExpr; cond?: PyExpr; line: number }
  | { k: 'attr'; obj: PyExpr; name: string; line: number }
  | { k: 'call'; fn: PyExpr; args: PyExpr[]; kw: [string, PyExpr][]; line: number }
  | { k: 'sub'; obj: PyExpr; idx: PyExpr; line: number }
  | { k: 'slice'; lo?: PyExpr; hi?: PyExpr; step?: PyExpr; line: number }
  | { k: 'bin'; op: string; a: PyExpr; b: PyExpr; line: number }
  | { k: 'un'; op: string; a: PyExpr; line: number }
  | { k: 'bool'; op: 'and' | 'or'; a: PyExpr; b: PyExpr; line: number }
  | { k: 'cmp'; first: PyExpr; ops: string[]; rest: PyExpr[]; line: number }
  | { k: 'ifexp'; c: PyExpr; a: PyExpr; b: PyExpr; line: number };

export type PyStmt =
  | { k: 'expr'; e: PyExpr; line: number }
  | { k: 'assign'; targets: PyExpr[]; v: PyExpr; line: number }
  | { k: 'aug'; op: string; target: PyExpr; v: PyExpr; line: number }
  | { k: 'if'; c: PyExpr; body: PyStmt[]; orelse: PyStmt[]; line: number }
  | { k: 'while'; c: PyExpr; body: PyStmt[]; line: number }
  | { k: 'for'; target: PyExpr; iter: PyExpr; body: PyStmt[]; line: number }
  | { k: 'def'; name: string; params: { name: string; dflt?: PyExpr }[]; body: PyStmt[]; line: number }
  | { k: 'return'; e?: PyExpr; line: number }
  | { k: 'break'; line: number } | { k: 'continue'; line: number } | { k: 'pass'; line: number }
  | { k: 'import'; names: { mod: string; as: string }[]; line: number }
  | { k: 'from'; mod: string; names: { name: string; as: string }[]; line: number }
  | { k: 'global'; names: string[]; line: number }
  | { k: 'try'; body: PyStmt[]; handlers: { type?: string; as?: string; body: PyStmt[] }[]; fin: PyStmt[]; line: number }
  | { k: 'raise'; e?: PyExpr; line: number };

const AUG = ['+=', '-=', '*=', '/=', '//=', '%=', '**=', '&=', '|=', '^=', '<<=', '>>='];
const UNSUPPORTED: Record<string, string> = {
  class: '不支援自訂 class（請用函式與變數）', lambda: '不支援 lambda', with: '不支援 with 敘述',
  yield: '不支援 yield / generator', async: '不支援 async', nonlocal: '不支援 nonlocal', del: '不支援 del',
};

class Parser {
  i = 0;
  constructor(private toks: Tok[]) {}
  peek(o = 0) { return this.toks[Math.min(this.i + o, this.toks.length - 1)]; }
  next() { return this.toks[this.i++]; }
  isOp(v: string, o = 0) { const t = this.peek(o); return t.t === 'op' && t.v === v; }
  isKw(v: string, o = 0) { const t = this.peek(o); return t.t === 'name' && t.v === v; }
  eatOp(v: string) { if (this.isOp(v)) { this.i++; return true; } return false; }
  eatKw(v: string) { if (this.isKw(v)) { this.i++; return true; } return false; }
  fail(msg: string, t = this.peek()): never { throw new SketchError(msg, t.line); }
  expectOp(v: string) {
    if (!this.eatOp(v)) {
      const t = this.peek();
      this.fail(`這裡需要「${v}」，但看到「${t.t === 'nl' ? '換行' : t.t === 'eof' ? '檔案結尾' : t.t === 'indent' ? '縮排' : t.v}」${v === ':' ? '（if / for / while / def 後面要加冒號）' : ''}`);
    }
  }
  name(): string {
    const t = this.next();
    if (t.t !== 'name' || KEYWORDS.has(t.v)) this.fail(`這裡需要名稱，但看到「${t.v || '換行'}」`, t);
    return t.v;
  }

  file(): PyStmt[] {
    const out: PyStmt[] = [];
    while (this.peek().t !== 'eof') {
      if (this.peek().t === 'nl') { this.next(); continue; }
      if (this.peek().t === 'indent') this.fail('這一行多了縮排');
      out.push(...this.stmt());
    }
    return out;
  }

  block(): PyStmt[] {
    this.expectOp(':');
    if (this.peek().t !== 'nl') return this.simple();
    this.next();
    if (this.peek().t !== 'indent') this.fail('冒號後面的下一行要縮排');
    this.next();
    const body: PyStmt[] = [];
    while (this.peek().t !== 'dedent' && this.peek().t !== 'eof') {
      if (this.peek().t === 'nl') { this.next(); continue; }
      body.push(...this.stmt());
    }
    this.next();
    return body;
  }

  stmt(): PyStmt[] {
    const t = this.peek();
    const line = t.line;
    if (t.t === 'name' && UNSUPPORTED[t.v]) this.fail(UNSUPPORTED[t.v]);
    if (this.eatKw('if')) return [this.ifRest(line)];
    if (this.eatKw('while')) {
      const c = this.test();
      const body = this.block();
      if (this.isKw('else')) this.fail('不支援 while … else');
      return [{ k: 'while', c, body, line }];
    }
    if (this.eatKw('for')) {
      const target = this.targetList();
      if (!this.eatKw('in')) this.fail('for 後面要有 in');
      const iter = this.testList();
      return [{ k: 'for', target, iter, body: this.block(), line }];
    }
    if (this.eatKw('def')) {
      const name = this.name();
      this.expectOp('(');
      const params: { name: string; dflt?: PyExpr }[] = [];
      while (!this.isOp(')')) {
        if (this.isOp('*') || this.isOp('**')) this.fail('不支援 *args / **kwargs');
        const pn = this.name();
        if (this.eatOp(':')) this.test(); // 型別註記略過
        params.push({ name: pn, dflt: this.eatOp('=') ? this.test() : undefined });
        if (!this.eatOp(',')) break;
      }
      this.expectOp(')');
      if (this.eatOp('->')) this.test();
      return [{ k: 'def', name, params, body: this.block(), line }];
    }
    if (this.eatKw('try')) {
      const body = this.block();
      const handlers: { type?: string; as?: string; body: PyStmt[] }[] = [];
      let fin: PyStmt[] = [];
      while (this.eatKw('except')) {
        let type: string | undefined, as: string | undefined;
        if (!this.isOp(':')) {
          type = this.name();
          while (this.eatOp('.')) type = this.name();
          if (this.eatKw('as')) as = this.name();
        }
        handlers.push({ type, as, body: this.block() });
      }
      if (this.eatKw('else')) this.fail('不支援 try … else');
      if (this.eatKw('finally')) fin = this.block();
      if (!handlers.length && !fin.length) this.fail('try 後面要有 except 或 finally');
      return [{ k: 'try', body, handlers, fin, line }];
    }
    return this.simple();
  }

  ifRest(line: number): PyStmt {
    const c = this.test();
    const body = this.block();
    let orelse: PyStmt[] = [];
    const l2 = this.peek().line;
    if (this.eatKw('elif')) orelse = [this.ifRest(l2)];
    else if (this.eatKw('else')) orelse = this.block();
    return { k: 'if', c, body, orelse, line };
  }

  simple(): PyStmt[] {
    const out: PyStmt[] = [this.small()];
    while (this.eatOp(';')) { if (this.peek().t === 'nl') break; out.push(this.small()); }
    const t = this.peek();
    if (t.t !== 'nl' && t.t !== 'eof' && t.t !== 'dedent') this.fail(`這一行多了「${t.v}」（是不是少了運算子或逗號？）`);
    if (t.t === 'nl') this.next();
    return out;
  }

  small(): PyStmt {
    const t = this.peek();
    const line = t.line;
    if (t.t === 'name' && UNSUPPORTED[t.v]) this.fail(UNSUPPORTED[t.v]);
    if (this.eatKw('pass')) return { k: 'pass', line };
    if (this.eatKw('break')) return { k: 'break', line };
    if (this.eatKw('continue')) return { k: 'continue', line };
    if (this.eatKw('return')) return { k: 'return', e: this.atEnd() ? undefined : this.testList(), line };
    if (this.eatKw('raise')) return { k: 'raise', e: this.atEnd() ? undefined : this.test(), line };
    if (this.eatKw('assert')) { this.test(); if (this.eatOp(',')) this.test(); return { k: 'pass', line }; }
    if (this.eatKw('global')) {
      const names = [this.name()];
      while (this.eatOp(',')) names.push(this.name());
      return { k: 'global', names, line };
    }
    if (this.eatKw('import')) {
      const names: { mod: string; as: string }[] = [];
      do {
        let mod = this.name();
        while (this.eatOp('.')) mod += '.' + this.name();
        names.push({ mod, as: this.eatKw('as') ? this.name() : mod.split('.')[0] });
      } while (this.eatOp(','));
      return { k: 'import', names, line };
    }
    if (this.eatKw('from')) {
      let mod = this.name();
      while (this.eatOp('.')) mod += '.' + this.name();
      if (!this.eatKw('import')) this.fail('from … 後面要接 import');
      const names: { name: string; as: string }[] = [];
      const paren = this.eatOp('(');
      if (this.eatOp('*')) names.push({ name: '*', as: '*' });
      else do {
        if (paren && this.isOp(')')) break;
        const n = this.name();
        names.push({ name: n, as: this.eatKw('as') ? this.name() : n });
      } while (this.eatOp(','));
      if (paren) this.expectOp(')');
      return { k: 'from', mod, names, line };
    }
    const first = this.testList();
    const opT = this.peek();
    if (opT.t === 'op' && AUG.includes(opT.v)) {
      this.next();
      this.checkTarget(first);
      return { k: 'aug', op: opT.v.slice(0, -1), target: first, v: this.testList(), line };
    }
    if (this.isOp('=')) {
      const targets = [first];
      let v = first;
      while (this.eatOp('=')) { v = this.testList(); targets.push(v); }
      targets.pop();
      targets.forEach((x) => this.checkTarget(x));
      return { k: 'assign', targets, v, line };
    }
    if (this.isOp(':')) this.fail('不支援單獨的型別註記');
    return { k: 'expr', e: first, line };
  }
  atEnd() { const t = this.peek(); return t.t === 'nl' || t.t === 'eof' || (t.t === 'op' && t.v === ';'); }
  checkTarget(e: PyExpr) {
    if (e.k === 'name' || e.k === 'attr' || e.k === 'sub') return;
    if (e.k === 'tuple' || e.k === 'list') { e.items.forEach((x) => this.checkTarget(x)); return; }
    throw new SketchError('等號左邊必須是變數', e.line);
  }
  targetList(): PyExpr {
    const line = this.peek().line;
    const items = [this.expr()];
    while (this.eatOp(',')) { if (this.isKw('in')) break; items.push(this.expr()); }
    return items.length === 1 ? items[0] : { k: 'tuple', items, line };
  }

  testList(): PyExpr {
    const line = this.peek().line;
    const first = this.test();
    if (!this.isOp(',')) return first;
    const items = [first];
    while (this.eatOp(',')) {
      const t = this.peek();
      if (t.t === 'nl' || t.t === 'eof' || (t.t === 'op' && ['=', ')', ';'].includes(t.v))) break;
      items.push(this.test());
    }
    return { k: 'tuple', items, line };
  }
  test(): PyExpr {
    if (this.isKw('lambda')) this.fail('不支援 lambda');
    const line = this.peek().line;
    const a = this.orTest();
    if (this.eatKw('if')) {
      const c = this.orTest();
      if (!this.eatKw('else')) this.fail('條件運算式要有 else（x if 條件 else y）');
      return { k: 'ifexp', c, a, b: this.test(), line };
    }
    return a;
  }
  orTest(): PyExpr {
    let a = this.andTest();
    while (this.isKw('or')) { const line = this.next().line; a = { k: 'bool', op: 'or', a, b: this.andTest(), line }; }
    return a;
  }
  andTest(): PyExpr {
    let a = this.notTest();
    while (this.isKw('and')) { const line = this.next().line; a = { k: 'bool', op: 'and', a, b: this.notTest(), line }; }
    return a;
  }
  notTest(): PyExpr {
    if (this.isKw('not')) { const line = this.next().line; return { k: 'un', op: 'not', a: this.notTest(), line }; }
    return this.comparison();
  }
  comparison(): PyExpr {
    const line = this.peek().line;
    const first = this.expr();
    const ops: string[] = [], rest: PyExpr[] = [];
    for (;;) {
      const t = this.peek();
      let op: string | null = null;
      if (t.t === 'op' && ['<', '>', '==', '>=', '<=', '!='].includes(t.v)) { this.next(); op = t.v; }
      else if (this.isKw('in')) { this.next(); op = 'in'; }
      else if (this.isKw('not') && this.isKw('in', 1)) { this.i += 2; op = 'not in'; }
      else if (this.isKw('is')) { this.next(); op = this.eatKw('not') ? 'is not' : 'is'; }
      if (!op) break;
      ops.push(op);
      rest.push(this.expr());
    }
    return ops.length ? { k: 'cmp', first, ops, rest, line } : first;
  }
  static LEVELS = [['|'], ['^'], ['&'], ['<<', '>>'], ['+', '-'], ['*', '/', '//', '%', '@']];
  expr(level = 0): PyExpr {
    if (level >= Parser.LEVELS.length) return this.factor();
    let a = this.expr(level + 1);
    for (;;) {
      const t = this.peek();
      if (t.t === 'op' && Parser.LEVELS[level].includes(t.v)) { this.next(); a = { k: 'bin', op: t.v, a, b: this.expr(level + 1), line: t.line }; }
      else return a;
    }
  }
  factor(): PyExpr {
    const t = this.peek();
    if (t.t === 'op' && ['+', '-', '~'].includes(t.v)) { this.next(); return { k: 'un', op: t.v, a: this.factor(), line: t.line }; }
    const base = this.atomExpr();
    if (this.isOp('**')) { const line = this.next().line; return { k: 'bin', op: '**', a: base, b: this.factor(), line }; }
    return base;
  }
  atomExpr(): PyExpr {
    let e = this.atom();
    for (;;) {
      const t = this.peek();
      if (this.eatOp('(')) {
        const args: PyExpr[] = [], kw: [string, PyExpr][] = [];
        while (!this.isOp(')')) {
          if (this.isOp('*') || this.isOp('**')) this.fail('不支援 * / ** 展開參數');
          if (this.peek().t === 'name' && this.isOp('=', 1)) { const n = this.next().v; this.next(); kw.push([n, this.test()]); }
          else { if (kw.length) this.fail('位置參數不能放在關鍵字參數後面'); args.push(this.test()); }
          if (!this.eatOp(',')) break;
        }
        this.expectOp(')');
        e = { k: 'call', fn: e, args, kw, line: t.line };
      } else if (this.eatOp('[')) {
        const idx = this.subscript();
        this.expectOp(']');
        e = { k: 'sub', obj: e, idx, line: t.line };
      } else if (this.eatOp('.')) {
        e = { k: 'attr', obj: e, name: this.name(), line: t.line };
      } else return e;
    }
  }
  subscript(): PyExpr {
    const line = this.peek().line;
    const part = () => (this.isOp(':') || this.isOp(']') ? undefined : this.test());
    const lo = part();
    if (!this.eatOp(':')) return lo!;
    const hi = part();
    const step = this.eatOp(':') ? part() : undefined;
    return { k: 'slice', lo, hi, step, line };
  }
  atom(): PyExpr {
    const t = this.next();
    const line = t.line;
    if (t.t === 'num') return { k: 'num', v: t.n!, float: !!t.float, line };
    if (t.t === 'str' || t.t === 'fstr') {
      const parts: FPart[] = t.t === 'fstr' ? [...t.parts!] : [t.v];
      let isF = t.t === 'fstr';
      while (this.peek().t === 'str' || this.peek().t === 'fstr') {
        const n = this.next();
        if (n.t === 'fstr') { parts.push(...n.parts!); isF = true; } else parts.push(n.v);
      }
      return isF ? { k: 'fstr', parts, line } : { k: 'str', v: parts.join(''), line };
    }
    if (t.t === 'name') {
      if (t.v === 'None') return { k: 'const', v: null, line };
      if (t.v === 'True') return { k: 'const', v: true, line };
      if (t.v === 'False') return { k: 'const', v: false, line };
      if (KEYWORDS.has(t.v)) this.fail(`這裡不能用關鍵字「${t.v}」`, t);
      return { k: 'name', id: t.v, line };
    }
    if (t.t === 'op' && t.v === '(') {
      if (this.eatOp(')')) return { k: 'tuple', items: [], line };
      const first = this.test();
      if (this.isKw('for')) this.fail('不支援產生器運算式，請改用 [ ... for ... ]');
      if (this.eatOp(')')) return first;
      const items = [first];
      while (this.eatOp(',')) { if (this.isOp(')')) break; items.push(this.test()); }
      this.expectOp(')');
      return { k: 'tuple', items, line };
    }
    if (t.t === 'op' && t.v === '[') {
      if (this.eatOp(']')) return { k: 'list', items: [], line };
      const first = this.test();
      if (this.eatKw('for')) {
        const target = this.targetList();
        if (!this.eatKw('in')) this.fail('串列生成式要有 in');
        const iter = this.orTest();
        const cond = this.eatKw('if') ? this.orTest() : undefined;
        this.expectOp(']');
        return { k: 'comp', e: first, target, iter, cond, line };
      }
      const items = [first];
      while (this.eatOp(',')) { if (this.isOp(']')) break; items.push(this.test()); }
      this.expectOp(']');
      return { k: 'list', items, line };
    }
    if (t.t === 'op' && t.v === '{') {
      const keys: PyExpr[] = [], vals: PyExpr[] = [];
      while (!this.isOp('}')) {
        keys.push(this.test());
        if (!this.eatOp(':')) this.fail('不支援 set，請用 list 或 dict');
        vals.push(this.test());
        if (!this.eatOp(',')) break;
      }
      this.expectOp('}');
      return { k: 'dict', keys, vals, line };
    }
    this.fail(`這裡看不懂「${t.t === 'nl' ? '換行' : t.t === 'indent' ? '縮排' : t.t === 'eof' ? '檔案結尾' : t.v}」`, t);
  }
}

function parseExprText(src: string, line: number): PyExpr {
  const toks = tokenize(src.trim(), line).filter((t) => t.t !== 'nl' && t.t !== 'indent' && t.t !== 'dedent');
  const p = new Parser(toks);
  const e = p.test();
  if (p.peek().t !== 'eof') throw new SketchError('f-string 裡的運算式寫法錯誤', line);
  return e;
}

export function parsePython(src: string): PyStmt[] {
  return new Parser(tokenize(src)).file();
}
