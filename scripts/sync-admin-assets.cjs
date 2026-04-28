#!/usr/bin/env node
/**
 * Admin 빌드 후 src/index.ts의 ADMIN_HTML asset 파일명을 자동 동기화
 * public/admin/index.html에서 파일명 읽어 src/index.ts 업데이트
 */

const fs = require('fs');
const path = require('path');

const adminHtmlPath = path.join(__dirname, '..', 'public', 'admin', 'index.html');
const indexTsPath = path.join(__dirname, '..', 'src', 'index.ts');

if (!fs.existsSync(adminHtmlPath)) {
  console.error('❌ public/admin/index.html 없음 - 먼저 npm run build:admin 실행');
  process.exit(1);
}

const adminHtml = fs.readFileSync(adminHtmlPath, 'utf-8');
const indexTs = fs.readFileSync(indexTsPath, 'utf-8');

// public/admin/index.html의 <head> 섹션에서 asset 참조 추출
const headMatch = adminHtml.match(/<head>([\s\S]*?)<\/head>/);
if (!headMatch) {
  console.error('❌ <head> 섹션을 찾을 수 없음');
  process.exit(1);
}

const headContent = headMatch[1];

// script src 추출
const scriptMatch = headContent.match(/<script[^>]+src="([^"]+)"[^>]*>/);
const mainJs = scriptMatch ? scriptMatch[1] : null;

// modulepreload hrefs 추출 (순서대로)
const modulepreloadMatches = [...headContent.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)];
const modulepreloads = modulepreloadMatches.map(m => m[1]);

// stylesheet href 추출
const cssMatch = headContent.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+admin\/assets[^"]+)"/)
  || headContent.match(/<link[^>]+href="([^"]+\.css)"[^>]+rel="stylesheet"/);
const mainCss = cssMatch ? cssMatch[1] : null;

if (!mainJs) {
  console.error('❌ main JS 파일을 찾을 수 없음');
  process.exit(1);
}

console.log('📦 감지된 Admin Asset:');
console.log('  main JS:', mainJs);
modulepreloads.forEach(m => console.log('  modulepreload:', m));
if (mainCss) console.log('  CSS:', mainCss);

// src/index.ts의 ADMIN_HTML 내 asset 라인들을 교체
// 패턴: /admin/assets/ 로 시작하는 script src, link modulepreload, link stylesheet
const newAssetLines = [];
if (mainJs) {
  newAssetLines.push(`  <script type="module" crossorigin src="${mainJs}"></script>`);
}
modulepreloads.forEach(href => {
  newAssetLines.push(`  <link rel="modulepreload" crossorigin href="${href}">`);
});
if (mainCss) {
  newAssetLines.push(`  <link rel="stylesheet" crossorigin href="${mainCss}">`);
}

// src/index.ts에서 기존 asset 블록 찾아 교체
const assetBlockRegex = /( {2}<script[^>]+\/admin\/assets[^>]+>.*\n(?:  <link[^>]+(?:modulepreload|stylesheet)[^>]+>\n)*)/;
const newBlock = newAssetLines.join('\n') + '\n';

if (!assetBlockRegex.test(indexTs)) {
  // 줄바꿈 방식 다르게 시도
  console.warn('⚠️  기존 asset 블록 패턴 못 찾음, 개별 라인 교체 시도...');
  
  let updated = indexTs;
  
  // script src 교체
  updated = updated.replace(
    /  <script type="module" crossorigin src="\/admin\/assets\/[^"]+"><\/script>/,
    `  <script type="module" crossorigin src="${mainJs}"></script>`
  );
  
  // modulepreload 전체 교체 (react, lucide, recharts)
  const vendors = ['react-vendor', 'lucide-vendor', 'recharts-vendor'];
  modulepreloads.forEach((href, i) => {
    const vendor = vendors[i] || `vendor-${i}`;
    const regex = new RegExp(`  <link rel="modulepreload" crossorigin href="/admin/assets/${vendor}-[^"]+">`, 'g');
    if (regex.test(updated)) {
      updated = updated.replace(
        new RegExp(`  <link rel="modulepreload" crossorigin href="/admin/assets/${vendor}-[^"]+">`),
        `  <link rel="modulepreload" crossorigin href="${href}">`
      );
    }
  });
  
  // CSS 교체
  if (mainCss) {
    updated = updated.replace(
      /  <link rel="stylesheet" crossorigin href="\/admin\/assets\/[^"]+\.css">/,
      `  <link rel="stylesheet" crossorigin href="${mainCss}">`
    );
  }
  
  fs.writeFileSync(indexTsPath, updated, 'utf-8');
  console.log('✅ src/index.ts asset 파일명 업데이트 완료 (개별 라인 교체)');
} else {
  const updated = indexTs.replace(assetBlockRegex, newBlock);
  fs.writeFileSync(indexTsPath, updated, 'utf-8');
  console.log('✅ src/index.ts asset 파일명 업데이트 완료');
}

// ──────────────────────────────────────────────────────────
// _routes.json 업데이트: widget.js, widget-test.html 추가
// ──────────────────────────────────────────────────────────
const distDir = path.join(__dirname, '..', 'dist');
const routesPath = path.join(distDir, '_routes.json');
const routes = {
  version: 1,
  include: ['/*'],
  exclude: [
    '/admin/assets/*',
    '/static/*',
    '/widget.js',
    '/widget-test.html',
    '/favicon.ico',
    '/favicon.svg',
  ],
};
if (fs.existsSync(distDir)) {
  fs.writeFileSync(routesPath, JSON.stringify(routes, null, 2), 'utf-8');
  console.log('✅ dist/_routes.json 업데이트 완료 (widget.js, widget-test.html 정적 서빙)');
} else {
  console.warn('⚠️  dist/ 디렉토리 없음 - 빌드 후 _routes.json이 자동 업데이트됩니다.');
}

// ──────────────────────────────────────────────────────────

// dist/admin/index.html 동기화 (wrangler static asset용)
function syncAdminHtml(htmlPath) {
  if (!fs.existsSync(htmlPath)) return;
  let html = fs.readFileSync(htmlPath, 'utf-8');
  if (mainJs) html = html.replace(/index-[^"]+\.js/, mainJs.split('/').pop());
  if (mainCss) html = html.replace(/index-[^"]+\.css/, mainCss.split('/').pop());
  modulepreloads.forEach(href => {
    const fileName = href.split('/').pop();
    const prefix = fileName.split('-').slice(0, 2).join('-');
    html = html.replace(new RegExp(prefix + '-[^"]+\.js'), fileName);
  });
  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log('✅ ' + htmlPath + ' 동기화 완료');
}

const syncPaths = [
  require('path').join(__dirname, '..', 'dist', 'admin', 'index.html'),
  'C:/Users/homeyo/Downloads/dist/admin/index.html'
];
syncPaths.forEach(syncAdminHtml);
