export type DeviceType = 'R' | 'C' | 'L' | 'V' | 'I' | 'D' | 'Q' | 'M' | 'E' | 'G';

export interface DeviceStamp {
  type: DeviceType;
  name: string;
  positiveNode: number;
  negativeNode: number;
  value: number;
  controlNode?: number;
  extraParam?: number;
}

export interface MNASolution {
  voltages: number[];
  currents: number[];
  converged: boolean;
  iterations: number;
}

export function buildMNAMatrix(
  devices: DeviceStamp[],
  numNodes: number,
  voltageSourceCount: number
): { A: number[][]; b: number[] } {
  const n = numNodes + voltageSourceCount;
  const A: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const b: number[] = new Array(n).fill(0);

  let vsIndex = 0;

  for (const device of devices) {
    const { type, positiveNode: p, negativeNode: n_, value: val } = device;
    const pIdx = p - 1;
    const nIdx = n_ - 1;

    switch (type) {
      case 'R': {
        if (p !== 0) A[pIdx][pIdx] += 1 / val;
        if (n_ !== 0) A[nIdx][nIdx] += 1 / val;
        if (p !== 0 && n_ !== 0) {
          A[pIdx][nIdx] -= 1 / val;
          A[nIdx][pIdx] -= 1 / val;
        }
        break;
      }
      case 'V': {
        const eqIdx = numNodes + vsIndex;
        if (p !== 0) {
          A[pIdx][eqIdx] += 1;
          A[eqIdx][pIdx] += 1;
        }
        if (n_ !== 0) {
          A[nIdx][eqIdx] -= 1;
          A[eqIdx][nIdx] -= 1;
        }
        b[eqIdx] = val;
        vsIndex++;
        break;
      }
      case 'I': {
        if (p !== 0) b[pIdx] -= val;
        if (n_ !== 0) b[nIdx] += val;
        break;
      }
      case 'G': {
        const cIdx = (device.controlNode ?? 0) - 1;
        if (p !== 0 && cIdx >= 0) A[pIdx][cIdx] += val;
        if (p !== 0 && n_ !== 0) A[pIdx][nIdx] -= val;
        if (n_ !== 0 && cIdx >= 0) A[nIdx][cIdx] -= val;
        if (n_ !== 0) A[nIdx][nIdx] += val;
        break;
      }
      case 'E': {
        const eqIdx = numNodes + vsIndex;
        const cIdx = (device.controlNode ?? 0) - 1;
        if (p !== 0) A[pIdx][eqIdx] += 1;
        if (n_ !== 0) A[nIdx][eqIdx] -= 1;
        A[eqIdx][pIdx] += 1;
        A[eqIdx][nIdx] -= 1;
        if (cIdx >= 0) A[eqIdx][cIdx] -= val;
        vsIndex++;
        break;
      }
      case 'D': {
        const vt = 0.02585;
        const thermalVoltage = vt * (device.extraParam ?? 1);
        const is = val;
        let vd = 0;
        if (p !== 0 && n_ !== 0) {
          vd = 0.7;
        }
        const gd = (is / thermalVoltage) * Math.exp(vd / thermalVoltage);
        const ieq = is * (Math.exp(vd / thermalVoltage) - 1) - gd * vd;
        if (p !== 0) {
          A[pIdx][pIdx] += gd;
          b[pIdx] -= ieq;
        }
        if (n_ !== 0) {
          A[nIdx][nIdx] += gd;
          b[nIdx] += ieq;
        }
        if (p !== 0 && n_ !== 0) {
          A[pIdx][nIdx] -= gd;
          A[nIdx][pIdx] -= gd;
        }
        break;
      }
    }
  }

  return { A, b };
}

export function solveMNA(A: number[][], b: number[]): MNASolution {
  const n = A.length;
  const augmented = A.map((row, i) => [...row, b[i]]);
  let iterations = 0;
  const maxIter = 100;

  for (let i = 0; i < n && iterations < maxIter; i++, iterations++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
    if (Math.abs(augmented[i][i]) < 1e-15) continue;
    for (let k = i + 1; k < n; k++) {
      const factor = augmented[k][i] / augmented[i][i];
      for (let j = i; j <= n; j++) {
        augmented[k][j] -= factor * augmented[i][j];
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += augmented[i][j] * x[j];
    }
    const denom = augmented[i][i];
    x[i] = denom !== 0 ? (augmented[i][n] - sum) / denom : 0;
  }

  const numVoltages = n;
  const voltages = x.slice(0, numVoltages);
  const currents = x.slice(numVoltages);

  return {
    voltages: [0, ...voltages],
    currents,
    converged: iterations < maxIter,
    iterations,
  };
}
