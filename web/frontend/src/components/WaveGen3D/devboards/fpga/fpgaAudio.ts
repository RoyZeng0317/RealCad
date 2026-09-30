// 板上喇叭：用 Web Audio 的方波振盪器，頻率 = 模擬出來的喇叭腳切換頻率（20 Hz ~ 20 kHz 才發聲）
//   瀏覽器規定要使用者點過頁面才能出聲，所以第一次點擊時才建立 AudioContext
let ctx: AudioContext | null = null;
let osc: OscillatorNode | null = null;
let gain: GainNode | null = null;

function ensure() {
  if (ctx || typeof window === 'undefined' || !('AudioContext' in window)) return;
  ctx = new AudioContext();
  gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  osc = ctx.createOscillator();
  osc.type = 'square';
  osc.connect(gain);
  osc.start();
}

if (typeof window !== 'undefined') {
  const unlock = () => { ensure(); void ctx?.resume(); };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
}

export const audible = (hz: number) => hz >= 20 && hz <= 20000;

/** hz = 0 或聽不到的頻率就靜音 */
export function setTone(hz: number) {
  if (!ctx || !osc || !gain) return;
  const t = ctx.currentTime;
  if (audible(hz)) {
    osc.frequency.setTargetAtTime(hz, t, 0.01);
    gain.gain.setTargetAtTime(0.05, t, 0.01);
  } else gain.gain.setTargetAtTime(0, t, 0.01);
}
