// Quartus 專案檔解析：.qsf（腳位、最上層實體、元件型號）與 .sof / .pof（只檢查裡面記錄的元件型號）
export interface QsfInfo { top?: string; device?: string; family?: string; pins: Record<string, number>; warnings: string[] }

/** set_location_assignment PIN_91 -to clk、-to "led[0]"、-to led\[0\]、-to {led[0]} 都支援 */
export function parseQsf(text: string): QsfInfo {
  const info: QsfInfo = { pins: {}, warnings: [] };
  const unq = (s: string) => s.replace(/^["{]|["}]$/g, '').replace(/\\\[/g, '[').replace(/\\\]/g, ']');
  text.split(/\r?\n/).forEach((raw, n) => {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;
    let m = /^set_location_assignment\s+(?:PIN_)?(\d+)\s+-to\s+(\S+)/i.exec(line);
    if (m) { info.pins[unq(m[2])] = Number(m[1]); return; }
    m = /^set_location_assignment\s+(\S+)\s+-to\s+(\S+)/i.exec(line);
    if (m) { info.warnings.push(`第 ${n + 1} 行：看不懂的腳位 ${m[1]}（需要 PIN_數字）`); return; }
    m = /^set_global_assignment\s+-name\s+(\w+)\s+(.+)$/i.exec(line);
    if (m) {
      const v = unq(m[2].trim());
      if (/^TOP_LEVEL_ENTITY$/i.test(m[1])) info.top = v;
      else if (/^DEVICE$/i.test(m[1])) info.device = v.toUpperCase();
      else if (/^FAMILY$/i.test(m[1])) info.family = v;
    }
  });
  return info;
}

/** .sof / .pof 是 Intel 的封閉格式；這裡只從檔案裡找出記錄的元件型號，用來確認是不是給這塊板子的 */
export function sniffDevice(bytes: Uint8Array): string | null {
  let run = '';
  const found: string[] = [];
  for (let i = 0; i < bytes.length && i < 4_000_000; i++) {
    const b = bytes[i];
    if (b >= 0x20 && b < 0x7f) { run += String.fromCharCode(b); continue; }
    if (run.length >= 5) { const m = /(EP[A-Z]*\d+[A-Z0-9-]*)/.exec(run); if (m) found.push(m[1]); }
    run = '';
    if (found.length) break;
  }
  return found[0] ?? null;
}

export const DEVICE = 'EPF10K50EQC240-1';
/** 型號比對：EPF10K50E 系列的 QC240 包裝都算相容（速度等級不同只提示） */
export function deviceCompat(dev: string): 'ok' | 'speed' | 'bad' {
  const d = dev.toUpperCase();
  if (d === DEVICE) return 'ok';
  if (d.startsWith('EPF10K50EQC240')) return 'speed';
  return 'bad';
}
