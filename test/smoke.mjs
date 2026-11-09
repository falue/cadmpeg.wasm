// node test/smoke.mjs [files per format]: every CLI command once, and up to N sample files of each input format to STEP.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { cadmpeg, convert, load } from '../cadmpeg.js';

const root = new URL('..', import.meta.url).pathname;
await load(readFileSync(join(root, 'cadmpeg.wasm')));
const per = Number(process.argv[2] ?? 2);
const formats = '.f3d .fcstd .ipt .iam .sldprt .catpart .prt .3dm .igs .iges .stp .step .sat .sab .smt .smb .pvz .usda .usdc .usdz'.split(' ');
let failed = 0;
const report = (ok, line) => {
  failed += !ok;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${line}`);
};

const samples = new Map();
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'target' || name === '.git') continue;
    const path = join(dir, name);
    const stat = statSync(path);
    const ext = name.toLowerCase().match(/\.[^.]*$/)?.[0];
    if (stat.isDirectory()) walk(path);
    else if (formats.includes(ext) && stat.size < 30e6) (samples.get(ext) ?? samples.set(ext, []).get(ext)).push(path);
  }
})(join(root, 'upstream'));

for (const [ext, paths] of samples) {
  for (const path of paths.sort().slice(0, per)) {
    const t = performance.now();
    try {
      const { data, report: r } = await convert(basename(path), readFileSync(path), ext === '.stp' || ext === '.step' ? 'step:ap214' : 'step', '--allow-errors');
      report(true, `${ext} → step ${(performance.now() - t).toFixed(0)}ms ${data.length}B ${Object.keys(r).join(',')} ${path.slice(root.length)}`);
    } catch (err) {
      report(false, `${ext} → step ${err.message.slice(0, 200)} ${path.slice(root.length)}`);
    }
  }
}

const part = join(root, 'upstream/corpus/nist-pmi/sldprt/nist_ftc_06_asme1_rd_sw1802.SLDPRT');
const files = { 'a.sldprt': readFileSync(part) };
files['a.step'] = (await convert('a.sldprt', files['a.sldprt'])).data;
for (const args of [['--version'], ['dialects'], ['inspect', 'a.sldprt'], ['check', 'a.sldprt'], ['measure', 'a.step', '--faces', '--kind', 'cylinder', '--tsv'], ['diff', 'a.sldprt', 'a.step', '--geometry'], ['dump', 'a.sldprt', '-o', 'a.cadir.json'], ['query', 'summary', 'a.cadir.json']]) {
  const run = await cadmpeg(args, files);
  if (args[0] === 'dump') files['a.cadir.json'] = run.files['a.cadir.json'];
  report(run.code === 0 || (args[0] === 'diff' && run.code === 1), `cadmpeg ${args.join(' ')} → exit ${run.code}, ${(run.stdout || run.stderr).trim().split('\n')[0].slice(0, 120)}`);
}
console.log(failed ? `${failed} failed` : 'all ok');
process.exitCode = failed ? 1 : 0;
