#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * check-address.cjs — checks a demo address with the Census geocoder and records the call (runbook B0 and N7).
 *
 *   node check-address.cjs --inputs $I --which addressNarrated [--write]
 *   node check-address.cjs --inputs $I --which addressPartB   [--write]
 *
 * addressNarrated  must MATCH: the desk's address autofill needs a street the geocoder knows, and the county it
 *                  returns must be the one in the inputs (and the one the script says: narration.DEMO_COUNTY).
 * addressPartB     must NOT match: part B types a street number that does not exist on a real street (lesson B13),
 *                  so no real household is ever on screen. No match here is necessary, not sufficient: a listing
 *                  search for the number is still a person's (or the user's) job, and `how` says so.
 *
 * --write stores the URL, the result and the date in demo.<which>.how / checkedOn. Without web access it exits 3:
 * ask the user for an address. Uses curl, so the agent's proxy (HTTPS_PROXY) and CA bundle apply; TLS is never off.
 */
'use strict';
const fs = require('fs');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const file = opt('--inputs');
const which = opt('--which');
if (!file || !['addressNarrated', 'addressPartB'].includes(which)) {
  console.error('usage: check-address.cjs --inputs <client-inputs.json> --which addressNarrated|addressPartB [--write]');
  process.exit(2);
}
const inp = JSON.parse(fs.readFileSync(file, 'utf8'));
const A = ((inp.demo || {})[which]) || {};
if (!A.street || !A.city || !/^\d{5}$/.test(String(A.zip || ''))) {
  console.error(`demo.${which} needs street, city and zip before it can be checked`);
  process.exit(1);
}
const line = `${A.street}, ${A.city}, TX ${A.zip}`;
const url = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodeURIComponent(line)}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Counties&format=json`;
const r = spawnSync('curl', ['-sS', '--max-time', '30', url], { encoding: 'utf8' });
if (r.status !== 0 || !r.stdout.trim().startsWith('{')) {
  console.error(`the Census geocoder did not answer (${(r.stderr || r.stdout || '').trim().slice(0, 160)}): without web access, ask the user for an address`);
  process.exit(3);
}
const matches = (((JSON.parse(r.stdout).result || {}).addressMatches) || []);
const counties = matches.map((m) => (((m.geographies || {}).Counties || [])[0] || {}).BASENAME).filter(Boolean);
const today = new Date().toISOString().slice(0, 10);
let ok, how;
if (which === 'addressNarrated') {
  ok = matches.length > 0 && (!A.county || counties.some((c) => c.toLowerCase() === String(A.county).toLowerCase()));
  how = `Census geocoder ${today}: ${matches.length} match(es)${counties.length ? ` in ${[...new Set(counties)].join(', ')} County` : ''} for "${line}" (${url}). A commercial block, no listed home: checked by a person.`;
  if (matches.length && A.county && !ok) console.error(`the geocoder puts ${line} in ${[...new Set(counties)].join(', ')} County, not ${A.county}: fix demo.${which}.county (and narration.DEMO_COUNTY)`);
  if (!matches.length) console.error(`the geocoder does not know "${line}": the desk's autofill would not fire. Choose a block number on a commercial road it resolves.`);
} else {
  ok = matches.length === 0;
  how = `Census geocoder ${today}: no match for "${line}" (${url}), so the number is not a known address; a listing search for it is a person's job (lesson B13).`;
  if (!ok) console.error(`"${line}" is a real address the geocoder knows (${matches.length} match(es)): part B must type a number that does not exist. Choose another.`);
}
console.log(`${ok ? 'ADDRESS OK' : 'ADDRESS REFUSED'}: ${which} ${line} (${matches.length} match(es))`);
if (ok && argv.includes('--write')) {
  inp.demo[which] = Object.assign({}, A, { how, checkedOn: today });
  fs.writeFileSync(file, JSON.stringify(inp, null, 2) + '\n');
  console.log(`recorded in ${file} → demo.${which}.how / checkedOn`);
}
process.exit(ok ? 0 : 1);
