"""
assets/inu_pixel.json (OSM 기반, 994x935px, 1m/px) 의 도로망을 지도 좌표(962x841)로 변환해
data/roadnet.js 를 만든다.

변환: 유사변환(크기·회전·이동). OSM 건물 중심점과 data/footprints.js 의 같은 건물 윤곽 중심점을
번호(01, 07, 18-1 …)로 짝지어 최소자승으로 맞춘다.

실행:  python tools/build_roadnet.py   (campus-map 폴더에서)
"""
import json, re, collections
import numpy as np

d = json.load(open('assets/inu_pixel.json', encoding='utf-8'))
N = np.array(d['nodes'], float)
W = d['ways']
fp = open('data/footprints.js', encoding='utf-8').read()
FP = {m.group(1): np.array(json.loads(m.group(2)), float) for m in re.finditer(r'^\s+(\w+): (\[\[.*?\]\]),', fp, re.M)}

# OSM 이름의 괄호 번호 → 우리 건물 id
NUM2ID = {'01': 'b1', '02': 'b2', '04': 'b4', '05': 'b5', '06': 'lib', '07': 'it', '08': 'b8', '09': 'b9',
          '11': 'b11', '12': 'b12', '13': 'b13', '15': 'b15', '16': 'b16', '17': 'b17', '18-1': 'd1',
          '19': 'b19', '21': 'b21', '22': 'b22', '23': 'b23', '28': 'b28', '29': 'b29'}

src, dst = [], []
for w in W:
    if w['kind'] != 'building':
        continue
    m = re.search(r'\((\d+(?:-\d)?)\)', w['tags'].get('name', ''))
    if not m or m.group(1) not in NUM2ID or NUM2ID[m.group(1)] not in FP:
        continue
    src.append(N[w['nodes']].mean(0))
    dst.append(FP[NUM2ID[m.group(1)]].mean(0))
src, dst = np.array(src), np.array(dst)

# [x', y'] = [[a, -b], [b, a]]·[x, y] + [tx, ty]
A = np.zeros((2 * len(src), 4)); B = np.zeros(2 * len(src))
for i, (x, y) in enumerate(src):
    A[2 * i] = [x, -y, 1, 0]; A[2 * i + 1] = [y, x, 0, 1]
    B[2 * i], B[2 * i + 1] = dst[i]
(a, b, tx, ty), *_ = np.linalg.lstsq(A, B, rcond=None)
res = np.array([[a * x - b * y + tx, b * x + a * y + ty] for x, y in src]) - dst
print(f'pairs={len(src)} scale={np.hypot(a, b):.4f} rot={np.degrees(np.arctan2(b, a)):.2f}deg '
      f'tx={tx:.1f} ty={ty:.1f} rms={np.sqrt((res ** 2).sum(1).mean()):.1f}px max={np.sqrt((res ** 2).sum(1)).max():.1f}px')

T = lambda p: [round(a * p[0] - b * p[1] + tx, 1), round(b * p[0] + a * p[1] + ty, 1)]
ways = [{'kind': w['kind'], 'hw': w['tags'].get('highway', ''), 'name': w['tags'].get('name', ''),
         'pts': [T(N[i]) for i in w['nodes']]}
        for w in W if w['kind'] in ('road', 'footway', 'steps')]
rings = [[T(p) for p in r['points']] for r in d['campus_boundary'][0]['rings'] if r.get('points')]

out = {'transform': {'a': a, 'b': b, 'tx': tx, 'ty': ty,
                     'note': 'OSM 픽셀(994x935, 1m/px) → 지도 좌표(962x841) 유사변환, 건물 중심 %d쌍 피팅' % len(src)},
       'ways': ways, 'boundary': rings}
with open('data/roadnet.js', 'w', encoding='utf-8') as f:
    f.write('/* OSM 도로망 (assets/inu_pixel.json) 을 지도 좌표로 변환한 것. 생성: python tools/build_roadnet.py */\n')
    f.write('const ROADNET = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('ways', len(ways), collections.Counter(w['hw'] for w in ways))
