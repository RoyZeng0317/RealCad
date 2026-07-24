export interface SparseMatrixEntry {
  row: number;
  col: number;
  value: number;
}

export class SparseMatrix {
  private data: Map<number, Map<number, number>> = new Map();
  public size: number;

  constructor(size: number) {
    this.size = size;
  }

  set(row: number, col: number, value: number): void {
    if (!this.data.has(row)) {
      this.data.set(row, new Map());
    }
    this.data.get(row)!.set(col, value);
  }

  add(row: number, col: number, value: number): void {
    const existing = this.get(row, col);
    this.set(row, col, existing + value);
  }

  get(row: number, col: number): number {
    return this.data.get(row)?.get(col) ?? 0;
  }

  clear(): void {
    this.data.clear();
  }

  toDense(): number[][] {
    const n = this.size;
    const result: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (const [row, cols] of this.data) {
      for (const [col, value] of cols) {
        result[row][col] = value;
      }
    }
    return result;
  }

  multiply(b: number[]): number[] {
    const n = this.size;
    const result = new Array(n).fill(0);
    for (const [row, cols] of this.data) {
      let sum = 0;
      for (const [col, value] of cols) {
        sum += value * b[col];
      }
      result[row] = sum;
    }
    return result;
  }
}

export function luDecomposition(A: SparseMatrix): { L: number[][]; U: number[][] } {
  const n = A.size;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  const U = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let k = i; k < n; k++) {
      let sum = 0;
      for (let j = 0; j < i; j++) {
        sum += L[i][j] * U[j][k];
      }
      U[i][k] = A.get(i, k) - sum;
    }
    for (let k = i; k < n; k++) {
      if (i === k) {
        L[i][i] = 1;
      } else {
        let sum = 0;
        for (let j = 0; j < i; j++) {
          sum += L[k][j] * U[j][i];
        }
        L[k][i] = (A.get(k, i) - sum) / U[i][i];
      }
    }
  }
  return { L, U };
}

export function forwardSubstitution(L: number[][], b: number[]): number[] {
  const n = L.length;
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < i; j++) {
      sum += L[i][j] * y[j];
    }
    y[i] = (b[i] - sum) / L[i][i];
  }
  return y;
}

export function backSubstitution(U: number[][], y: number[]): number[] {
  const n = U.length;
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += U[i][j] * x[j];
    }
    x[i] = (y[i] - sum) / U[i][i];
  }
  return x;
}

export function solveSparse(A: SparseMatrix, b: number[]): number[] {
  const { L, U } = luDecomposition(A);
  const y = forwardSubstitution(L, b);
  return backSubstitution(U, y);
}
