import { describe, expect, it } from "vitest";
import {
  TEMPLATE_DEFINITIONS,
  getTemplateSteps,
  initialTemplateValues,
  type TemplateField,
  type TemplateId,
  type TemplateStep,
  type TemplateValues,
} from "@/lib/documents/template-workflow";
import { idMaxLength, PASSPORT_COUNTRIES } from "@/lib/forms/id-document";
import { US_STATES } from "@/lib/forms/us-states";

/**
 * The companion rule to "a form never asks what it can look up".
 *
 * That one is about not asking. This one is about what happens when we DO
 * ask: a box that will take any characters at all is a box that collects a
 * wrong answer silently and hands it to a county clerk weeks later.
 *
 * The owner put it as a standard rather than a bug report, and that is how it
 * is enforced here. He was looking at the bill of sale when he found it:
 *
 *   "Why is it on the ID number? I'm able to put more than ID digits. Same
 *    with the phone. Shouldn't this be the standard everywhere? Across every
 *    template, across every form?"
 *
 * So these walk EVERY template rather than the one that was complained about.
 * The point is that the next template inherits the standard without anybody
 * remembering to ask for it.
 *
 * None of this was invented here. `id-document.ts` has carried an audited
 * fifty-one state licence table, a passport country list and a length rule
 * since the sale intake was built, and `us-states.ts` has carried the states.
 * The corridor simply was not using any of it.
 */

/**
 * Every branch a person can actually walk into.
 *
 * Steps are conditional, and the conditions are mutually exclusive in places:
 * the state-issuer screen and the country-issuer screen can never both be on
 * the same path. So a single pass over one set of answers would quietly skip
 * half the fields and let a guard pass while checking nothing.
 *
 * These are the answers that open every door, unioned. Only reachable fields
 * are checked, which is the honest set: a field nobody can navigate to is not
 * a field this standard is about.
 */
const SCENARIOS: TemplateValues[] = [
  { hasCoBuyer: "yes", hasTradeIn: "yes", hasOtherFees: "yes", sellerLienEnabled: "yes", conditionType: "warranty", registrationFiler: "dealer", paymentMethod: "Other", applicantType: "individual", buyerIdKind: "stateLicence", coBuyerIdKind: "stateLicence", applicantIdType: "stateLicence" },
  { hasCoBuyer: "yes", applicantType: "individual", buyerIdKind: "passport", coBuyerIdKind: "passport", applicantIdType: "passport" },
  { applicantType: "entity", registrationFiler: "buyer", buyerIdKind: "militaryId" },
];

const stepsFor = (id: TemplateId): TemplateStep[] => {
  const seen = new Map<string, TemplateStep>();
  for (const scenario of SCENARIOS) {
    for (const step of getTemplateSteps(id, { ...initialTemplateValues(id), ...scenario })) {
      if (!seen.has(step.id)) seen.set(step.id, step);
    }
  }
  return [...seen.values()];
};

const everyField = (): { template: TemplateId; field: TemplateField }[] => {
  const all: { template: TemplateId; field: TemplateField }[] = [];
  for (const definition of TEMPLATE_DEFINITIONS) {
    for (const step of stepsFor(definition.id)) {
      for (const field of step.fields) all.push({ template: definition.id, field });
    }
  }
  return all;
};

const describeField = (entry: { template: TemplateId; field: TemplateField }) =>
  `${entry.template}.${entry.field.key} ("${entry.field.label}")`;

describe("every template found its fields", () => {
  it("walks a real number of them, so the rules below are checking something", () => {
    // An empty list would make every assertion in this file pass while
    // checking nothing at all, which is the way a guard rots.
    const all = everyField();
    expect(all.length).toBeGreaterThan(100);
    expect(all.some((entry) => entry.field.key === "buyerIdNumber")).toBe(true);
  });
});

describe("a state is chosen, never spelled", () => {
  it("offers the list everywhere a state is asked for", () => {
    /*
      A free box invites "Tx", "tex" and "TX ", three spellings of one answer
      that every lookup downstream then treats as three different states.
      Nine of these were free text.
    */
    const loose = everyField().filter(
      (entry) =>
        /^(?!.*county).*state$/i.test(entry.field.key) &&
        entry.field.type !== "select" &&
        entry.field.kind !== "address",
    );
    expect(loose.map(describeField), "a state that can be typed freely").toEqual([]);
  });

  it("stores the two letter code rather than the name", () => {
    // BillOfSalePreview already calls passportIssuerName() on the issuer and
    // form130U runs it through normalise.stateCode(). Both were written
    // expecting a CODE, so a box handing them "Texas" was already broken.
    const buyerState = everyField().find((entry) => entry.field.key === "buyerState");
    expect(buyerState?.field.options?.map((option) => option.value)).toContain("TX");
    expect(buyerState?.field.options).toHaveLength(US_STATES.length);
  });
});

describe("the issuer question knows which list it is", () => {
  it("never asks one box for either a state or a country", () => {
    /*
      "Issuing state or country" is two different questions wearing one label,
      and one box cannot offer a list because it does not know which list.
      It is two screens now, each shown only when it applies.
    */
    const both = everyField().filter((entry) => /state or country/i.test(entry.field.label));
    expect(both.map(describeField), "one box asking two questions").toEqual([]);
  });

  it("offers states for a licence and countries for a passport", () => {
    const steps = stepsFor("bill-of-sale");
    const forLicence = steps.find((step) => step.id === "buyer-id-state");
    const forPassport = steps.find((step) => step.id === "buyer-id-country");

    expect(forLicence?.fields[0].options?.map((o) => o.value)).toContain("TX");
    expect(forPassport?.fields[0].options).toHaveLength(PASSPORT_COUNTRIES.length);

    // And each appears only for the document it belongs to.
    expect(forLicence?.when?.({ buyerIdKind: "stateLicence" })).toBe(true);
    expect(forLicence?.when?.({ buyerIdKind: "passport" })).toBe(false);
    expect(forPassport?.when?.({ buyerIdKind: "passport" })).toBe(true);
    expect(forPassport?.when?.({ buyerIdKind: "stateLicence" })).toBe(false);
    // A military ID has no issuer to ask for, so neither screen opens.
    expect(forLicence?.when?.({ buyerIdKind: "militaryId" })).toBe(false);
    expect(forPassport?.when?.({ buyerIdKind: "militaryId" })).toBe(false);
  });
});

describe("an ID number is asked after the things that make it checkable", () => {
  it("knows which document and which issuer it belongs to", () => {
    const numbers = everyField().filter((entry) => /^(ID number|FEIN)/i.test(entry.field.label));
    expect(numbers.length).toBeGreaterThan(0);
    for (const entry of numbers) {
      // A FEIN is a company's federal number and has no issuing state; only
      // the personal ID numbers carry a document kind.
      if (/FEIN/i.test(entry.field.label)) continue;
      expect(entry.field.kind, describeField(entry)).toBe("idNumber");
      expect(entry.field.context?.documentKind, describeField(entry)).toBeTruthy();
    }
  });

  it("asks the kind and the issuer BEFORE the number, on every template", () => {
    /*
      The ordering fault, and the reason this is not just a validation change.
      The number used to be the second box on the first buyer screen, before
      anything had asked what kind of document it was — so at the moment
      somebody typed it, nothing knew what a right answer looked like.
    */
    for (const definition of TEMPLATE_DEFINITIONS) {
      const steps = stepsFor(definition.id);
      for (const [index, step] of steps.entries()) {
        for (const field of step.fields) {
          if (field.kind !== "idNumber") continue;
          const kindKey = field.context?.documentKind;
          if (!kindKey) continue;
          const asksKind = steps.findIndex((other) =>
            other.fields.some((other_field) => other_field.key === kindKey),
          );
          expect(asksKind, `${definition.id}: nothing asks ${kindKey}`).toBeGreaterThan(-1);
          expect(
            asksKind,
            `${definition.id}: ${field.key} is asked before ${kindKey}`,
          ).toBeLessThan(index);
        }
      }
    }
  });

  it("caps the box at what the document can actually carry", () => {
    // The owner's own example. A Texas licence is eight digits and the box
    // was taking as many as anybody typed.
    expect(idMaxLength("stateLicence", "TX")).toBe(8);
    expect(idMaxLength("passport", "US")).toBe(9);
    // And an unknown document still gets a ceiling rather than no limit:
    // AAMVA caps the customer number at 25.
    expect(idMaxLength("other")).toBe(25);
  });
});

describe("a phone holds a phone number", () => {
  it("is a phone field everywhere one is asked for", () => {
    const phones = everyField().filter((entry) => /phone/i.test(entry.field.key));
    expect(phones.length).toBeGreaterThan(0);
    for (const entry of phones) {
      expect(entry.field.kind, describeField(entry)).toBe("phone");
    }
  });
});

describe("the registration answer decides the registration fee", () => {
  const steps = stepsFor("bill-of-sale");
  const at = (id: string) => steps.findIndex((step) => step.id === id);

  it("asks who registers the car before charging for registering it", () => {
    /*
      It was the other way round: the Tax and Fees screen asked for a
      registration fee and the NEXT screen asked who was actually registering
      the car, so the question that decides the fee came after the fee.
    */
    expect(at("registration-filer")).toBeGreaterThan(-1);
    expect(at("registration-filer")).toBeLessThan(at("registration-fee"));
    expect(at("registration-filer")).toBeLessThan(at("fees"));
  });

  it("does not ask for a fee the dealership is not collecting", () => {
    const fee = steps.find((step) => step.id === "registration-fee");
    expect(fee?.when?.({ registrationFiler: "dealer" })).toBe(true);
    expect(fee?.when?.({ registrationFiler: "buyer" })).toBe(false);
  });

  it("keeps the registration fee out of the Tax and Fees screen", () => {
    // Otherwise it would be asked twice, once unconditionally.
    const fees = steps.find((step) => step.id === "fees");
    expect(fees?.fields.map((field) => field.key)).not.toContain("registrationFee");
  });
});
