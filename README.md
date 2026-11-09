# cadmpeg.wasm

Unofficial: not made or endorsed by the cadmpeg project. cadmpeg is Apache-2.0; its license is in [LICENSE-cadmpeg](LICENSE-cadmpeg).

The complete [cadmpeg](https://github.com/cadmpeg/cadmpeg) CLI compiled to WebAssembly (WASI), with a small JS wrapper that runs it in the browser or in Node over an in-memory directory. Every command and flag works as in the native tool: `convert`, `inspect`, `check`, `measure`, `diff`, `dump`, `query`, `dialects`, `repro`.

## Use

```js
import { cadmpeg, convert } from 'cadmpeg.wasm';

// Native CAD file to STEP, plus cadmpeg's JSON report (decode, check, export).
const { data, report } = await convert(file.name, new Uint8Array(await file.arrayBuffer()), 'step');

// Any command: args as on the command line, files as its working directory.
const run = await cadmpeg(['inspect', 'part.sldprt'], { 'part.sldprt': bytes });
run.code; run.stdout; run.stderr; run.files; // files: the directory afterwards, outputs included
```

`cadmpeg.wasm` loads from beside `cadmpeg.js` on first use. Call `load(bytes | url | WebAssembly.Module)` first to load it from elsewhere (in Node: pass the bytes). A run blocks its thread until it finishes, so run it in a Worker in a web app.

Reads: Fusion `.f3d`, SolidWorks `.sldprt`, CATIA `.CATPart`, Inventor `.ipt`/`.iam`, NX and Creo `.prt`, Rhino `.3dm`, IGES, STEP, ACIS `.sat`/`.sab`/`.smt`/`.smb`, FreeCAD `.FCStd`, Creo View `.pvz`, OpenUSD. Writes: STEP, IGES, 3dm, USD, f3d, FCStd, sldprt, CADIR. Support per format: [upstream format support](https://github.com/cadmpeg/cadmpeg/blob/main/docs/format-support.md).

## Build

Needs rustup (the toolchain version comes from upstream's `rust-toolchain.toml`), `rustup target add wasm32-wasip1`, and `wasm-opt` (binaryen).

```sh
./build.sh          # clones upstream/ if missing, applies patches/, builds cadmpeg.wasm
npm test            # every command once, sample files of every format to STEP
node test/parity.mjs upstream/target/dist/cadmpeg   # byte comparison with a native build
```

Update cadmpeg with `git -C upstream pull` (after `git -C upstream checkout .` to drop the patches), then `./build.sh`.

`patches/wasm32-measure-allowance.patch` is the one change to cadmpeg: its measurement work allowance (`items × 2²²`) overflows a 32-bit `usize` at about 1000 faces and edges; it saturates there.

Output matches a native build byte for byte, except for last-digit float differences (about 1e-16) in some large files, from the platform math library.
