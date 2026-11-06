// data/floorplans.js 의 호실 배치(레이아웃 생성기 결과)를 inu-campus-map.html(Leaflet, 위경도)용
// 실내 데이터로 변환해 data/indoor-gen.js 를 만든다.
//
//   node tools/build_indoor.mjs      (campus-map 폴더에서)
//
// 방법: 건물마다 inu-campus-map.html 의 건물 폴리곤(위경도)을 미터 좌표(X=lon·KX, Y=-lat·KY, y 아래)로 놓고,
// buildings.js 의 회전각(rot, + OSM 보정각)으로 정한 축에 폴리곤을 투영해 폭·높이를 잰 뒤
// 레이아웃의 0~1 좌표를 그 직사각형에 맞춰 넣는다. 결과 형식은 페이지의 D.indoor['17'] 과 같다.
import fs from 'node:fs';
import vm from 'node:vm';

const KX = 88700, KY = 111000;                       // 페이지와 같은 m/deg 근사값
const SHRINK = 0.94;                                  // 외곽선 안쪽으로 살짝 들여서 배치
const ID2NO = { b5: '5', lib: '6', it: '7', b8: '8', b11: '11', b12: '12', b13: '13', nea: '14', b15: '15', b16: '16' };
// b17 은 페이지에 손으로 딴 실내 데이터(경로 그래프 포함)가 이미 있어 제외

// ---- 페이지의 D 읽기
const html = fs.readFileSync('inu-campus-map.html', 'utf8');
const dLine = html.split('\n').find((l) => l.startsWith('const D = '));
const D = JSON.parse(dLine.slice('const D = '.length).replace(/;\s*$/, ''));

// ---- 앱 스크립트를 그대로 실행해 LAYOUTS / BUILDINGS / FLOORPLANS 얻기
globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ setAttribute() {}, appendChild() {} }), querySelector: () => null };
for (const f of ['data/buildings.js', 'data/floorplans.js', 'data/footprints.js', 'renderer.js'])
  vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
// 스크립트의 top-level const 는 globalThis 속성이 아니라 공유 렉시컬 스코프에 있으므로 식으로 꺼낸다
const { LAYOUTS, BUILDINGS, FLOORPLANS } = vm.runInThisContext('({ LAYOUTS: window.LAYOUTS, BUILDINGS, FLOORPLANS })');

// ---- OSM 픽셀 → 지도 좌표 유사변환의 회전각 (data/roadnet.js) — 지도 각도를 위경도 각도로 보정
let rotCorr = 0;
try {
  const rn = fs.readFileSync('data/roadnet.js', 'utf8');
  const t = JSON.parse(rn.slice(rn.indexOf('{'), rn.lastIndexOf('}') + 1)).transform;
  rotCorr = (Math.atan2(t.b, t.a) * 180) / Math.PI;
} catch {}

const polyArea = (p) => { let s = 0; for (let i = 0; i < p.length - 1; i++) s += p[i][1] * KX * (p[i + 1][0] * KY) - p[i + 1][1] * KX * (p[i][0] * KY); return Math.abs(s / 2); };
const TYPE = { st: 'stair', wc: 'wc', ev: 'elev' };
const LABEL = { st: '계단', wc: 'WC', ev: 'EV' };
const out = {};

for (const b of BUILDINGS) {
  const no = ID2NO[b.id], plan = FLOORPLANS[b.id];
  if (!no || !plan || !LAYOUTS[plan.layout]) continue;
  const parts = D.buildings.filter((x) => x.no === no);
  if (!parts.length) { console.warn('페이지에 건물 없음:', no); continue; }
  const poly = parts.reduce((a, x) => (polyArea(x.poly) > polyArea(a.poly) ? x : a)).poly;

  // 미터 좌표(y 아래)로 변환한 뒤 레이아웃 축(u = 폭 방향, v = 길이 방향)에 투영.
  // 축 각도: OSM 폴리곤에서 가장 긴 변의 방향을 v(또는 u)로 쓴다(it-detail.html 과 같은 방식). buildings.js 의 rot(+OSM 보정)는
  // 가장 긴 변과 90° 단위로 가장 가까운 방향을 고르는 기준으로만 쓴다 → 손으로 적은 각도의 오차가 사라지고 건물 모양에 딱 맞는다.
  const P = poly.map(([lat, lon]) => [lon * KX, -lat * KY]);
  const cx0 = P.reduce((s, p) => s + p[0], 0) / P.length, cy0 = P.reduce((s, p) => s + p[1], 0) / P.length;
  let longest = [0, 0];
  for (let i = 0; i < P.length - 1; i++) { const dx = P[i + 1][0] - P[i][0], dy = P[i + 1][1] - P[i][1], l = Math.hypot(dx, dy); if (l > longest[0]) longest = [l, Math.atan2(dy, dx)]; }
  const want = ((b.rot || 0) + rotCorr) * Math.PI / 180;
  let a = longest[1];                                               // 긴 변 각도를 want 에 가장 가까운 90° 배수로 돌린다
  { let bestA = a, bestD = Infinity; for (let k = -2; k <= 2; k++) { const cand = longest[1] + k * Math.PI / 2; const d = Math.abs(Math.atan2(Math.sin(cand - want), Math.cos(cand - want))); if (d < bestD) { bestD = d; bestA = cand; } } a = bestA; }
  const ca = Math.cos(a), sa = Math.sin(a);
  const us = P.map(([x, y]) => (x - cx0) * ca + (y - cy0) * sa), vs = P.map(([x, y]) => -(x - cx0) * sa + (y - cy0) * ca);
  const umin = Math.min(...us), umax = Math.max(...us), vmin = Math.min(...vs), vmax = Math.max(...vs);
  const W = (umax - umin) * SHRINK, H = (vmax - vmin) * SHRINK;
  const uc = (umin + umax) / 2, vc = (vmin + vmax) / 2;
  const toLL = (x, y) => { // 레이아웃 0~1 → 위경도
    const u = uc + (x - 0.5) * W, v = vc + (y - 0.5) * H;
    const X = cx0 + u * ca - v * sa, Y = cy0 + u * sa + v * ca;
    return [+(-Y / KY).toFixed(7), +(X / KX).toFixed(7)];
  };
  const rect = (c) => [toLL(c.x, c.y), toLL(c.x + c.w, c.y), toLL(c.x + c.w, c.y + c.h), toLL(c.x, c.y + c.h)];
  const center = (c) => toLL(c.x + c.w / 2, c.y + c.h / 2);

  const floors = b.floors.map((f) => f.name).filter((f) => plan.floors[f]);
  const rooms = [], ent = [];
  for (const f of floors) {
    const built = LAYOUTS[plan.layout].build(plan.floors[f]);
    for (const c of built.cells) rooms.push({ f, id: String(c.id), t: c.kind === 'area' ? 'office' : 'room', poly: rect(c), c: center(c) });
    for (const x of built.fixtures) rooms.push({ f, id: LABEL[x.type], t: TYPE[x.type], poly: rect(x), c: center(x) });
    if (built.entrance) ent.push({ f, name: '출입구', ll: toLL(built.entrance.x, built.entrance.y) });
  }
  // 층별 안내판 사진이 있으면 경로를 같이 넣는다 (assets/signs/<id>/<층>.jpg, 없으면 전체.jpg)
  const signs = {};
  const dir = `assets/signs/${b.id}`;
  const any = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /\.jpe?g$/i.test(n)).sort() : [];
  const whole = any.includes('전체.jpg') ? `${dir}/전체.jpg` : any.length ? `${dir}/${any[0]}` : null; // 층별 사진이 없으면 전체(또는 첫 사진)
  for (const f of floors) { const p = `${dir}/${f}.jpg`; if (fs.existsSync(p)) signs[f] = p; else if (whole) signs[f] = whole; }
  out[no] = { floors, rooms, corr: {}, ent, gen: true, src: 'floorplans.js', signs };
  console.log(`${no.padStart(2)}호관 ${b.name}: ${floors.join(',')} 호실 ${rooms.length}개, 프레임 ${W.toFixed(0)}×${H.toFixed(0)}m, 축 ${(a * 180 / Math.PI).toFixed(1)}° (긴 변 기준, 요청 ${(want * 180 / Math.PI).toFixed(1)}°), 안내판 ${Object.keys(signs).length}장`);
}

fs.writeFileSync('data/indoor-gen.js',
  '/* inu-campus-map.html 용 실내 데이터 (data/floorplans.js 에서 생성). 생성: node tools/build_indoor.mjs */\n' +
  'const INDOOR_GEN = ' + JSON.stringify(out) + ';\n');
console.log('→ data/indoor-gen.js', Object.keys(out).length, '개 건물');
