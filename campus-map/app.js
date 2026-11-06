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
      moved = false;
      if (e.target.closest('button, .floor-picker, .event-marker') || window.campusEventPlacement) return;
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
    announceLocation();
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
    announceLocation(id);
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
      rooms = renderIndoor(current.id, f.name, (id) => { if (!mapPZ.wasDragged()) highlightRoom(id); });
      roomHint.classList.remove('show');
    } else {
      clearIndoor(current.id);
      roomHint.textContent = '호실 정보 없음';
      roomHint.classList.add('show');
    }
    // 층을 바꾸면 이전 호실 선택도 해제합니다.
    updateGuide();
    if (window.campusEventEditing) announceLocation();
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
    updateGuide();
    history.replaceState(null, '', location.pathname);
  }
  $('#closeBtn').addEventListener('click', closePanel);

  // 키보드: ESC 닫기, ←/→ 층 이동
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, button, #eventSidebar')) return;
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
  //  - "11호관 식당" 처럼 이름 붙은 공간도 찾음: 건물 이름/소제목이 검색어 앞부분과 일치하면 나머지를 호실(이름)로 봄
  const normKey = (s) => (s || '').replace(/\s/g, '').toUpperCase();
  function searchHits(raw) {
    const q = normKey(raw);
    const hits = [];
    // 1) 건물 이름/소제목으로 시작하는 검색어 → 그 건물 안에서 나머지 글자로 호실 검색
    const scoped = [];
    BUILDINGS.forEach((b) => {
      [b.name, b.sub].map(normKey).filter(Boolean).forEach((k) => {
        if (q.startsWith(k) && q.length > k.length) scoped.push({ id: b.id, part: q.slice(k.length).replace(/호$/, '') });
      });
    });
    // 2) 숫자 호실만 ("403", "정보403") → 전체 또는 부분 일치 건물에서 검색
    const m = q.match(/(B?\d{3,}(?:-\d+)?)호?$/);
    let roomPart = null, scope = null;
    if (scoped.length) { roomPart = scoped[0].part; scope = scoped.map((s) => s.id); }
    else if (m) { roomPart = m[1]; const bp = q.slice(0, m.index); scope = bp ? BUILDINGS.filter((b) => bldgMatches(b, bp)).map((b) => b.id) : null; }
    else if (!/^\d/.test(q) && q.length >= 2 && !BUILDINGS.some((b) => bldgMatches(b, q))) { roomPart = q; } // "식당" 처럼 이름만

    if (!roomPart || (!scoped.length && !m)) {
      BUILDINGS.filter((b) => bldgMatches(b, q)).forEach((b) => hits.push({ type: 'building', id: b.id, b }));
    }
    if (roomPart) {
      findRooms(roomPart)
        .filter((r) => !scope || scope.includes(r.buildingId))
        .sort((a, b) => (normKey(a.room) === roomPart ? 0 : 1) - (normKey(b.room) === roomPart ? 0 : 1)) // 정확히 일치하는 호실 먼저
        .slice(0, 12)
        .forEach((r) => hits.push({ type: 'room', id: r.buildingId, floor: r.floor, room: r.room, b: BUILDINGS.find((x) => x.id === r.buildingId) }));
    }
    return hits;
  }
  const roomLabel = (id) => (/^B?\d/.test(id) ? `${id}호` : id);
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
        ? `<span class="tag">${h.floor}</span>${roomLabel(h.room)}<small>${h.b.name}</small>`
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

  function updateGuide(roomId) {
    const b = current;
    $('#guideBadge').textContent = b ? ((b.sub.match(/(\d+)호관/) || b.name.match(/(\d+)호관/))?.[1] || 'INU').padStart(2, '0') : '07';
    $('#guideTitle').textContent = b ? b.name : '정보기술대학';
    $('#guideSubtitle').textContent = b ? [b.sub, b.floors[currentFloor].name].filter(Boolean).join(' · ') : '건물 안까지 이어지는 캠퍼스 지도';
    $('#enterBuilding').textContent = b ? '캠퍼스 전체로 돌아가기 ↗' : '7호관 내부 보기 ↗';
    $('#guideDetailTitle').textContent = roomId ? `${roomId}호` : b ? `${b.name} · ${b.floors[currentFloor].name}` : '같은 지도, 더 가까이';
    $('#guideDetailText').textContent = roomId ? '선택한 호실을 지도에서 강조했습니다. 다른 층도 층 선택기로 확인해 보세요.' : b ? (hasFloorplan(b.id, b.floors[currentFloor].name) ? '호실을 누르면 위치를 확인할 수 있습니다. 층 버튼으로 다른 층을 둘러보세요.' : '이 층의 호실 정보는 준비 중입니다.') : '건물을 누르고 층을 선택해 호실 배치를 확인하세요. 호실 번호로 검색하면 원하는 위치로 바로 이동합니다.';
    $('#mapCaption').textContent = b ? `${b.name} · ${b.floors[currentFloor].name}` : '캠퍼스 전체';
    $('#mapSubcaption').textContent = roomId ? `${roomId}호를 선택했습니다` : b ? '호실을 눌러 위치를 확인하세요' : '건물을 클릭하면 실내 지도가 표시됩니다';
  }
  $('#enterBuilding').addEventListener('click', () => { if (current) { closePanel(); fitMap(); } else openBuilding('it'); });
  $('#homeMap').addEventListener('click', () => { closePanel(); fitMap(); });
  document.querySelectorAll('[data-building]').forEach(button => button.addEventListener('click', () => openBuilding(button.dataset.building)));
  $('#submitSearch').addEventListener('click', () => { const hits = searchHits(input.value.trim()); if (hits.length) pick(hits[Math.max(0, activeIdx)]); else { input.focus(); renderResults(); } });

  function announceLocation(roomId) {
    if (!current) return;
    updateGuide(roomId);
    const room = roomId && rooms && rooms[roomId];
    document.dispatchEvent(new CustomEvent('campus-location', { detail: {
      kind: room ? 'room' : 'building', buildingId: current.id,
      floor: room ? current.floors[currentFloor].name : '', room: room ? roomId : '',
      x: room ? +room.dataset.mx : current.x, y: room ? +room.dataset.my : current.y,
      label: [current.name, current.sub, room ? current.floors[currentFloor].name + ' ' + roomId + '호' : ''].filter(Boolean).join(' · ')
    }}));
  }
  window.campusMap = {
    fit: fitMap, close: closePanel,
    center: (x, y) => mapPZ.centerOn(x, y, Math.max(1.3, Math.min(mapPZ.state.scale, 3))),
    point: (x, y) => { const r = map.getBoundingClientRect(); return { x: (x - r.left) / mapPZ.state.scale, y: (y - r.top) / mapPZ.state.scale }; },
    wasDragged: mapPZ.wasDragged,
    openLocation: (location) => {
      const b = BUILDINGS.find(b => b.id === location.buildingId);
      if (!b) return;
      const i = b.floors.findIndex(f => f.name === location.floor);
      openBuilding(b.id, i < 0 ? undefined : i);
      if (location.room) highlightRoom(location.room);
    }
  };
  new ResizeObserver(() => { if (!current) fitMap(); }).observe(mapWrap);

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
