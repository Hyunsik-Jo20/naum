# 전국초중등학교위치표준데이터 CSV → 부산 초·중·고 앱 데이터(busanSchools.ts)
# 사용: local-data/ 에 CSV 1개 넣고 실행. (인코딩/컬럼명 자동 감지)
import csv
import glob
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL = os.path.join(BASE, 'local-data')


def find_csv():
    if len(sys.argv) > 1:
        return sys.argv[1]
    files = glob.glob(os.path.join(LOCAL, '*.csv'))
    if not files:
        sys.exit('local-data/ 에 CSV 파일이 없습니다. 표준데이터 CSV를 넣어주세요.')
    return files[0]


def read_rows(path):
    for enc in ('cp949', 'utf-8-sig', 'utf-8'):
        try:
            with open(path, encoding=enc, newline='') as f:
                rows = list(csv.DictReader(f))
            if rows:
                return rows, enc
        except (UnicodeDecodeError, csv.Error):
            continue
    sys.exit('CSV 인코딩/형식을 읽지 못했습니다.')


def col(fieldnames, *keys):
    for k in keys:
        for fn in fieldnames:
            if k in fn:
                return fn
    return None


LEVEL_BY_CODE = {'02': '초', '03': '중', '04': '고', '05': '특'}


def level_of(code):
    return LEVEL_BY_CODE.get((code or '').strip().zfill(2), '기타')


def region_of(addr):
    m = re.search(r'([가-힣]+[구군])', addr.replace('부산광역시', ''))
    return m.group(1) if m else '기타'


def main():
    path = find_csv()
    rows, enc = read_rows(path)
    fn = rows[0].keys()
    c_name = col(fn, '학교명')
    c_level = col(fn, '학교급코드', '학교급')
    c_addr = col(fn, '지역', '도로명주소', '지번주소', '주소')
    c_lat = col(fn, '위도')
    c_lon = col(fn, '경도')
    c_closed = col(fn, '폐교여부')
    c_paused = col(fn, '휴교여부')
    c_office = col(fn, '교육지원청')
    c_tel = col(fn, '전화번호', '전화')
    if not all([c_name, c_level, c_addr, c_lat, c_lon]):
        sys.exit(f'필요 컬럼을 못 찾음: {list(fn)}')

    out = []
    seen = set()
    for r in rows:
        addr = (r.get(c_addr) or '').strip()
        if not addr.startswith('부산'):
            continue
        if c_closed and (r.get(c_closed) or '').strip() == 'Y':
            continue
        if c_paused and (r.get(c_paused) or '').strip() == 'Y':
            continue
        lv = level_of(r.get(c_level) or '')
        try:
            lat = float(r.get(c_lat))
            lon = float(r.get(c_lon))
        except (TypeError, ValueError):
            continue
        if not (34 < lat < 36 and 128 < lon < 130):
            continue
        name = (r.get(c_name) or '').strip()
        region = region_of(addr)
        key = (name, region)
        if key in seen:
            continue
        seen.add(key)
        raw_office = (r.get(c_office) or '') if c_office else ''
        office = raw_office.replace('부산광역시', '').replace('교육지원청', '').strip()
        if not office or '교육부' in raw_office:
            office = '기타'
        tel = (r.get(c_tel) or '').strip() if c_tel else ''
        out.append((f'b{len(out) + 1}', name, lv, region, round(lat, 6), round(lon, 6), office, tel))

    out.sort(key=lambda x: (x[3], x[2], x[1]))
    regions = sorted({o[3] for o in out})
    offices = sorted({o[6] for o in out})

    lines = [
        '// 자동 생성됨 (scripts/gen_schools.py) — 전국초중등학교위치표준데이터(부산) 기반',
        "export type SchoolLevel = '초' | '중' | '고' | '특' | '기타'",
        '',
        'export interface BusanSchool {',
        '  id: string',
        '  name: string',
        '  level: SchoolLevel',
        '  region: string',
        '  office: string',
        '  lat: number',
        '  lon: number',
        '  tel: string',
        '}',
        '',
        f'export const BUSAN_REGIONS: string[] = {regions!r}'.replace("'", '"'),
        f'export const BUSAN_OFFICES: string[] = {offices!r}'.replace("'", '"'),
        '',
        'export const busanSchools: BusanSchool[] = [',
    ]
    for (sid, name, lv, region, lat, lon, office, tel) in out:
        lines.append(
            f"  {{ id: '{sid}', name: '{name}', level: '{lv}', region: '{region}', office: '{office}', lat: {lat}, lon: {lon}, tel: '{tel}' }},"
        )
    lines.append(']')
    lines.append('')

    ts_path = os.path.join(BASE, 'src', 'data', 'busanSchools.ts')
    with open(ts_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    from collections import Counter
    by_level = Counter(o[2] for o in out)
    print(f'입력: {os.path.basename(path)} ({enc}) / 부산 학교 {len(out)}개')
    print('학교급:', dict(by_level))
    print('지역(구·군):', len(regions), regions)
    print('출력:', ts_path)


if __name__ == '__main__':
    main()
