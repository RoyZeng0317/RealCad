export const COLS = 30;
export const PITCH = 0.5;
export const MAIN_ROWS = 5;
export const CENTER_GAP = PITCH * 1.6;
export const RAIL_GAP = PITCH * 1.4;
export const BOARD_H = 0.32;
export const BOARD_TOP = BOARD_H / 2;

const half = CENTER_GAP / 2;

export const LAYOUT = {
  topMain: Array.from({ length: MAIN_ROWS }, (_, i) =>
    -(half + (i + 0.5) * PITCH)
  ).reverse(),
  botMain: Array.from({ length: MAIN_ROWS }, (_, i) =>
    half + (i + 0.5) * PITCH
  ),
  topRails: [
    -(half + MAIN_ROWS * PITCH + RAIL_GAP + 0.5 * PITCH),
    -(half + MAIN_ROWS * PITCH + RAIL_GAP + 1.5 * PITCH),
  ],
  botRails: [
    half + MAIN_ROWS * PITCH + RAIL_GAP + 0.5 * PITCH,
    half + MAIN_ROWS * PITCH + RAIL_GAP + 1.5 * PITCH,
  ],
};

export const COL_XS = Array.from(
  { length: COLS },
  (_, i) => (i - (COLS - 1) / 2) * PITCH
);

export const ALL_ROW_ZS = [
  ...LAYOUT.topRails,
  ...LAYOUT.topMain,
  ...LAYOUT.botMain,
  ...LAYOUT.botRails,
].sort((a, b) => a - b);

export const BOARD_W = COLS * PITCH + 1.2;
export const BOARD_D =
  LAYOUT.botRails[1] - LAYOUT.topRails[1] + PITCH * 2 + 1.0;

export function snapToHole(x: number, z: number): { x: number; z: number } | null {
  const nearestX = COL_XS.reduce((a, b) =>
    Math.abs(a - x) < Math.abs(b - x) ? a : b
  );
  const nearestZ = ALL_ROW_ZS.reduce((a, b) =>
    Math.abs(a - z) < Math.abs(b - z) ? a : b
  );
  const tolX = PITCH * 0.6;
  const tolZ = PITCH * 0.6;
  if (Math.abs(nearestX - x) > tolX || Math.abs(nearestZ - z) > tolZ) return null;
  return { x: nearestX, z: nearestZ };
}
