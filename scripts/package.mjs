#!/usr/bin/env node
/**
 * LiveNote — 스토어 업로드용 zip 패키저 (의존성 없음, Node 내장 zlib 만 사용).
 * 실행에 필요한 파일(manifest, src/, assets/)만 모아 dist/live-note-<version>.zip 생성.
 *
 *   node scripts/package.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ── 포함 대상 (이 경로들만 패키징) ──
const INCLUDE = ["manifest.json", "src", "assets"];

const version = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")
).version;

// ── 파일 목록 수집 ──
function walk(rel, out) {
  const abs = path.join(ROOT, rel);
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(abs)) walk(path.posix.join(rel, name), out);
  } else {
    out.push(rel);
  }
}
const files = [];
for (const inc of INCLUDE) walk(inc, files);

// ── ZIP 작성기 (store/deflate) ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const chunks = [];
const central = [];
let offset = 0;

for (const rel of files) {
  const data = fs.readFileSync(path.join(ROOT, rel));
  const name = Buffer.from(rel.split(path.sep).join("/"), "utf8");
  const crc = crc32(data);
  const compressed = zlib.deflateRawSync(data, { level: 9 });

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(8, 8); // method: deflate
  local.writeUInt16LE(0, 10); // mod time
  local.writeUInt16LE(0x21, 12); // mod date (1980-01-01 안전값)
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);

  chunks.push(local, name, compressed);

  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(20, 4); // version made by
  cen.writeUInt16LE(20, 6); // version needed
  cen.writeUInt16LE(0, 8);
  cen.writeUInt16LE(8, 10);
  cen.writeUInt16LE(0, 12);
  cen.writeUInt16LE(0x21, 14);
  cen.writeUInt32LE(crc, 16);
  cen.writeUInt32LE(compressed.length, 20);
  cen.writeUInt32LE(data.length, 24);
  cen.writeUInt16LE(name.length, 28);
  cen.writeUInt16LE(0, 30);
  cen.writeUInt16LE(0, 32);
  cen.writeUInt16LE(0, 34);
  cen.writeUInt16LE(0, 36);
  cen.writeUInt32LE(0, 38);
  cen.writeUInt32LE(offset, 42);
  central.push(cen, name);

  offset += local.length + name.length + compressed.length;
}

const centralBuf = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(centralBuf.length, 12);
eocd.writeUInt32LE(offset, 16);
eocd.writeUInt16LE(0, 20);

const zip = Buffer.concat([...chunks, centralBuf, eocd]);

const distDir = path.join(ROOT, "dist");
fs.mkdirSync(distDir, { recursive: true });
const outPath = path.join(distDir, `live-note-${version}.zip`);
fs.writeFileSync(outPath, zip);

console.log(`packaged ${files.length} files`);
console.log(`→ dist/live-note-${version}.zip (${(zip.length / 1024).toFixed(1)} KB)`);
