#!/usr/bin/env node
/**
 * LiveNote — 아이콘 생성기 (의존성 없음, Node 내장 zlib 만 사용).
 * 4x 슈퍼샘플링으로 둥근 모서리/원을 부드럽게 렌더한 뒤 다운스케일하여
 * assets/icon16.png, icon48.png, icon128.png 를 생성한다.
 *
 *   node scripts/generate-icons.js
 *
 * 디자인: 다크 라운드 스퀘어 카드 + 흰색 메모 라인 3줄 + 우상단 빨강 LIVE 점.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ---- PNG 인코더 ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- 드로잉 헬퍼 (정규화 좌표 0..1) ----
const BG = [15, 17, 21]; // #0f1115
const BG2 = [32, 36, 46]; // 살짝 밝은 하단(세로 그라데이션)
const INK = [241, 241, 241];
const ACCENT = [204, 0, 0];

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
// 둥근 사각형 내부 여부 (cx 범위 [x0,x1], 반지름 r)
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r));
  const dy = Math.max(y0 + r - y, 0, y - (y1 - r));
  return dx * dx + dy * dy <= r * r;
}
function inCircle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// 한 점(정규화)의 색상. 알파 프리멀티플 없이 [r,g,b,a] 반환.
function sample(u, v) {
  // 배경 카드
  if (inRoundRect(u, v, 0.06, 0.06, 0.94, 0.94, 0.22)) {
    const base = mix(BG, BG2, v); // 세로 그라데이션
    // 메모 라인 3줄
    const lines = [
      { y: 0.40, x1: 0.74 },
      { y: 0.55, x1: 0.80 },
      { y: 0.70, x1: 0.60 },
    ];
    for (const L of lines) {
      if (inRoundRect(u, v, 0.24, L.y - 0.045, L.x1, L.y + 0.045, 0.045)) {
        return [...INK, 255];
      }
    }
    // 우상단 LIVE 점
    if (inCircle(u, v, 0.72, 0.30, 0.085)) return [...ACCENT, 255];
    return [base[0], base[1], base[2], 255];
  }
  return [0, 0, 0, 0]; // 투명
}

function render(size) {
  const SS = 4; // 슈퍼샘플
  const big = size * SS;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x * SS + sx + 0.5) / big;
          const v = (y * SS + sy + 0.5) / big;
          const px = sample(u, v);
          const af = px[3] / 255;
          r += px[0] * af;
          g += px[1] * af;
          b += px[2] * af;
          a += px[3];
        }
      }
      const n = SS * SS;
      const alpha = a / n;
      const idx = (y * size + x) * 4;
      // 평균색(알파 가중) → 다시 일반 RGBA
      const af = alpha > 0 ? alpha / 255 : 1;
      out[idx] = Math.round(r / n / af);
      out[idx + 1] = Math.round(g / n / af);
      out[idx + 2] = Math.round(b / n / af);
      out[idx + 3] = Math.round(alpha);
    }
  }
  return encodePng(size, size, out);
}

const assetsDir = path.join(__dirname, "..", "assets");
fs.mkdirSync(assetsDir, { recursive: true });
for (const size of [16, 48, 128]) {
  const png = render(size);
  fs.writeFileSync(path.join(assetsDir, `icon${size}.png`), png);
  console.log(`wrote assets/icon${size}.png (${png.length} bytes)`);
}
