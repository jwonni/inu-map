// 건물 출입구 보정 데이터(data/entrances.js) 생성.
// 1층 배치도를 보고 정한 출입구를 레이아웃 좌표(0~1)로 적어 두면 OSM 건물 프레임 기준 위경도로 변환한다.
//   node tools/build_entrances.mjs
import fs from 'node:fs'; import vm from 'node:vm';
const KX = 88700, KY = 111000;
const html = fs.readFileSync('inu-campus-map.html', 'utf8');
const D = JSON.parse(html.split('\n').find((l) => l.startsWith('const D = ')).slice(10).replace(/;\s*$/, ''));
globalThis.window = globalThis; globalThis.document = { createElementNS: () => ({ setAttribute() {}, appendChild() {} }), querySelector: () => null };
for (const f of ['data/buildings.js', 'data/floorplans.js', 'data/footprints.js', 'renderer.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
const BLD = vm.runInThisContext('BUILDINGS');
const rn = fs.readFileSync('data/roadnet.js', 'utf8'); const t = JSON.parse(rn.slice(rn.indexOf('{'), rn.lastIndexOf('}') + 1)).transform; const rotCorr = Math.atan2(t.b, t.a) * 180 / Math.PI;
const area = (p) => { let s = 0; for (let i = 0; i < p.length - 1; i++) s += p[i][1] * KX * (p[i + 1][0] * KY) - p[i + 1][1] * KX * (p[i][0] * KY); return Math.abs(s / 2); };

// build_indoor.mjs 와 같은 프레임 계산 (가장 긴 변 기준 축)
function frame(id, no) {
  const b = BLD.find((x) => x.id === id); const parts = D.buildings.filter((x) => x.no === no);
  const poly = parts.reduce((a, x) => (area(x.poly) > area(a.poly) ? x : a)).poly;
  const P = poly.map(([lat, lon]) => [lon * KX, -lat * KY]);
  const cx0 = P.reduce((s, p) => s + p[0], 0) / P.length, cy0 = P.reduce((s, p) => s + p[1], 0) / P.length;
  let longest = [0, 0]; for (let i = 0; i < P.length - 1; i++) { const dx = P[i + 1][0] - P[i][0], dy = P[i + 1][1] - P[i][1], l = Math.hypot(dx, dy); if (l > longest[0]) longest = [l, Math.atan2(dy, dx)]; }
  const want = ((b.rot || 0) + rotCorr) * Math.PI / 180; let a = longest[1], bd = Infinity;
  for (let k = -2; k <= 2; k++) { const c = longest[1] + k * Math.PI / 2, d = Math.abs(Math.atan2(Math.sin(c - want), Math.cos(c - want))); if (d < bd) { bd = d; a = c; } }
  const ca = Math.cos(a), sa = Math.sin(a); const us = P.map(([x, y]) => (x - cx0) * ca + (y - cy0) * sa), vs = P.map(([x, y]) => -(x - cx0) * sa + (y - cy0) * ca);
  const umin = Math.min(...us), umax = Math.max(...us), vmin = Math.min(...vs), vmax = Math.max(...vs), W = (umax - umin) * .94, H = (vmax - vmin) * .94, uc = (umin + umax) / 2, vc = (vmin + vmax) / 2;
  return { toLL: (x, y) => { const u = uc + (x - .5) * W, v = vc + (y - .5) * H; const X = cx0 + u * ca - v * sa, Y = cy0 + u * sa + v * ca; return [+(-Y / KY).toFixed(6), +(X / KX).toFixed(6)]; }, osm: parts.flatMap((x) => x.ent || []) };
}

// ---- 건물별 결정 (1층 배치도 대조 결과). osm:n = OSM 출입구 n번 유지, [x,y] = 레이아웃 좌표로 추가
const DECISIONS = {
  '7':  { id: 'it',  keep: [2, 3, 4], add: [[0.15, 0.0]], names: ['B동 끝 출입구', 'A동 쪽 정문', 'B동 쪽 정문', 'A동 끝 출입구'],
          note: '1F 배치도 기준: 날개 끝 2곳 + 베이스(현위치 쪽) 2곳. OSM 의 날개 옆면·베이스 양끝 출입구는 배치도에 없어 제외' },
  '13': { id: 'b13', keep: [0], add: [[0.0, 0.5]], names: ['동쪽 끝(OSM)', '반대쪽 끝 출입구'], note: '1F 배치도: 복도 양 끝 출입구. OSM 에 없던 반대쪽 끝을 추가' },
  '14': { id: 'nea', keep: [0, 1, 2], add: [[0.0, 0.45]], names: ['가운데동 아래(OSM)', '별동(OSM)', '별동(OSM)', '가운데동 끝 출입구'],
          note: '1F 배치도: 가운데 동 복도 끝(113 옆) 출입구 추가. 110/109 사이 아래 출입구는 OSM 과 일치' },
  '6':  { id: 'lib', keep: [0, 1], add: [], names: ['위쪽(Cafe 옆)', '아래쪽'], note: '1F 배치도의 위·아래 출입구와 OSM 2곳이 일치' },
  '8':  { id: 'b8',  keep: [0, 1, 2, 3], add: [], names: ['A동 끝', 'B동 끝', 'C동 끝', 'C동 아래'], note: '1F 배치도: 세 날개 끝 출입구 + C동 아래. OSM 4곳과 일치' },
};
const out = {};
for (const [no, d] of Object.entries(DECISIONS)) {
  const f = frame(d.id, no);
  out[no] = { pts: [...d.keep.map((i) => f.osm[i]), ...d.add.map(([x, y]) => f.toLL(x, y))], names: d.names, note: d.note };
  console.log(`${no}호관 ${out[no].pts.length}곳 - ${d.note}`);
}
fs.writeFileSync('data/entrances.js',
  '/* 건물 출입구 보정 (1층 배치도 기준). entOf() 가 OSM 출입구 대신 이 값을 쓴다. 생성: node tools/build_entrances.mjs\n' +
  '   5·11·12·15·16호관은 배치도 좌우 방향이 확정되지 않아 OSM 출입구를 그대로 둔다 (building-detail.html 로 확인 후 DECISIONS 에 추가). */\n' +
  'const ENT_FIX = ' + JSON.stringify(out) + ';\n');
