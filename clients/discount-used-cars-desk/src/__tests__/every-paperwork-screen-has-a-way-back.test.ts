import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every Handle A Sale step has Back. The paperwork's first question (the
 * mileage, what we apply for, how often they pay) and a Change trip had an
 * empty space instead. Back now goes to the question before, to the review
 * a Change link came from, or, on the first question, to the document's
 * own step in the guide.
 */
const page = readFileSync("src/app/admin/sales/[dealId]/paperwork/[doc]/[q]/page.tsx", "utf8");
const screen = readFileSync("src/components/admin/paperwork/PaperworkScreen.tsx", "utf8");

describe("every paperwork screen has a way back", () => {
  it("falls back to the guide step on the first question and to the review on a Change trip", () => {
    expect(page).toMatch(/const backHref = reopen && !reviewingKey\(key\) \? stepHref\(REVIEW\) : previous \? stepHref\(previous\.key\) : guideHref;/);
    expect(page).toContain("previousHref={backHref}");
    expect(page).not.toContain("previousHref={previous ? stepHref(previous.key) : null}");
  });

  it("is a link to the document's own guide step, never the deal page", () => {
    expect(page).toMatch(/const guideHref = `\/admin\/sales\/\$\{encodeURIComponent\(dealId\)\}\/guide\/\$\{encodeURIComponent\(`document:\$\{entry\.documentType\}`\)\}`;/);
    expect(screen).toContain('<Link className="ed-guide-back" href={previousHref}>');
  });
});
