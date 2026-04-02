#!/usr/bin/env node
/**
 * 빌드 후 dist/_routes.json 업데이트
 * widget.js, widget-test.html을 Cloudflare Pages 정적 서빙 대상으로 등록
 */

const fs   = require('fs');
const path = require('path');

const distDir    = path.join(__dirname, '..', 'dist');
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

fs.writeFileSync(routesPath, JSON.stringify(routes, null, 2), 'utf-8');
console.log('✅ dist/_routes.json 업데이트 완료');
console.log('   exclude:', routes.exclude.join(', '));
