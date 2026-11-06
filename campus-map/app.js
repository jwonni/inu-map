(() => {
  const $ = (s) => document.querySelector(s);

  // ---------- 확대/이동 가능한 지도 ----------
  function createPanZoom(container, target, { min = 0.3, max = 5, onChange } = {}) {
    const s = { scale: 1, x: 0, y: 0 };
    let drag = null;
    let moved = false;

    const apply = () => {
      target.style.transform = `translate(${s.x}px, ${s.y}px) scale(${s.scale})`;
      onChange && onChange(s);
    };
    const zoomAt = (factor, cx, cy) => {
      const ns = Math.min(max, Math.max(min, s.scale * factor));
      const k = ns / s.scale;
      s.x = cx - (cx - s.x) * k;
      s.y = cy - (cy - s.y) * k;
      s.scale = ns;
      apply();
    };
    const fit = (w, h) => {
      const r = container.getBoundingClientRect();
      s.scale = Math.min(r.width / w, r.height / h) * 0.95;
      s.x = (r.width - w * s.scale) / 2;
      s.y = (r.height - h * s.scale) / 2;
      apply();
    };
    // (px,py) 를 화면 중앙에서 dy 만큼 위로 올린 자리에 놓기 (하단 카드에 가리지 않도록)
    const centerOn = (px, py, scale, dy = 0) => {
      const r = container.getBoundingClientRect();
      if (scale) s.scale = scale;
      s.x = r.width / 2 - px * s.scale;
      s.y = r.height / 2 - dy - py * s.scale;
      apply();
    };

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = container.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    container.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, .floor-picker')) return;
      drag = { x: e.clientX, y: e.clientY, sx: s.x, sy: s.y };
      moved = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      container.classList.add('dragging');
      s.x = drag.sx + dx;
      s.y = drag.sy + dy;
      apply();
    });
    window.addEventListener('pointerup', () => { drag = null; container.classList.remove('dragging'); });

    const zoomCenter = (f) => { const r = container.getBoundingClientRect(); zoomAt(f, r.width / 2, r.height / 2); };
    return { zoomCenter, fit, centerOn, wasDragged: () => moved, state: s };
  }

  // ---------- 메인 지도 ----------
  const mapWrap = $('#mapWrap');
  const map = $('#map');
  const hotspots = $('#hotspots');
  const INDOOR_ZOOM = 4; // 실내 호실을 보여줄 때 확대 배율
  const ROOM_ZOOM = 7;   // 호실 검색 결과로 이동할 때 확대 배율

  const pin = document.createElement('div');
  pin.className = 'pin';
  pin.textContent = '📍';
  hotspots.appendChild(pin);

  const mapSvg = $('#mapSvg');
  const mapPZ = createPanZoom(mapWrap, map, {
    min: 0.4, max: 10,
    onChange: (s) => { // 확대해도 라벨/핀은 화면 크기 그대로
      mapSvg.style.setProperty('--inv', 1 / s.scale);
      pin.style.fontSize = `${30 / s.scale}px`;
    },
  });
  const fitMap = () => mapPZ.fit(MAP_SIZE.w, MAP_SIZE.h);
  const defaultFloorIdx = (b) => Math.max(0, b.floors.findIndex((f) => f.name === (b.defaultFloor || '1F')));

  const shapes = renderCartoonMap(mapSvg, BUILDINGS, MAP_FEATURES);
  BUILDINGS.forEach((b) => {
    const el = shapes[b.id];
    b._el = el;
    el.addEventListener('click', () => { if (!mapPZ.wasDragged()) openBuilding(b.id); });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBuilding(b.id); }
    });
    // 호실 데이터가 있는 건물은 초록 점 표시
    if (b.floors.some((f) => hasFloorplan(b.id, f.name))) {
      el.classList.add('has-plan');
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('class', 'plan-dot');
      dot.setAttribute('r', 5);
      const a = ((b.rot || 0) * Math.PI) / 180, cx0 = b.w / 2 - 4, cy0 = -b.h / 2 - 2;
      dot.setAttribute('cx', cx0 * Math.cos(a) - cy0 * Math.sin(a));
      dot.setAttribute('cy', cx0 * Math.sin(a) + cy0 * Math.cos(a));
      el.appendChild(dot);
    }
  });

  document.querySelectorAll('[data-zoom]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const z = btn.dataset.zoom;
      if (z === 'reset') fitMap();
      else mapPZ.zoomCenter(z === 'in' ? 1.25 : 0.8);
    })
  );

  // ---------- 하단 카드 + 실내 호실 ----------
  const panel = $('#panel');
  const roomInfo = $('#roomInfo');
  const roomHint = $('#roomHint');
  let current = null;
  let currentFloor = 0;
  let rooms = null;      // 현재 층의 호실 요소들
  let activeRoom = null;

  function openBuilding(id, floorIdx) {
    const b = BUILDINGS.find((x) => x.id === id);
    if (!b) return;
    if (floorIdx == null) floorIdx = defaultFloorIdx(b);
    if (current && current !== b) clearIndoor(current.id);
    current = b;

    BUILDINGS.forEach((x) => x._el.classList.toggle('active', x === b));
    pin.style.display = 'block';
    pin.style.left = `${b.x}px`;
    pin.style.top = `${b.y - Math.max(b.w, b.h) / 2 - 2}px`;
    pin.style.animation = 'none'; void pin.offsetWidth; pin.style.animation = '';

    $('#pName').textContent = b.name;
    $('#pSub').textContent = b.sub || '';

    // 층 버튼: 네이버처럼 위층이 위에 오도록 역순
    const tabs = $('#floorTabs');
    tabs.innerHTML = '';
    [...b.floors].map((f, i) => [f, i]).reverse().forEach(([f, i]) => {
      const t = document.createElement('button');
      t.dataset.idx = i;
      t.textContent = f.name.replace(/F$/, ''); // 1F → 1, B1 → B1
      if (f.label) { const s = document.createElement('small'); s.textContent = f.label; t.appendChild(s); }
      if (!hasFloorplan(b.id, f.name)) { t.classList.add('no-plan'); t.title = '호실 정보 준비 중'; }
      t.addEventListener('click', () => selectFloor(i));
      tabs.appendChild(t);
    });

    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');

    // 건물을 화면 중앙으로. 호실 데이터가 있으면 실내가 보이도록 크게 확대
    const hasPlan = b.floors.some((f) => hasFloorplan(b.id, f.name));
    mapPZ.centerOn(b.x, b.y, hasPlan ? INDOOR_ZOOM : Math.max(mapPZ.state.scale, 1.5));
    selectFloor(floorIdx);
  }
  // 위/아래 화살표: 한 층씩 이동
  $('#fpUp').addEventListener('click', () => current && selectFloor(Math.min(current.floors.length - 1, currentFloor + 1)));
  $('#fpDown').addEventListener('click', () => current && selectFloor(Math.max(0, currentFloor - 1)));

  function highlightRoom(id) {
    if (activeRoom) activeRoom.classList.remove('active');
    activeRoom = rooms && rooms[id] ? rooms[id] : null;
    if (activeRoom) {
      activeRoom.classList.add('active');
      $('#roomName').textContent = /^B?\d/.test(id) ? `${id}호` : id;
      $('#roomWhere').textContent = `${current.floors[currentFloor].name}`;
      roomInfo.classList.add('show');
    } else roomInfo.classList.remove('show');
  }

  function selectFloor(i) {
    if (!current) return;
    currentFloor = i;
    const f = current.floors[i];
    [...$('#floorTabs').children].forEach((t) => {
      const on = Number(t.dataset.idx) === i;
      t.classList.toggle('active', on);
      if (on) t.scrollIntoView({ block: 'nearest' });
    });
    const hash = `#${current.id}/${f.name}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);

    rooms = null; activeRoom = null;
    roomInfo.classList.remove('show');
    if (hasFloorplan(current.id, f.name)) {
      rooms = renderIndoor(current.id, f.name, (id) => highlightRoom(id));
      roomHint.classList.remove('show');
    } else {
      clearIndoor(current.id);
      roomHint.textContent = '호실 정보 없음';
      roomHint.classList.add('show');
    }
  }

  function closePanel() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    BUILDINGS.forEach((x) => x._el.classList.remove('active'));
    if (current) clearIndoor(current.id);
    rooms = null; activeRoom = null;
    roomInfo.classList.remove('show');
    pin.style.display = 'none';
    current = null;
    history.replaceState(null, '', location.pathname);
  }
  $('#closeBtn').addEventListener('click', closePanel);

  // 키보드: ESC 닫기, ←/→ 층 이동
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') closePanel();
    if (!current) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') selectFloor(Math.min(current.floors.length - 1, currentFloor + 1));
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') selectFloor(Math.max(0, currentFloor - 1));
  });

  // ---------- 검색 (건물 + 호실 번호) ----------
  const input = $('#searchInput');
  const results = $('#searchResults');
  let activeIdx = -1;

  // 검색어 해석: "7호관 403호", "정보기술대학 403", "14호관202", "403" 모두 지원
  //  - 끝에 오는 3자리 이상 숫자(B105, 506-1 포함)를 호실로, 그 앞부분을 건물로 봄
  const bldgMatches = (b, part) => (b.name + b.sub).replace(/\s/g, '').toUpperCase().includes(part);
  function searchHits(raw) {
    const q = raw.replace(/\s/g, '').toUpperCase();
    const m = q.match(/(B?\d{3,}(?:-\d+)?)호?$/);
    const roomPart = m ? m[1] : null;
    const bldgPart = m ? q.slice(0, m.index) : q;
    const hits = [];
    if (!roomPart || !bldgPart) {
      BUILDINGS.filter((b) => bldgMatches(b, q)).forEach((b) => hits.push({ type: 'building', id: b.id, b }));
    }
    if (roomPart) {
      const scope = bldgPart ? BUILDINGS.filter((b) => bldgMatches(b, bldgPart)).map((b) => b.id) : null;
      findRooms(roomPart)
        .filter((r) => !scope || scope.includes(r.buildingId))
        .sort((a, b) => (a.room === roomPart ? 0 : 1) - (b.room === roomPart ? 0 : 1)) // 정확히 일치하는 호실 먼저
        .slice(0, 12)
        .forEach((r) => hits.push({ type: 'room', id: r.buildingId, floor: r.floor, room: r.room, b: BUILDINGS.find((x) => x.id === r.buildingId) }));
    }
    return hits;
  }
  function renderResults() {
    const q = input.value.trim().replace(/\s/g, '');
    results.innerHTML = '';
    activeIdx = -1;
    if (!q) return results.classList.remove('show');
    const hits = searchHits(q);
    if (!hits.length) results.innerHTML = '<li>검색 결과가 없습니다</li>';
    hits.forEach((h) => {
      const li = document.createElement('li');
      li.innerHTML = h.type === 'room'
        ? `<span class="tag">${h.floor}</span>${h.room}호<small>${h.b.name}</small>`
        : `${h.b.name}${h.b.sub ? `<small>${h.b.sub}</small>` : ''}`;
      li.addEventListener('mousedown', () => pick(h));
      results.appendChild(li);
    });
    results.classList.add('show');
  }
  function pick(h) {
    input.value = '';
    results.classList.remove('show');
    if (h.type === 'room') {
      openBuilding(h.id, h.b.floors.findIndex((f) => f.name === h.floor));
      highlightRoom(h.room);
      // 찾은 호실이 화면 가운데 오도록 더 확대
      if (activeRoom && activeRoom.dataset.mx)
        mapPZ.centerOn(+activeRoom.dataset.mx, +activeRoom.dataset.my, Math.max(mapPZ.state.scale, ROOM_ZOOM));
    } else openBuilding(h.id);
  }
  input.addEventListener('input', renderResults);
  input.addEventListener('blur', () => setTimeout(() => results.classList.remove('show'), 100));
  input.addEventListener('keydown', (e) => {
    const items = [...results.querySelectorAll('li')];
    if (e.key === 'ArrowDown') activeIdx = Math.min(items.length - 1, activeIdx + 1);
    else if (e.key === 'ArrowUp') activeIdx = Math.max(0, activeIdx - 1);
    else if (e.key === 'Enter') {
      const hits = searchHits(input.value.trim().replace(/\s/g, ''));
      if (hits.length) pick(hits[Math.max(0, activeIdx)]);
      return;
    } else return;
    items.forEach((li, i) => li.classList.toggle('active', i === activeIdx));
  });

  // ---------- 초기화 ----------
  fitMap();
  // #건물id 또는 #건물id/층 (예: #it/3F)
  const [id, floor] = location.hash.slice(1).split('/');
  if (id) {
    const b = BUILDINGS.find((x) => x.id === id);
    const fi = b && floor ? b.floors.findIndex((f) => f.name === decodeURIComponent(floor)) : -1;
    openBuilding(id, fi >= 0 ? fi : undefined);
  }
  window.addEventListener('resize', () => { if (!current) fitMap(); });
})();
