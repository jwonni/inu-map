/*
 * 건물 데이터
 * - x, y        : 지도 좌표(962x841 기준) 건물 중심
 * - w, h, rot   : 카툰 지도에 그릴 건물 크기(px)와 회전각(도). 캠퍼스 격자는 약 31° / -59° 입니다.
 * - color       : 건물 지붕 색 (선택). 없으면 기본 팔레트 사용
 * - floors      : 층 목록. 도면 이미지는 assets/floors/<id>/<층>.(png|jpg|jpeg|webp) 에서 자동으로 찾습니다.
 * - defaultFloor: 건물을 열 때 먼저 보여줄 층 (기본 '1F')
 */
const MAP_SIZE = { w: 962, h: 841 };
const AX = 31;   // 캠퍼스 장축 방향
const AY = -59;  // 캠퍼스 단축 방향

const floorsOf = (names) => names.map((name) => ({ name }));
const defaultFloors = (n = 3) => floorsOf(Array.from({ length: n }, (_, i) => `${i + 1}F`));

const BUILDINGS = [
  {
    // U자형: 날개가 캠퍼스 장축(31°)을 따라 뻗고, 베이스(입구)는 남동쪽 도로 쪽. rot=-59 → 로컬 y축이 남동쪽
    id: 'it', name: '정보기술대학', sub: '7호관', x: 586, y: 495, w: 53, h: 64, rot: AY, color: '#7cc4ff',
    footprint: 'layout', // 추출 윤곽이 지저분해서 U자 레이아웃 윤곽을 그대로 사용
    defaultFloor: '1F',
    floors: [{ name: 'B1', label: '주차장' }, ...floorsOf(['1F', '2F', '3F', '4F', '5F'])],
  },
  { id: 'b1',  name: '1호관',  sub: '대학본부',         x: 676, y: 270, w: 70, h: 38, rot: AX, color: '#ffb66b', floors: defaultFloors() },
  { id: 'b2',  name: '2호관',  sub: '교수회관',         x: 608, y: 200, w: 56, h: 36, rot: AX, floors: defaultFloors() },
  { id: 'b4',  name: '4호관',  sub: '',                 x: 755, y: 302, w: 58, h: 30, rot: AX, floors: defaultFloors() },
  { id: 'b5',  name: '5호관',  sub: '',                 x: 691, y: 399, w: 74, h: 44, rot: AX, floors: defaultFloors() },
  // 일자형 막대(장축 약 -40°). 라벨 글자 때문에 추출 윤곽이 잘려서 레이아웃 사각형을 윤곽으로 사용.
  // 로컬 x축 = 남서→북동 (배치도의 왼쪽 101 이 남서쪽 끝)
  { id: 'nea', name: '14호관', sub: '경영대학,동북아', x: 521, y: 293, w: 80, h: 20, rot: -40, color: '#b9a6ff',
    footprint: 'layout', defaultFloor: '1F', floors: floorsOf(['1F', '2F', '3F', '4F', '5F']) },
  // 일자형: 장축이 캠퍼스 단축(-59°) 방향. 로컬 x축 = 남서→북동 (배치도의 왼쪽 101 이 남서쪽 끝)
  { id: 'b13', name: '13호관', sub: '',                 x: 562, y: 319, w: 92, h: 22, rot: -54, color: '#9be0b3',
    footprint: 'layout', defaultFloor: '1F', floors: [{ name: 'B1' }, ...floorsOf(['1F', '2F', '3F', '4F', '5F'])] },
  // A·B·C동이 동쪽 끝에서 이어진 E자형 한 건물
  // A·B·C동이 동쪽 끝에서 이어진 E자형 한 건물. wings: 각 날개 가운데에 표시할 이름과 좌표
  { id: 'b8',  name: '8호관',  sub: '',                 x: 526, y: 599, w: 110, h: 90, rot: AX, floors: defaultFloors(),
    wings: [{ name: 'A동', x: 500, y: 618 }, { name: 'B동', x: 517, y: 578 }, { name: 'C동', x: 545, y: 548 }] },
  { id: 'b9',  name: '9호관',  sub: '',                 x: 582, y: 713, w: 70, h: 42, rot: AX, floors: defaultFloors() },
  { id: 'b11', name: '11호관', sub: '',                 x: 433, y: 509, w: 80, h: 30, rot: AY, floors: defaultFloors() },
  { id: 'b12', name: '12호관', sub: '',                 x: 486, y: 433, w: 80, h: 30, rot: AY, floors: defaultFloors() },
  { id: 'b15', name: '15호관', sub: '',                 x: 451, y: 377, w: 80, h: 30, rot: AY, floors: defaultFloors() },
  { id: 'b16', name: '16호관', sub: '',                 x: 387, y: 475, w: 60, h: 28, rot: AY, floors: defaultFloors() },
  { id: 'b17', name: '17호관', sub: '',                 x: 350, y: 525, w: 60, h: 28, rot: AY, floors: defaultFloors() },
  { id: 'd1',  name: '18-1호관', sub: '제1기숙사',      x: 285, y: 590, w: 90, h: 60, rot: AX, color: '#ffd36b', floors: defaultFloors() },
  { id: 'b19', name: '19호관', sub: '',                 x: 310, y: 482, w: 54, h: 26, rot: AY, floors: defaultFloors() },
  { id: 'b21', name: '21호관', sub: '',                 x: 313, y: 392, w: 44, h: 26, rot: AX, floors: defaultFloors() },
  { id: 'b22', name: '22호관', sub: '',                 x: 351, y: 353, w: 36, h: 24, rot: AX, floors: defaultFloors() },
  { id: 'b23', name: '23호관', sub: '강당 및 공연장',   x: 490, y: 130, w: 70, h: 56, rot: AX, color: '#ff9aa8', floors: defaultFloors() },
  { id: 'b24', name: '24호관', sub: '전망타워',         x: 770, y: 360, w: 30, h: 30, rot: AX, color: '#9be0b3', floors: defaultFloors() },
  { id: 'b25', name: '25호관', sub: '해동실어린이집',   x: 783, y: 441, w: 44, h: 28, rot: AX, color: '#ffd36b', floors: defaultFloors() },
  { id: 'b28', name: '28호관', sub: '',                 x: 529, y: 775, w: 56, h: 30, rot: AX, floors: defaultFloors() },
  { id: 'b29', name: '29호관', sub: '',                 x: 380, y: 716, w: 46, h: 34, rot: AX, floors: defaultFloors() },
];
