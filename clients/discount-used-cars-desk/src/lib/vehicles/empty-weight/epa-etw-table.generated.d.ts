/**
 * The shape of the generated EPA table, written by hand so the type checker
 * never infers one from a 1.3 MB literal. The `.d.ts` resolves before the
 * `.js` for TypeScript; the bundlers load the `.js`.
 *
 * Built by scripts/empty-weight/build_epa_table.py; see that file for the
 * yearly rebuild.
 */

/** [make or @group, EPA model (upper case), displacement L or null for an EV, drive 0|2|4, flags 1 hybrid 2 EV, every ETW tested]. */
export type EpaRow = [string, string, number | null, number, number, number[]];

export type EpaSource = { url: string; file: string; sha256: string; downloaded: string };

export type EpaTable = {
  v: number;
  built: string;
  relation: string;
  rowFormat: string[];
  page: string;
  sources: Record<string, EpaSource[]>;
  groups: Record<string, string[]>;
  years: Record<string, EpaRow[]>;
};

declare const table: EpaTable;
export default table;
