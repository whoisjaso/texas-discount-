#!/usr/bin/env python3
"""Build the crash-test fixture the desk's empty-weight tests run against.

Ground truth is the NHTSA Vehicle Crash Test Database: test vehicles with a
real VIN and a lab-measured curb weight. Each VIN was decoded through vPIC's
DecodeVINValuesBatch. This takes a deterministic sample of about 400 of them,
spread across model years and vehicle classes, and writes for each:

  the vPIC fields the estimator reads, the measured curb weight in lb, the
  reference estimate (reference_estimate.py, i.e. the oracle the TypeScript
  port must match exactly) and the Transport Canada median, when the research
  found one.

to src/__tests__/helpers/empty-weight-crash-tests.json.

Usage
  python3 make_fixtures.py --crash DIR
DIR holds the research files: eval_rows2.json (measured curb and the Canada
figure per VIN, sanity-filtered) and vpic_decoded.jsonl (one vPIC decode per
line).

The yearly step: after build_epa_table.py --download, run this again so the
reference figures follow the new table, then run the desk's tests.
"""
import argparse
import collections
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ beside the scripts in the repository
sys.path.insert(0, HERE)
import reference_estimate as R  # noqa: E402

DESK = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(DESK, 'src', '__tests__', 'helpers', 'empty-weight-crash-tests.json')
FIELDS = ['ModelYear', 'Make', 'Model', 'Series', 'Trim', 'DisplacementL', 'DriveType', 'FuelTypePrimary',
          'ElectrificationLevel', 'GVWR', 'VehicleType', 'BodyClass', 'CurbWeightLB']
DASHES = re.compile('[‒–—―−]')
SOURCES = [
    'https://nrd.api.nhtsa.dot.gov/nhtsa/vehicle/api/v1/vehicle-database-test-results/get-vehicle-detail-info/1/10000',
    'https://catalog.data.gov/dataset/vehicle-crash-test-database',
    'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/',
    'https://vpic.nhtsa.dot.gov/api/vehicles/GetCanadianVehicleSpecifications/',
]
TARGET = 400


def clean(v):
    return DASHES.sub('-', v) if isinstance(v, str) else v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--crash', required=True)
    ap.add_argument('--out', default=OUT)
    a = ap.parse_args()
    rows = json.load(open(os.path.join(a.crash, 'eval_rows2.json')))
    dec = {}
    for line in open(os.path.join(a.crash, 'vpic_decoded.jsonl')):
        d = json.loads(line)
        dec[d['VIN']] = d
    tab = R.Table(R.load_table())

    strata = collections.defaultdict(list)
    for r in rows:
        strata[(r['year'] // 5, bool(r['truck']))].append(r)
    total = len(rows)
    picked = []
    for key in sorted(strata):
        group = sorted(strata[key], key=lambda r: hashlib.sha1(r['vin'].encode()).hexdigest())
        take = max(3, round(TARGET * len(group) / total))
        picked += group[:take]
    picked.sort(key=lambda r: (r['year'], r['vin']))

    out_rows = []
    for r in picked:
        d = dec[r['vin']]
        e = R.estimate(tab, d)
        out_rows.append(dict(
            vin=r['vin'],
            decode={k: clean(d.get(k) or '') for k in FIELDS},
            measuredCurbLbs=r['truth'],
            reference=None if e is None else dict(curbLbs=e['curb'], lowLbs=e['low'], highLbs=e['high'], yearUsed=e['yearUsed'], level=e['level']),
            canadaMedianLbs=r.get('cvs'),
        ))
    table = R.load_table()
    doc = dict(
        about='Crash-test vehicles with lab-measured curb weights, their vPIC decode, and the reference EPA estimate. Built by scripts/empty-weight/make_fixtures.py.',
        tableBuilt=table['built'],
        sources=SOURCES,
        rows=out_rows,
    )
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump(doc, open(a.out, 'w'), indent=None, separators=(',', ':'), ensure_ascii=False)
    open(a.out, 'a').write('\n')
    hits = [x for x in out_rows if x['reference']]
    errs = sorted(abs(x['reference']['curbLbs'] - x['measuredCurbLbs']) for x in hits)
    print('rows', len(out_rows), 'covered', len(hits), 'median abs', errs[len(errs) // 2], 'p95', errs[int(0.95 * len(errs))])


if __name__ == '__main__':
    main()
