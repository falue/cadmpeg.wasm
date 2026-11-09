// cadmpeg in the browser (and Node): the whole CLI as WebAssembly, run over an in-memory directory.
import { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory, wasi } from '@bjorn3/browser_wasi_shim';

let compiled;

/** The shim answers readlink with NOTSUP, which fails realpath (Rust's canonicalize); nothing here is a link. */
class Directory extends PreopenDirectory {
  path_readlink(path) {
    return { ret: this.path_lookup(path, 0).inode_obj ? wasi.ERRNO_INVAL : wasi.ERRNO_NOENT, data: null };
  }
}

/**
 * Compiles cadmpeg.wasm once. `source`: its URL (default: beside this file), its bytes, or a compiled module.
 * Node has no fetch for file URLs: pass the bytes there.
 */
export function load(source = new URL('./cadmpeg.wasm', import.meta.url)) {
  compiled ??=
    source instanceof WebAssembly.Module ? Promise.resolve(source)
    : source instanceof URL || typeof source === 'string' ? WebAssembly.compileStreaming(fetch(source))
    : WebAssembly.compile(source);
  return compiled;
}

/**
 * Runs `cadmpeg ...args` with `files` ({ name: Uint8Array }) as its working directory.
 * Resolves to its exit code, its output and the directory's files afterwards (inputs included).
 */
export async function cadmpeg(args, files = {}) {
  const module = await load();
  const text = () => {
    const decoder = new TextDecoder();
    const out = { text: '' };
    out.fd = new ConsoleStdout((bytes) => (out.text += decoder.decode(bytes, { stream: true })));
    return out;
  };
  const [stdout, stderr] = [text(), text()];
  const dir = new Directory('/', new Map(Object.entries(files).map(([name, data]) => [name, new File(data)])));
  const host = new WASI(['cadmpeg', ...args], [], [new OpenFile(new File([])), stdout.fd, stderr.fd, dir], { debug: false });
  const code = host.start(await WebAssembly.instantiate(module, { wasi_snapshot_preview1: host.wasiImport }));
  const out = {};
  for (const [name, entry] of dir.dir.contents) if (entry instanceof File) out[name] = entry.data;
  return { code, stdout: stdout.text, stderr: stderr.text, files: out };
}

/**
 * Converts a CAD file to `to` (`step`, `iges`, `3dm`, `usd`, `f3d`, `fcstd`, `sldprt`, `cadir`, or `format:dialect`).
 * Resolves to the output and cadmpeg's JSON report; rejects with cadmpeg's error message.
 */
export async function convert(name, data, to = 'step', ...flags) {
  const run = await cadmpeg(['convert', name, '-o', 'output', '--to', to, '--report', 'report.json', ...flags], { [name]: data });
  if (run.code !== 0) throw new Error(run.stderr.trim().split('\n').pop() || `cadmpeg exited with ${run.code}`);
  return { data: run.files.output, report: JSON.parse(new TextDecoder().decode(run.files['report.json'])), log: run.stderr };
}
