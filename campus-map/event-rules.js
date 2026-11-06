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
      Number.isFinite(e.size) && e.size >= 20 && e.size <= 100 && e.location &&
      ['outdoor', 'building', 'room'].includes(e.location.kind) && typeof e.location.label === 'string' &&
      Number.isFinite(e.location.x) && Number.isFinite(e.location.y) && inCampus(e.location.x, e.location.y) &&
      (e.location.kind === 'outdoor' || BUILDINGS.some(b => b.id === e.location.buildingId && (e.location.kind === 'building' || b.floors.some(f => f.name === e.location.floor))));
  }
  return { clock, status, today, inCampus, valid };
})();
