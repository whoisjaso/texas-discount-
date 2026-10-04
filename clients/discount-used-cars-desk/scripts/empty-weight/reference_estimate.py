#!/usr/bin/env python3
"""The reference empty-weight estimate from the bundled EPA table: the oracle for epa.ts.

It is `estimate_v2` from the research (scratchpad epalookup.py), unchanged in
its rules, reading the generated table instead of the raw EPA files. The desk's
TypeScript port (src/lib/vehicles/empty-weight/epa.ts) must give the same curb,
low, high and year on every row of the crash-test fixture; the parity test
(the-estimate-is-epa-test-weight-less-300.test.ts) holds it to that.

Rules, in order (each one measured against 1,706 crash-test vehicles with
lab-measured curb weights, MY1996 to 2026):
  make       upper case, with aliases; MY2000-2009 rows carry a manufacturer
             group instead of a make; RAM and DODGE are one make
  model      punctuation stripped (F-150 = F150), vPIC models split on '/', text
             in brackets dropped, matched on word n-grams of the EPA name, then
             on a token set (GM C/K15 read as 1500); Series/Trim tried only
             when they look like a model (C300, 328I), never a bare 2500;
             a name that adds a different-vehicle word (BRONCO SPORT for a
             Bronco, GRAND CHEROKEE for a Cherokee) loses to the query's own
             model; when only such names match the level says '+partial';
             a query that names the variant (Civic, Series TYPE R) keeps
             only the rows that carry it ('+variant')
  heavy      GVWR 8,001 lb or more, or 2500/3500/HD in the text: the EPA name
             must carry the same series number
  EV         EVs match only EVs
  engine     displacement within 0.1 L, strictly (a V6 never borrows a V8)
  hybrid     a preference, not a filter
  drive      a preference, recorded in the level when unmatched
  year       Y, then Y-1, Y-2, Y+1
  answer     median_low(ETW) less 300; range = class bounds less 300

Usage: python3 reference_estimate.py < decoded.json   (a vPIC DecodeVinValues result)

The yearly step: when EPA posts a new model year, run build_epa_table.py
--download, commit the regenerated table and fixture, run the desk's tests.
"""
import collections
import json
import math
import os
import re
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ beside the scripts in the repository
sys.path.insert(0, HERE)
from build_epa_table import FOUR, TWO, MAKE_ALIAS, OUT, alnum, toks  # noqa: E402

GV_LO = {'1': 0, '1A': 0, '1B': 3001, '1C': 4001, '1D': 5001, '2E': 6001, '2F': 7001, '2G': 8001, '2H': 9001, '3': 10001,
         '4': 14001, '5': 16001, '6': 19501, '7': 26001, '8': 33001}
HD_RX = re.compile(r'\b(2500|3500|4500|5500|250|350|450|550|HD|SUPER DUTY|SD)\b')
GM_SERIES = re.compile(r'^[CK](15|25|35)(00)?$')
DRIVE_WORDS = {alnum(x) for x in FOUR | TWO}
# Words that, added to the query in an EPA name, make it a different vehicle:
# Bronco and BRONCO SPORT, ProMaster and PROMASTER CITY, Transit and TRANSIT
# CONNECT, Range Rover and RANGE ROVER EVOQUE, Cherokee and GRAND CHEROKEE,
# Civic and CIVIC TYPE R. Trim words (LE, SE, XLE) are not on the list: a
# CAMRY LE/SE is a Camry.
OTHER_MODEL = {'SPORT', 'CITY', 'CONNECT', 'EVOQUE', 'VELAR', 'CLUBMAN', 'COUNTRYMAN', 'PACEMAN', 'TYPE', 'PRIME',
               'CROSS', 'CROSSTOUR', 'ALLROAD', 'ALLTRACK', 'SPORTWAGEN', 'SPORTBACK', 'GRAND', 'MAX', 'XL', 'ESV',
               'EXT', 'LONG', 'WILDERNESS', 'CHASSIS', 'TRAC'}
def gm(t):
    return GM_SERIES.sub(lambda m: m.group(1) + '00', t)


def ngrams(tokens):
    out = set()
    for i in range(len(tokens)):
        for j in range(i + 1, min(len(tokens), i + 4) + 1):
            out.add(''.join(tokens[i:j]))
    return out


def other_model(row_model, query_tokens):
    """True when the EPA name adds a word that makes it a different vehicle from the query."""
    words = {gm(t) for t in toks(row_model)}
    return bool((words - query_tokens) & OTHER_MODEL)


def model_keys(model, make=''):
    keys = set()
    mk = set(toks(make))
    for alt in re.split(r'/', model.upper()):
        tk = [t for t in toks(alt) if t not in mk and alnum(t) not in DRIVE_WORDS]
        keys |= ngrams(tk)
        keys |= ngrams([gm(t) for t in tk])
    return keys


def load_table(path=OUT):
    text = open(path).read()
    start = text.index('export default JSON.parse(') + len('export default JSON.parse(')
    literal = text[start:text.rindex(')')]
    return json.loads(json.loads(literal))


class Table:
    def __init__(self, table):
        self.t = table
        self.groups = {k: set(v) for k, v in table['groups'].items()}
        self.cache = {}

    def year(self, y):
        if y in self.cache:
            return self.cache[y]
        rows = []
        for make, model, disp, drive, flags, etws in self.t['years'].get(str(y), []):
            is_group = make.startswith('@')
            row_make = '' if is_group else make
            tset = set()
            for alt in model.split('/'):
                tset |= {gm(t) for t in toks(alt)}
            rows.append(dict(make=row_make, groups=self.groups.get(make, set()) if is_group else set(), model=model,
                             keys=model_keys(model, row_make), tset=tset, hyb=bool(flags & 1), ev=bool(flags & 2),
                             disp=disp, drive=drive or None, etws=etws))
        self.cache[y] = rows
        return rows

    def candidates(self, year, make, model, series=''):
        make = MAKE_ALIAS.get((make or '').upper(), (make or '').upper())
        mk_ok = {make} | ({'DODGE', 'RAM'} if make in ('RAM', 'DODGE') else set())
        rows = [r for r in self.year(int(year)) if (r['make'] in mk_ok) or (not r['make'] and make in r['groups'])]
        vk = alnum(model)
        mt = [t for t in toks(model) if t not in set(toks(make))]
        want = {vk, alnum(' '.join(mt))}
        hit = [r for r in rows if want & r['keys']]
        if not hit and series:
            want2 = {alnum(model + ' ' + s) for s in series.split()}
            hit = [r for r in rows if want2 & r['keys']]
        if not hit:
            need = {gm(t) for t in mt}
            if need:
                hit = [r for r in rows if need <= r['tset']]
        if hit:
            query = {gm(t) for t in toks(model + ' ' + (series or ''))}
            for r in hit:
                r['other'] = other_model(r['model'], query)
        return hit, 'model'


def vpic_drive(dt):
    d = (dt or '').upper()
    if not d:
        return None
    if 'AWD' in d or '4WD' in d or '4X4' in d or 'ALL' in d or 'FOUR' in d:
        return 4
    if '4X2' in d or 'FWD' in d or 'RWD' in d or 'FRONT' in d or 'REAR' in d or '2WD' in d:
        return 2
    return None


def half_bin(etw):
    return 62.5 if etw <= 4000 else (125 if etw <= 5500 else 250)


def model_names(dec):
    names = []
    raw = re.sub(r'\([^)]*\)', ' ', dec.get('Model') or '')
    for alt in raw.split('/'):
        if alt.strip():
            names.append(alt.strip())
    for k in ('Series', 'Trim'):
        v = re.sub(r'\([^)]*\)', ' ', dec.get(k) or '').strip()
        for w in re.split(r'[\s/,]+', v.upper()):
            if re.fullmatch(r'[A-Z]{1,4}-?\d{2,3}[A-Z]{0,4}|\d{3}[A-Z]{1,3}', w) and w not in names:
                names.append(w)
    return names


def estimate(tab, dec):
    """dict(curb, low, high, etwMedian, etwMin, etwMax, yearUsed, level, n, models) or None."""
    try:
        y = int(dec.get('ModelYear'))
    except (TypeError, ValueError):
        return None
    make = (dec.get('Make') or '').upper()
    try:
        disp = round(float(dec.get('DisplacementL')), 1)
    except (TypeError, ValueError):
        disp = None
    drive = vpic_drive(dec.get('DriveType'))
    fuel = (dec.get('FuelTypePrimary') or '').upper()
    el = (dec.get('ElectrificationLevel') or '').upper()
    is_ev = 'ELECTRIC' == fuel or 'BEV' in el
    is_hyb = ('HEV' in el or 'HYBRID' in el) and not is_ev
    m = re.search(r'Class (\w+)', dec.get('GVWR') or '')
    gv = GV_LO.get(m.group(1)) if m else None
    hd_text = ' '.join([dec.get('Model') or '', dec.get('Series') or '', dec.get('Trim') or '']).upper()
    heavy = (gv is not None and gv >= 8001) or bool(HD_RX.search(hd_text))
    for yy in [y, y - 1, y - 2, y + 1]:
        for name in model_names(dec):
            hit, level = tab.candidates(yy, make, name, dec.get('Series') or '')
            if not hit:
                continue
            if heavy:
                nums = set(re.findall(r'\b(2500|3500|250|350|HD)\b', hd_text))
                hit = [r for r in hit if nums and nums & set(re.findall(r'(2500|3500|250|350|HD)', r['model'].upper()))]
                if not hit:
                    continue
            ev = [r for r in hit if r['ev'] == is_ev]
            if not ev:
                continue
            hit = ev
            if not is_ev and disp is not None:
                h = [r for r in hit if r['disp'] is not None and abs(r['disp'] - disp) <= 0.11]
                if not h:
                    continue
                hit = h
                level += '+disp'
            h = [r for r in hit if r['hyb'] == is_hyb]
            if h:
                hit = h
                level += '+hyb'
            # A short name also matches longer names (ProMaster in PROMASTER
            # CITY, Bronco in BRONCO SPORT): the query's own model wins when
            # it is there, and the level says '+partial' when it is not.
            h = [r for r in hit if not r['other']]
            if h:
                hit = h
            else:
                level += '+partial'
            # And the other way round: when the query names a variant (a
            # Civic with Series TYPE R), the rows that carry it win over the
            # plain model's, which weigh a different car.
            want = {gm(t) for t in toks(name + ' ' + (dec.get('Series') or ''))} & OTHER_MODEL
            if want:
                h = [r for r in hit if want & {gm(t) for t in toks(r['model'])}]
                if h and len(h) < len(hit):
                    hit = h
                    level += '+variant'
            if drive is not None:
                h = [r for r in hit if r['drive'] in (drive, None)]
                if h:
                    hit = h
                    level += '+drive'
                else:
                    level += '+drive-unmatched'
            etws = [e for r in hit for e in r['etws']]
            med = statistics.median_low(etws)
            lo = min(etws) - half_bin(min(etws)) - 300
            hi = max(etws) + half_bin(max(etws)) - 300
            return dict(curb=med - 300, low=math.floor(lo), high=math.ceil(hi), etwMedian=med, etwMin=min(etws),
                        etwMax=max(etws), yearUsed=yy, level=level, n=len(etws),
                        models=sorted(set(r['model'] for r in hit))[:6])
    return None


if __name__ == '__main__':
    print(json.dumps(estimate(Table(load_table()), json.load(sys.stdin)), indent=1))
