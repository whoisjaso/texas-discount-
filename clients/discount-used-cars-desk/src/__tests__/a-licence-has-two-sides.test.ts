import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EMPTY_BUYER_ID, readBuyerId } from "@/lib/sales/buyer-id";

/**
 * The sale held a photograph of one side of a two sided document.
 *
 * The back of a licence was decoded and thrown away. That is where the
 * restrictions, the endorsements and the issuing authority's own text live,
 * and it is where every value on the screen actually came from, so a file
 * holding only the front is an incomplete file. Somebody asking to see the
 * licence on a deal is not asking to see half of it.
 *
 * And a separate thing the same run turned up. Chrome will not vibrate a
 * document nobody has touched, and it says so in the console: "Blocked call to
 * navigator.vibrate because user hasn't tapped on the frame or any embedded
 * frame yet." This page is opened by pointing a phone at a QR code on a desk,
 * so nobody ever touches it. Every buzz the scanner tried to give was being
 * swallowed, including the one that was built specifically because it was
 * asked for.
 */

const SCANNER = readFileSync("src/components/sales/LicenceScanner.tsx", "utf8");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EN = (require("../../messages/en.json") as { funnel: Record<string, Record<string, string>> }).funnel;
const CLIENT = readFileSync("src/app/capture/[token]/CaptureClient.tsx", "utf8");
const ROUTE = readFileSync("src/app/api/capture/route.ts", "utf8");
const STEP = readFileSync("src/components/admin/guide/BuyerIdStep.tsx", "utf8");
const PAGE = readFileSync("src/app/admin/sales/[dealId]/guide/[step]/page.tsx", "utf8");
const CSS = readFileSync("src/app/globals.css", "utf8");

describe("the back of the card is kept, not just read", () => {
  it("is somewhere the record can hold it", () => {
    expect(EMPTY_BUYER_ID.backImage).toBeNull();
    expect(readBuyerId({ buyerId: { backImage: "d/1-back.jpg" } }).backImage).toBe("d/1-back.jpg");
  });

  it("is taken from the frame that decoded, not from a later one", () => {
    // The one moment the card is known to be square to the lens, in focus and
    // filling the view, because a barcode that read is proof of all three.
    // Anchored to the decode call in the frame loop, not to the helper that
    // does the decoding, which sits earlier in the file.
    const decode = SCANNER.slice(SCANNER.indexOf("read = await decodeLicence("));
    expect(decode.slice(0, decode.indexOf("return;"))).toContain("await snapshot(false)");
  });

  it("is the whole frame, not the barcode-shaped cutout", () => {
    // Cropping to the frame on that pass would file a photograph of a barcode
    // and lose the rest of the card, which is most of why the back is kept.
    expect(SCANNER).toMatch(/snapshot\(toCutout: boolean\)/);
    expect(SCANNER).toContain("snapshot(true)");
    expect(SCANNER).toContain("snapshot(false)");
  });

  it("is not invented for a card whose barcode never read", () => {
    // A photograph nobody framed successfully is not evidence of anything.
    const skip = SCANNER.slice(SCANNER.indexOf("function skipBarcode"));
    expect(skip.slice(0, skip.indexOf("}\n"))).toContain("back: null");
  });

  it("travels with the front", () => {
    expect(CLIENT).toContain('body.set("back", back');
  });

  it("is stored, and never at the cost of the front", () => {
    // The front is what somebody at a desk is waiting on. A second image
    // failing must not fail the first.
    const block = ROUTE.slice(ROUTE.indexOf("let backPath"));
    expect(block.slice(0, block.indexOf("\n  }"))).toContain("if (!error) backPath = at");
    expect(ROUTE).not.toMatch(/backPath[\s\S]{0,200}return NextResponse\.json\(\s*\{\s*error/);
  });

  it("survives a retake that sends no back", () => {
    expect(ROUTE).toContain("backImage: backPath ?? held.backImage");
  });

  it("survives the reader's second write", () => {
    // The front-of-card pass rewrites the row seconds later, and every key it
    // does not carry forward is a key it erases.
    const late = ROUTE.slice(ROUTE.indexOf("const filled = {"));
    expect(late.slice(0, late.indexOf("};"))).toContain("backImage: held.backImage");
  });
});

describe("the confirmation is the two photographs and the values together", () => {
  it("signs a link for the back as well", () => {
    expect(PAGE).toContain("backUrl = await sign(held.backImage)");
  });

  it("shows both sides on the screen that asks you to check the values", () => {
    // A person checking a licence number against a card looks at the card, so
    // the card belongs on the same screen as the number rather than one tap
    // away from it. That is the whole reason there is no separate step.
    expect(STEP).toContain("ed-idcap-shots");
    // The words live in the catalogue now, pinned in EN, referenced by key.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const buyerId = (require("../../messages/en.json") as {
      funnel: { buyerId: Record<string, string> };
    }).funnel.buyerId;
    expect(buyerId.frontAlt).toBe("The front of the licence");
    expect(buyerId.backAlt).toBe("The back of the licence");
    expect(STEP).toContain("t.buyerId.frontAlt");
    expect(STEP).toContain("t.buyerId.backAlt");
  });

  it("names which is which", () => {
    // Two pictures of one card at a glance are two pictures of one card.
    expect(STEP).toMatch(/<figcaption[^>]*>\{t\.buyerId\.front\}<\/figcaption>/);
    expect(STEP).toMatch(/<figcaption[^>]*>\{t\.buyerId\.back\}<\/figcaption>/);
  });

  it("gives them equal boxes so the captions line up", () => {
    // They do not arrive the same shape: one is cropped to a cutout and one is
    // a whole sensor frame.
    const rule = CSS.slice(CSS.indexOf(".ed-idcap-side .ed-idcap-shot {"));
    const body = rule.slice(0, rule.indexOf("}"));
    expect(body).toContain("aspect-ratio");
    expect(body).toContain("object-fit: contain");
  });
});

describe("the tap that makes the phone able to buzz at all", () => {
  it("holds the camera until the document has been touched", () => {
    expect(SCANNER).toMatch(/type Stage =\s*\|?\s*"ready"/);
    expect(SCANNER).toContain('if (stage === "ready") return;');
  });

  it("says why in the code, because the reason is not guessable", () => {
    expect(SCANNER).toMatch(/navigator\.vibrate/);
  });

  it("takes the picture itself, and lets a person take it too", () => {
    /*
      This used to assert there was no shutter at all, on the grounds that
      asking somebody to judge their own photograph is asking for something
      they cannot do at arm's length. That was right about the judging and
      wrong about the taking.

      The owner walked it in a real room: the quality gate fires in a second
      under a desk lamp and never fires in a dim showroom against a worn card,
      and the person holding the card can see the picture is fine long before a
      statistic about pixels agrees. So the phone still takes it by itself, and
      the shutter is there for when it will not.
    */
    expect(SCANNER).toContain("shouldCapture(streak.current)");
    expect(SCANNER).toContain("ed-scan-shutter");
    // Offered on both aiming passes, not just the front.
    expect(SCANNER).toContain('stage === "front" || stage === "back"');
  });

  it("holds each side still and asks before keeping it", () => {
    // The judging happens on a frozen frame, which is the only moment anybody
    // can see a thumb over a corner or glare across the barcode.
    expect(SCANNER).toContain('"frontReview"');
    expect(SCANNER).toContain('"backReview"');
    expect(SCANNER).toContain("function retake()");
    expect(SCANNER).toContain("function keep()");
    expect(SCANNER).toContain("Retake");
  });

  it("has a way out of a screen that has taken the whole display", () => {
    // A camera with no exit is a trap, and worse on a desk machine where there
    // is no swipe back.
    expect(SCANNER).toContain("onExit");
    expect(SCANNER).toContain("ed-scan-leave");
    // On both the ready screen and the camera itself.
    expect(SCANNER.match(/ed-scan-leave/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("does not run the frame loop before the camera is open", () => {
    expect(SCANNER).toMatch(/current === "ready" \|\|[\s\S]{0,40}current === "starting"/);
    // Nor while a still is being looked at: the frame under review must not be
    // replaced beneath the person reviewing it.
    expect(SCANNER).toMatch(/current === "frontReview" \|\|[\s\S]{0,40}current === "backReview"/);
  });
});

describe("a card already photographed does not have to be photographed again", () => {
  it("offers the library as well as the camera", () => {
    // `capture` is an override, not a preference: an input carrying it opens
    // the camera and never offers the library, so it takes two inputs.
    const inputs = CLIENT.match(/<input[\s\S]{0,220}?\/>/g) ?? [];
    const withCapture = inputs.filter((tag) => tag.includes("capture="));
    const withoutCapture = inputs.filter((tag) => !tag.includes("capture=") && tag.includes('type="file"'));
    expect(withCapture.length).toBeGreaterThan(0);
    expect(withoutCapture.length).toBeGreaterThan(0);
  });

  it("takes both sides from one pick", () => {
    expect(CLIENT).toContain("files[0], files[1] ?? null");
  });

  it("asks for both sides in the copy", () => {
    // Nobody turns the card over unasked.
    expect(EN.capture.title).toBe("The Licence, Both Sides");
    expect(CLIENT).toContain("t.title");
  });
});

describe("the frame on the back pass looks like the thing it wants", () => {
  it("is drawn as a stacked code, not as an empty rectangle", () => {
    const rule = CSS.slice(CSS.indexOf('.ed-scan-cutout[data-stage="back"] {'));
    const body = rule.slice(0, rule.indexOf("\n}"));
    // Two gradients: bars across, rows down. One alone is a supermarket
    // barcode or a set of rules, and neither reads as a PDF417.
    expect(body.match(/repeating-linear-gradient/g)?.length).toBe(2);
  });

  it("stays faint enough to see the card through", () => {
    // This is a window onto a camera. An overlay somebody cannot read the card
    // through is an overlay that prevents the alignment it exists to help.
    const rule = CSS.slice(CSS.indexOf('.ed-scan-cutout[data-stage="back"] {'));
    const body = rule.slice(0, rule.indexOf("\n}"));
    const alphas = [...body.matchAll(/rgba\([^)]*?([\d.]+)\)/g)].map((m) => Number(m[1]));
    expect(alphas.length).toBeGreaterThan(0);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(0.35);
  });
});
