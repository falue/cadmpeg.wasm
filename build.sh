#!/bin/sh
# Builds cadmpeg.wasm (the whole cadmpeg CLI for WASI) from upstream/, with patches/ applied.
set -e
cd "$(dirname "$0")"
[ -d upstream ] || git clone --depth 1 https://github.com/cadmpeg/cadmpeg upstream
for p in patches/*.patch; do
  git -C upstream apply --reverse --check "../$p" 2>/dev/null || git -C upstream apply "../$p"
done
# Size over speed: the browser downloads it.
(cd upstream && CARGO_PROFILE_DIST_OPT_LEVEL=s CARGO_PROFILE_DIST_LTO=fat CARGO_PROFILE_DIST_CODEGEN_UNITS=1 \
  cargo build --profile dist -p cadmpeg --bin cadmpeg --target wasm32-wasip1)
wasm-opt -O2 --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext \
  upstream/target/wasm32-wasip1/dist/cadmpeg.wasm -o cadmpeg.wasm
