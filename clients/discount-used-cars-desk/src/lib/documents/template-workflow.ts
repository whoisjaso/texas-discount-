import { isEligibleForPlainPoa } from "@/lib/documents/power-of-attorney-eligibility";
import { chicagoDateKey } from "@/lib/customers/recurring-dates";
import { dealership, factOr } from "@/lib/dealership-config";
import type { BillOfSaleData } from "@/lib/documents/billOfSale";
import type { Form130UData } from "@/lib/documents/form130U";
import type { RebuiltDisclosureData } from "@/lib/documents/rebuiltDisclosure";
import type { SalvageSaleData } from "@/lib/documents/salvageSale";
import type { VehicleResponsibilityFormData } from "@/lib/documents/vehicleResponsibility";
import type { PowerOfAttorneyFormFields } from "@/lib/documents/powerOfAttorneyForm";
import type { AgreementData } from "@/lib/fill-130u/field-mapping";
import { PASSPORT_COUNTRIES, type IdDocumentKind } from "@/lib/forms/id-document";
import { US_STATES } from "@/lib/forms/us-states";
import { VTR61_COMPONENTS } from "@/lib/vehicles/title-work-evidence";
import { usDate } from "@/lib/documents/us-date";
import type { Vtr61Input } from "@/lib/fill-vtr61/fill-pdf";
import type { OfficialRebuiltDisclosureData } from "@/lib/documents/official-rebuilt-disclosure";

/** Standalone paperwork. These values never create a customer or a sale. */
export const TEMPLATE_DEFINITIONS = [
  { id: "bill-of-sale", title: "Bill Of Sale", note: "Buyer, vehicle, price", icon: "receipt" },
  { id: "form-130u", title: "Form 130-U", note: "Title and registration", icon: "file-text" },
  { id: "buyers-guide", title: "Buyer's Guide", note: "As-is window form", icon: "car" },
  { id: "vehicle-responsibility", title: "Vehicle Responsibility", note: "Buyer handles registration", icon: "shield-check" },
  { id: "power-of-attorney", title: "Power Of Attorney", note: "Official VTR-271", icon: "signature" },
  { id: "rebuilt-disclosure", title: "Rebuilt Title Disclosure", note: "Official purchaser disclosure", icon: "file-text" },
  { id: "rebuilt-vehicle-statement", title: "Rebuilt Vehicle Statement", note: "Official VTR-61 · title application", icon: "file-text" },
  { id: "salvage-bill-of-sale", title: "Salvage Bill Of Sale", note: "Salvage vehicle purchase", icon: "receipt" },
  { id: "tow-away-acknowledgment", title: "Tow-Away Acknowledgment", note: "Leaves on a tow", icon: "truck" },
  { id: "buyer-responsibility-statement", title: "Buyer Responsibility Statement", note: "Buyer handles the rebuild", icon: "shield-check" },
] as const;

export type TemplateId = (typeof TEMPLATE_DEFINITIONS)[number]["id"];
export type TemplateValues = Record<string, string>;
export type TemplateField = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "email" | "tel" | "select" | "multiselect" | "textarea";
  required?: boolean;
  options?: { value: string; label: string }[];
  inputMode?: "text" | "decimal" | "numeric" | "tel" | "email";
  autoComplete?: string;
  /**
   * A field that answers other fields.
   *
   * "vin" decodes at the seventeenth character; "address" suggests while it is
   * typed and completes itself when it is left. Both write through `derives`
   * and both write to blanks only, so nothing a person typed is touched.
   */
  kind?: "vin" | "address" | "idNumber" | "phone";
  /**
   * Other keys this field needs in order to check itself.
   *
   * An ID number cannot be validated alone: what makes it right or wrong is
   * the kind of document it came off and who issued it. `documentKind` and
   * `issuer` name the keys holding those, in this template's own vocabulary,
   * for the same reason `derives` does — the shared rule never learns that one
   * template calls it `buyerIdKind` and another `applicantIdType`.
   */
  context?: { documentKind?: string; issuer?: string };
  /**
   * Which of this template's keys the lookup fills, by the shared name.
   *
   * `derive.ts` speaks in `city`, `county`, `year`, `make` and so on, and every
   * template spells those differently: the 130-U's town is `mailingCity`, the
   * bill of sale's is `buyerCity`. The mapping lives on the field so the shared
   * rule never learns any one template's vocabulary.
   */
  derives?: Record<string, string>;
};
export type TemplateStep = {
  id: string;
  title: string;
  icon: string;
  fields: TemplateField[];
  when?: (values: TemplateValues) => boolean;
};

const field = (key: string, label: string, required = false, type: TemplateField["type"] = "text"): TemplateField => ({
  key, label, required, type,
  ...(type === "number" ? { inputMode: "decimal" as const } : {}),
  ...(type === "tel" ? { inputMode: "tel" as const, autoComplete: "tel" } : {}),
  ...(type === "email" ? { inputMode: "email" as const, autoComplete: "email" } : {}),
  ...(/(?:Zip|Mileage|Reading|Year|Weight|Capacity)$/.test(key) ? { inputMode: "numeric" as const } : {}),
  ...(/Vin$|^vin$/.test(key) ? { autoComplete: "off", inputMode: "text" as const } : {}),
});
/**
 * A VIN that fills the vehicle in.
 *
 * `derives` names this template's own keys. Anything a template does not have
 * a box for is simply left out of the map and the decoder's answer for it is
 * dropped, which is how the bill of sale can take a year, make and model while
 * the 130-U also takes a body style and an empty weight.
 */
const vinField = (key: string, label: string, derives: Record<string, string>): TemplateField => ({
  ...field(key, label, true),
  kind: "vin",
  derives,
});

/** A street address that suggests while it is typed and finishes itself when it is left. */
const addressField = (key: string, label: string, derives: Record<string, string>): TemplateField => ({
  ...field(key, label, true),
  kind: "address",
  derives,
});

const options = (key: string, label: string, choices: readonly (readonly [string, string])[], required = true): TemplateField => ({
  key, label, type: "select", required, options: choices.map(([value, text]) => ({ value, label: text })),
});
/**
 * Which state, chosen from a list rather than typed.
 *
 * A free box for a state invites "Tx", "tex" and "TX " — three spellings of
 * one answer that every lookup downstream then treats as three states. This
 * mattered more than tidiness here: `BillOfSalePreview` already calls
 * `passportIssuerName()` on the issuer value and the 130-U runs it through
 * `normalise.stateCode()`, so both were built expecting a CODE and the box was
 * handing them whatever somebody typed.
 */
const stateField = (key: string, label = "State"): TemplateField =>
  options(key, label, US_STATES.map((state) => [state.code, state.name] as const));

/** Which country issued a passport, from the same list the desk already uses. */
const countryField = (key: string, label = "Issuing country"): TemplateField =>
  options(key, label, PASSPORT_COUNTRIES.map((place) => [place.code, place.name] as const));

/**
 * An ID number that knows what document it is on.
 *
 * The length and shape come from the kind and the issuer, which is why both
 * are named here. It CAPS the field at the longest number that document can
 * carry and warns, without ever blocking, when the shape does not match:
 * states reissue formats and grandfather old numbers, so a rule that blocked
 * would eventually stop a real customer buying a real car over a number that
 * is genuinely printed on their card.
 */
const idNumberField = (
  key: string,
  label: string,
  context: { documentKind?: string; issuer?: string },
): TemplateField => ({
  ...field(key, label, true),
  kind: "idNumber",
  context,
  autoComplete: "off",
});

/** A phone that formats itself and stops at ten digits. */
const phoneField = (key: string, label: string, required = false): TemplateField => ({
  ...field(key, label, required, "tel"),
  kind: "phone",
});

const yesNo = (key: string, label: string) => options(key, label, [["yes", "Yes"], ["no", "No"]]);
const isYes = (key: string) => (values: TemplateValues) => values[key] === "yes";
const step = (id: string, title: string, icon: string, fields: TemplateField[], when?: TemplateStep["when"]): TemplateStep => ({ id, title, icon, fields, when });
const identityKinds = [["stateLicence", "Driver's license"], ["stateIdCard", "State ID"], ["passport", "Passport"], ["militaryId", "Military ID"]] as const;
const needsIssuer = (kind: string) => ["stateLicence", "stateIdCard", "passport"].includes(kind);
/** The half of `needsIssuer` whose issuer is a state rather than a country. */
const issuedByState = (kind: string) => ["stateLicence", "stateIdCard"].includes(kind);

/**
 * Where an ID was issued, asked as the question the document actually has.
 *
 * One box labelled "Issuing state or country" is two different questions
 * wearing one label, and a single box cannot offer a list because it does not
 * know which list to offer. So it is two screens, each shown only when it
 * applies, each a real list. `id-document.ts` has carried `needsState` and
 * `needsCountry` since the sale intake was built; this is that distinction
 * finally reaching the templates corridor.
 */
const issuerSteps = (
  idPrefix: string,
  whose: string,
  kindKey: string,
  issuerKey: string,
  also: (values: TemplateValues) => boolean = () => true,
): TemplateStep[] => [
  step(`${idPrefix}-state`, `Which State Issued ${whose} ID?`, "identification-card",
    [stateField(issuerKey, "Issuing state")],
    (v) => also(v) && issuedByState(v[kindKey] ?? "")),
  step(`${idPrefix}-country`, `Which Country Issued ${whose} Passport?`, "identification-card",
    [countryField(issuerKey)],
    (v) => also(v) && (v[kindKey] ?? "") === "passport"),
];
const paymentMethods = [["Cash", "Cash"], ["Certified Check", "Certified check"], ["Cashier Check", "Cashier's check"], ["Zelle", "Zelle"], ["CashApp", "Cash App"], ["Apple Pay", "Apple Pay"], ["PayPal", "PayPal"], ["Financing", "Financing"], ["Other", "Other"]] as const;
const odometer = options("odometerStatus", "Mileage status", [["actual", "Actual mileage"], ["exceeds", "Exceeds mechanical limits"], ["not_actual", "Not actual mileage"]]);
/*
  The VIN answers the three boxes beside it, and the two further on.

  Every template that asks "which vehicle" asks for the year, make and model
  next to a VIN that determines all three. A template without a body style or
  a weight box simply leaves those out of the map below and the decoder's
  answer for them is dropped.
*/
const vehicle = [
  step("vehicle", "Which Vehicle?", "car", [
    vinField("vehicleVin", "VIN", {
      year: "vehicleYear",
      make: "vehicleMake",
      model: "vehicleModel",
      bodyStyle: "vehicleBodyStyle",
      // No empty weight. Box 11 is read off the door jamb or the old title,
      // never off a decoder. See DERIVED_BY_VIN in derive.ts.
    }),
    field("vehicleYear", "Year", true),
    field("vehicleMake", "Make", true),
    field("vehicleModel", "Model", true),
  ]),
];
const vehicleDetails = step("vehicle-details", "Vehicle Details", "car", [field("vehicleBodyStyle", "Body style", true), field("vehicleColor", "Color", true), field("vehicleTrim", "Trim (optional)"), field("vehiclePlate", "Plate (if any)")]);
const mileage = step("mileage", "What Does the Odometer Read?", "car", [field("vehicleMileage", "Miles", true), odometer]);
/*
  The ID number is asked LAST of the three, and that order is the point.

  It used to be the second box on the first screen, before anything had asked
  what kind of document it was or who issued it — so at the moment somebody
  typed the number, nothing on the screen knew what a right answer looked
  like. The kind and the issuer are what make a number checkable, so they are
  asked first and the number screen arrives already knowing its own rule.
*/
const buyer = [
  step("buyer", "Who Is the Buyer?", "user", [field("buyerName", "Full legal name", true), phoneField("buyerPhone", "Phone (optional)")]),
  step("buyer-id-kind", "What ID Is the Buyer Showing?", "identification-card", [options("buyerIdKind", "ID type", identityKinds)]),
  ...issuerSteps("buyer-id", "the Buyer's", "buyerIdKind", "buyerLicenseState"),
  step("buyer-id-number", "Buyer's ID Number", "identification-card", [idNumberField("buyerIdNumber", "ID number", { documentKind: "buyerIdKind", issuer: "buyerLicenseState" })]),
  step("buyer-address", "Buyer's Address", "map-pin", [addressField("buyerAddress", "Street address", { city: "buyerCity", state: "buyerState", zip: "buyerZip" }), field("buyerCity", "City", true), stateField("buyerState"), field("buyerZip", "ZIP", true)]),
];
const saleDate = step("date", "What Is the Date?", "calendar", [field("saleDate", "Date of sale", true, "date")]);
const titleOrigin = step("title-origin", "Where Is the Salvage Title From?", "file-text", [stateField("titleOriginState", "Title state")]);

const billOfSaleSteps = [
  ...vehicle, vehicleDetails,
  step("stock", "Inventory Reference", "car", [field("stockNumber", "Stock number (optional)")]),
  mileage, ...buyer,
  step("buyer-email", "The Buyer's Email", "user", [field("buyerEmail", "Email (optional)", false, "email")]),
  step("co-buyer-choice", "Is There a Co-Buyer?", "user", [yesNo("hasCoBuyer", "Co-buyer")]),
  step("co-buyer", "Who Is the Co-Buyer?", "user", [field("coBuyerName", "Full legal name", true)], isYes("hasCoBuyer")),
  step("co-buyer-id-kind", "What ID Is the Co-Buyer Showing?", "identification-card", [options("coBuyerIdKind", "ID type", identityKinds)], isYes("hasCoBuyer")),
  ...issuerSteps("co-buyer-id", "the Co-Buyer's", "coBuyerIdKind", "coBuyerLicenseState", isYes("hasCoBuyer")),
  step("co-buyer-id-number", "Co-Buyer's ID Number", "identification-card", [idNumberField("coBuyerLicense", "ID number", { documentKind: "coBuyerIdKind", issuer: "coBuyerLicenseState" })], isYes("hasCoBuyer")),
  step("co-buyer-address", "Co-Buyer's Address", "map-pin", [addressField("coBuyerAddress", "Street address", { city: "coBuyerCity", state: "coBuyerState", zip: "coBuyerZip" }), field("coBuyerCity", "City", true), stateField("coBuyerState"), field("coBuyerZip", "ZIP", true)], isYes("hasCoBuyer")),
  step("co-buyer-contact", "Co-Buyer's Contact", "user", [phoneField("coBuyerPhone", "Phone (optional)"), field("coBuyerEmail", "Email (optional)", false, "email")], isYes("hasCoBuyer")),
  step("price", "What Is the Price?", "currency-dollar", [field("salePrice", "Vehicle price", true, "number"), field("saleDate", "Date of sale", true, "date")]),
  step("trade-choice", "Is There a Trade-In?", "car", [yesNo("hasTradeIn", "Trade-in")]),
  step("trade", "Trade-In Details", "car", [field("tradeInDescription", "Year, make and model", true), vinField("tradeInVin", "VIN", { description: "tradeInDescription" }), field("tradeInAllowance", "Allowance", true, "number"), field("tradeInPayoff", "Payoff (0 if none)", true, "number")], isYes("hasTradeIn")),
  /*
    Registration comes BEFORE the fees, because it decides one of them.

    It used to be the other way round: the Tax and Fees screen asked for a
    registration fee and the NEXT screen asked who was actually registering the
    car. So the question that decides whether we collect that fee was asked
    after the fee, and a sale where the buyer registers it themselves still
    had a box demanding a number the dealership is not charging.

    The same rule as the rest of the corridor: a figure a formula can produce
    is not a question, and here the formula is "we charge it when we file it".
  */
  step("registration-filer", "Who Handles Registration?", "file-text", [options("registrationFiler", "Registration", [["dealer", "The dealership"], ["buyer", "The buyer"]])]),
  step("fees", "Tax and Fees", "receipt", [field("tax", "Sales tax", true, "number"), field("titleFee", "Title fee", true, "number"), field("docFee", "Document fee", true, "number")]),
  step("registration-fee", "What Is the Registration Fee?", "receipt", [field("registrationFee", "Registration fee", true, "number")], (v) => v.registrationFiler !== "buyer"),
  step("other-fees-choice", "Any Other Fees?", "receipt", [yesNo("hasOtherFees", "Other fees")]),
  step("other-fees", "Other Fees", "receipt", [field("otherFees", "Amount", true, "number"), field("otherFeesDescription", "What the fee covers", true)], isYes("hasOtherFees")),
  step("payment", "How Is the Buyer Paying?", "currency-dollar", [options("paymentMethod", "Payment method", paymentMethods)]),
  step("payment-other", "Which Payment Method?", "currency-dollar", [field("paymentMethodOther", "Payment method", true)], (v) => v.paymentMethod === "Other"),
  step("condition", "What Is the Warranty Arrangement?", "shield-check", [options("conditionType", "Vehicle condition", [["as_is", "As is"], ["warranty", "Written warranty"]])]),
  step("warranty", "Written Warranty", "shield-check", [field("warrantyDuration", "Duration", true), field("warrantyDescription", "Coverage", true, "textarea")], (v) => v.conditionType === "warranty"),
  step("lien-choice", "Will the Seller Hold a Lien?", "shield-check", [yesNo("sellerLienEnabled", "Seller lien")]),
  step("seller-lien", "Seller Lien Terms", "currency-dollar", [field("sellerLienAmount", "Amount", true, "number"), field("sellerLienReason", "Reason", true), field("sellerLienDate", "Lien date", true, "date"), field("sellerLienDueDate", "Due date", true, "date")], isYes("sellerLienEnabled")),
  step("seller-lienholder", "Who Holds the Lien?", "buildings", [field("sellerLienholderName", "Lienholder", true), addressField("sellerLienholderAddress", "Street address", { city: "sellerLienholderCity", state: "sellerLienholderState", zip: "sellerLienholderZip" })], isYes("sellerLienEnabled")),
  step("seller-lienholder-place", "Lienholder's Location", "map-pin", [field("sellerLienholderCity", "City", true), stateField("sellerLienholderState"), field("sellerLienholderZip", "ZIP", true)], isYes("sellerLienEnabled")),
];

const individual = (v: TemplateValues) => v.applicantType === "Individual";
const entity = (v: TemplateValues) => Boolean(v.applicantType) && !individual(v);
const form130USteps = [
  step("application", "What Are You Applying For?", "file-text", [options("applicationType", "Application", [["titleAndRegistration", "Title and registration"], ["titleOnly", "Title only"], ["registrationOnly", "Registration only"], ["nontitle", "Nontitle registration"]])]),
  ...vehicle,
  step("vehicle-details", "Vehicle Details", "car", [field("vehicleBodyStyle", "Body style", true), field("vehicleColor", "Major color", true), field("minorColor", "Minor color (if any)"), field("vehiclePlate", "Texas plate (if any)")]),
  mileage,
  step("vehicle-weight", "Vehicle Weight", "truck", [field("emptyWeight", "Empty weight, lbs (if applicable)"), field("carryingCapacity", "Carrying capacity, lbs (if applicable)")]),
  step("applicant-type", "Who Is Applying?", "user", [options("applicantType", "Applicant", [["Individual", "Individual"], ["Business", "Business"], ["Government", "Government"], ["Trust", "Trust"], ["Non-Profit", "Nonprofit"]])]),
  step("applicant-name", "Applicant's Legal Name", "user", [field("applicantFirstName", "First name", true), field("applicantMiddleName", "Middle name (if any)"), field("applicantLastName", "Last name", true), field("applicantSuffix", "Suffix (if any)")], individual),
  step("applicant-entity", "Entity's Legal Name", "buildings", [field("applicantEntityName", "Entity name", true), field("applicantIdNumber", "FEIN / EIN", true)], entity),
  step("applicant-id", "Applicant's Identification", "identification-card", [options("applicantIdType", "ID type", identityKinds), idNumberField("applicantIdNumber", "ID number", { documentKind: "applicantIdType", issuer: "applicantIdState" })], individual),
  ...issuerSteps("applicant-id", "the Applicant's", "applicantIdType", "applicantIdState", individual),
  step("applicant-contact", "Applicant's Contact", "user", [phoneField("applicantPhone", "Phone (optional)"), field("applicantEmail", "Email (optional)", false, "email")]),
  step("applicant-mailing", "Applicant's Mailing Address", "map-pin", [addressField("mailingAddress", "Street address", { city: "mailingCity", state: "mailingState", zip: "mailingZip", county: "countyOfResidence" }), field("mailingCity", "City", true), stateField("mailingState"), field("mailingZip", "ZIP", true)]),
  /*
    Only when the address could not answer it.

    The page before this one determines the county, and this was a whole screen
    asking for it anyway, on the deal's least famous fact. Now it appears only
    when the lookup came back without one: a rural address the geocoder does
    not carry, or a street typed too loosely to match. Then it is a real
    question and it is asked. Otherwise the corridor moves straight past.

    Deliberately keyed on the VALUE rather than on whether a lookup ran. What
    matters is whether the box is filled, however it got filled, and a prefill
    or a back-and-edit is as good an answer as a geocoder's.
  */
  step("applicant-county", "County of Residence", "map-pin", [field("countyOfResidence", "County", true)],
    (v) => !(v.countyOfResidence ?? "").trim()),
  step("co-applicant-choice", "Any Additional Applicant?", "user", [yesNo("hasCoApplicant", "Additional applicant")]),
  step("co-applicant", "Additional Applicant", "user", [field("coApplicantName", "Full legal name", true)], isYes("hasCoApplicant")),
  step("previous-owner", "Who Is the Previous Owner?", "buildings", [field("previousOwnerName", "Name or entity", true), field("previousOwnerCity", "City", true), stateField("previousOwnerState")]),
  step("location-choice", "Where Is the Vehicle Kept?", "map-pin", [options("vehicleLocationSameAsMailing", "Vehicle location", [["yes", "Mailing address"], ["no", "Another address"]])]),
  step("vehicle-location", "Vehicle's Location", "map-pin", [addressField("vehicleLocationAddress", "Street address", { city: "vehicleLocationCity", state: "vehicleLocationState", zip: "vehicleLocationZip", county: "vehicleLocationCounty" }), field("vehicleLocationCity", "City", true), stateField("vehicleLocationState"), field("vehicleLocationZip", "ZIP", true)], (v) => v.vehicleLocationSameAsMailing === "no"),
  step("purchase-choice", "Is This For a Purchase?", "receipt", [yesNo("isPurchase", "Vehicle purchase")]),
  step("price", "Purchase Details", "currency-dollar", [field("salesPrice", "Vehicle price", true, "number"), field("saleDate", "Date of sale", true, "date"), field("rebateOrIncentive", "Rebate or incentive (0 if none)", true, "number")], isYes("isPurchase")),
  step("trade-choice", "Is There a Trade-In?", "car", [yesNo("hasTradeIn", "Trade-in")], isYes("isPurchase")),
  step("trade", "Trade-In Details", "car", [field("tradeInDescription", "Year, make and model", true), vinField("tradeInVin", "VIN", { description: "tradeInDescription" }), field("tradeInAllowance", "Allowance", true, "number")], (v) => v.isPurchase === "yes" && v.hasTradeIn === "yes"),
  step("lien-choice", "Is There a Lien?", "shield-check", [yesNo("hasLien", "Lien")]),
  step("lien", "Lien Details", "currency-dollar", [field("lienDate", "Lien date", true, "date"), field("etitleLienholderId", "Electronic title ID (if any)")], isYes("hasLien")),
  step("lienholder", "Who Holds the Lien?", "buildings", [field("lienholderName", "Lienholder", true), addressField("lienholderAddress", "Street address", { city: "lienholderCity", state: "lienholderState", zip: "lienholderZip" })], isYes("hasLien")),
  step("lienholder-place", "Lienholder's Location", "map-pin", [field("lienholderCity", "City", true), stateField("lienholderState"), field("lienholderZip", "ZIP", true)], isYes("hasLien")),
];

const allSteps: Record<TemplateId, TemplateStep[]> = {
  "bill-of-sale": billOfSaleSteps,
  "form-130u": form130USteps,
  "buyers-guide": [
    step("guide-condition", "Is the Vehicle Sold As Is?", "shield-check", [yesNo("guideAsIsConfirmed", "As-is vehicle")]),
    ...vehicle,
    step("guide-contact", "Who Handles Buyer Questions?", "user", [field("guideContact", "Contact name or department", true)]),
  ],
  "vehicle-responsibility": [
    ...vehicle, ...buyer,
    step("registration", "What Registration Amount Was Quoted?", "currency-dollar", [field("quotedRegistrationAmount", "Quoted amount", true, "number"), field("saleDate", "Date of sale", true, "date")]),
  ],
  "power-of-attorney": [
    step("poa-eligibility", "Can This Form Be Used?", "shield-check", [yesNo("poaEligibilityConfirmed", "VTR-271 applies to this transaction")]),
    ...vehicle,
    step("poa-vehicle-details", "Vehicle Details", "car", [field("vehicleBodyStyle", "Body style", true), field("vehiclePlate", "Plate (if any)"), field("titleDocumentNumber", "Title document number (if known)")]),
    step("grantor", "Who Is Granting Authority?", "user", [field("grantorName", "Full legal name or entity", true)]),
    step("grantor-address", "Owner's Address", "map-pin", [addressField("grantorAddress", "Street address", { city: "grantorCity", county: "grantorCounty" }), field("grantorCity", "City", true), field("grantorCounty", "County", true)]),
    step("grantor-place", "Owner's State and ZIP", "map-pin", [stateField("grantorState"), field("grantorZip", "ZIP", true)]),
    step("executed-date", "When Will the Owner Sign?", "calendar", [field("executedDate", "Date (optional, may be written in ink)", false, "date")]),
  ],
  "rebuilt-disclosure": [
    step("vehicle", "Which Vehicle?", "car", [vinField("vehicleVin", "VIN", { year: "vehicleYear", make: "vehicleMake" }), field("vehicleYear", "Year", true), field("vehicleMake", "Make", true)]),
    step("buyer", "Who Is the Purchaser?", "user", [field("buyerName", "Full legal name", true)]),
    step("signature-date", "When Will the Purchaser Sign?", "calendar", [field("signatureDate", "Date (optional, may be written in ink)", false, "date")]),
  ],
  "rebuilt-vehicle-statement": [
    ...vehicle,
    step("body-style", "Vehicle Body Style", "car", [field("vehicleBodyStyle", "Body style", true)]),
    step("owner", "Who Owns the Vehicle?", "user", [field("ownerName", "Full legal name or entity", true)]),
    step("rebuilder-choice", "Did the Owner Rebuild It?", "user", [yesNo("rebuilderIsOwner", "Owner is the rebuilder")]),
    step("rebuilder", "Who Rebuilt the Vehicle?", "user", [field("rebuilderName", "Full legal name or entity", true)], v => v.rebuilderIsOwner === "no"),
    step("rebuilder-address", "Rebuilder's Address", "map-pin", [addressField("rebuilderStreet", "Street address", { city: "rebuilderCity", state: "rebuilderState", zip: "rebuilderZip" }), field("rebuilderCity", "City", true), stateField("rebuilderState"), field("rebuilderZip", "ZIP", true)]),
    step("rebuild-work", "What Work Was Done?", "file-text", [field("workPerformed", "Describe the work and replaced part locations", true, "textarea"), field("dateWorkCompleted", "Work completed", true, "date")]),
    step("parts-choice", "Were Component Parts Replaced?", "car", [yesNo("partsUsed", "Component parts replaced")]),
    step("parts", "Which Parts Were Replaced?", "car", [{ key: "componentsUsed", label: "Select each component", type: "multiselect", required: true, options: VTR61_COMPONENTS.map(c => ({ value: c.key, label: c.label })) }], isYes("partsUsed")),
    ...VTR61_COMPONENTS.map(component => step(`part-${component.key}`, `${component.label}: Where From?`, "car", [
      field(`part_${component.key}_origin`, "Seller's name and complete address, or donor vehicle", true, "textarea"),
      field(`part_${component.key}_number`, component.numberRequired ? "Component part number" : "Part number (if available)", component.numberRequired),
      field(`part_${component.key}_donorVin`, "Donor VIN (if taken from a vehicle)"),
    ], v => v.partsUsed === "yes" && (v.componentsUsed || "").split(",").includes(component.key))),
  ],
  "salvage-bill-of-sale": [
    ...vehicle, titleOrigin, mileage, ...buyer,
    step("salvage-license", "Salvage Dealer License", "identification-card", [field("salvageLicense", "License (if held)")]),
    step("price", "What Is the Price?", "currency-dollar", [field("salePrice", "Vehicle price", true, "number"), field("saleDate", "Date of sale", true, "date")]),
    step("fees", "Tax and Fees", "receipt", [field("tax", "Sales tax", true, "number"), field("titleFee", "Title fee", true, "number"), field("docFee", "Document fee", true, "number")]),
    step("payment", "What Was Paid Today?", "currency-dollar", [field("amountPaidToday", "Amount paid", true, "number"), options("paymentMethod", "Payment method", paymentMethods)]),
    step("payment-other", "Which Payment Method?", "currency-dollar", [field("paymentMethodOther", "Payment method", true)], (v) => v.paymentMethod === "Other"),
  ],
  "tow-away-acknowledgment": [
    ...vehicle, titleOrigin, ...buyer,
    step("tow", "How Will the Vehicle Leave?", "truck", [options("howLeaving", "Transport", [["towTruck", "Tow truck"], ["trailer", "Trailer"], ["flatbed", "Flatbed"]]), field("saleDate", "Date of sale", true, "date")]),
  ],
  "buyer-responsibility-statement": [...vehicle, titleOrigin, ...buyer, saleDate],
};

export function isTemplateId(value: string): value is TemplateId {
  return TEMPLATE_DEFINITIONS.some((definition) => definition.id === value);
}

export function initialTemplateValues(id: TemplateId): TemplateValues {
  const values: TemplateValues = {};
  for (const item of allSteps[id]) for (const itemField of item.fields) values[itemField.key] = "";
  if ("saleDate" in values) {
    values.saleDate = chicagoDateKey();
  }
  if (id === "form-130u") Object.assign(values, {
    previousOwnerName: factOr(dealership.legalName, "dealer legal name"),
    previousOwnerCity: dealership.address.locality,
    previousOwnerState: dealership.address.region,
  });
  if (id === "bill-of-sale") Object.assign(values, {
    sellerLienholderName: factOr(dealership.legalName, "dealer legal name"),
    sellerLienholderAddress: dealership.address.street,
    sellerLienholderCity: dealership.address.locality,
    sellerLienholderState: dealership.address.region,
    sellerLienholderZip: dealership.address.postalCode,
  });
  if (id === "buyers-guide") values.guideContact = "Sales Office";
  return values;
}

export function getTemplateSteps(id: TemplateId, values: TemplateValues): TemplateStep[] {
  return allSteps[id].filter((item) => !item.when || item.when(values));
}

export function validateTemplateStep(item: TemplateStep, values: TemplateValues): Record<string, string> {
  if (item.when && !item.when(values)) return {};
  const errors: Record<string, string> = {};
  for (const itemField of item.fields) {
    const value = (values[itemField.key] ?? "").trim();
    if (!value) {
      if (itemField.required) errors[itemField.key] = `Enter ${itemField.label.toLowerCase()}.`;
      continue;
    }
    if (itemField.type === "select" && !itemField.options?.some((option) => option.value === value)) errors[itemField.key] = "Choose an option.";
    if (itemField.type === "multiselect" && value.split(",").some(selected => !itemField.options?.some(option => option.value === selected))) errors[itemField.key] = "Choose the applicable components.";
    if (itemField.type === "number" && (!Number.isFinite(Number(value)) || Number(value) < 0)) errors[itemField.key] = "Enter an amount of 0 or more.";
    if (/Mileage$|Reading$|Weight$|Capacity$/.test(itemField.key) && !/^\d+$/.test(value)) errors[itemField.key] = "Enter a whole number of 0 or more.";
    if (itemField.key === "vehicleYear" && (!/^\d{4}$/.test(value) || Number(value) < 1886 || Number(value) > new Date().getFullYear() + 2)) errors[itemField.key] = "Enter a valid four-digit model year.";
    if (itemField.key === "vehicleYear" && values.poaEligibilityConfirmed === "yes" && isEligibleForPlainPoa(Number(value), new Date().getFullYear()) === false) errors[itemField.key] = "This vehicle needs the secure VTR-271-A from the county tax office.";
    if (/Vin$|^vin$/.test(itemField.key)) {
      const oldVehicle = itemField.key === "vehicleVin" && Number(values.vehicleYear) > 0 && Number(values.vehicleYear) < 1981;
      if (!(oldVehicle ? /^[A-Z0-9]{5,17}$/i : /^[A-HJ-NPR-Z0-9]{17}$/i).test(value)) errors[itemField.key] = oldVehicle ? "Check the vehicle's VIN." : "Enter a 17-character VIN without I, O or Q.";
    }
    if (/Zip$/.test(itemField.key) && !/^\d{5}(?:-\d{4})?$/.test(value)) errors[itemField.key] = "Enter a five-digit ZIP or ZIP+4.";
    if (/State$/.test(itemField.key) && !/LicenseState$|IdState$/.test(itemField.key) && !/^[A-Za-z]{2}$/.test(value)) errors[itemField.key] = "Enter the two-letter state.";
    if (itemField.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[itemField.key] = "Enter a valid email address.";
    if (itemField.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T12:00:00`).getTime()) || new Date(`${value}T12:00:00`).toISOString().slice(0, 10) !== value)) errors[itemField.key] = "Enter a valid date.";
    if (itemField.key === "guideAsIsConfirmed" && value !== "yes") errors[itemField.key] = "This template is the as-is Buyer's Guide. Use the appropriate warranty form.";
    if (itemField.key === "poaEligibilityConfirmed" && value !== "yes") errors[itemField.key] = "Use the correct power of attorney before continuing.";
    if ((itemField.key === "sellerLienAmount" || itemField.key === "lienAmount") && Number(value) <= 0) errors[itemField.key] = "Enter a lien amount greater than 0.";
  }
  return errors;
}

const text = (v: TemplateValues, key: string) => (v[key] ?? "").trim();
const number = (v: TemplateValues, key: string) => Number(text(v, key)) || 0;
const upper = (v: TemplateValues, key: string) => text(v, key).toUpperCase();
const joinAddress = (v: TemplateValues) => [text(v, "buyerAddress"), text(v, "buyerCity"), [upper(v, "buyerState"), text(v, "buyerZip")].filter(Boolean).join(" ")].filter(Boolean).join(", ");

export function toBillOfSaleData(v: TemplateValues): BillOfSaleData {
  const co = v.hasCoBuyer === "yes";
  const trade = v.hasTradeIn === "yes";
  const lien = v.sellerLienEnabled === "yes";
  const warranty = v.conditionType === "warranty";
  const extra = v.hasOtherFees === "yes";
  // The dealership charges a registration fee when the dealership files the
  // registration. The screen is skipped when the buyer files it themselves,
  // and this makes the fee zero rather than whatever was typed before somebody
  // went back and changed the answer.
  const weRegister = v.registrationFiler !== "buyer";
  return {
    saleDate: text(v, "saleDate"), stockNumber: text(v, "stockNumber"),
    buyerName: text(v, "buyerName"), buyerAddress: text(v, "buyerAddress"), buyerCity: text(v, "buyerCity"), buyerState: upper(v, "buyerState"), buyerZip: text(v, "buyerZip"), buyerPhone: text(v, "buyerPhone"), buyerEmail: text(v, "buyerEmail"), buyerLicense: text(v, "buyerIdNumber"), buyerLicenseState: needsIssuer(v.buyerIdKind) ? upper(v, "buyerLicenseState") : "", buyerIdKind: text(v, "buyerIdKind"),
    coBuyerName: co ? text(v, "coBuyerName") : "", coBuyerAddress: co ? text(v, "coBuyerAddress") : "", coBuyerCity: co ? text(v, "coBuyerCity") : "", coBuyerState: co ? upper(v, "coBuyerState") : "", coBuyerZip: co ? text(v, "coBuyerZip") : "", coBuyerPhone: co ? text(v, "coBuyerPhone") : "", coBuyerEmail: co ? text(v, "coBuyerEmail") : "", coBuyerLicense: co ? text(v, "coBuyerLicense") : "", coBuyerLicenseState: co ? upper(v, "coBuyerLicenseState") : "",
    vehicleYear: text(v, "vehicleYear"), vehicleMake: text(v, "vehicleMake"), vehicleModel: text(v, "vehicleModel"), vehicleTrim: text(v, "vehicleTrim"), vehicleVin: upper(v, "vehicleVin"), vehiclePlate: upper(v, "vehiclePlate"), vehicleColor: text(v, "vehicleColor"), vehicleBodyStyle: text(v, "vehicleBodyStyle"), vehicleMileage: text(v, "vehicleMileage"), odometerReading: text(v, "vehicleMileage"), odometerStatus: text(v, "odometerStatus") as BillOfSaleData["odometerStatus"],
    salePrice: number(v, "salePrice"), tradeInAllowance: trade ? number(v, "tradeInAllowance") : 0, tradeInDescription: trade ? text(v, "tradeInDescription") : "", tradeInVin: trade ? upper(v, "tradeInVin") : "", tradeInPayoff: trade ? number(v, "tradeInPayoff") : 0,
    tax: number(v, "tax"), titleFee: number(v, "titleFee"), docFee: number(v, "docFee"), registrationFee: weRegister ? number(v, "registrationFee") : 0, otherFees: extra ? number(v, "otherFees") : 0, otherFeesDescription: extra ? text(v, "otherFeesDescription") : "",
    paymentMethod: text(v, "paymentMethod") as BillOfSaleData["paymentMethod"], paymentMethodOther: v.paymentMethod === "Other" ? text(v, "paymentMethodOther") : "",
    conditionType: text(v, "conditionType") as BillOfSaleData["conditionType"], warrantyDuration: warranty ? text(v, "warrantyDuration") : "", warrantyDescription: warranty ? text(v, "warrantyDescription") : "",
    sellerLienEnabled: lien, sellerLienAmount: lien ? number(v, "sellerLienAmount") : 0, sellerLienReason: lien ? text(v, "sellerLienReason") : "", sellerLienDate: lien ? text(v, "sellerLienDate") : "", sellerLienDueDate: lien ? text(v, "sellerLienDueDate") : "", sellerLienholderName: lien ? text(v, "sellerLienholderName") : "", sellerLienholderAddress: lien ? text(v, "sellerLienholderAddress") : "", sellerLienholderCity: lien ? text(v, "sellerLienholderCity") : "", sellerLienholderState: lien ? upper(v, "sellerLienholderState") : "", sellerLienholderZip: lien ? text(v, "sellerLienholderZip") : "",
  };
}

export function toForm130UData(v: TemplateValues): Form130UData {
  if (v.isPurchase === "no") v = { ...v, salesPrice: "", saleDate: "", rebateOrIncentive: "", hasTradeIn: "no" };
  const lien = v.hasLien === "yes";
  const trade = v.hasTradeIn === "yes";
  const person = v.applicantType === "Individual";
  const sameLocation = v.vehicleLocationSameAsMailing === "yes";
  return {
    applicationType: text(v, "applicationType") as Form130UData["applicationType"],
    vin: upper(v, "vehicleVin"), year: text(v, "vehicleYear"), make: text(v, "vehicleMake"), model: text(v, "vehicleModel"), bodyStyle: text(v, "vehicleBodyStyle"), majorColor: text(v, "vehicleColor"), minorColor: text(v, "minorColor"), licensePlateNo: upper(v, "vehiclePlate"), odometerReading: text(v, "vehicleMileage"), odometerBrand: ({ actual: "A", exceeds: "X", not_actual: "N" } as const)[v.odometerStatus as "actual" | "exceeds" | "not_actual"], emptyWeight: text(v, "emptyWeight"), carryingCapacity: text(v, "carryingCapacity"),
    applicantType: text(v, "applicantType") as Form130UData["applicantType"], applicantIdNumber: text(v, "applicantIdNumber"), applicantIdType: person ? text(v, "applicantIdType") : "", applicantIdState: person && needsIssuer(v.applicantIdType) ? upper(v, "applicantIdState") : "",
    applicantFirstName: person ? text(v, "applicantFirstName") : "", applicantMiddleName: person ? text(v, "applicantMiddleName") : "", applicantLastName: person ? text(v, "applicantLastName") : "", applicantSuffix: person ? text(v, "applicantSuffix") : "", applicantEntityName: person ? "" : text(v, "applicantEntityName"), coApplicantName: v.hasCoApplicant === "yes" ? text(v, "coApplicantName") : "",
    mailingAddress: text(v, "mailingAddress"), mailingCity: text(v, "mailingCity"), mailingState: upper(v, "mailingState"), mailingZip: text(v, "mailingZip"), countyOfResidence: text(v, "countyOfResidence"), applicantDob: "", applicantPhone: text(v, "applicantPhone"), applicantEmail: text(v, "applicantEmail"),
    previousOwnerName: text(v, "previousOwnerName"), previousOwnerCity: text(v, "previousOwnerCity"), previousOwnerState: upper(v, "previousOwnerState"),
    vehicleLocationSameAsMailing: sameLocation, vehicleLocationAddress: text(v, sameLocation ? "mailingAddress" : "vehicleLocationAddress"), vehicleLocationCity: text(v, sameLocation ? "mailingCity" : "vehicleLocationCity"), vehicleLocationState: upper(v, sameLocation ? "mailingState" : "vehicleLocationState"), vehicleLocationZip: text(v, sameLocation ? "mailingZip" : "vehicleLocationZip"), vehicleLocationCounty: text(v, sameLocation ? "countyOfResidence" : "vehicleLocationCounty"),
    hasLien: lien, lienholderName: lien ? text(v, "lienholderName") : "", lienholderAddress: lien ? text(v, "lienholderAddress") : "", lienholderCity: lien ? text(v, "lienholderCity") : "", lienholderState: lien ? upper(v, "lienholderState") : "", lienholderZip: lien ? text(v, "lienholderZip") : "", lienDate: lien ? text(v, "lienDate") : "", lienAmount: lien ? number(v, "lienAmount") : 0, etitleLienholderId: lien ? text(v, "etitleLienholderId") : "",
    salesPrice: number(v, "salesPrice"), tradeInAllowance: trade ? number(v, "tradeInAllowance") : 0, taxRate: 6.25, rebateOrIncentive: number(v, "rebateOrIncentive"), tradeInDescription: trade ? text(v, "tradeInDescription") : "", tradeInVin: trade ? upper(v, "tradeInVin") : "", saleDate: text(v, "saleDate"), remarks: "",
  };
}

/** All standalone answers are sent, including fields older callers omitted. */
export function toForm130URequest(v: TemplateValues) {
  const d = toForm130UData(v);
  return {
    is_purchase: v.isPurchase !== "no",
    vin: d.vin, year: d.year, make: d.make, model: d.model, body_style: d.bodyStyle, major_color: d.majorColor, minor_color: d.minorColor,
    odometer: d.odometerReading, odometer_brand: d.odometerBrand, empty_weight: d.emptyWeight, carrying_capacity: d.carryingCapacity, tx_plate_no: d.licensePlateNo,
    buyer_first_name: d.applicantFirstName, buyer_middle_name: d.applicantMiddleName, buyer_last_name: d.applicantLastName, buyer_suffix: d.applicantSuffix, buyer_entity_name: d.applicantEntityName,
    buyer_address: d.mailingAddress, buyer_city: d.mailingCity, buyer_state: d.mailingState, buyer_zip: d.mailingZip, buyer_county: d.countyOfResidence, buyer_phone: d.applicantPhone, buyer_email: d.applicantEmail, buyer_dl_number: d.applicantIdNumber, buyer_dl_state: d.applicantIdState, buyer_id_kind: (d.applicantIdType || undefined) as IdDocumentKind | undefined,
    co_buyer_name: d.coApplicantName, sale_price: d.salesPrice, sale_date: d.saleDate, trade_in_amount: d.tradeInAllowance, trade_in_description: d.tradeInDescription, trade_in_vin: d.tradeInVin, rebate_amount: d.rebateOrIncentive,
    applying_for: ({ titleAndRegistration: "title_and_registration", titleOnly: "title_only", registrationOnly: "registration_only", nontitle: "nontitle" } as const)[d.applicationType],
    applicant_type: ({ Individual: "individual", Business: "business", Government: "government", Trust: "trust", "Non-Profit": "non_profit" } as const)[d.applicantType],
    previous_owner_name: d.previousOwnerName, previous_owner_city: d.previousOwnerCity, previous_owner_state: d.previousOwnerState,
    vehicle_location_same_as_mailing: d.vehicleLocationSameAsMailing, vehicle_location_address: d.vehicleLocationSameAsMailing ? "" : d.vehicleLocationAddress, vehicle_location_city: d.vehicleLocationSameAsMailing ? "" : d.vehicleLocationCity, vehicle_location_state: d.vehicleLocationSameAsMailing ? "" : d.vehicleLocationState, vehicle_location_zip: d.vehicleLocationSameAsMailing ? "" : d.vehicleLocationZip, vehicle_location_county: d.vehicleLocationSameAsMailing ? "" : d.vehicleLocationCounty,
    has_lien: d.hasLien, lien_date: d.lienDate, lien_amount: d.lienAmount, etitle_lienholder_id: d.etitleLienholderId, lienholder_name: d.lienholderName, lienholder_address: d.lienholderAddress, lienholder_city: d.lienholderCity, lienholder_state: d.lienholderState, lienholder_zip: d.lienholderZip,
  } satisfies Omit<AgreementData, "applying_for" | "applicant_type"> & { applying_for: string; applicant_type: string; buyer_entity_name: string; trade_in_vin: string; previous_owner_name: string; previous_owner_city: string; previous_owner_state: string; vehicle_location_same_as_mailing: boolean; vehicle_location_address: string; vehicle_location_city: string; vehicle_location_state: string; vehicle_location_zip: string; vehicle_location_county: string };
}

export function toRebuiltDisclosureData(v: TemplateValues): RebuiltDisclosureData {
  return { buyerName: text(v, "buyerName"), buyerIdNumber: text(v, "buyerIdNumber"), buyerPhone: text(v, "buyerPhone"), buyerAddress: joinAddress(v), vehicleDescription: [text(v, "vehicleYear"), text(v, "vehicleMake"), text(v, "vehicleModel")].filter(Boolean).join(" "), vehicleYear: text(v, "vehicleYear"), vehicleMake: text(v, "vehicleMake"), vehicleModel: text(v, "vehicleModel"), vin: upper(v, "vehicleVin"), saleDate: text(v, "saleDate") };
}

export function toOfficialRebuiltDisclosureData(v: TemplateValues): OfficialRebuiltDisclosureData {
  return { year: text(v, "vehicleYear"), make: text(v, "vehicleMake"), vin: upper(v, "vehicleVin"), buyerName: text(v, "buyerName"), signatureDate: text(v, "signatureDate") };
}

export function toVtr61Request(v: TemplateValues): Vtr61Input {
  const selected = text(v, "componentsUsed").split(",");
  return {
    vin: upper(v, "vehicleVin"), year: text(v, "vehicleYear"), make: text(v, "vehicleMake"), model: text(v, "vehicleModel"), bodyStyle: text(v, "vehicleBodyStyle"),
    ownerName: text(v, "ownerName"), rebuilderName: text(v, v.rebuilderIsOwner === "yes" ? "ownerName" : "rebuilderName"),
    rebuilderAddress: [text(v, "rebuilderStreet"), text(v, "rebuilderCity"), [upper(v, "rebuilderState"), text(v, "rebuilderZip")].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    workPerformed: text(v, "workPerformed"), dateWorkCompleted: usDate(text(v, "dateWorkCompleted")),
    laborStatement: v.partsUsed === "no" ? "No component parts were replaced." : "",
    parts: v.partsUsed === "yes" ? VTR61_COMPONENTS.filter(c => selected.includes(c.key)).map(c => ({ component: c.key, origin: text(v, `part_${c.key}_origin`), partNumber: text(v, `part_${c.key}_number`), donorVin: upper(v, `part_${c.key}_donorVin`) })) : [],
  };
}

export function toSalvageSaleData(v: TemplateValues): SalvageSaleData {
  const total = Math.round((number(v, "salePrice") + number(v, "tax") + number(v, "titleFee") + number(v, "docFee")) * 100) / 100;
  return { ...toRebuiltDisclosureData(v), vehicleMileage: text(v, "vehicleMileage"), odometerStatus: text(v, "odometerStatus") as SalvageSaleData["odometerStatus"], salePrice: number(v, "salePrice"), tax: number(v, "tax"), titleFee: number(v, "titleFee"), docFee: number(v, "docFee"), total, amountPaidToday: number(v, "amountPaidToday"), paymentMethod: v.paymentMethod === "Other" ? text(v, "paymentMethodOther") : text(v, "paymentMethod"), howLeaving: text(v, "howLeaving") as SalvageSaleData["howLeaving"], salvageLicense: text(v, "salvageLicense"), titleOriginState: upper(v, "titleOriginState") };
}

export function toVehicleResponsibilityData(v: TemplateValues): VehicleResponsibilityFormData {
  return { ...toRebuiltDisclosureData(v), dealId: null, quotedRegistrationAmount: number(v, "quotedRegistrationAmount"), buyerSignatureDataUrl: "", language: "en" };
}

export function toPowerOfAttorneyData(v: TemplateValues): PowerOfAttorneyFormFields {
  return { vin: upper(v, "vehicleVin"), year: text(v, "vehicleYear"), make: text(v, "vehicleMake"), model: text(v, "vehicleModel"), bodyStyle: text(v, "vehicleBodyStyle"), licensePlate: upper(v, "vehiclePlate"), titleDocumentNumber: text(v, "titleDocumentNumber"), grantorName: text(v, "grantorName"), grantorAddress: text(v, "grantorAddress"), grantorCity: text(v, "grantorCity"), grantorCounty: text(v, "grantorCounty"), grantorState: upper(v, "grantorState"), grantorZip: text(v, "grantorZip"), executedDate: text(v, "executedDate") };
}

export function templatePdfUrl(id: TemplateId, values: TemplateValues, language: "en" | "es" = "en"): string | null {
  const params = new URLSearchParams();
  if (id === "power-of-attorney") {
    const d = toPowerOfAttorneyData(values);
    const pairs = { vin: d.vin, year: d.year, make: d.make, model: d.model, bodyStyle: d.bodyStyle, plate: d.licensePlate, titleDocumentNumber: d.titleDocumentNumber, grantorName: d.grantorName, grantorAddress: d.grantorAddress, grantorCityName: d.grantorCity, grantorCounty: d.grantorCounty, grantorState: d.grantorState, grantorZip: d.grantorZip, executedDate: d.executedDate };
    for (const [key, value] of Object.entries(pairs)) if (value) params.set(key, value);
    return `/api/documents/power-of-attorney?${params.toString()}`;
  }
  if (id === "buyers-guide") {
    for (const [key, value] of Object.entries({ year: text(values, "vehicleYear"), make: text(values, "vehicleMake"), model: text(values, "vehicleModel"), vin: upper(values, "vehicleVin"), contact: text(values, "guideContact"), lang: language })) if (value) params.set(key, value);
    return `/api/documents/buyers-guide?${params.toString()}`;
  }
  return null;
}

export function buildTemplateData(id: TemplateId, values: TemplateValues) {
  switch (id) {
    case "bill-of-sale": return toBillOfSaleData(values);
    case "form-130u": return toForm130UData(values);
    case "power-of-attorney": return toPowerOfAttorneyData(values);
    case "vehicle-responsibility": return toVehicleResponsibilityData(values);
    case "rebuilt-disclosure": return toOfficialRebuiltDisclosureData(values);
    case "rebuilt-vehicle-statement": return toVtr61Request(values);
    case "buyers-guide": return { vehicle: { vin: upper(values, "vehicleVin"), year: text(values, "vehicleYear"), make: text(values, "vehicleMake"), model: text(values, "vehicleModel") }, dealer: { contact: text(values, "guideContact") } };
    default: return toSalvageSaleData(values);
  }
}
