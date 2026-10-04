/**
 * The co-buyer, as the sale holds them.
 *
 * Start A Sale has always offered "Add a co-buyer" and saved the name on the
 * buyer's customer record, where nothing read it: every bill of sale, 130-U
 * and contract printed the co-buyer boxes empty, on a sale whose intake had
 * named one. The customer record is shared by every sale that buyer ever
 * makes, so it is the wrong place for a fact of one sale. The name is kept
 * on the sale (`step_data.coBuyer`), written at intake, and read from here
 * by every document.
 *
 * The co-buyer signs in ink beside their printed name (owner decision D-02:
 * a second signing pad is not built), and writes their own address and ID
 * there too until the co-buyer step exists.
 */
export const CO_BUYER_KEY = "coBuyer";

export type CoBuyer = { name: string };

export function readCoBuyer(stepData: unknown): CoBuyer {
  if (!stepData || typeof stepData !== "object") return { name: "" };
  const held = (stepData as Record<string, unknown>)[CO_BUYER_KEY];
  if (!held || typeof held !== "object") return { name: "" };
  const name = (held as Record<string, unknown>).name;
  return { name: typeof name === "string" ? name.trim() : "" };
}

export function writeCoBuyer(stepData: unknown, coBuyer: CoBuyer): Record<string, unknown> {
  const base = stepData && typeof stepData === "object" ? { ...(stepData as Record<string, unknown>) } : {};
  const name = coBuyer.name.trim();
  if (!name) {
    delete base[CO_BUYER_KEY];
    return base;
  }
  base[CO_BUYER_KEY] = { name };
  return base;
}
