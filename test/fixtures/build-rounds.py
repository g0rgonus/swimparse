"""Hand-built round fixtures. Invented meet, invented swimmers, no real data.

Three swimmers in one event, chosen to cover every round shape a file can hold:
  1. prelim + final           (the ordinary championship swim)
  2. prelim + swim-off + final (all four time slots filled)
  3. prelim only              (did not advance; swim-off and final blank)
"""
OUT = 'rounds'

def rec(width, *fields):
    """Lay a fixed-width record out by column. fields: (start0, text) pairs."""
    row = [' '] * width
    for start, text in fields:
        for i, ch in enumerate(str(text)):
            row[start + i] = ch
    return ''.join(row).rstrip() if False else ''.join(row)

def rj(text, n):    # right-justified, as times and ages are stored
    return str(text).rjust(n)

SWIMMERS = [
    # name,                anum,  seed,     prelim,   swimoff,  final,    pheat,plane,fheat,flane,pplace,fplace,pts
    ("Lovelace, Ada",      '1001', '1:13.46','1:13.05', '',      '1:11.04', 2, 4, 1, 4, 3, 1, 20),
    ("Hopper, Grace",      '1002', '1:14.10','1:13.55', '1:13.20','1:12.88', 2, 5, 1, 5, 4, 2, 17),
    ("Johnson, Katherine", '1003', '1:20.00','1:19.42', '',       '',        3, 1, 0, 0, 9, 0,  0),
]

# ------------------------------------------------------------------ SDIF -----
sdif = [
    rec(160, (0, 'A0'), (2, '1'), (43, 'swimparse fixture')),
    rec(160, (0, 'B1'), (2, '1'), (11, 'Rounds Test Invitational'), (121, '06262026'), (149, 'L')),
    rec(160, (0, 'C1'), (2, '1'), (11, 'VATST'), (17, 'Test Aquatic Club')),
]
for name, _anum, seed, prelim, swimoff, final, ph, pl, fh, fl, pp, fp, pts in SWIMMERS:
    fields = [
        (0, 'D0'), (2, '1'), (11, name), (63, '12'), (65, 'F'), (66, 'G'),
        (67, rj('100', 4)), (71, '4'), (72, rj('17A', 4)), (76, '1112'),
        (88, rj(seed, 8)), (96, 'L'),
    ]
    if prelim:  fields += [(97, rj(prelim, 8)), (105, 'L')]
    if swimoff: fields += [(106, rj(swimoff, 8)), (114, 'L')]
    if final:   fields += [(115, rj(final, 8)), (123, 'L')]
    fields += [(124, rj(ph, 2)), (126, rj(pl, 2))]
    if fh: fields += [(128, rj(fh, 2)), (130, rj(fl, 2))]
    if pp: fields += [(132, rj(pp, 3))]
    if fp: fields += [(135, rj(fp, 3))]
    if pts: fields += [(138, rj(pts, 4))]
    sdif.append(rec(160, *fields))
sdif.append(rec(160, (0, 'Z0'), (2, '1')))
open(f'{OUT}.sd3', 'w', encoding='cp1252', newline='').write('\r\n'.join(sdif) + '\r\n')

# ------------------------------------------------------------------- HY3 -----
def secs(t):
    """SDIF display time -> HY3 seconds, the same swim in the other notation."""
    if not t: return ''
    m, s = t.split(':') if ':' in t else ('0', t)
    return f"{int(m) * 60 + float(s):.2f}"

hy3 = [
    rec(130, (0, 'A1'), (44, 'swimparse fix'), (58, '06262026')),
    rec(130, (0, 'B1'), (2, 'Rounds Test Invitational'), (92, '06262026')),
    rec(130, (0, 'C1'), (2, 'VATST'), (7, 'Test Aquatic Club')),
]
for name, anum, seed, prelim, swimoff, final, ph, pl, fh, fl, pp, fp, _pts in SWIMMERS:
    last, first = [p.strip() for p in name.split(',')]
    hy3.append(rec(130, (0, 'D1'), (2, 'F'), (3, rj(anum, 5)), (8, last), (28, first), (48, first)))
    for round_code, time, heat, lane, place in (
        ('P', prelim, ph, pl, pp), ('S', swimoff, 0, 0, 0), ('F', final, fh, fl, fp),
    ):
        if not time:
            continue
        hy3.append(rec(130, (0, 'E1'), (2, 'F'), (3, rj(anum, 5)), (8, last[:5]), (13, 'F'), (14, 'G'),
                       (15, rj('100', 6)), (21, 'D'), (22, rj('11', 3)), (25, rj('12', 3)),
                       (38, rj('17A', 4)), (52, rj(secs(seed), 7)), (59, 'L')))
        e2 = [(0, 'E2'), (2, round_code), (4, rj(secs(time), 7)), (11, 'L')]
        if heat:  e2 += [(21, rj(heat, 2)), (24, rj(lane, 2))]
        if place: e2 += [(30, rj(place, 3))]
        hy3.append(rec(130, *e2))
open(f'{OUT}.hy3', 'w', encoding='cp1252', newline='').write('\r\n'.join(hy3) + '\r\n')
print(f"sd3: {len(sdif)} records · hy3: {len(hy3)} records")
