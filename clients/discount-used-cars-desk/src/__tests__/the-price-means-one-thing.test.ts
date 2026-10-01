import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  EMPTY_MONEY,
  FEE_TOTAL,
  isMoneySettled,
  readMoney,
  BALANCE_OWED_REASON,
  saleMoney,
  splitOutTheDoor,
  writeMoney,
} from "@/lib/sales/money";
import { paperworkMoney, paperworkQuestions } from "@/lib/sales/paperwork";
import { buildGuideSteps } from "@/lib/sales/guide";

/**
 * The price on a windscreen meant two things and the software knew neither.
 *
 * "Four thousand" is either the car or the car plus tax and fees, and the two
 * readings are $618.75 apart on a $3,500 vehicle. Nothing in the product asked
 * which, so every document downstream took the number literally and a deal
 * quoted out-the-door printed a bill of sale $618.75 over what the buyer had
 * agreed to pay.
 *
 * The second half is the one with money in it. A buyer can take the car today
 * and leave the registration for later. In Texas a dealer who hands over plates
 * has to complete that registration, so a buyer who never comes back leaves the
 * lot to file it out of its own pocket or answer to the DMV. The lien is the
 * leverage: the unpaid balance is secured on the title, the title comes here
 * rather than to their house, and it is released when they pay.
 *
 * These tests exist to fail if either answer stops reaching a document, or if
 * the arithmetic stops adding up to what the buyer was actually quoted.
 */

const GUIDE_PAGE = readFileSync(
  "src/app/admin/sales/[dealId]/guide/[step]/page.tsx",
  "utf8",
);
const PAPERWORK_PAGE = readFileSync(
  "src/app/admin/sales/[dealId]/paperwork/[doc]/[q]/page.tsx",
  "utf8",
);
const REVIEW = readFileSync("src/components/admin/paperwork/ReviewStep.tsx", "utf8");
const PREVIEW = readFileSync("src/components/documents/BillOfSalePreview.tsx", "utf8");
// The 130-U's field mapping moved out of the route and into a shared module
// when the sale corridor stopped rendering an HTML replica of the state form
// and started filling the real one. Both routes read from here now, so this
// is where the lien key lives.
// The 130-U's reading of the agreement moved out of the route into a pure
// module a unit test can import; the key it reads the lien from lives there.
const ROUTE_130U = readFileSync("src/lib/fill-130u/from-agreement.ts", "utf8");
const CSS = readFileSync("src/app/globals.css", "utf8");
const STEP = readFileSync("src/components/admin/guide/MoneyStep.tsx", "utf8");
const GUIDE = readFileSync("src/lib/sales/guide.ts", "utf8");
const GUIDE_SCREEN = readFileSync(
  "src/components/admin/guide/GuideStepScreen.tsx",
  "utf8",
);
// The corridor's words live in the catalogue now, so the operator can read
// them in either language. The EN entries are the canonical copy these
// guards score and pin; the components are checked for referencing the keys.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EN_FUNNEL = (require("../../messages/en.json") as { funnel: { money: Record<string, string>; review: { money: Record<string, string> } } }).funnel;

const cents = (amount: number) => Math.round(amount * 100);

describe("what the advertised price meant", () => {
  it("puts tax and fees on top when the price is the car alone", () => {
    const money = saleMoney(3500, { priceBasis: "vehicleOnly" });
    expect(money.salePrice).toBe(3500);
    expect(money.tax).toBe(218.75);
    expect(money.feeTotal).toBe(400);
    expect(money.total).toBe(4118.75);
  });

  it("works backwards when the price is what they drive away for", () => {
    const money = saleMoney(4000, { priceBasis: "outTheDoor" });
    expect(money.salePrice).toBe(3388.24);
    expect(money.tax).toBe(211.76);
    expect(money.feeTotal).toBe(400);
    expect(money.total).toBe(4000);
  });

  it("adds up to the quoted figure exactly, at every price", () => {
    /*
      The one that catches the obvious implementation.

      Back-solve the price, round it to cents, then charge 6.25% of the rounded
      number and the three lines land a cent either side of what the buyer was
      quoted. A bill of sale whose own column does not sum to its own total is
      the kind of thing a customer notices and nobody can explain at the desk.
      Taking the tax as the remainder is exact by construction, and this is what
      says so.
    */
    for (let quoted = 500; quoted <= 40000; quoted += 13.37) {
      const advertised = Math.round(quoted * 100) / 100;
      const { salePrice, tax } = splitOutTheDoor(advertised);
      expect(cents(salePrice) + cents(tax) + cents(FEE_TOTAL)).toBe(cents(advertised));
    }
  });

  it("does not invent a negative car out of a price below the fees", () => {
    const money = saleMoney(200, { priceBasis: "outTheDoor" });
    expect(money.salePrice).toBe(0);
    expect(money.tax).toBe(0);
  });
});

describe("the registration that was not paid", () => {
  it("leaves tax and fees owed, and calls it a lien", () => {
    const money = saleMoney(3500, { priceBasis: "vehicleOnly", paidTodayAmount: "3500" });
    expect(money.total).toBe(4118.75);
    expect(money.paidToday).toBe(3500);
    expect(money.lien).toBe(618.75);
    // The whole of what is left, not a part of it: the state's tax, its two
    // fees and ours are all unpaid on a car that drove off today.
    expect(money.lien).toBe(money.registrationCost);
  });

  it("leaves nothing owed when it is paid", () => {
    const money = saleMoney(3500, { priceBasis: "vehicleOnly" });
    expect(money.paidToday).toBe(money.total);
    expect(money.lien).toBe(0);
  });

  it("still owes the registration on an out-the-door price", () => {
    // Agreeing a drive-away figure is not the same as having paid it.
    const money = saleMoney(4000, { priceBasis: "outTheDoor", paidTodayAmount: "3388.24" });
    expect(money.paidToday).toBe(3388.24);
    expect(money.lien).toBe(611.76);
    expect(money.paidToday + money.lien).toBe(4000);
  });

  it("raises no lien on a deal nobody has been asked about", () => {
    // A lien is a deliberate act with a title behind it. An unanswered screen
    // must not grow one, and the default has to be the safe direction.
    const money = saleMoney(3500, EMPTY_MONEY);
    expect(money.lien).toBe(0);
    expect(money.basis).toBe("vehicleOnly");
  });

  it("taxes the price less the trade-in, which is the statute", () => {
    /*
      Tax Code section 152.021 as the Comptroller applies it: a $42,000 car
      with a $15,000 trade is taxed on $27,000. This product charged tax on
      the full price and took the trade off afterwards, overtaxing every
      trade-in deal by 6.25% of the allowance. Found by the research pass and
      verified against the Comptroller's own worked example.
    */
    const money = saleMoney(3500, { priceBasis: "vehicleOnly", paidTodayAmount: "2500" }, 1000);
    expect(money.tax).toBe(156.25);
    expect(money.total).toBe(3056.25);
    expect(money.paidToday).toBe(2500);
    expect(money.lien).toBe(556.25);
  });
});

describe("what they actually handed over", () => {
  /*
    This was derived, and derived is not the same as known.

    The figure was the car less any trade-in, which is the ordinary shape of
    the deal and therefore right most of the time. Most of the time is not good
    enough for a number this dealership will hold a title over: a buyer who
    puts three thousand down on a thirty five hundred dollar car leaves owing
    $1,118.75, and no screen in the product could say so.
  */
  const answers = (paidTodayAmount: string) => ({
    paidTodayAmount,
    priceBasis: "vehicleOnly" as const,
  });

  it("is whatever the dealer typed", () => {
    const money = saleMoney(3500, answers("3000"));
    expect(money.total).toBe(4118.75);
    expect(money.paidToday).toBe(3000);
    expect(money.lien).toBe(1118.75);
  });

  it("falls back to the whole total until somebody is asked", () => {
    /*
      The total, not the car, and the difference matters.

      Falling back to the car would put $618.75 on the title of every deal
      nobody has opened this screen on. An unanswered question must not
      manufacture a balance. The screen prefills its box with the likely figure
      instead, which is a different thing: a prefill only becomes an answer
      when somebody moves past it.
    */
    expect(saleMoney(3500, answers("")).paidToday).toBe(4118.75);
    expect(saleMoney(3500, answers("")).lien).toBe(0);
  });

  it("survives the way people type money", () => {
    for (const typed of ["$3,000", " 3000 ", "3000.00", "$ 3,000.00"]) {
      expect(saleMoney(3500, answers(typed)).paidToday).toBe(3000);
    }
  });

  it("does not take a half-typed number for an answer", () => {
    // Mid-keystroke a box can hold "$" or "." or nothing at all. Reading any
    // of those as a figure would put a balance on the title mid-typing.
    for (const typed of ["$", ".", "abc", "-"]) {
      expect(saleMoney(3500, answers(typed)).lien).toBe(0);
    }
  });

  it("refuses to pay more than the deal is worth", () => {
    // A typo, not an instruction, and it would otherwise produce a negative
    // balance owed.
    const money = saleMoney(3500, answers("99999"));
    expect(money.paidToday).toBe(4118.75);
    expect(money.lien).toBe(0);
  });

  it("refuses a negative payment", () => {
    expect(saleMoney(3500, answers("-500")).paidToday).toBe(0);
    expect(saleMoney(3500, answers("-500")).lien).toBe(4118.75);
  });

  it("says what a yes or no never could", () => {
    /*
      The screen this replaced asked "are they paying it all today", yes or no,
      and then asked the amount underneath it. Two answers about one fact, free
      to disagree.

      $3,800 handed over on a $3,500 car with $618.75 of tax and fees is
      neither of those answers: not paying it all, not paying for the car
      alone. The old pair had nowhere to write it down and this one needs no
      extra question to.
    */
    const money = saleMoney(3500, answers("3800"));
    expect(money.total).toBe(4118.75);
    expect(money.paidToday).toBe(3800);
    expect(money.lien).toBe(318.75);
  });

  it("needs no second answer to know a deal is settled", () => {
    // Paying the exact total is a paid deal, and nobody had to claim it was.
    const money = saleMoney(3500, answers("4118.75"));
    expect(money.paidToday).toBe(money.total);
    expect(money.lien).toBe(0);
  });

  it("reaches the bill of sale as the balance", () => {
    const filed = paperworkMoney(3500, {}, answers("3000"));
    expect(filed.sellerLienEnabled).toBe(true);
    expect(filed.sellerLienAmount).toBe(1118.75);
  });
});

describe("what the answers are worth to the deal", () => {
  it("survives the round trip", () => {
    const written = writeMoney(
      { other: "kept" },
      { amount: "4000", paidTodayAmount: "3000", priceBasis: "outTheDoor" },
    );
    expect(written.other).toBe("kept");
    expect(readMoney(written)).toEqual({
      amount: "4000",
      paidTodayAmount: "3000",
      priceBasis: "outTheDoor",
    });
  });

  it("does not let an old deal's paid figure pose as the spoken amount", () => {
    /*
      Deals from before the amount question hold only what was handed over. On
      a deal that paid the whole total, reading that figure back as the car's
      price would recompute a bigger total and invent a balance on a sale that
      closed clean. So the old figure stays only a paid figure, and the
      arithmetic keeps anchoring on the vehicle row for those deals.
    */
    const old = readMoney({ money: { paidTodayAmount: "4118.75", priceBasis: "vehicleOnly" } });
    expect(old.amount).toBe("");
    const money = saleMoney(3500, old);
    expect(money.total).toBe(4118.75);
    expect(money.lien).toBe(0);
  });

  it("refuses a value that is not one of the answers", () => {
    // `step_data` is an untyped JSON column shared by every step of the sale.
    expect(readMoney({ money: { priceBasis: "cheap", paidTodayAmount: 3000 } })).toEqual(
      EMPTY_MONEY,
    );
  });

  it("is not settled until both are answered", () => {
    expect(isMoneySettled(EMPTY_MONEY)).toBe(false);
    expect(isMoneySettled({ amount: "3000", paidTodayAmount: "", priceBasis: "" })).toBe(false);
    expect(isMoneySettled({ amount: "", paidTodayAmount: "", priceBasis: "vehicleOnly" })).toBe(
      false,
    );
    expect(
      isMoneySettled({ amount: "3000", paidTodayAmount: "", priceBasis: "vehicleOnly" }),
    ).toBe(true);
    // A deal from before the amount question holds only a paid figure, and on
    // those deals it was the answer.
    expect(
      isMoneySettled({ amount: "", paidTodayAmount: "3000", priceBasis: "vehicleOnly" }),
    ).toBe(true);
  });
});

describe("the lien reaching the paper", () => {
  const unpaid = paperworkMoney(3500, {}, { priceBasis: "vehicleOnly", paidTodayAmount: "3500" });

  it("arrives in the three keys the documents already read", () => {
    // The bill of sale and the 130-U have carried a seller lien since long
    // before this flow existed. What they never had was anything deciding when
    // to raise one, so nothing ever did.
    expect(unpaid.sellerLienEnabled).toBe(true);
    expect(unpaid.sellerLienAmount).toBe(618.75);
    expect(unpaid.sellerLienReason).toBe(BALANCE_OWED_REASON);
  });

  it("is off on a deal that is paid", () => {
    const paid = paperworkMoney(3500, {}, { priceBasis: "vehicleOnly" });
    expect(paid.sellerLienEnabled).toBe(false);
    expect(paid.sellerLienAmount).toBe(0);
  });

  it("is filed with the document rather than only drawn on the screen", () => {
    expect(REVIEW).toContain("...(money ?? {})");
  });

  it("is read by the 130-U from the same key", () => {
    expect(ROUTE_130U).toContain("sellerLienAmount");
    expect(ROUTE_130U).toContain("has_lien: hasLien");
  });

  it("uses semantic lien red on screen and prints it in ink", () => {
    const billOfSaleCss = CSS.slice(
      CSS.indexOf("/* Bill of Sale"),
      CSS.indexOf("/* ---------- Funding fork"),
    );
    const printRules = billOfSaleCss.slice(billOfSaleCss.indexOf("@media print"));

    expect(PREVIEW).toContain("b.sellerLienBalanceLine");
    expect(billOfSaleCss).toMatch(
      /\.bos-lien-figure,[\s\S]*?color:\s*var\(--tj-lien\)/,
    );
    expect(printRules).toMatch(
      /\.bos-print,[\s\S]*?\.bos-print \*[\s\S]*?color:\s*#111111 !important/,
    );
  });

  it("is red on the screen that files it too, and legibly", () => {
    // A colour defined only in a dark block, or only in a light one, is a
    // colour that disappears for half the people looking at it.
    // Vega's desk is on the public site's pale grey ground (#eeeff2), where
    // the paper red (#B3261E) measures about 5.8:1 and clears AA.
    expect(CSS).toMatch(/--tj-lien:\s*#B3261E/i);
    expect(CSS.match(/--tj-lien:/g)?.length).toBeGreaterThanOrEqual(3);
    expect(CSS).toContain(".ed-paper-lien dt,");
  });
});

describe("where the question is asked", () => {
  const sale = {
    id: "d1",
    stepData: {
      // Documents now derive from the sale plan as well as the funding, so a
      // fixture that wants document steps has to answer it. That dependency
      // is the point: the packet cannot be built before the questions that
      // decide it.
      salePlan: {
        registrationBy: "dealer",
        titleSignedBy: "buyer",
        priceIncludesRegistration: null,
        inspectionBy: "done",
        insuranceShown: true,
      },
    },

    buyer: { name: "A Buyer" },
    funding: { type: "cash", lenderId: null, lenderOther: null },
    documents: [],
    vehicle: { salePrice: 3500 },
    plate: null,
  } as never;

  it("is two steps of the sale, not two questions on one screen", () => {
    /*
      They were one screen holding both, on the argument that a running total
      is what makes either answerable. The rule is one question a page the
      whole way through, because somebody covering a desk for the first time
      reads one thing and answers it, and a page with two questions on it is a
      page where the second gets missed.
    */
    const keys = buildGuideSteps(sale).map((step) => step.key);
    expect(keys).toContain("paid");
    expect(keys).toContain("price");
  });

  it("asks the amount before asking what it means", () => {
    /*
      This order has flipped twice, and the second flip is the owner's, in his
      own words: ask how much they are paying, then whether that includes tax
      and fees, because the second answer decides which way the deal goes.

      The first flip put the basis first so the amount could be offered as
      taps, and the taps were the mistake. Their figures came from the vehicle
      row, so a car listed at $0 opened the flow with "the car is marked
      $0.00" and there was no box anywhere to say what the deal was for. An
      open amount box asked cold has no such dependency, and its figure is the
      anchor everything else is computed from.
    */
    const keys = buildGuideSteps(sale).map((step) => step.key);
    expect(keys.indexOf("price")).toBe(keys.indexOf("paid") + 1);
  });

  it("starts the box at the marked price, and empty when there is none", () => {
    // A prefill is a suggestion; a $0 in the box would read as an answer
    // somebody already gave. The walkthrough car was listed at $0.
    expect(STEP).toContain('advertised > 0 ? String(advertised) : ""');
    expect(EN_FUNNEL.money.noMarked).toBe(
      "This car has no marked price. Type what they agreed to.",
    );
    expect(STEP).toContain("t.money.noMarked");
  });

  it("anchors every figure on the typed amount, not the vehicle row", () => {
    // The row prefills; the answer rules. A car listed at $0 sold for $4,000
    // must compute as a $4,000 deal.
    const money = saleMoney(0, { amount: "4000", priceBasis: "outTheDoor" });
    expect(money.total).toBe(4000);
    expect(money.salePrice).toBe(3388.24);
    expect(money.lien).toBe(0);
  });

  it("works out what crossed the desk from the amount and its meaning", () => {
    /*
      One typed figure serves both questions. On an out-the-door deal it is
      the total, so nothing is owed. On a car-alone deal it covers the car,
      so the tax and fees are the balance: exactly what the basis answer
      says out loud. The override box exists for the sale that is neither,
      and only that sale writes a second figure.
    */
    const carAlone = saleMoney(0, { amount: "3500", priceBasis: "vehicleOnly" });
    expect(carAlone.paidToday).toBe(3500);
    expect(carAlone.lien).toBe(618.75);

    const outTheDoor = saleMoney(0, { amount: "4000", priceBasis: "outTheDoor" });
    expect(outTheDoor.paidToday).toBe(4000);
    expect(outTheDoor.lien).toBe(0);

    const partial = saleMoney(0, {
      amount: "3500",
      priceBasis: "vehicleOnly",
      paidTodayAmount: "2000",
    });
    expect(partial.paidToday).toBe(2000);
    expect(partial.lien).toBe(2118.75);
  });

  it("has no yes or no about it left to disagree with the amount", () => {
    // Two answers about one fact could contradict each other: a yes with three
    // thousand typed under it. There is one answer now.
    const keys = buildGuideSteps(sale).map((step) => step.key);
    expect(keys).not.toContain("balance");
    expect(GUIDE).not.toContain("registrationPaid");
    expect(STEP).not.toContain("registrationPaid");
  });

  it("asks both before anything gets printed", () => {
    // Three documents read from these two answers: the bill of sale wants the
    // total and the balance, the 130-U wants the balance, and the vehicle
    // responsibility form wants what the tax and fees come to.
    const keys = buildGuideSteps(sale).map((step) => step.key);
    const firstDocument = keys.findIndex((key) => key.startsWith("document:"));
    expect(firstDocument).toBeGreaterThan(keys.indexOf("price"));
  });

  it("counts each as its own unanswered step", () => {
    const steps = buildGuideSteps(sale);
    expect(steps.find((step) => step.key === "paid")?.done).toBe(false);
    expect(steps.find((step) => step.key === "price")?.done).toBe(false);
  });

  it("marks only the one that was answered", () => {
    // Half an answer is not an answer to the other half.
    const half = {
      ...(sale as object),
      stepData: { money: { paidTodayAmount: "3500" } },
    } as never;
    const steps = buildGuideSteps(half);
    expect(steps.find((step) => step.key === "paid")?.done).toBe(true);
    expect(steps.find((step) => step.key === "price")?.done).toBe(false);
  });

  it("carries its own Next on the box, and the nav's on the choice", () => {
    // A keyboard has no moment that means done, so the amount page submits its
    // own form. The price page produces the figures somebody reads out loud,
    // so neither answer moves it on.
    expect(STEP).toContain("ed-money-next");
    // The exclusion moved from a list of step keys to a typed advanceMode:
    // a growing key list meant every new self-advancing step had to remember
    // to add itself or it silently grew a skip button, which is exactly what
    // happened to the prescreen questions.
    expect(GUIDE_SCREEN).toContain('advanceMode !== "self"');
    expect(GUIDE_SCREEN).toMatch(/questionKind === "paid"[\s\S]{0,120}"self"/);
    expect(STEP).toContain('answer({ priceBasis: "outTheDoor" }, null)');
    expect(STEP).toContain('answer({ priceBasis: "vehicleOnly" }, null)');
  });

  it("draws no receipt from an answer nobody has given", () => {
    // A total on screen before the basis is chosen is a number somebody will
    // read as ours.
    expect(STEP).toContain('const basisAnswered = answers.priceBasis !== "";');
    expect(STEP).toContain("{basisAnswered ? (");
  });

  it("does not write to the database once per keystroke", () => {
    // The box is held locally while it is typed; the deal is written once,
    // when Next is pressed. A save per keystroke would be a round trip per
    // digit, and a half-typed "3" written to the deal is a $3 car.
    expect(STEP).toContain("onChange={(event) => setTyped(event.target.value)}");
    expect(STEP).toContain("answer({ amount: typed }, nextHref)");
    expect(STEP).not.toMatch(/onChange[^}]*saveSaleMoney/);
  });

  it("refuses to move on with an empty box", () => {
    // Next is the only way forward and it will not fire on nothing: an empty
    // amount is not an answer, and a deal must not advance holding one.
    expect(STEP).toContain("const answered = figure !== null && figure > 0;");
    expect(STEP).toContain("disabled={pending || !answered}");
  });

  it("moves on even though the save came first", () => {
    /*
      The bug this exists for, found by walking it rather than reading it.

      Saving and navigating were both `startTransition` calls on one
      `useTransition` hook, and the second one's `router.push` was dropped:
      the amount saved, no error appeared, and the sale sat still.

      The fix is to await the save and push outside any transition.
    */
    // Matched as an import and as a call, not as a word: the comment above
    // this code names the hook to explain why it is not there, and a bare
    // string check fails on its own explanation.
    expect(STEP).not.toMatch(/import \{[^}]*useTransition[^}]*\} from "react"/);
    expect(STEP).not.toMatch(/useTransition\(\)/);
    expect(STEP).toContain("const result = await saveSaleMoney(dealId, patch);");
    expect(STEP).toContain("if (goingTo) router.push(goingTo);");
  });

  it("is rendered by both steps it belongs to", () => {
    expect(GUIDE_SCREEN).toContain('current.key === "paid" || current.key === "price"');
  });
});

/**
 * The reading level, measured rather than hoped for.
 *
 * The brief: dealers using this run on a vocabulary no greater than a sixth
 * grade level, and the barrier to entry has to be low enough that anyone
 * handed the phone gets it right. That is a testable claim, so it is tested.
 *
 * Flesch-Kincaid grade, on the copy of the money screens and on every question
 * the guide asks in its own words. The document steps are excluded because
 * their wording is a legal form's name: "Vehicle Responsibility Acknowledgment"
 * scores near university and is not ours to rename.
 */
export function syllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return 0;
  if (clean.length <= 3) return 1;
  const trimmed = clean
    // A trailing silent e, and the -ed that does not add a beat.
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "");
  return Math.max(1, (trimmed.match(/[aeiouy]{1,2}/g) ?? []).length);
}

export function gradeLevel(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const sentences = Math.max(1, (text.match(/[.!?]+/g) ?? []).length);
  const beats = words.reduce((total, word) => total + syllables(word), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (beats / words.length) - 15.59;
}

/**
 * Why a label is not scored the way a sentence is.
 *
 * Flesch-Kincaid needs a sentence. "Total" is one word of two syllables and
 * scores 8.4, which says nothing about the word "Total" and everything about
 * feeding a words-per-sentence formula something with no sentence in it. Left
 * that way the guard would fail on the plainest words on the screen and get
 * loosened, which is worse than not having it.
 *
 * So a fragment under four words is judged the way a label should be: no word
 * longer than three syllables. Anything longer is a sentence and gets a grade.
 * Returns why it is too hard, or null when it reads.
 */
/**
 * Words of the trade, which the syllable rule measures wrongly.
 *
 * Syllable count is a proxy for how hard a word is, and it is the wrong proxy
 * for a word this reader says fifty times a day. "Registration" is four
 * syllables and is printed on every 130-U that crosses this desk; a dealer
 * reads it faster than most three-letter words in the language.
 *
 * Kept as a short, named list rather than as a raised threshold, because the
 * threshold is doing real work everywhere else. It is the difference between
 * an exception and a loosening. Anything added here should be a word the trade
 * itself uses, not a word we would like to get away with.
 */
const TRADE_WORDS = new Set(["registration", "vehicle", "odometer", "inventory"]);

export function tooHardToRead(text: string): string | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 4) {
    const long = words.find(
      (word) =>
        syllables(word) > 3 && !TRADE_WORDS.has(word.toLowerCase().replace(/[^a-z]/g, "")),
    );
    return long ? `"${long}" is ${syllables(long)} syllables` : null;
  }
  const grade = gradeLevel(text);
  return grade > 6 ? `grade ${grade.toFixed(1)}` : null;
}

/**
 * Every string the two money screens put in front of a person, paired with
 * the catalogue entry that carries it. The catalogue is where the copy lives
 * now, so the guard scores the entry a person actually reads and pins it —
 * a rewrite of the EN money copy fails here, exactly as it did when the
 * strings lived in the component.
 */
const MONEY_COPY: Array<[spoken: string, catalogueKey: string, entry: string]> = [
  ["How Much Are They Paying?", "guide.paid", "How Much Are They Paying?"],
  [
    "Does That Include Tax And Fees?",
    "money.basisHeading",
    "Does That Include Tax And Fees?",
  ],
  [
    "How Much Are They Paying Today?",
    "money.amountHeading",
    "How Much Are They Paying Today?",
  ],
  [
    "What Is The Down Payment Today?",
    "money.downPaymentHeading",
    "What Is The Down Payment Today?",
  ],
  ["The car is marked $3,500.", "money.marked", "The car is marked {price}."],
  [
    "This car has no marked price. Type what they agreed to.",
    "money.noMarked",
    "This car has no marked price. Type what they agreed to.",
  ],
  ["They are paying $3,500.", "money.paying", "They are paying {price}."],
  ["Yes", "money.yes", "Yes"],
  ["That is the whole price", "money.yesGloss", "That is the whole price"],
  ["No", "money.no", "No"],
  ["Tax and fees go on top", "money.noGloss", "Tax and fees go on top"],
  ["Car", "money.car", "Car"],
  ["Less trade-in", "money.lessTradeIn", "Less trade-in"],
  ["Sales tax", "money.salesTax", "Sales tax"],
  ["Title fee", "money.titleFee", "Title fee"],
  ["Doc fee", "money.docFee", "Doc fee"],
  ["Reg fee", "money.regFee", "Reg fee"],
  ["Total", "money.total", "Total"],
  ["Paying today", "money.payingToday", "Paying today"],
  ["Balance owed", "money.balanceOwed", "Balance owed"],
  [
    "We hold the title until they pay this.",
    "money.noteLien",
    "We hold the title until they pay this.",
  ],
  [
    "Paid in full. No balance owed.",
    "money.notePaid",
    "Paid in full. No balance owed.",
  ],
  [
    "They are paying some other amount today",
    "money.otherAmount",
    "They are paying some other amount today",
  ],
];

function catalogueValue(key: string): string | undefined {
  let node: unknown = EN_FUNNEL;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

describe("a sixth grader could work the money screens", () => {
  it("has a scorer that can fail", () => {
    // An empty result is only worth trusting from an instrument that can fail,
    // and both branches of this one have to be able to.
    expect(syllables("car")).toBe(1);
    expect(syllables("balance")).toBe(2);
    expect(syllables("registration")).toBe(4);
    expect(gradeLevel("The car is marked $3,500.")).toBeLessThan(3);
    expect(tooHardToRead("Balance owed")).toBeNull();
    expect(tooHardToRead("Itemisation")).toContain("syllables");
    // The trade-word exception is an exception and not a loosening: it lets a
    // word a dealer reads on every 130-U through, and nothing else long.
    expect(tooHardToRead("Registration Included")).toBeNull();
    expect(tooHardToRead("Consideration Included")).toContain("syllables");
    expect(
      tooHardToRead("Itemisation of the statutory registration obligation."),
    ).toContain("grade");
  });

  it.each(MONEY_COPY)("reads %s at sixth grade or below", (line) => {
    expect(tooHardToRead(line)).toBeNull();
  });

  it("says every one of those lines on the screen", () => {
    // Otherwise the list above is a list of sentences nobody ships, and it
    // would keep passing while the real copy drifted anywhere it liked. The
    // catalogue entry is pinned exactly, and the money screen must reference
    // the catalogue's money namespace so the entries actually render.
    for (const [, key, entry] of MONEY_COPY) {
      expect(catalogueValue(key), `catalogue drifted at funnel.${key}`).toBe(entry);
    }
    expect(STEP).toContain("t.money.");
    expect(STEP).toContain("useFunnel()");
  });

  it("holds for every question the guide asks in its own words", () => {
    const asked = [...GUIDE.matchAll(/question:\s*"([^"]+)"/g)].map((match) => match[1]);
    expect(asked.length).toBeGreaterThanOrEqual(6);
    // Named in the failure, because "expected 7.2 to be at most 6" on its own
    // does not say which screen to go and rewrite.
    const tooHard = asked
      .map((question) => ({ question, why: tooHardToRead(question) }))
      .filter((entry) => entry.why !== null);
    expect(tooHard).toEqual([]);
  });
});

describe("the printed balance does not name what it is for", () => {
  it("says balance owed rather than unpaid registration", () => {
    /*
      A reason line naming one part of the deal invites an argument about
      whether that part was really owed, and the lien secures the balance
      either way. What it is made of is in the column directly above it on the
      same page.
    */
    expect(BALANCE_OWED_REASON).not.toMatch(/registration/i);
    expect(BALANCE_OWED_REASON).toMatch(/balance owed/i);
  });

  it("is called a balance on every screen a person reads", () => {
    expect(EN_FUNNEL.money.balanceOwed).toBe("Balance owed");
    expect(EN_FUNNEL.review.money.balanceOwed).toBe("Balance Owed");
    expect(STEP).toContain("t.money.balanceOwed");
    expect(REVIEW).toContain("t.review.money.balanceOwed");
    expect(STEP).not.toMatch(/>Lien/);
  });
});

describe("the registration quote nobody types any more", () => {
  it("is not a question on the vehicle responsibility form", () => {
    // It is the one number on that form the buyer agrees to pay, and it was
    // the one number nothing checked against the bill of sale beside it.
    const questions = paperworkQuestions("vehicleResponsibility", {
      funding: "cash",
      paidToday: null, buyerCity: "", buyerCounty: "",
      bodyStyle: "sedan",
      licenceState: "TX",
      answers: {},
    });
    expect(questions.map((question) => question.key)).not.toContain("quotedRegistrationAmount");
  });

  it("is tax, title, registration and the doc fee", () => {
    const money = saleMoney(3500, { priceBasis: "vehicleOnly" });
    expect(money.registrationCost).toBe(618.75);
    expect(money.registrationCost).toBe(money.tax + FEE_TOTAL);
  });

  it("is computed onto that form rather than left blank", () => {
    expect(PAPERWORK_PAGE).toContain('entry.documentType === "vehicleResponsibility"');
    expect(PAPERWORK_PAGE).toContain("money.registrationCost");
    expect(REVIEW).toContain("quotedRegistrationAmount");
  });
});
