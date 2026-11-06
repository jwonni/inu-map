import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = vm.createContext({ window: {}, Intl, Date });
for (const file of ['data/buildings.js', 'data/mapFeatures.js', 'event-rules.js']) {
  vm.runInContext(await readFile(new URL('../' + file, import.meta.url), 'utf8'), context);
}
const rules = context.window.EventRules;
const event = { id: 'test', title: '입시 설명회', description: '방문객 안내', day: '2026-11-07', allDay: false, start: '09:00', end: '18:00', icon: 'talk', size: 44, location: { kind: 'outdoor', x: 500, y: 400, label: '캠퍼스 야외' } };
assert.equal(rules.valid(event), true);
assert.equal(rules.today(event, new Date('2026-11-06T23:59:59+09:00')), false);
assert.equal(rules.today(event, new Date('2026-11-07T00:00:00+09:00')), true);
assert.equal(rules.today(event, new Date('2026-11-07T23:59:59+09:00')), true);
assert.equal(rules.today(event, new Date('2026-11-08T00:00:00+09:00')), false);
assert.equal(rules.today(event, new Date('2026-11-06T15:00:00Z')), true);
assert.equal(rules.status(event, new Date('2026-11-07T08:59:59+09:00')), '시작 전');
assert.equal(rules.status(event, new Date('2026-11-07T09:00:00+09:00')), '진행 중');
assert.equal(rules.status(event, new Date('2026-11-07T18:00:00+09:00')), '종료');
assert.equal(rules.status({ ...event, allDay: true }, new Date('2026-11-07T00:00:00+09:00')), '종일');
assert.equal(rules.valid({ ...event, start: '19:00' }), false);
assert.equal(rules.valid({ ...event, end: '09:00' }), false);
assert.equal(rules.valid({ ...event, day: '2026-02-30' }), false);
assert.equal(rules.valid({ ...event, size: 500 }), false);
assert.equal(rules.valid({ ...event, location: { ...event.location, x: 0, y: 0 } }), false);
assert.equal(rules.valid(JSON.parse(JSON.stringify(event))), true);
assert.equal(rules.valid({ ...event, location: { kind: 'room', buildingId: 'it', floor: '3F', room: '305', label: '7호관 305호', x: 586, y: 495 } }), true);
assert.equal(rules.valid({ ...event, location: { ...event.location, kind: 'building', buildingId: 'missing' } }), false);
assert.equal(rules.clock(new Date('2026-12-31T15:00:00Z')).day, '2027-01-01');
assert.equal(rules.valid({ ...event, location: { kind: 'room', buildingId: 'b11', floor: '1F', room: '식당', label: '11호관 1F 식당', x: 438, y: 495 } }), true);
console.log('Passed 20 event date, time, location and persistence validation checks.');
