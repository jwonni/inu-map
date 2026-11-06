(() => {
  const $ = s => document.querySelector(s);
  const rules = EventRules;
  const KEY = 'inu-campus-events-v1';
  const icons = [ ['booth', '행사 부스'], ['food', '푸드트럭'], ['talk', '설명회'], ['show', '공연'], ['welcome', '안내소'], ['activity', '체험'] ];
  let events = [], mode = 'map', editing = false, draft = null, locationMode = 'indoor', noteId = null;
  let stamp = '', toastTimer, midnightTimer;
  const asset = id => `assets/events/${id}.svg`;
  function storageWarning(message) { $('#storageNotice').hidden = false; $('#storageNotice').textContent = message; }
  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(raw) || !raw.every(rules.valid)) throw new Error('invalid data');
      events = raw;
    } catch { storageWarning('저장된 이벤트를 불러오지 못했습니다. 브라우저 저장 설정 또는 데이터를 확인해 주세요.'); }
  }
  function persist(next) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); events = next; return true; }
    catch { $('#formError').textContent = '저장 공간에 접근할 수 없습니다. 브라우저 설정을 확인해 주세요. 입력한 내용은 유지됩니다.'; return false; }
  }
  function toast(message) {
    $('#eventToast').textContent = message; $('#eventToast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#eventToast').hidden = true, 3500);
  }
  function setMode(next, edit = false) {
    if (draft && !confirm('저장하지 않은 편집 내용을 버릴까요?')) return;
    draft = null; editing = edit; mode = next; noteId = null;
    window.campusEventEditing = edit;
    $('#eventNote').hidden = true;
    $('#mapMode').classList.toggle('selected', next === 'map');
    $('#eventMode').classList.toggle('selected', next === 'events');
    $('#mapMode').setAttribute('aria-pressed', next === 'map');
    $('#eventMode').setAttribute('aria-pressed', next === 'events');
    $('#editEvents').setAttribute('aria-pressed', edit);
    $('#editEvents').textContent = edit ? '✓ 편집 완료' : '✎ 편집';
    $('#eventSidebar').hidden = next !== 'events';
    $('#mapGuide').hidden = next === 'events';
    $('#guideWelcome').hidden = next === 'events';
    document.body.classList.toggle('event-mode', next === 'events');
    $('#newEvent').hidden = !edit;
    $('#eventHeading').textContent = edit ? '이벤트 관리' : '오늘의 이벤트';
    $('#eventForm').hidden = true;
    document.body.classList.toggle('editing-events', edit);
    window.campusEventPlacement = false;
    campusMap.close();
    $('#mapCaption').textContent = next === 'events' ? (edit ? '이벤트 편집' : '오늘의 캠퍼스') : '캠퍼스 전체';
    $('#mapSubcaption').textContent = next === 'events' ? (edit ? '위치를 정하고 새로운 소식을 등록하세요' : '배너를 누르면 행사 안내가 펼쳐집니다') : '건물을 클릭하면 실내 지도가 표시됩니다';
    render();
  }
  function shown() { return mode === 'events' ? events.filter(e => editing || rules.today(e)) : []; }
  function render() {
    $('#eventCount').textContent = events.filter(e => rules.today(e)).length;
    $('#eventDate').textContent = `${rules.clock().day.replaceAll('-', '. ')} · 한국 시간${editing ? ' · 전체 날짜' : ''}`;
    const list = $('#eventList'); list.replaceChildren();
    const items = shown().sort((a, b) => a.day.localeCompare(b.day) || (a.start || '').localeCompare(b.start || ''));
    if (!items.length) {
      const empty = document.createElement('p'); empty.className = 'empty-events';
      empty.textContent = editing ? '등록된 이벤트가 없습니다. ＋ 추가로 첫 행사를 등록해 보세요.' : '오늘 예정된 이벤트가 없습니다. 새로운 캠퍼스 소식을 기다려 주세요.';
      list.append(empty);
    }
    for (const e of items) {
      const button = document.createElement('button'); button.className = 'event-item';
      button.classList.toggle('active', draft?.id === e.id || noteId === e.id);
      const img = document.createElement('img'); img.src = asset(e.icon); img.alt = '';
      const copy = document.createElement('span');
      const title = document.createElement('strong'); title.textContent = e.title;
      const detail = document.createElement('small'); detail.textContent = `${editing ? e.day + ' · ' : ''}${rules.status(e)} · ${e.allDay ? '종일' : e.start + '–' + e.end}`;
      const place = document.createElement('small'); place.textContent = e.location.label;
      copy.append(title, detail, place); button.append(img, copy);
      button.addEventListener('click', () => editing ? begin(e) : showNote(e)); list.append(button);
    }
    renderMarkers();
  }
  function renderMarkers() {
    const layer = $('#eventMarkers'); layer.replaceChildren();
    for (const e of shown()) if (e.id !== draft?.id) marker(e, false);
    if (draft?.location) marker(draft, true);
  }
  function marker(e, isDraft) {
    const button = document.createElement('button');
    button.className = 'event-marker' + (isDraft ? ' draft' : '');
    if (isDraft && locationMode === 'indoor') button.style.pointerEvents = 'none';
    button.style.left = e.location.x + 'px'; button.style.top = e.location.y + 'px'; button.style.width = e.size + 'px';
    button.setAttribute('aria-label', isDraft ? '편집 중인 배너. 드래그로 이동하거나 방향키로 미세 조정' : `${e.title} · ${e.location.label}`);
    button.dataset.eventId = e.id;
    const img = document.createElement('img'); img.src = asset(e.icon); img.alt = ''; img.draggable = false;
    button.append(img);
    if (!isDraft) {
      const label = document.createElement('span'); label.textContent = e.title; button.append(label);
    }
    let dragging = null, moved = false;
    button.addEventListener('pointerdown', event => {
      moved = false;
      if (!isDraft || locationMode !== 'outdoor') return;
      event.stopPropagation();
      const point = campusMap.point(event.clientX, event.clientY);
      dragging = { dx: point.x - e.location.x, dy: point.y - e.location.y, x: event.clientX, y: event.clientY };
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointermove', event => {
      if (!dragging) return;
      if (Math.hypot(event.clientX - dragging.x, event.clientY - dragging.y) > 3) moved = true;
      const p = campusMap.point(event.clientX, event.clientY);
      const x = p.x - dragging.dx, y = p.y - dragging.dy;
      if (!rules.inCampus(x, y)) return;
      draft.location.x = +x.toFixed(1); draft.location.y = +y.toFixed(1);
      button.style.left = x + 'px'; button.style.top = y + 'px'; syncLocation();
    });
    const endDrag = () => { dragging = null; };
    button.addEventListener('pointerup', endDrag); button.addEventListener('pointercancel', endDrag);
    button.addEventListener('click', event => { event.stopPropagation(); if (!moved && !isDraft) editing ? begin(e) : showNote(e); });
    button.addEventListener('keydown', event => {
      if (!isDraft || locationMode !== 'outdoor' || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const step = event.shiftKey ? 5 : 0.5;
      const x = draft.location.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0);
      const y = draft.location.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0);
      if (rules.inCampus(x, y)) { draft.location.x = x; draft.location.y = y; button.style.left = x + 'px'; button.style.top = y + 'px'; syncLocation(); }
    });
    $('#eventMarkers').append(button);
  }
  function showNote(e) {
    noteId = e.id; campusMap.close(); campusMap.center(e.location.x, e.location.y);
    $('#noteTitle').textContent = e.title;
    $('#noteWhen').textContent = `${e.day} · ${e.allDay ? '종일' : e.start + '–' + e.end} · ${rules.status(e)}`;
    $('#noteLocation').textContent = e.location.label; $('#noteDescription').textContent = e.description;
    $('#eventNote').hidden = false; render();
  }
  function begin(e) {
    if (draft && !confirm('저장하지 않은 편집 내용을 버릴까요?')) return;
    draft = e ? JSON.parse(JSON.stringify(e)) : { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(), title: '', description: '', day: rules.clock().day, allDay: true, start: '09:00', end: '18:00', icon: 'booth', size: 44, location: null };
    noteId = null; $('#eventNote').hidden = true; $('#eventForm').hidden = false;
    $('#formHeading').textContent = e ? '이벤트 수정' : '새 이벤트';
    $('#deleteEvent').hidden = !e; $('#formError').textContent = '';
    $('#eventTitle').value = draft.title; $('#eventDescription').value = draft.description;
    $('#eventDay').value = draft.day; $('#eventAllDay').checked = draft.allDay;
    $('#eventStart').value = draft.start; $('#eventEnd').value = draft.end;
    $('#timeFields').hidden = draft.allDay; $('#eventSize').value = draft.size; $('#sizeValue').value = draft.size;
    setLocationMode(draft.location?.kind === 'outdoor' ? 'outdoor' : 'indoor', false);
    if (e) campusMap.center(e.location.x, e.location.y);
    syncIcons(); render(); $('#eventForm').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function setLocationMode(value, clear = true) {
    locationMode = value;
    if (clear && draft) draft.location = null;
    window.campusEventPlacement = !!draft && value === 'outdoor';
    document.querySelectorAll('[data-location]').forEach(b => { b.classList.toggle('selected', b.dataset.location === value); b.setAttribute('aria-pressed', b.dataset.location === value); });
    $('#locationHelp').textContent = value === 'outdoor' ? '배너를 지도에 끌어 놓거나, 고른 뒤 캠퍼스 안을 클릭하세요. 드래그·좌표·방향키로 위치를 조정할 수 있습니다.' : '상단에서 호실을 검색하거나 지도에서 건물과 호실을 클릭하세요.';
    if (value === 'outdoor') campusMap.close();
    syncLocation(); renderMarkers();
  }
  function syncLocation() {
    const loc = draft?.location;
    $('#chosenLocation').textContent = loc ? loc.label : '선택된 위치 없음';
    $('#positionFields').hidden = locationMode !== 'outdoor' || !loc;
    $('#eventX').value = loc ? loc.x : ''; $('#eventY').value = loc ? loc.y : '';
    $('#formError').textContent = '';
  }
  function syncIcons() { document.querySelectorAll('[data-icon]').forEach(b => { b.classList.toggle('selected', b.dataset.icon === draft?.icon); b.setAttribute('aria-pressed', b.dataset.icon === draft?.icon); }); }
  for (const [id, label] of icons) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.icon = id;
    button.draggable = true;
    button.addEventListener('dragstart', e => {
      if (!draft) return e.preventDefault();
      draft.icon = id; setLocationMode('outdoor'); syncIcons();
      e.dataTransfer.setData('application/x-campus-icon', id);
      e.dataTransfer.effectAllowed = 'copy';
    });
    const img = document.createElement('img'); img.src = asset(id); img.alt = ''; img.draggable = false;
    const text = document.createElement('span'); text.textContent = label; button.append(img, text);
    button.addEventListener('click', () => { if (draft) { draft.icon = id; syncIcons(); renderMarkers(); } }); $('#iconPicker').append(button);
  }
  $('#mapWrap').addEventListener('dragover', e => {
    if (draft && e.dataTransfer.types.includes('application/x-campus-icon')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  });
  $('#mapWrap').addEventListener('drop', e => {
    if (!draft) return;
    const icon = e.dataTransfer.getData('application/x-campus-icon');
    if (!icons.some(([id]) => id === icon)) return;
    e.preventDefault();
    const p = campusMap.point(e.clientX, e.clientY);
    if (!rules.inCampus(p.x, p.y)) return toast('캠퍼스 부지 안에 배너를 배치해 주세요.');
    draft.icon = icon;
    draft.location = { kind: 'outdoor', x: +p.x.toFixed(1), y: +p.y.toFixed(1), label: '캠퍼스 야외' };
    syncLocation(); syncIcons(); renderMarkers();
  });
  document.addEventListener('campus-location', event => {
    if (draft && locationMode === 'indoor') { draft.location = event.detail; syncLocation(); renderMarkers(); }
    else if (mode === 'events' && !editing) {
      const loc = event.detail;
      const matches = shown().filter(e => e.location.buildingId === loc.buildingId && (loc.kind === 'building' ? e.location.kind === 'building' : e.location.room === loc.room && e.location.floor === loc.floor));
      if (matches.length === 1) showNote(matches[0]);
      else if (matches.length > 1) toast('이 위치에 여러 행사가 있습니다. 왼쪽 목록 또는 배너에서 행사를 선택하세요.');
    }
  });
  $('#mapWrap').addEventListener('click', event => {
    if (!draft || locationMode !== 'outdoor' || event.target.closest('button, .event-marker') || campusMap.wasDragged()) return;
    const p = campusMap.point(event.clientX, event.clientY);
    if (!rules.inCampus(p.x, p.y)) return toast('캠퍼스 부지 안에 배너를 배치해 주세요.');
    draft.location = { kind: 'outdoor', x: +p.x.toFixed(1), y: +p.y.toFixed(1), label: '캠퍼스 야외' };
    syncLocation(); renderMarkers();
  }, true);
  // 야외 배치 중 건물 클릭은 실내 지도를 여는 대신 배너 위치를 정합니다.
  $('#mapSvg').addEventListener('click', e => { if (window.campusEventPlacement) e.stopPropagation(); }, true);
  document.querySelectorAll('[data-location]').forEach(b => b.addEventListener('click', () => setLocationMode(b.dataset.location)));
  $('#eventSize').addEventListener('input', e => { if (draft) { draft.size = +e.target.value; $('#sizeValue').value = draft.size; renderMarkers(); } });
  for (const id of ['eventX', 'eventY']) $('#' + id).addEventListener('change', () => {
    if (!draft?.location) return;
    const x = +$('#eventX').value, y = +$('#eventY').value;
    if (!rules.inCampus(x, y)) { syncLocation(); toast('캠퍼스 부지 안의 좌표를 입력해 주세요.'); return; }
    draft.location.x = x; draft.location.y = y; renderMarkers();
  });
  $('#eventAllDay').addEventListener('change', e => $('#timeFields').hidden = e.target.checked);
  $('#eventForm').addEventListener('submit', e => {
    e.preventDefault(); if (!draft) return;
    Object.assign(draft, { title: $('#eventTitle').value.trim(), description: $('#eventDescription').value.trim(), day: $('#eventDay').value, allDay: $('#eventAllDay').checked, start: $('#eventStart').value, end: $('#eventEnd').value });
    if (!draft.location) { $('#formError').textContent = '먼저 지도에서 행사 위치를 선택해 주세요.'; return; }
    if (!draft.allDay && (!draft.start || !draft.end || draft.start >= draft.end)) { $('#formError').textContent = '종료 시간은 시작 시간보다 늦어야 합니다. 자정을 넘는 행사는 날짜별로 나누어 등록해 주세요.'; return; }
    if (!draft.description || !rules.valid(draft)) { $('#formError').textContent = '제목, 설명, 날짜와 캠퍼스 안의 위치를 확인해 주세요.'; return; }
    if (!persist([...events.filter(x => x.id !== draft.id), draft])) return;
    const today = rules.today(draft); endEdit(); render(); toast(today ? '저장했습니다. 오늘의 이벤트에 표시됩니다.' : '저장했습니다. 해당 행사일 00시부터 표시됩니다.');
  });
  function endEdit() { draft = null; window.campusEventPlacement = false; $('#eventForm').hidden = true; campusMap.close(); render(); }
  $('#cancelEvent').addEventListener('click', () => { if (confirm('편집을 취소할까요? 저장하지 않은 내용은 사라집니다.')) endEdit(); });
  $('#deleteEvent').addEventListener('click', () => { if (draft && confirm('이 이벤트를 삭제할까요?') && persist(events.filter(e => e.id !== draft.id))) { endEdit(); toast('이벤트를 삭제했습니다.'); } });
  $('#newEvent').addEventListener('click', () => begin());
  $('#mapMode').addEventListener('click', () => setMode('map'));
  $('#eventMode').addEventListener('click', () => setMode('events'));
  $('#editEvents').addEventListener('click', () => setMode('events', !editing));
  $('#closeNote').addEventListener('click', () => { noteId = null; $('#eventNote').hidden = true; render(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { noteId = null; $('#eventNote').hidden = true; } });
  function refreshClock() {
    const now = rules.clock(); const next = now.day + now.time;
    if (next === stamp) return;
    stamp = next;
    if (noteId) {
      const e = events.find(e => e.id === noteId && rules.today(e));
      if (!e) { noteId = null; $('#eventNote').hidden = true; }
      else $('#noteWhen').textContent = `${e.day} · ${e.allDay ? '종일' : e.start + '–' + e.end} · ${rules.status(e)}`;
    }
    render();
    clearTimeout(midnightTimer);
    const nextMidnight = Date.parse(`${now.day}T00:00:00+09:00`) + 86400000;
    midnightTimer = setTimeout(refreshClock, Math.max(1, nextMidnight - Date.now()));
  }
  setInterval(refreshClock, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshClock(); });
  window.addEventListener('focus', refreshClock);
  window.addEventListener('storage', e => { if (e.key === KEY) { read(); stamp = ''; refreshClock(); } });
  window.addEventListener('beforeunload', e => { if (draft) { e.preventDefault(); e.returnValue = ''; } });
  read(); refreshClock();
})();
