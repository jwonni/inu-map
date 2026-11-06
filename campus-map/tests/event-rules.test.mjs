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
const indoor = { ...event, id: 'room', location: { kind: 'room', buildingId: 'it', floor: '4F', room: '403', label: '7호관 403호', x: 586, y: 495 } };
const nextDay = { ...indoor, day: '2026-11-08' };
const otherBuilding = { ...indoor, location: { ...indoor.location, buildingId: 'b13' } };
const now = new Date('2026-11-07T10:00:00+09:00');
const counts = rules.buildingCounts([event, indoor, nextDay, otherBuilding], now);
assert.equal(counts.it, 1);
assert.equal(counts.b13, 1);
assert.equal(Object.keys(counts).length, 2);
assert.equal(rules.atRoom(indoor, { buildingId: 'it', floor: '4F' }, '403'), true);
assert.equal(rules.atRoom(indoor, { buildingId: 'it', floor: '3F' }, '403'), false);
assert.equal(rules.atRoom(indoor, { buildingId: 'b13', floor: '4F' }, '403'), false);
assert.ok(rules.markerSize(44) < 44);
assert.equal(rules.markerSize(100), 36);
assert.equal(rules.markerSize(24), 24);
assert.equal(rules.valid({ ...event, size: 12 }), true);
const searchable = [
  { ...event, id: 'talk', title: '입시 설명회', description: '고등학생 진학 상담과 전공 안내', location: { ...event.location, label: '7호관 403호' } },
  { ...event, id: 'food', title: '캠퍼스 푸드트럭', description: 'Food Truck 점심 음식과 간식 판매' },
  { ...event, id: 'show', title: '음악 공연', description: '입시 설명회 참가자를 위한 무대' },
];
assert.equal(rules.search(searchable, '').length, 3);
assert.equal(rules.search(searchable, '입시설명회')[0].id, 'talk');
assert.equal(rules.search(searchable, '설명훼')[0].id, 'talk');
assert.equal(rules.search(searchable, '푸드 트럭')[0].id, 'food');
assert.equal(rules.search(searchable, '전공 안내')[0].id, 'talk');
assert.equal(rules.search(searchable, '7호관403')[0].id, 'talk');
assert.equal(rules.search(searchable, '입시 설명회')[1].id, 'show');
assert.equal(rules.search(searchable, '무관한검색어').length, 0);
assert.equal(searchable.map(e => e.id).join(','), 'talk,food,show');
assert.ok(rules.markerSize(12) < rules.markerSize(24) && rules.markerSize(24) < rules.markerSize(36));
assert.equal(rules.search(searchable, 'FOOD TRUK')[0].id, 'food');
console.log('Passed 41 event date, display, size and fuzzy search checks.');
