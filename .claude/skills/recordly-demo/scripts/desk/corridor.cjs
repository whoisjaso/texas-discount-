// The desk's sale corridor, as a content hash: what a scenario was walked on, independent of commits. A scenario
// walked on an uncommitted change and the same change committed later hash the same; any edit to the corridor's
// source (the guide, the paperwork questions, the field maps, the admin screens) changes it.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOTS = ['src/lib/sales', 'src/lib/documents/field-maps', 'src/components/admin'];

function files(desk) {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(f);
    }
  };
  for (const r of ROOTS) walk(path.join(desk, r));
  return out.sort();
}

/** sha256 (16 hex) of the corridor's source files, path and content. */
function corridorHash(desk) {
  const h = crypto.createHash('sha256');
  for (const f of files(desk)) {
    h.update(path.relative(desk, f) + '\0');
    h.update(fs.readFileSync(f));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 16);
}

module.exports = { corridorHash, CORRIDOR_ROOTS: ROOTS };

if (require.main === module) {
  const desk = process.argv[2] || process.env.DESK_DIR;
  if (!desk) { console.error('usage: corridor.cjs <desk dir> (or DESK_DIR)'); process.exit(2); }
  console.log(corridorHash(desk));
}
