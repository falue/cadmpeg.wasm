// node test/parity.mjs <native cadmpeg> [files per format]: wasm and native `convert` must write the same bytes.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { convert, load } from '../cadmpeg.js';

const [native, per = '3'] = process.argv.slice(2);
const root = new URL('..', import.meta.url).pathname;
await load(readFileSync(join(root, 'cadmpeg.wasm')));
const formats = '.f3d .fcstd .ipt .iam .sldprt .catpart .prt .3dm .igs .iges .stp .step .sat .sab .pvz .usda .usdc .usdz'.split(' ');
const out = mkdtempSync(join(tmpdir(), 'parity-'));
const samples = new Map();
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'target' || name === '.git') continue;
    const path = join(dir, name);
    const ext = name.toLowerCase().match(/\.[^.]*$/)?.[0];
    if (statSync(path).isDirectory()) walk(path);
    else if (formats.includes(ext) && statSync(path).size < 30e6) (samples.get(ext) ?? samples.set(ext, []).get(ext)).push(path);
  }
})(join(root, 'upstream'));

let same = 0, differ = 0;
for (const [ext, paths] of samples) {
  for (const [i, path] of paths.sort().slice(0, Number(per)).entries()) {
    const to = ext === '.stp' || ext === '.step' ? 'step:ap214' : 'step';
    const target = join(out, `${ext.slice(1)}${i}.step`);
    let a, b;
    try {
      execFileSync(native, ['convert', path, '-o', target, '--to', to, '--allow-errors', '--force'], { stdio: 'pipe' });
      a = readFileSync(target);
    } catch (err) {
      a = `native failed: ${String(err.stderr).trim().split('\n').pop()}`;
    }
    try {
      b = Buffer.from((await convert(basename(path), readFileSync(path), to, '--allow-errors')).data);
    } catch (err) {
      b = `wasm failed: ${err.message}`;
    }
    const ok = typeof a === typeof b && (typeof a === 'string' ? a.replace('native', '') === b.replace('wasm', '') : a.equals(b));
    ok ? same++ : differ++;
    console.log(`${ok ? 'SAME' : 'DIFF'} ${path.slice(root.length)}${ok ? '' : `\n  native: ${typeof a === 'string' ? a : a.length + 'B'}\n  wasm:   ${typeof b === 'string' ? b : b.length + 'B'}`}`);
  }
}
console.log(`${same} same, ${differ} differ`);
process.exitCode = differ ? 1 : 0;
