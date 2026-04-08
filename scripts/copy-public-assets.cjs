#!/usr/bin/env node
/**
 * Workers 빌드용 정적 파일 복사 스크립트
 * public/ → dist/public/ 로 복사
 * (Cloudflare Workers Static Assets binding 용)
 */

const fs   = require('fs');
const path = require('path');

const SRC  = path.join(__dirname, '..', 'public');
const DEST = path.join(__dirname, '..', 'dist', 'public');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// dist/public 초기화 후 복사
if (fs.existsSync(DEST)) fs.rmSync(DEST, { recursive: true });
copyDir(SRC, DEST);
console.log('✅ public/ → dist/public/ 복사 완료 (Workers Static Assets)');
