import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { safeBackPath } from "@/lib/sales/capture-back";

/**
 * Two dead ends, found on the owner's phone, not in any test run.
 *
 * The first: the capture page's Leave landed on the manual picker with no way
 * back to the camera and no way anywhere else. "It doesn't give me no choice
 * to do anything else."
 *
 * The second: the mobile bottom tab bar stayed on screen inside the sale
 * corridor, sitting on top of the camera. The admin layout chose the chrome on
 * the server from an x-pathname header, and App Router layouts never re-render
 * on client navigation, so the choice was frozen at the last hard load. It
 * looked right on desktop checks precisely because reloads hid it.
 *
 * These tests anchor to syntax, never to prose, per the house rule.
 */

const CLIENT = readFileSync("src/app/capture/[token]/CaptureClient.tsx", "utf8");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EN = (require("../../messages/en.json") as { funnel: Record<string, Record<string, string>> }).funnel;
const CAPTURE_PAGE = readFileSync("src/app/capture/[token]/page.tsx", "utf8");
const CHROME = readFileSync("src/components/admin/AdminChrome.tsx", "utf8");
const LAYOUT = readFileSync("src/app/admin/layout.tsx", "utf8");
const STEP = readFileSync("src/components/admin/guide/BuyerIdStep.tsx", "utf8");

/**
 * Every shipping .ts/.tsx file under a root, walked without shelling out.
 *
 * Tests are skipped: this very file names the definition inside a regex
 * literal, and a guard that fails on its own assertion text is the failure
 * mode the house rules call out.
 */
function sourceFiles(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root)) {
    if (entry === "__tests__") continue;
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

describe("leave is not one way on the capture screen", () => {
  it("offers a route back to the scanner from the manual picker", () => {
    // The control is the state transition, not its label: pressing it puts
    // the status back where the scanner renders.
    expect(CLIENT).toMatch(/onClick=\{\(\) => setStatus\("scanning"\)\}/);
  });

  it("renders the way back into the sale only off the validated prop", () => {
    // The href is the prop the server validated, never the raw query param.
    expect(CLIENT).toMatch(/\{back \? \(\s*<a[^>]*href=\{back\}/);
    expect(CLIENT).not.toContain("searchParams");
  });

  it("tells the buyer's phone it can be put down after a send", () => {
    // When there is no back path this is somebody else's phone, and the done
    // screen says so instead of stopping silently.
    expect(EN.capture.allSet).toContain("You can put this phone down.");
    expect(CLIENT).toContain("t.allSet");
  });
});

describe("the back param cannot leave the site", () => {
  it("rejects an absolute URL", () => {
    expect(safeBackPath("https://evil.example/x")).toBeNull();
  });

  it("rejects a protocol relative URL", () => {
    expect(safeBackPath("//evil.example")).toBeNull();
  });

  it("rejects everything that is not a guide path", () => {
    expect(safeBackPath("/admin/team")).toBeNull();
    expect(safeBackPath("javascript:alert(1)")).toBeNull();
    expect(safeBackPath(undefined)).toBeNull();
    expect(safeBackPath(["/admin/sales/abc/guide/buyerId"])).toBeNull();
  });

  it("accepts the one shape the licence step actually sends", () => {
    expect(safeBackPath("/admin/sales/abc/guide/buyerId")).toBe(
      "/admin/sales/abc/guide/buyerId",
    );
  });

  it("is what the capture page runs the query param through", () => {
    expect(CAPTURE_PAGE).toMatch(
      /import \{ safeBackPath \} from "@\/lib\/sales\/capture-back"/,
    );
    expect(CAPTURE_PAGE).toMatch(/safeBackPath\(/);
    // And the client only ever receives the validated value.
    expect(CAPTURE_PAGE).toMatch(/back=\{backPath\}/);
  });

  it("rides only the same-phone link, never the QR", () => {
    // The QR is generated on the server from the bare captureUrl; the desk's
    // own phone gets the appended param. If these ever merge back into one
    // string, a buyer's phone gets a door into the admin.
    expect(STEP).toMatch(/back=\$\{encodeURIComponent\(/);
    expect(STEP).toMatch(/guide\/buyerId/);
    expect(STEP).toMatch(/qrDataUrl/);
    expect(STEP).not.toMatch(/qrDataUrl[^\n]*back=/);
  });
});

describe("the admin chrome follows navigation", () => {
  it("decides the frame from the live pathname, on the client", () => {
    expect(CHROME).toContain('"use client"');
    expect(CHROME).toMatch(/usePathname\(\)/);
    expect(CHROME).toMatch(/isSaleFlowPath\(pathname\)/);
  });

  it("gets the corridor test from the one shared definition", () => {
    expect(CHROME).toMatch(
      /import \{ isSaleFlowPath \} from "@\/lib\/admin\/sale-flow-path"/,
    );
  });

  it("defines isSaleFlowPath exactly once in the whole tree", () => {
    const definitions = sourceFiles("src").filter((path) =>
      /(?:function|const)\s+isSaleFlowPath/.test(readFileSync(path, "utf8")),
    );
    expect(definitions).toEqual([join("src", "lib", "admin", "sale-flow-path.ts")]);
  });

  it("leaves the layout no definition of its own", () => {
    // The layout hands the decision to AdminChrome instead of freezing one at
    // the last hard load. A second definition creeping back in here is the
    // drift this guards against.
    expect(LAYOUT).not.toMatch(/function isSaleFlowPath/);
    expect(LAYOUT).toMatch(/import AdminChrome from "@\/components\/admin\/AdminChrome"/);
    expect(LAYOUT).toMatch(/<AdminChrome/);
  });
});
