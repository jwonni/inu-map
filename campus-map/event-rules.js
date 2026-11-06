/* 행사 표시는 방문자의 시간대와 무관하게 캠퍼스의 한국 시간을 사용합니다. */
window.EventRules = (() => {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  function clock(now = new Date()) {
    const p = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
  }
  function status(event, now = new Date()) {
    const c = clock(now);
    if (event.day > c.day) return '예정';
    if (event.day < c.day) return '지난 행사';
    if (event.allDay) return '종일';
    if (c.time < event.start) return '시작 전';
    return c.time >= event.end ? '종료' : '진행 중';
  }
  const today = (event, now = new Date()) => event.day === clock(now).day;
  function inCampus(x, y) {
    let inside = false;
    const polygon = MAP_FEATURES.campus;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
      if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function valid(e) {
    return e && typeof e.id === 'string' && typeof e.title === 'string' && e.title.trim().length > 0 && e.title.length <= 80 &&
      typeof e.description === 'string' && e.description.length <= 2000 && /^\d{4}-\d{2}-\d{2}$/.test(e.day) &&
      !isNaN(Date.parse(e.day)) && new Date(e.day).toISOString().slice(0, 10) === e.day &&
      typeof e.allDay === 'boolean' && (e.allDay || (/^([01]\d|2[0-3]):[0-5]\d$/.test(e.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(e.end) && e.start < e.end)) &&
      ['booth', 'food', 'talk', 'show', 'welcome', 'activity'].includes(e.icon) &&
      Number.isFinite(e.size) && e.size >= 12 && e.size <= 100 && e.location &&
      ['outdoor', 'building', 'room'].includes(e.location.kind) && typeof e.location.label === 'string' &&
      Number.isFinite(e.location.x) && Number.isFinite(e.location.y) && inCampus(e.location.x, e.location.y) &&
      (e.location.kind === 'outdoor' || BUILDINGS.some(b => b.id === e.location.buildingId && (e.location.kind === 'building' || b.floors.some(f => f.name === e.location.floor))));
  }
  const markerSize = size => Math.round(Math.min(36, Math.max(12, size > 36 ? size * 0.55 : size)));
  function buildingCounts(events, now = new Date()) {
    const counts = {};
    for (const e of events) if (today(e, now) && e.location.kind !== 'outdoor') counts[e.location.buildingId] = (counts[e.location.buildingId] || 0) + 1;
    return counts;
  }
  const atRoom = (e, view, room) => e.location.kind === 'room' && e.location.buildingId === view.buildingId && e.location.floor === view.floor && e.location.room === room;
  const normalize = text => String(text || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  function similarity(a, b) {
    if (!a || !b) return 0;
    // 한글은 자모로 비교해 받침이나 모음 하나가 다른 오타도 찾습니다.
    a = a.normalize('NFD'); b = b.normalize('NFD');
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      for (let j = 1; j <= b.length; j++) row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = row;
    }
    return 1 - previous[b.length] / Math.max(a.length, b.length);
  }
  function fieldScore(query, text) {
    const compact = normalize(text);
    if (!compact) return 0;
    if (query === compact) return 1.3;
    if (compact.includes(query)) return 1.1;
    let best = 0;
    // 단어 및 인접 두 단어를 비교하므로 긴 설명 속의 오타와 띄어쓰기 차이도 처리합니다.
    const words = String(text || '').split(/[^\p{L}\p{N}]+/u).map(normalize).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      for (const word of [words[i], words[i] + (words[i + 1] || '')]) {
        if (word.length < query.length * 0.45 || word.length > query.length * 2) continue;
        best = Math.max(best, similarity(query, word));
      }
    }
    return best >= 0.58 ? best * 0.85 : 0;
  }
  function search(events, raw) {
    const query = normalize(raw);
    if (!query) return [...events];
    const tokens = String(raw).trim().split(/\s+/).map(normalize).filter(Boolean);
    return events.map((event, index) => {
      const fields = [[event.title, 1.15], [event.description, 1], [event.location.label, 0.95]];
      const scoreFor = q => Math.max(...fields.map(([text, weight]) => fieldScore(q, text) * weight));
      const full = scoreFor(query);
      const parts = tokens.map(scoreFor);
      const score = Math.max(full, parts.every(s => s > 0) ? parts.reduce((a, b) => a + b, 0) / parts.length : 0);
      return { event, score, index };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.event);
  }
  return { clock, status, today, inCampus, valid, markerSize, buildingCounts, atRoom, search };
})();
