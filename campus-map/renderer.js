/*
 * 카툰 스타일 캠퍼스 지도 렌더러 (SVG)
 *   renderCartoonMap(svg, buildings, features) → { [buildingId]: <g> }
 *   renderIndoor(buildingId, floorName, onRoomClick) → { [roomId]: <g> }   // 건물 안에 호실 배치 그리기
 *   clearIndoor(buildingId)
 *
 * 레이아웃 종류 (floorplans.js 의 layout)
 *   'U' : 두 날개(A동/B동) + 아래 베이스
 *   'I' : 일자형, 가운데 복도 양쪽에 호실 (top / bottom 행, 왼쪽→오른쪽)
 * 행 배열에는 호실 번호 외에 '#st'(계단) '#wc'(화장실) '#ev'(엘리베이터) 토큰을 섞어 쓸 수 있습니다.
 */
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  };
  const pts = (arr) => arr.map((p) => p.join(',')).join(' ');
  const smooth = (arr) => {
    if (arr.length < 3) return arr.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
    let d = `M${arr[0][0]} ${arr[0][1]}`;
    for (let i = 1; i < arr.length - 1; i++) {
      const mx = (arr[i][0] + arr[i + 1][0]) / 2, my = (arr[i][1] + arr[i + 1][1]) / 2;
      d += ` Q${arr[i][0]} ${arr[i][1]} ${mx} ${my}`;
    }
    const l = arr[arr.length - 1];
    return d + ` L${l[0]} ${l[1]}`;
  };
  const rng = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // 글자가 거꾸로 보이지 않도록: 최종 화면 각도를 (-90, 90] 범위로 맞추는 보정 회전값
  const norm = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
  const readable = (a) => { a = norm(a); return a > 90 || a <= -90 ? norm(a + 180) : a; };
  const fixAngle = (frameRot, base) => readable(frameRot + base) - frameRot;
  // data/*.js 의 top-level const 는 window 속성이 아니므로 식별자로 직접 참조
  const FP = typeof FOOTPRINTS !== 'undefined' ? FOOTPRINTS : {};
  const FPX = typeof EXTRA_FOOTPRINTS !== 'undefined' ? EXTRA_FOOTPRINTS : [];
  const PLANS = typeof FLOORPLANS !== 'undefined' ? FLOORPLANS : {};

  const C = {
    forest: '#a8d98a', forestDark: '#7fbf63', campus: '#e8f3dc',
    park: '#b9e0a1', water: '#8fd0f5', waterDeep: '#64b8ec', city: '#ecebe6', cityBlock: '#d9d7cf',
    road: '#fff7e6', roadEdge: '#4a4a4a', outline: '#3b3b3b', side: '#b8b3a8',
    bldg: ['#ffffff', '#f3f6ff', '#fdf3e7', '#eefaf0'],
  };

  // ---------- 소품 ----------
  function tree(parent, x, y, r, rnd) {
    const g = el('g', { class: 'tree' }, parent);
    el('ellipse', { cx: x + 2, cy: y + r * 0.9, rx: r * 0.9, ry: r * 0.35, fill: 'rgba(0,0,0,.12)' }, g);
    el('rect', { x: x - r * 0.15, y, width: r * 0.3, height: r * 0.9, fill: '#8a6a45' }, g);
    el('circle', { cx: x, cy: y - r * 0.2, r, fill: rnd() > 0.5 ? '#4f9f4a' : '#5aab52', stroke: C.outline, 'stroke-width': 1.3 }, g);
    el('circle', { cx: x - r * 0.3, cy: y - r * 0.45, r: r * 0.5, fill: '#8fd37a' }, g);
  }
  function waves(parent, x, y, n = 3) {
    for (let i = 0; i < n; i++)
      el('path', { d: `M${x} ${y + i * 9} q6 -4 12 0 t12 0 t12 0`, fill: 'none', stroke: '#fff', 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: .8 }, parent);
  }
  function field(parent, f) {
    const g = el('g', { transform: `translate(${f.cx} ${f.cy}) rotate(${f.rot})` }, parent);
    const x = -f.w / 2, y = -f.h / 2;
    const base = { x, y, width: f.w, height: f.h, stroke: C.outline, 'stroke-width': 2, rx: 6 };
    const W = { fill: 'none', stroke: '#fff', 'stroke-width': 1.4 };
    if (f.type === 'track') {
      el('rect', { ...base, rx: f.h / 2, fill: '#e58a6a' }, g);
      el('rect', { x: x + 10, y: y + 10, width: f.w - 20, height: f.h - 20, rx: (f.h - 20) / 2, fill: '#6cc46a', stroke: '#fff', 'stroke-width': 1.5 }, g);
      el('rect', { x: x + 5, y: y + 5, width: f.w - 10, height: f.h - 10, rx: (f.h - 10) / 2, ...W, 'stroke-dasharray': '4 3' }, g);
    } else if (f.type === 'soccer') {
      el('rect', { ...base, fill: '#6cc46a' }, g);
      el('rect', { x: x + 5, y: y + 5, width: f.w - 10, height: f.h - 10, ...W }, g);
      el('line', { x1: 0, y1: y + 5, x2: 0, y2: -y - 5, ...W }, g);
      el('circle', { cx: 0, cy: 0, r: f.h / 6, ...W }, g);
    } else if (f.type === 'basketball') {
      el('rect', { ...base, fill: '#f2a35e' }, g);
      el('line', { x1: 0, y1: y + 3, x2: 0, y2: -y - 3, ...W }, g);
      el('circle', { cx: 0, cy: 0, r: f.h / 6, ...W }, g);
    } else if (f.type === 'tennis') {
      el('rect', { ...base, fill: '#4fa5d8' }, g);
      el('rect', { x: x + 6, y: y + 6, width: f.w - 12, height: f.h - 12, ...W }, g);
      el('line', { x1: 0, y1: y + 6, x2: 0, y2: -y - 6, ...W }, g);
    } else if (f.type === 'golf') {
      el('rect', { ...base, fill: '#8ed66f' }, g);
      el('circle', { cx: f.w / 4, cy: 0, r: 3, fill: '#fff', stroke: C.outline, 'stroke-width': 1 }, g);
      el('line', { x1: f.w / 4, y1: 0, x2: f.w / 4, y2: -9, stroke: C.outline, 'stroke-width': 1.2 }, g);
      el('polygon', { points: `${f.w / 4},-9 ${f.w / 4 + 7},-6.5 ${f.w / 4},-4`, fill: '#e74c3c' }, g);
    }
    const tg = el('g', { transform: `rotate(${-f.rot})` }, g);
    el('text', { x: 0, y: f.h / 2 + 12, class: 'lbl-place', 'text-anchor': 'middle' }, tg).textContent = f.label;
  }

  // ---------- 레이아웃 생성기 (0~1 좌표) ----------
  // 생성 결과: { cells:[{id,x,y,w,h,kind?}], fixtures:[{type:'st'|'wc'|'ev',x,y,w,h}], corridors:[{x,y,w,h}], labels:[{x,y,text}], entrance:{x,y}|null }
  const splitCells = (cells) => {
    const out = [];
    cells.forEach((c) => {
      if (Array.isArray(c.id)) { // 한 칸을 둘로 나누기 (['109','110'])
        const n = c.id.length, horiz = c.w >= c.h;
        c.id.forEach((id, i) => out.push(horiz
          ? { ...c, id, x: c.x + (i * c.w) / n, w: c.w / n }
          : { ...c, id, y: c.y + (i * c.h) / n, h: c.h / n }));
      } else out.push(c);
    });
    return out;
  };

  // U자형: 왼쪽 A동 날개 + 오른쪽 B동 날개 + 아래 베이스. 바깥 열 맨 위 계단, 안쪽 열 아래 계단+EV, 바깥 열 아래 WC
  const U = { wingW: 0.30, colW: 0.13, baseTop: 0.74, topH: 0.10, wingBottom: 0.66, stairsH: 0.07 };
  const U_OUTLINE = [[0, 0], [U.wingW, 0], [U.wingW, U.baseTop], [1 - U.wingW, U.baseTop], [1 - U.wingW, 0], [1, 0], [1, 1], [0, 1]];
  function buildU(fl) {
    const cells = [], fixtures = [], corridors = [], labels = [];
    const col = (ids, x0, hasTop, outer) => {
      if (!ids || !ids.length) return;
      const top = (hasTop ? U.topH : 0.02) + (outer ? U.stairsH : 0);
      const h = (U.wingBottom - top) / ids.length;
      ids.forEach((id, i) => cells.push({ id, x: x0, y: U.wingBottom - (i + 1) * h, w: U.colW, h })); // 아래→위
    };
    const topRow = (ids, x0) => {
      if (!ids || !ids.length) return;
      const w = U.wingW / ids.length;
      ids.forEach((id, i) => cells.push({ id, x: x0 + i * w, y: 0, w, h: U.topH }));
    };
    const corner = (ids, x0) => {
      if (!ids || !ids.length) return;
      const h = (1 - U.baseTop - 0.02) / ids.length;
      ids.forEach((id, i) => cells.push({ id, x: x0, y: U.baseTop + 0.01 + i * h, w: U.colW, h })); // 위→아래
    };
    col(fl.A_outer, 0, fl.top_A?.length, true);
    col(fl.A_inner, U.wingW - U.colW, fl.top_A?.length, false);
    col(fl.B_inner, 1 - U.wingW, fl.top_B?.length, false);
    col(fl.B_outer, 1 - U.colW, fl.top_B?.length, true);
    topRow(fl.top_A, 0); topRow(fl.top_B, 1 - U.wingW);
    corner(fl.A_corner, 0); corner(fl.B_corner, 1 - U.colW);
    if (fl.base && fl.base.length) {
      const x0 = U.colW + 0.02, x1 = 1 - U.colW - 0.02, w = (x1 - x0) / fl.base.length;
      fl.base.forEach((id, i) => cells.push({ id, x: x0 + i * w, y: 0.80, w, h: 0.15 }));
    }
    (fl.free || []).forEach((c) => cells.push({ ...c }));
    // 복도
    const gapW = U.wingW - 2 * U.colW;
    corridors.push({ x: U.colW, y: 0.02, w: gapW, h: U.wingBottom - 0.02 });
    corridors.push({ x: 1 - U.wingW + U.colW, y: 0.02, w: gapW, h: U.wingBottom - 0.02 });
    corridors.push({ x: U.colW, y: U.baseTop, w: 1 - 2 * U.colW, h: 0.06 });
    // 계단 / WC / EV
    const topA = fl.top_A?.length ? U.topH : 0.02, topB = fl.top_B?.length ? U.topH : 0.02;
    const lowH = U.baseTop - U.wingBottom;
    fixtures.push({ type: 'st', x: 0, y: topA, w: U.colW, h: U.stairsH });
    fixtures.push({ type: 'st', x: 1 - U.colW, y: topB, w: U.colW, h: U.stairsH });
    fixtures.push({ type: 'st', x: U.wingW - U.colW, y: U.wingBottom, w: U.colW, h: lowH });
    fixtures.push({ type: 'st', x: 1 - U.wingW, y: U.wingBottom, w: U.colW, h: lowH });
    fixtures.push({ type: 'wc', x: 0, y: U.wingBottom, w: U.colW, h: lowH });
    fixtures.push({ type: 'wc', x: 1 - U.colW, y: U.wingBottom, w: U.colW, h: lowH });
    fixtures.push({ type: 'ev', x: U.colW, y: U.wingBottom + lowH * 0.15, w: gapW, h: lowH * 0.7 });
    fixtures.push({ type: 'ev', x: 1 - U.wingW + U.colW, y: U.wingBottom + lowH * 0.15, w: gapW, h: lowH * 0.7 });
    labels.push({ x: U.wingW / 2, y: 1, dy: 4, text: 'A동' });
    labels.push({ x: 1 - U.wingW / 2, y: 1, dy: 4, text: 'B동' });
    return { cells: splitCells(cells), fixtures, corridors, labels, entrance: fl.entrance ? { x: 0.5, y: 1 } : null };
  }

  // 일자형: 가운데 복도, top 행(위) / bottom 행(아래), 왼쪽→오른쪽. 토큰 '#st' '#wc' '#ev' 는 시설
  const I = { rowH: 0.38, corrY: 0.42, corrH: 0.16, pad: 0.015 };
  const I_OUTLINE = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const TOKEN_W = { '#st': 0.7, '#wc': 0.7, '#ev': 0.45, '#_': 0.5 }; // 호실 한 칸 너비 대비. '#_' 는 빈 복도(동 사이 틈)
  function buildI(fl) {
    const cells = [], fixtures = [], corridors = [], labels = [];
    const row = (items, y) => {
      if (!items || !items.length) return;
      const units = items.reduce((s, it) => s + (TOKEN_W[it] || 1), 0);
      const unit = (1 - 2 * I.pad) / units;
      let x = I.pad;
      items.forEach((it) => {
        const w = unit * (TOKEN_W[it] || 1);
        if (it === '#_') { /* 빈 칸 */ }
        else if (TOKEN_W[it]) fixtures.push({ type: it.slice(1), x, y, w, h: I.rowH });
        else cells.push({ id: it, x, y, w, h: I.rowH });
        x += w;
      });
    };
    row(fl.top, 0.02);
    row(fl.bottom, 1 - 0.02 - I.rowH);
    (fl.free || []).forEach((c) => cells.push({ ...c }));
    corridors.push({ x: I.pad, y: I.corrY, w: 1 - 2 * I.pad, h: I.corrH });
    return { cells: splitCells(cells), fixtures, corridors, labels, entrance: fl.entrance ? { x: 0, y: 0.5, side: 'left' } : null };
  }

  const LAYOUTS = { U: { outline: U_OUTLINE, build: buildU }, I: { outline: I_OUTLINE, build: buildI } };

  // ---------- 건물 ----------
  function footprintPx(b) {
    // 추출한 윤곽 우선. footprint:'layout' 이면 레이아웃 윤곽, 둘 다 없으면 사각형
    const plan = PLANS[b.id];
    if (b.footprint !== 'layout' && FP[b.id]) return { abs: FP[b.id].map(([x, y]) => [x - b.x, y - b.y]) };
    if (plan && LAYOUTS[plan.layout]) return { local: LAYOUTS[plan.layout].outline.map(([x, y]) => [x * b.w - b.w / 2, y * b.h - b.h / 2]) };
    return { local: [[-b.w / 2, -b.h / 2], [b.w / 2, -b.h / 2], [b.w / 2, b.h / 2], [-b.w / 2, b.h / 2]] };
  }

  function building(parent, labelsParent, b, idx) {
    const g = el('g', { class: 'bldg', 'data-id': b.id, transform: `translate(${b.x} ${b.y})`, tabindex: 0, role: 'button' }, parent);
    g.setAttribute('aria-label', b.name);
    const fp = footprintPx(b);
    const shape = fp.local ? el('g', { transform: `rotate(${b.rot || 0})` }, g) : el('g', {}, g);
    const poly = fp.local || fp.abs;
    const roof = b.color || C.bldg[idx % C.bldg.length];
    const d = 6;
    el('polygon', { points: pts(poly.map(([x, y]) => [x + 4, y + 8])), fill: 'rgba(0,0,0,.18)' }, shape);
    el('polygon', { points: pts(poly.map(([x, y]) => [x, y + d])), fill: C.side, stroke: C.outline, 'stroke-width': 2, 'stroke-linejoin': 'round' }, shape);
    el('polygon', { points: pts(poly), fill: roof, stroke: C.outline, 'stroke-width': 2, 'stroke-linejoin': 'round', class: 'roof' }, shape);
    const cid = `clip-${b.id}`;
    const clip = el('clipPath', { id: cid }, shape);
    el('polygon', { points: pts(poly) }, clip);
    const win = el('g', { 'clip-path': `url(#${cid})`, class: 'windows' }, shape);
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    for (let y = y0 + 5; y < y1 - 3; y += 9) for (let x = x0 + 5; x < x1 - 3; x += 9)
      el('rect', { x, y, width: 4.5, height: 3.5, rx: 1, fill: 'rgba(60,80,120,.2)' }, win);
    // 실내(호실) 레이어 자리
    el('g', { class: 'indoor', transform: `rotate(${b.rot || 0})` }, g);
    // 라벨: 건물에 가려지지 않도록 별도 레이어에, 윤곽의 가장 아래 지점 아래에 배치
    const a = ((fp.local ? b.rot || 0 : 0) * Math.PI) / 180;
    const bottom = Math.max(...poly.map(([x, y]) => x * Math.sin(a) + y * Math.cos(a)));
    const lg = el('g', { transform: `translate(${b.x} ${b.y})`, class: 'bldg-label', 'data-id': b.id }, labelsParent);
    (b.wings || []).forEach((w) => {
      el('text', { x: w.x - b.x, y: w.y - b.y, class: 'lbl-wing', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, lg).textContent = w.name;
    });
    const t = el('text', { x: 0, y: bottom + 12, class: 'lbl-bldg', 'text-anchor': 'middle' }, lg);
    [b.name, b.sub].filter(Boolean).forEach((ln, i) => {
      const ts = el('tspan', { x: 0, dy: i ? 13 : 0 }, t);
      if (i) ts.setAttribute('class', 'sub');
      ts.textContent = ln;
    });
    return g;
  }

  // ---------- 실내 호실 렌더링 ----------
  const shapesById = {};
  const bById = {};

  window.renderIndoor = function (id, floorName, onRoomClick) {
    const b = bById[id], g = shapesById[id], plan = PLANS[id];
    if (!b || !g || !plan || !LAYOUTS[plan.layout]) return null;
    const fl = plan.floors[floorName];
    const layer = g.querySelector('.indoor');
    layer.innerHTML = '';
    if (!fl) return null;
    g.classList.add('indoor-on');
    const L = LAYOUTS[plan.layout], built = L.build(fl);
    const W = b.w, H = b.h, rot = b.rot || 0;
    const px = (x) => x * W - W / 2, py = (y) => y * H - H / 2;
    const hAng = fixAngle(rot, 0);
    const text = (parent, x, y, txt, fs, cls, ang = hAng) =>
      (el('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': fs, class: cls || '', transform: ang ? `rotate(${ang} ${x} ${y})` : '' }, parent).textContent = txt);

    el('polygon', { points: pts(L.outline.map(([x, y]) => [px(x), py(y)])), class: 'floor-base' }, layer);
    built.corridors.forEach((c) => el('rect', { x: px(c.x), y: py(c.y), width: c.w * W, height: c.h * H, class: 'corridor' }, layer));

    built.fixtures.forEach((f) => {
      const X = px(f.x), Y = py(f.y), Wd = f.w * W, Ht = f.h * H;
      if (f.type === 'st') {
        const sg = el('g', { class: 'stairs-g' }, layer);
        el('rect', { x: X, y: Y, width: Wd, height: Ht, class: 'stairs' }, sg);
        const vertical = Ht >= Wd, len = vertical ? Ht : Wd, n = Math.max(3, Math.round(len / 0.9));
        for (let i = 1; i < n; i++) {
          const t = (len * i) / n;
          if (vertical) el('line', { x1: X + 0.3, y1: Y + t, x2: X + Wd - 0.3, y2: Y + t, class: 'stairs-steps' }, sg);
          else el('line', { x1: X + t, y1: Y + 0.3, x2: X + t, y2: Y + Ht - 0.3, class: 'stairs-steps' }, sg);
        }
      } else {
        const tg = el('g', { class: f.type === 'wc' ? 'toilet' : 'elev' }, layer);
        el('rect', { x: X, y: Y, width: Wd, height: Ht, rx: 0.3 }, tg);
        text(tg, X + Wd / 2, Y + Ht / 2, f.type.toUpperCase(), Math.min(Wd, Ht) * 0.55);
      }
    });

    const rooms = {};
    built.cells.forEach((c) => {
      const rg = el('g', { class: 'room' + (c.kind === 'area' ? ' area' : ''), 'data-room': c.id, tabindex: 0 }, layer);
      const w = c.w * W, h = c.h * H;
      el('rect', { x: px(c.x), y: py(c.y), width: w, height: h, rx: 0.4 }, rg);
      const vertical = h > w * 1.25;
      const len = vertical ? h : w, thick = vertical ? w : h;
      const fs = Math.max(1.1, Math.min(len / (String(c.id).length * 0.62 + 0.6), thick * 0.72, c.kind === 'area' ? 4 : 3.2));
      text(rg, px(c.x) + w / 2, py(c.y) + h / 2, c.id, fs, '', fixAngle(rot, vertical ? -90 : 0));
      rg.addEventListener('click', (e) => { e.stopPropagation(); onRoomClick && onRoomClick(c.id, rg); });
      rooms[c.id] = rg;
    });

    if (built.entrance) {
      const e = built.entrance, X = px(e.x), Y = py(e.y);
      const eg = el('g', { class: 'entrance' }, layer);
      const arrow = e.side === 'left' ? `M${X} ${Y - 3} L${X + 3} ${Y} L${X} ${Y + 3}` : `M${X - 3} ${Y} L${X} ${Y + 3} L${X + 3} ${Y}`;
      el('path', { d: arrow, fill: 'none', stroke: '#e74c3c', 'stroke-width': 0.8, 'stroke-linecap': 'round' }, eg);
      text(layer, e.side === 'left' ? X - 6 : X, e.side === 'left' ? Y : Y + 7, '입구', 3, 'entrance-lbl');
    }
    built.labels.forEach((l) => text(layer, px(l.x), py(l.y) + (l.dy || 0), l.text, 3, 'wing-lbl'));
    return rooms;
  };

  window.clearIndoor = function (id) {
    const g = shapesById[id];
    if (!g) return;
    g.classList.remove('indoor-on');
    g.querySelector('.indoor').innerHTML = '';
  };

  window.hasFloorplan = (id, floorName) => !!PLANS[id]?.floors?.[floorName];
  window.findRooms = (q) => {
    const out = [];
    for (const [bid, plan] of Object.entries(PLANS)) {
      const L = LAYOUTS[plan.layout];
      if (!L) continue;
      for (const [fname, fl] of Object.entries(plan.floors))
        L.build(fl).cells.forEach((c) => { if (String(c.id).includes(q)) out.push({ buildingId: bid, floor: fname, room: c.id }); });
    }
    return out;
  };

  // ---------- 전체 지도 ----------
  window.renderCartoonMap = function (svg, buildings, F) {
    const rnd = rng(42);
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${MAP_SIZE.w} ${MAP_SIZE.h}`);
    const defs = el('defs', {}, svg);
    const pat = el('pattern', { id: 'grid', width: 24, height: 24, patternUnits: 'userSpaceOnUse' }, defs);
    el('circle', { cx: 2, cy: 2, r: 1, fill: 'rgba(0,0,0,.06)' }, pat);

    el('rect', { width: MAP_SIZE.w, height: MAP_SIZE.h, fill: C.city }, svg);
    el('rect', { width: MAP_SIZE.w, height: MAP_SIZE.h, fill: 'url(#grid)' }, svg);

    const city = el('g', {}, svg);
    F.cityBlocks.forEach(([cx, cy, w, h]) => {
      const g = el('g', { transform: `translate(${cx} ${cy}) rotate(${AX})` }, city);
      el('rect', { x: -w / 2 + 3, y: -h / 2 + 6, width: w, height: h, rx: 3, fill: 'rgba(0,0,0,.1)' }, g);
      el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 3, fill: C.cityBlock, stroke: '#b9b6ac', 'stroke-width': 1.5 }, g);
    });

    el('polygon', { points: pts(F.forest), fill: C.forest, stroke: C.forestDark, 'stroke-width': 3, 'stroke-linejoin': 'round' }, svg);
    el('polygon', { points: pts(F.park), fill: C.park, stroke: C.forestDark, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, svg);
    el('polygon', { points: pts(F.sea), fill: C.water, stroke: C.waterDeep, 'stroke-width': 3 }, svg);
    waves(svg, 40, 740); waves(svg, 120, 780); waves(svg, 60, 810);
    el('path', { d: smooth(F.river), fill: C.water, stroke: C.waterDeep, 'stroke-width': 2.5 }, svg);
    F.lakes.forEach((l) => {
      el('ellipse', { cx: l.cx, cy: l.cy, rx: l.rx, ry: l.ry, transform: `rotate(${l.rot} ${l.cx} ${l.cy})`, fill: C.water, stroke: C.waterDeep, 'stroke-width': 2.5 }, svg);
      waves(svg, l.cx - 18, l.cy - 10, 2);
    });

    el('polygon', { points: pts(F.campus), fill: C.campus, stroke: C.outline, 'stroke-width': 3.5, 'stroke-linejoin': 'round' }, svg);
    el('polygon', { points: pts(F.campus), fill: 'none', stroke: '#fff', 'stroke-width': 1.2, 'stroke-dasharray': '6 5', 'stroke-linejoin': 'round' }, svg);

    const trees = el('g', {}, svg);
    const inPoly = (px, py, poly) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const placed = [];
    for (let i = 0; i < 400 && placed.length < 70; i++) {
      const x = rnd() * 460, y = rnd() * 520;
      if (!inPoly(x, y, F.forest)) continue;
      if (F.lakes.some((l) => Math.hypot(x - l.cx, y - l.cy) < l.ry + 12)) continue;
      if (placed.some((p) => Math.hypot(p[0] - x, p[1] - y) < 22)) continue;
      placed.push([x, y]);
    }
    placed.sort((a, b) => a[1] - b[1]).forEach(([x, y]) => tree(trees, x, y, 7 + rnd() * 4, rnd));
    [[60, 735], [150, 770], [230, 790], [300, 825], [40, 640], [110, 690], [210, 745], [330, 800]].forEach(([x, y]) => tree(trees, x, y, 7, rnd));

    const roads = el('g', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }, svg);
    F.roads.forEach((r) => el('path', { d: smooth(r.pts), stroke: C.roadEdge, 'stroke-width': r.w + 3 }, roads));
    F.roads.forEach((r) => el('path', { d: smooth(r.pts), stroke: C.road, 'stroke-width': r.w }, roads));
    F.roads.filter((r) => r.main).forEach((r) => el('path', { d: smooth(r.pts), stroke: '#f3c248', 'stroke-width': 1.5, 'stroke-dasharray': '8 6' }, roads));
    F.roundabouts.forEach((o) => {
      el('circle', { cx: o.cx, cy: o.cy, r: o.r, fill: C.road, stroke: C.roadEdge, 'stroke-width': 3 }, roads);
      el('circle', { cx: o.cx, cy: o.cy, r: o.r - 8, fill: '#8ed66f', stroke: C.roadEdge, 'stroke-width': 2 }, roads);
    });

    F.fields.forEach((f) => field(svg, f));
    F.streams.forEach((s) => el('path', { d: smooth(s), fill: 'none', stroke: C.water, 'stroke-width': 6, 'stroke-linecap': 'round' }, svg));
    F.ponds.forEach((p) => el('ellipse', { cx: p.cx, cy: p.cy, rx: p.rx, ry: p.ry, transform: `rotate(${p.rot} ${p.cx} ${p.cy})`, fill: C.water, stroke: C.waterDeep, 'stroke-width': 2 }, svg));
    [[600, 160], [640, 185], [740, 250], [800, 290], [850, 330], [700, 560], [760, 610], [430, 600], [450, 620], [330, 650], [640, 460]]
      .forEach(([x, y]) => tree(svg, x, y, 6, rnd));
    F.placeLabels.forEach((p) => { el('text', { x: p.x, y: p.y, class: 'lbl-place', 'text-anchor': 'middle' }, svg).textContent = p.text; });

    const bg = el('g', { id: 'buildings' }, svg);
    FPX.forEach((poly) => {
      el('polygon', { points: pts(poly.map(([x, y]) => [x, y + 5])), fill: C.side, stroke: C.outline, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, bg);
      el('polygon', { points: pts(poly), fill: '#f4f4f1', stroke: C.outline, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, bg);
    });
    const labels = el('g', { id: 'labels', 'pointer-events': 'none' });
    const map = {};
    [...buildings].sort((a, b) => a.y - b.y).forEach((b, i) => {
      map[b.id] = building(bg, labels, b, i);
      shapesById[b.id] = map[b.id];
      bById[b.id] = b;
    });
    svg.appendChild(labels);

    const cp = el('g', { transform: 'translate(920 90)' }, svg);
    el('circle', { r: 22, fill: '#fff', stroke: C.outline, 'stroke-width': 2 }, cp);
    el('polygon', { points: '0,-16 6,0 0,-4 -6,0', fill: '#e74c3c', stroke: C.outline, 'stroke-width': 1 }, cp);
    el('polygon', { points: '0,16 6,0 0,4 -6,0', fill: '#fff', stroke: C.outline, 'stroke-width': 1 }, cp);
    el('text', { y: -26, class: 'lbl-place', 'text-anchor': 'middle', 'font-weight': 800 }, cp).textContent = 'N';
    return map;
  };
})();
