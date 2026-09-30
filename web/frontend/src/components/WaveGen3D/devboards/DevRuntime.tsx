// 開發板執行期：每幀推進各板子的程式（直譯器）、把 GPIO 狀態寫進 devStore、讀電路求解結果給 digitalRead/analogRead，
// 並把持續的接線錯誤轉成實際損壞（腳位燒毀 / USB 保險絲跳脫）
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DEV_BOARDS, DEV_KINDS, devPinByGpio, type DevKind } from './boardDefs.js';
import { useDev, isPowered } from './devStore.js';
import { SketchRunner, MODE, type Hal } from './sketchRun.js';
import { compile } from './compile.js';
import { SketchError } from './sketchLang.js';
import { getBench } from '../bench.js';

interface Live { runner: SketchRunner; nonce: number; boot: number; serial: string; lastRead: Map<number, number> }
const live = new Map<DevKind, Live>();
const SERIAL_MAX = 12000;

function makeHal(k: DevKind, L: () => Live): Hal {
  const d = DEV_BOARDS[k];
  const pinOf = (n: number, line: number) => {
    const p = devPinByGpio(k, n);
    if (!p) throw new SketchError(`${d.name} 沒有 GPIO ${n} 這隻腳`, line);
    return p;
  };
  // 燒毀的腳：程式照樣跑，但寫入沒作用、讀到的是亂數（跟真的壞掉的晶片一樣）
  const dead = (id: string) => useDev.getState().rt[k].dead.includes(id);
  const cur = (id: string) => useDev.getState().rt[k].pins[id];
  const set = (id: string, mode: number, level: number) => {
    const c = cur(id);
    if (!c || c.mode !== mode || c.level !== level) useDev.getState().setPin(k, id, { mode, level });
  };
  const gndPin = d.pins.find((p) => p.kind === 'GND')!.id;
  const volts = (id: string) => {
    const b = getBench();
    const v = b.holeV(`h:${k}:${id}`);
    const g = b.sol.nodeV[b.netOfHole(`h:${k}:${gndPin}`)] ?? 0;
    return v === null ? null : v - g;
  };
  return {
    intBits: d.intBits,
    consts: d.consts,
    pinMode(n, mode, line) {
      const p = pinOf(n, line);
      if (p.inputOnly && mode === MODE.OUTPUT) throw new SketchError(`GPIO ${n} 只能當輸入，不能設成 OUTPUT`, line);
      if (mode === MODE.INPUT_PULLDOWN && k === 'uno') throw new SketchError('Arduino Uno 沒有內建下拉電阻（INPUT_PULLDOWN）', line);
      if (dead(p.id)) return;
      set(p.id, mode, cur(p.id)?.level ?? 0);
    },
    digitalWrite(n, v, line) {
      const p = pinOf(n, line);
      if (dead(p.id)) return;
      const c = cur(p.id);
      if (!c || c.mode !== MODE.OUTPUT) {
        // AVR：對輸入腳寫 HIGH 會打開內建上拉；其他晶片沒設 OUTPUT 就不會輸出
        if (k === 'uno') set(p.id, v ? MODE.INPUT_PULLUP : MODE.INPUT, 0);
        return;
      }
      set(p.id, MODE.OUTPUT, v ? 1 : 0);
    },
    digitalRead(n, line) {
      const p = pinOf(n, line);
      if (dead(p.id)) return Math.random() < 0.5 ? 0 : 1;
      const v = volts(p.id);
      const last = L().lastRead.get(n) ?? 0;
      let r = last;
      if (v === null) r = cur(p.id)?.mode === MODE.INPUT_PULLUP ? 1 : cur(p.id)?.mode === MODE.INPUT_PULLDOWN ? 0 : Math.random() < 0.5 ? 0 : 1; // 浮接腳讀值不穩定
      else if (v >= d.vih) r = 1;
      else if (v <= d.vil) r = 0;
      L().lastRead.set(n, r);
      return r;
    },
    analogWrite(n, duty, line) {
      const p = pinOf(n, line);
      if (p.inputOnly) throw new SketchError(`GPIO ${n} 只能當輸入`, line);
      if (dead(p.id)) return;
      // Uno 非 PWM 腳：analogWrite 只會輸出 HIGH（≥128）或 LOW
      const level = k === 'uno' && !p.pwm ? (duty >= 0.5 ? 1 : 0) : duty;
      set(p.id, MODE.OUTPUT, level);
    },
    analogRead(n, line) {
      if (!d.adcBits) throw new SketchError(`${d.name} 沒有類比輸入（ADC），請外接 ADC 晶片`, line);
      const p = pinOf(n, line);
      if (!p.adc) throw new SketchError(`腳位 ${p.label} 不能類比讀取`, line);
      const max = 2 ** d.adcBits - 1;
      if (dead(p.id)) return Math.round(Math.random() * max);
      const v = volts(p.id);
      if (v === null) return Math.round(max * (0.3 + Math.random() * 0.4)); // 浮接：亂跳
      return Math.max(0, Math.min(max, Math.round((v / d.adcRef) * max)));
    },
    print(text) {
      const l = L();
      l.serial += text;
    },
    millis: () => performance.now() - L().boot,
  };
}

export function DevRuntime() {
  const dmgTimers = useRef(new Map<string, number>());
  const lastFlush = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const now = performance.now();
    const st = useDev.getState();

    for (const k of DEV_KINDS) {
      if (DEV_BOARDS[k].language === 'verilog') continue; // FPGA 由 FpgaRuntime 負責
      const rt = st.rt[k];
      const on = isPowered(st, k);
      let l = live.get(k);
      if (!on || !rt.running) {
        if (l) live.delete(k);
        const status = !on ? 'off' : 'stopped';
        if (rt.status !== status || Object.keys(rt.pins).length) st.patchRt(k, { status, pins: {} });
        continue;
      }
      if (!l || l.nonce !== rt.bootNonce) {
        const c = compile(st.conf[k].code, DEV_BOARDS[k].language);
        if (c.error) {
          live.delete(k);
          if (rt.status !== 'error' || !rt.compileError) st.patchRt(k, { status: 'error', compileError: c.error });
          continue;
        }
        const holder = { current: null as unknown as Live };
        const runner = new SketchRunner(c.ok.start(makeHal(k, () => holder.current)), now);
        l = { runner, nonce: rt.bootNonce, boot: now, serial: '', lastRead: new Map() };
        holder.current = l;
        live.set(k, l);
        st.patchRt(k, { status: 'running', compileError: null, runtimeError: null, pins: {} });
      }
      const state = l.runner.step(now);
      const cur = useDev.getState().rt[k];
      const status = state === 'error' ? 'error' : state;
      if (cur.status !== status || (state === 'error' && !cur.runtimeError)) {
        useDev.getState().patchRt(k, { status, runtimeError: state === 'error' ? l.runner.error : null });
      }
    }

    // 序列埠輸出每 0.1 秒寫回 store 一次
    if (now - lastFlush.current > 100) {
      lastFlush.current = now;
      for (const [k, l] of live) {
        if (!l.serial) continue;
        const prev = useDev.getState().rt[k].serial;
        useDev.getState().patchRt(k, { serial: (prev + l.serial).slice(-SERIAL_MAX) });
        l.serial = '';
      }
    }

    // 接線錯誤：持續 0.3 秒以上才真的燒毀，避免切換瞬間的暫態誤判
    const bench = getBench();
    const timers = dmgTimers.current;
    const active = new Set<string>();
    for (const dmg of bench.devDamage) {
      const key = `${dmg.kind}:${dmg.key}`;
      active.add(key);
      const t = (timers.get(key) ?? 0) + dt;
      timers.set(key, t);
      if (t < 0.3) continue;
      timers.delete(key);
      const s = useDev.getState();
      const rt = s.rt[dmg.kind];
      if (dmg.trip && !rt.tripped) {
        s.patchRt(dmg.kind, { tripped: true, serial: rt.serial + '\n[!] 電源過載：USB 保險絲跳脫，板子斷電（拔插 USB 可重設）\n' });
      } else if (dmg.pin && !rt.dead.includes(dmg.pin)) {
        const pins = { ...rt.pins };
        delete pins[dmg.pin];
        s.patchRt(dmg.kind, { dead: [...rt.dead, dmg.pin], pins, serial: rt.serial + `\n[!] 腳位 ${DEV_BOARDS[dmg.kind].pins.find((p) => p.id === dmg.pin)?.label} 燒毀\n` });
      }
    }
    for (const key of [...timers.keys()]) if (!active.has(key)) timers.delete(key);

    // 問題清單寫回 store（有變才寫）
    for (const k of DEV_KINDS) {
      const next = bench.devIssues[k];
      const cur = useDev.getState().rt[k].issues;
      if (JSON.stringify(next) !== JSON.stringify(cur)) useDev.getState().patchRt(k, { issues: next });
    }
  });
  return null;
}
