// 示波器 CH2 量測的電源輸出電壓：直流準位 + 一階暫態（開/關輸出、切換負載時可以在示波器上看到上升/下降）
export const PSU_TAU = 0.002; // s，電源輸出的等效時間常數（軟啟動 + 輸出電容）

interface Seg { t: number; target: number; v0: number }

/** 記錄電源輸出目標電壓的變化時間點，用解析式算出任意時間的電壓，不需要高速取樣 */
export class DcTrace {
  private segs: Seg[] = [{ t: -Infinity, target: 0, v0: 0 }];

  /** 每幀呼叫：目標電壓有變化就新增一段暫態 */
  update(now: number, target: number) {
    const last = this.segs[this.segs.length - 1];
    if (Math.abs(last.target - target) < 1e-9) return;
    this.segs.push({ t: now, target, v0: this.sample(now) });
    if (this.segs.length > 32) this.segs.splice(0, this.segs.length - 32);
  }

  sample(t: number): number {
    for (let k = this.segs.length - 1; k >= 0; k--) {
      const s = this.segs[k];
      if (t >= s.t) return isFinite(s.t) ? s.target + (s.v0 - s.target) * Math.exp(-(t - s.t) / PSU_TAU) : s.target;
    }
    return this.segs[0].v0;
  }

  /** 最近一次（≤ now）往上穿越 level 的時間；沒有則回傳 null */
  lastRisingCrossing(level: number, now: number): number | null {
    for (let k = this.segs.length - 1; k >= 0; k--) {
      const s = this.segs[k];
      if (!isFinite(s.t) || !(s.v0 < level && s.target > level)) continue;
      const tc = s.t + PSU_TAU * Math.log((s.v0 - s.target) / (level - s.target));
      const end = k + 1 < this.segs.length ? this.segs[k + 1].t : now;
      if (tc <= Math.min(end, now)) return tc;
    }
    return null;
  }
}
