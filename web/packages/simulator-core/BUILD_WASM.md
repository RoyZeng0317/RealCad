# Building WASM Module

The circuit simulation engine can be compiled to WebAssembly for better performance.

## Prerequisites

1. Install Rust: https://rustup.rs
2. Install wasm-pack: `cargo install wasm-pack`

## Build

```bash
cd packages/simulator-core
npm run build:wasm
```

## Architecture

The WASM module will port the MNA solver (matrix operations, LU decomposition)
to Rust for performance-critical operations while keeping the component models
and circuit builder in TypeScript.
