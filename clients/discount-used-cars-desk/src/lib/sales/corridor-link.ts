import { encodeCompletedLink, type DocumentSection } from "@/lib/documents/customerPortal";
import { BALANCE_OWED_REASON } from "@/lib/sales/money";
import { nameForForms, readBuyerId, settled } from "@/lib/sales/buyer-id";
import { readSalePlan } from "@/lib/sales/sale-plan";
import { readPaperwork } from "@/lib/sales/paperwork";
import { buildLenderDirectory, findLender, type Lender } from "@/lib/sales/lenders";
import { lienFor, sellerAsLienholder, type TitleLien } from "@/lib/documents/lien";
import { dealership, factOr } from "@/lib/dealership-config";
import { businessDateToday } from "@/lib/documents/us-date";
import { idDocumentType } from "@/lib/forms/id-document";
import { codeCase, fieldCase, vinCase } from "@/lib/documents/presentation-case";
import { readTitleOrigin } from "@/lib/vehicles/title-kinds";
import type { SaleDetail } from "@/lib/admin/sale-desk";
import { DOC_FEE_NOTICE_VERSION } from "@/lib/legal/doc-fee-notice";
import { joinAddress } from "@/lib/sales/aamva";
import { warrantySystemLabels } from "@/lib/sales/deal-facts";
import { dealerFees } from "@/lib/dealership-config";
import { readCoBuyer } from "@/lib/sales/co-buyer";
import { PAGE_LAYOUT } from "@/lib/documents/page-layout";

/**
 * The corridor's filed document, assembled into something a printer can hold.
 *
 * The paperwork corridor stores its answers and figures in `form_data`, which
 * is a faithful record and not a document: the packet's PDF route, and the
 * 130-U's own filler, both render from `completed_link`, the encoded payload
 * the customer portal writes. Corridor-filed rows never had one, so the
 * guide's own output could not be printed from the guide's own last screen.
 * The flow auditor put it plainly: the packet is a room the corridor's
 * documents cannot enter.
 *
 * This module is the door. It reads the whole deal, the corridor's answers
 * and the money figures, and writes the same payload the portal would have,
 * so every print path downstream works unchanged.
 *
 * The lien block is where the funding type earns its keep. On a bank deal
 * the lender is the lienholder, named from the deal's own lender answer, and
 * the seller lien keys are left off entirely: a lender-funded 130-U titling
 * the car with the dealership as lienholder was the audit's worst finding.
 */

const text = (value: unknown): string =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : "";

const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

/*
  The date on the paper is the date at the desk.

  This was the UTC date, which in Houston turns over at 7 pm in summer and
  6 pm in winter, so every document on an evening sale was dated tomorrow
  while the dealer's signature line, which asks the dealership's own
  calendar, said today. Two dates on one signature block is the kind of
  thing a title clerk sends back.
*/
function today(): string {
  return businessDateToday();
}

/**
 * What the bill of sale's Still To Do says, read off the sale's own plan.
 *
 * This block never received the plan. No print path passed it, so every
 * bill of sale this product ever printed told the buyer "You are
 * registering this vehicle yourself at the county tax office. Yours to
 * do", on sales where the dealership was filing through webDEALER and had
 * just signed the 130-U saying so. On paper that reads as the dealer
 * disclaiming a duty Transportation Code 501.0234 puts on it.
 *
 * So the answers travel with the document. Registration defaults to the
 * dealer, because that is the law's default and the corridor's; the buyer
 * wording prints only when the sale recorded that the buyer files.
 * Insurance and the inspection print only when they were answered: an
 * unanswered question is not a buyer's errand.
 */
export function stillToDo(sale: SaleDetail): {
  registrationByDealer: boolean;
  insuranceShown?: boolean;
  inspectionByDealer?: boolean;
  inspectionDone?: boolean;
} {
  const plan = readSalePlan(sale.stepData);
  return {
    registrationByDealer: plan.registrationBy !== "buyer",
    ...(plan.insuranceShown === null ? {} : { insuranceShown: plan.insuranceShown }),
    ...(plan.inspectionBy === null
      ? {}
      : {
          inspectionByDealer: plan.inspectionBy === "dealer",
          inspectionDone: plan.inspectionBy === "done",
        }),
  };
}

/** The lender on the deal, as the directory knows it; null when not picked from it. */
export function lenderFor(sale: SaleDetail): Lender | null {
  if (sale.funding.type !== "lender") return null;
  return findLender(buildLenderDirectory(dealership.lenders), sale.funding.lenderId);
}

/**
 * The bill of sale's disclosure of a lien that is not the seller's.
 *
 * The seller's own lien reaches the sheet through the seller-lien keys the
 * money step already writes. The bank's did not reach it at all: the sheet
 * said "Financing" and the 130-U filed the same day put the bank in box 34.
 */
function bankLienKeys(lien: TitleLien | null) {
  if (!lien || lien.holder !== "lender") return {};
  return {
    titleLienholderName: lien.lienholder.name,
    titleLienholderAddress: lien.lienholder.street,
    titleLienholderCity: lien.lienholder.city,
    titleLienholderState: lien.lienholder.state,
    titleLienholderZip: lien.lienholder.zip,
    titleLienReason: lien.reason,
  };
}

/** Boxes 32 to 34 of the 130-U, from whichever lien the title carries. */
function form130ULienKeys(lien: TitleLien | null) {
  if (!lien) return { hasLien: false };
  return {
    hasLien: true,
    lienDate: lien.lienDate,
    lienholderName: lien.lienholder.name,
    lienholderAddress: lien.lienholder.street,
    lienholderCity: lien.lienholder.city,
    lienholderState: lien.lienholder.state,
    lienholderZip: lien.lienholder.zip,
    etitleLienholderId: lien.lienholder.certifiedLienholderId ?? "",
    lienAmount: lien.amountSecured,
  };
}

/**
 * The trade-in as box 36 of the 130-U describes it: the value filed with this
 * document when it carries one, otherwise the bill of sale's answer, and only
 * when that bill of sale says there is a trade-in.
 */
function tradeInDescriptionFor(sale: SaleDetail, formData: Record<string, unknown>): string {
  const filed = text(formData.tradeInDescription).trim();
  if (filed) return filed;
  const bill = readPaperwork(sale.stepData, "billOfSale");
  return bill.tradeIn === "yes" ? (bill.tradeInDescription ?? "").trim() : "";
}

/** The lender on the deal, as a name a title clerk can read. */
export function lenderNameFor(sale: SaleDetail): string | null {
  if (sale.funding.type !== "lender") return null;
  const known = findLender(buildLenderDirectory(dealership.lenders), sale.funding.lenderId);
  if (known) return known.name;
  const typed = sale.funding.lenderOther?.trim();
  return typed && typed !== "Not chosen yet" ? typed : null;
}

/**
 * The shared buyer and vehicle block every document starts from.
 *
 * Values a person confirmed win; what the machine read fills gaps only for
 * fields whose whole record is the read.
 */
/*
  Every fact is cased for paper here, once: the VIN, the plate, the state
  and the licence number in capitals, every other field in title case unless
  somebody typed it in mixed case on purpose. The owner's standard, from a
  filled state form whose body style read "pickup": whatever the desk or the
  decoder typed, the documents print one way.
*/
/*
  Which state (or country) issued the ID: the intake's answer, then the
  bill of sale's own question (asked only when intake did not say), and
  only then the old default for a record from before either existed. The
  bill's answer used to be stored and dropped: the paper printed "TX"
  whatever had been answered.
*/
function licenceIssuer(sale: SaleDetail, needsState: boolean): string {
  const intake = codeCase(sale.buyer?.idState);
  if (intake) return intake;
  const answered =
    codeCase(readPaperwork(sale.stepData, "billOfSale").buyerLicenseState) ||
    codeCase(readPaperwork(sale.stepData, "salvageBillOfSale").buyerLicenseState);
  if (answered) return answered;
  return needsState ? "TX" : "";
}

/** One line of an address the way people write one: "City, ST 12345". */
export function oneLineAddress(street: string, city: string, state: string, zip: string): string {
  return joinAddress({ street: street || null, city: city || null, state: state || null, postal: zip || null, county: null }) ?? "";
}

function baseFacts(sale: SaleDetail) {
  const held = readBuyerId(sale.stepData);
  const mailing = held.mailing;
  const name = nameForForms(held).parts;
  const idKind = sale.buyer?.idKind ?? "stateLicence";
  return {
    buyerName: fieldCase(settled(held.name) ?? sale.buyer?.name ?? ""),
    /*
      The name in the boxes the forms print, typed where a deal has them and
      split from the whole name only where it does not. `nameForForms` is the
      one place that decides which, so no document invents its own answer.
    */
    applicantFirstName: fieldCase(name.first),
    applicantMiddleName: fieldCase(name.middle),
    applicantLastName: fieldCase(name.last),
    applicantSuffix: fieldCase(name.suffix),
    buyerPhone: sale.buyer?.phone ?? "",
    buyerEmail: sale.buyer?.email ?? "",
    buyerAddress: fieldCase(mailing.street ?? sale.buyer?.address ?? ""),
    buyerCity: fieldCase(mailing.city),
    // No state is added to an address that has none: a blank state is a
    // missing box the filing names, never a "TX" nobody said.
    buyerState: codeCase(mailing.state),
    buyerZip: mailing.postal ?? "",
    buyerLicense: codeCase(settled(held.licenseNumber) ?? sale.buyer?.idNumber ?? ""),
    /*
      The kind of document and who issued it. A record from before the kind
      was asked is a licence, and a licence with no recorded state is a
      Texas one, which is what every such record was filed as. A passport
      carries its country in the same slot and gets no state default: "TX"
      beside a Mexican passport number is a wrong box, not a blank one.
    */
    buyerIdKind: idKind,
    buyerLicenseState: licenceIssuer(sale, idDocumentType(idKind).needsState),
    vehicleYear: text(sale.vehicle?.year),
    vehicleMake: fieldCase(sale.vehicle?.make),
    vehicleModel: fieldCase(sale.vehicle?.model),
    vehicleVin: vinCase(sale.vehicle?.vin),
    vehiclePlate: codeCase(sale.plate),
    vehicleBodyStyle: fieldCase(sale.vehicle?.bodyStyle),
    /*
      The reading, the colour and the trim, off the vehicle row.

      Start A Sale records the odometer read that day onto the vehicle, and
      nothing carried it from there to the paper: the corridor asks whether
      the mileage is real, never what it is, so the bill of sale's federal
      odometer disclosure printed a blank line beside a signed statement
      that the reading was true, and the financing contract had no mileage
      at all. The state form was saved only by its own second lookup of the
      vehicle row. The persona walk's own bill of sale is the evidence.
    */
    vehicleMileage: sale.vehicle?.mileage != null ? String(sale.vehicle.mileage) : "",
    vehicleColor: fieldCase(sale.vehicle?.exteriorColor),
    vehicleTrim: fieldCase(sale.vehicle?.trim),
  };
}

/**
 * The full document payload for one corridor filing, or null for a type no
 * renderer knows. `formData` is what the review screen filed: the corridor's
 * answers spread over the computed money figures.
 */
export function corridorCompletedLink(
  sale: SaleDetail,
  documentType: string,
  formData: Record<string, unknown>,
  baseUrl: string,
  signatures: {
    buyerSignature?: string | null;
    buyerSignatureDate?: string | null;
    dealerSignature?: string | null;
    dealerSignatureDate?: string | null;
    /**
     * The filing member's onboarding name, printed beside the dealer stroke
     * as "Legal Name (First Last)" (owner's instruction 10/01/2026; SOP 130-U
     * bullet). Carried in the DEALER half, so the customer half of a portal
     * link can never name the dealer's signer, and the ceremony, which
     * re-encodes the dealer half as it is, keeps it.
     */
    dealerSignerName?: string | null;
  } = {},
  options: {
    /** The current filed bill of sale's date of sale (`saleDateFor`), when known. */
    saleDate?: string | null;
    /**
     * False when the owner has not set the documentary fee (Your Fees), so
     * the fee is 0 in the arithmetic. The paper then says so with the "Not
     * set" marker beside the line rather than printing $0.00 as if the owner
     * had charged nothing. Only a demo (DESK_ALLOW_UNSET_FACTS) files one.
     */
    docFeeSet?: boolean;
  } = {},
): string | null {
  const facts = baseFacts(sale);
  // The co-buyer named at intake, on the sale (sales/co-buyer.ts). They sign
  // and write their own details in ink (D-02); the name is printed.
  const coBuyerName = fieldCase(readCoBuyer(sale.stepData).name);
  const docFeeUnset = options.docFeeSet === false ? { docFeeUnset: true } : {};
  const billAnswers = readPaperwork(sale.stepData, "billOfSale");
  const funding = sale.funding.type;
  const lenderName = lenderNameFor(sale);

  const sellerLien =
    funding !== "lender" && Boolean(formData.sellerLienEnabled) && num(formData.sellerLienAmount) > 0
      ? {
          sellerLienEnabled: true,
          sellerLienAmount: num(formData.sellerLienAmount),
          sellerLienReason: text(formData.sellerLienReason) || BALANCE_OWED_REASON,
          sellerLienDate: options.saleDate || today(),
          sellerLienholderName: factOr(dealership.legalName, "dealer legal name"),
          sellerLienholderAddress: dealership.address.street,
          sellerLienholderCity: dealership.address.locality,
          sellerLienholderState: dealership.address.region,
          sellerLienholderZip: dealership.address.postalCode,
        }
      : { sellerLienEnabled: false, sellerLienAmount: 0 };

  /*
    Whose lien the title carries, decided once from the funding answer.

    The seller's on an in-house note, always, whatever the balance line
    says; the bank's on a lender deal, with its titling address when the
    directory carries one; the seller's on a cash deal only while money is
    owed. Both documents below read this rather than asking.
  */
  const lien = lienFor({
    funding,
    saleDate: options.saleDate || today(),
    balanceOwed: sellerLien.sellerLienEnabled ? sellerLien.sellerLienAmount : 0,
    reason: text(formData.sellerLienReason) || BALANCE_OWED_REASON,
    seller: sellerAsLienholder(dealership),
    lender: lenderFor(sale),
    lenderOther: sale.funding.lenderOther,
  });

  let section: DocumentSection;
  let data: Record<string, unknown>;
  const tradeIn = text(formData.tradeIn) !== "no" && (text(formData.tradeIn) === "yes" || num(formData.tradeInAllowance) > 0 || text(formData.tradeInDescription) !== "");
  const warranty = text(formData.conditionType) === "warranty";
  /*
    The date of sale: the current filed bill of sale's, when the filing that
    calls this knows it (a document filed the next morning is still dated
    the day the car was sold), else today at the desk.
  */
  const dated = options.saleDate || today();
  const issuerKind = idDocumentType(facts.buyerIdKind);

  if (documentType === "billOfSale") {
    section = "billOfSale";
    data = {
      saleDate: dated,
      // The car's own stock number when the lot gave it one.
      stockNumber: sale.vehicle?.stockNumber ?? "",
      outstanding: stillToDo(sale),
      ...facts,
      coBuyerName,
      coBuyerAddress: "",
      coBuyerCity: "",
      coBuyerState: "",
      coBuyerZip: "",
      coBuyerPhone: "",
      coBuyerEmail: "",
      coBuyerLicense: "",
      coBuyerLicenseState: "",
      // An answer typed on the document wins; the sale's own reading is what
      // prints when, as on every corridor deal, nobody retyped it.
      vehicleMileage: text(formData.odometerReading) || facts.vehicleMileage,
      odometerReading: text(formData.odometerReading) || facts.vehicleMileage,
      odometerStatus: text(formData.odometerStatus) || "actual",
      salePrice: num(formData.salePrice),
      tradeInAllowance: num(formData.tradeInAllowance),
      // Only while the sale says there is a trade-in: an answer typed before
      // the trade-in went back to No never prints a trade-in block.
      tradeInDescription: tradeIn ? text(formData.tradeInDescription) : "",
      tradeInVin: tradeIn ? vinCase(text(formData.tradeInVin)) : "",
      tradeInPayoff: 0,
      tax: num(formData.tax),
      titleFee: num(formData.titleFee),
      docFee: num(formData.docFee),
      registrationFee: num(formData.registrationFee),
      // The government lines of their own, once the sale's government fees
      // are confirmed from webDEALER (government-fees.ts); absent otherwise,
      // so a copy without them prints exactly as before.
      ...governmentLineKeys(formData),
      otherFees: 0,
      otherFeesDescription: "",
      // On financed deals the method is the funding answer, not a question:
      // offering Cash or Venmo on a bank deal made every option a wrong one.
      paymentMethod:
        funding === "lender" || funding === "inHouse"
          ? "Financing"
          : text(formData.paymentMethod) || "Cash",
      paymentMethodOther: funding === "lender" && lenderName ? lenderName : "",
      conditionType: text(formData.conditionType) || "as_is",
      warrantyDuration: warranty ? text(formData.warrantyDuration) : "",
      // FULL or LIMITED, for the Buyers Guide's boxes; blank on an as-is sale.
      warrantyKind: warranty ? text(formData.warrantyKind) : "",
      // The systems covered, in the Buyers Guide's own words; a copy filed
      // before they were asked keeps "As described in separate warranty document."
      warrantyDescription: warranty ? warrantySystemLabels(text(formData.warrantySystems)).join(", ") : "",
      amountPaidToday: num(formData.paidToday),
      ...sellerLien,
      ...bankLienKeys(lien),
      // The documentary fee notice prints beside the fee (Tex. Fin. Code
      // §348.006(c)(3)), and the approved Spanish one beside it on a Spanish
      // sale (§348.006(d)). Stamped at filing, so a copy filed before the
      // notice existed re-renders exactly as it was filed.
      docFeeNotice: DOC_FEE_NOTICE_VERSION,
      docFeeNoticeSpanish: sale.language === "es",
      ...docFeeUnset,
      // Filed under the page-by-page paperwork (documents/page-layout.ts):
      // Total Paid and the unsigned lines read the new way on this copy only.
      pageLayout: PAGE_LAYOUT,
    };
  } else if (documentType === "financing") {
    section = "financing";
    const cashPrice = num(formData.salePrice);
    data = {
      contractDate: dated,
      stockNumber: sale.vehicle?.stockNumber ?? "",
      buyerName: facts.buyerName,
      buyerAddress: oneLineAddress(facts.buyerAddress, facts.buyerCity, facts.buyerState, facts.buyerZip),
      buyerPhone: facts.buyerPhone,
      buyerEmail: facts.buyerEmail,
      coBuyerName,
      coBuyerAddress: "",
      coBuyerPhone: "",
      coBuyerEmail: "",
      vehicleYear: facts.vehicleYear,
      vehicleMake: facts.vehicleMake,
      vehicleModel: facts.vehicleModel,
      vehicleVin: facts.vehicleVin,
      vehiclePlate: facts.vehiclePlate,
      vehicleMileage: text(formData.odometerReading) || facts.vehicleMileage,
      cashPrice,
      // The trade-in the bill of sale took is part of the down payment on the
      // note, so the amount financed equals the bill of sale's balance (SOP
      // "Money": balance = total - paid; one set of figures per sale).
      tradeInAllowance: num(formData.tradeInAllowance),
      downPayment: num(formData.downPayment),
      tax: num(formData.tax),
      titleFee: num(formData.titleFee),
      registrationFee: num(formData.registrationFee),
      ...governmentLineKeys(formData),
      docFee: num(formData.docFee),
      apr: num(formData.apr),
      numberOfPayments: num(formData.numberOfPayments),
      paymentFrequency: text(formData.paymentFrequency) || "Monthly",
      firstPaymentDate: text(formData.firstPaymentDate),
      dueAtSigning: num(formData.downPayment),
      // The payment as agreed and the remainder that ends the note, solved
      // once in paperworkAnswers so the contract, the schedule and the
      // review all print the same three numbers.
      ...(num(formData.paymentAmount) > 0 ? { paymentAmount: num(formData.paymentAmount) } : {}),
      ...(num(formData.lastPaymentAmount) > 0 ? { lastPaymentAmount: num(formData.lastPaymentAmount) } : {}),
      // Clause 16 prints the statute's exact notice, and the approved Spanish
      // one on a Spanish sale. Stamped at filing, as on the bill of sale.
      docFeeNotice: DOC_FEE_NOTICE_VERSION,
      docFeeNoticeSpanish: sale.language === "es",
      // The bill of sale's as-is or warranty answer, carried so the contract
      // can follow it once counsel words its warranty box (D-05).
      conditionType: billAnswers.conditionType || "as_is",
      warrantyDuration: billAnswers.conditionType === "warranty" ? billAnswers.warrantyDuration ?? "" : "",
      ...docFeeUnset,
      pageLayout: PAGE_LAYOUT,
    };
  } else if (documentType === "form130U") {
    section = "form130U";
    data = {
      ...facts,
      // Box 17, the additional applicant: the co-buyer the intake named.
      ...(coBuyerName ? { coBuyerName } : {}),
      saleDate: dated,
      odometerReading: text(formData.odometerReading) || facts.vehicleMileage,
      // Box 10 states the bill of sale's mileage statement, never a default
      // of its own: "actual" here beside a bill that says "not actual" was a
      // state form contradicting the sale it titles.
      odometerStatus: text(formData.odometerStatus) || billAnswers.odometerStatus || "actual",
      salesPrice: num(formData.salePrice),
      salePrice: num(formData.salePrice),
      tradeInAllowance: num(formData.tradeInAllowance),
      // Box 36 names the trade-in the bill of sale took, so the county taxes
      // the same price less trade the bill of sale did (SOP "Money"; Tax
      // Code 152.021). The trade-in is asked on the bill of sale only.
      tradeInDescription: tradeInDescriptionFor(sale, formData),
      tax: num(formData.tax),
      countyOfResidence: text(formData.countyOfResidence),
      applicationType: text(formData.applicationType) || "titleAndRegistration",
      applicantType: text(formData.applicantType) || "Individual",
      // A business applicant is named as the business (box 16) and
      // identified by its FEIN (box 14), never by the person's licence.
      ...(text(formData.applicantType) === "Business"
        ? { businessName: text(formData.businessName), businessFein: text(formData.businessFein) }
        : {}),
      // Box 27 only when the buyer said yes; unasked is not enrolled.
      renewalReminders: text(formData.renewalReminders) === "yes" ? "yes" : "no",
      tradeInVin: billAnswers.tradeIn === "yes" ? vinCase(text(formData.tradeInVin) || billAnswers.tradeInVin || "") : "",
      emptyWeight: text(formData.emptyWeight),
      carryingCapacity: text(formData.carryingCapacity),
      // The seller-lien keys ride along only when the lien is the seller's:
      // a lender-funded 130-U titling the car with the dealership as
      // lienholder was the audit's worst finding.
      ...(lien?.holder === "seller" ? sellerLien : {}),
      ...form130ULienKeys(lien),
      pageLayout: PAGE_LAYOUT,
    };
  } else if (
    documentType === "vehicleResponsibility" ||
    documentType === "insuranceAcknowledgment" ||
    documentType === "rebuiltDisclosure"
  ) {
    /*
      The three desk-signed acknowledgments, one shape.

      Vehicle Responsibility filed from the corridor used to fall through to
      the null below, so "Preview The PDF" refused it and the packet printed
      a generic record sheet instead of the designed document. The other two
      were required by the plan and could not be filed at all.
    */
    section = documentType;
    data = {
      buyerName: facts.buyerName,
      buyerIdNumber: facts.buyerLicense,
      // What the number is and who issued it, as the 130-U already prints:
      // a passport number reads differently from a Texas licence number.
      buyerIdKind: facts.buyerIdKind,
      buyerIdIssuer: issuerKind.needsCountry || issuerKind.needsState ? facts.buyerLicenseState : "",
      buyerPhone: facts.buyerPhone,
      buyerAddress: oneLineAddress(facts.buyerAddress, facts.buyerCity, facts.buyerState, facts.buyerZip),
      vehicleDescription: [facts.vehicleYear, facts.vehicleMake, facts.vehicleModel]
        .filter(Boolean)
        .join(" "),
      // The parts as well as the line: the state's rebuilt disclosure form
      // has a rule for the year and a rule for the make, not one for both.
      vehicleYear: facts.vehicleYear,
      vehicleMake: facts.vehicleMake,
      vehicleModel: facts.vehicleModel,
      vin: facts.vehicleVin,
      saleDate: dated,
      quotedRegistrationAmount: num(formData.quotedRegistrationAmount),
      language: sale.language === "es" ? "es" : "en",
      ...(documentType === "rebuiltDisclosure" ? { officialForm: "ENF-MV-RBLT-DSCLMR" } : {}),
      // Who files the registration, stamped with the sheet, so a copy prints
      // the branch it was signed on whatever the plan says later (D-03, D-05).
      ...(documentType !== "rebuiltDisclosure" ? { registrationBy: readSalePlan(sale.stepData).registrationBy ?? "dealer" } : {}),
      /*
        The late-handling fee the buyer signs to, stamped at filing so a
        signed copy never changes when the dealer's figure does. A copy filed
        before the stamp reads the dealer's figure as it always did.
      */
      ...(documentType === "vehicleResponsibility" && dealerFees.lateHandlingFee !== null
        ? {
            lateHandlingFee: dealerFees.lateHandlingFee,
            lateHandlingTotal: Math.round((num(formData.quotedRegistrationAmount) + dealerFees.lateHandlingFee) * 100) / 100,
          }
        : {}),
    };
  } else if (
    documentType === "salvageBillOfSale" ||
    documentType === "towAwayAcknowledgment" ||
    documentType === "buyerResponsibilityStatement"
  ) {
    /*
      The tow-away packet, one shape for its three sheets.

      The money is the salvage bill of sale's and rides on all three so the
      acknowledgment and the statement name the same sale. No registration
      fee: nothing is registered. The tax is the state's on the price, as on
      any sale; a salvage vehicle is still a motor vehicle to the
      comptroller.
    */
    section = documentType;
    const bill = readPaperwork(sale.stepData, "salvageBillOfSale");
    const price = num(formData.salePrice);
    const tax = num(formData.tax);
    const titleFee = num(formData.titleFee);
    const docFee = num(formData.docFee);
    data = {
      buyerName: facts.buyerName,
      buyerIdNumber: facts.buyerLicense,
      buyerIdKind: facts.buyerIdKind,
      buyerIdIssuer: issuerKind.needsCountry || issuerKind.needsState ? facts.buyerLicenseState : "",
      buyerPhone: facts.buyerPhone,
      buyerAddress: oneLineAddress(facts.buyerAddress, facts.buyerCity, facts.buyerState, facts.buyerZip),
      vehicleDescription: [facts.vehicleYear, facts.vehicleMake, facts.vehicleModel]
        .filter(Boolean)
        .join(" "),
      vehicleYear: facts.vehicleYear,
      vehicleMake: facts.vehicleMake,
      vehicleModel: facts.vehicleModel,
      vin: facts.vehicleVin,
      vehicleMileage: text(formData.odometerReading) || facts.vehicleMileage,
      odometerStatus: text(formData.odometerStatus) || text(bill.odometerStatus) || "actual",
      saleDate: dated,
      salePrice: price,
      tax,
      titleFee,
      docFee,
      total: Math.round((price + tax + titleFee + docFee) * 100) / 100,
      amountPaidToday: num(formData.paidToday),
      // What is still owed after today, shown beside Paid Today (display only).
      ...(num(formData.sellerLienAmount) > 0 && funding !== "lender"
        ? { balanceOwed: num(formData.sellerLienAmount) }
        : {}),
      paymentMethod:
        funding === "lender" || funding === "inHouse"
          ? "Financing"
          : text(formData.paymentMethod) || text(bill.paymentMethod) || "Cash",
      ...(funding === "lender" && lenderName ? { paymentMethodOther: lenderName } : {}),
      // Answered on the salvage bill of sale, printed on the acknowledgment.
      howLeaving: text(formData.howLeaving) || text(bill.howLeaving),
      salvageLicense: dealership.salvageDealerLicense ?? "",
      // No other state recorded means a Texas title, printed as TX: never
      // the dealer's own address state, which is a different fact.
      titleOriginState: readTitleOrigin(sale.stepData).state ?? "TX",
      language: sale.language === "es" ? "es" : "en",
      // The salvage bill of sale is the tow-away sale's buyer's order, so the
      // documentary fee notice prints beside its fee as on any bill of sale.
      ...(documentType === "salvageBillOfSale"
        ? { docFeeNotice: DOC_FEE_NOTICE_VERSION, docFeeNoticeSpanish: sale.language === "es", ...docFeeUnset }
        : {}),
    };
  } else {
    // A type with no renderer. The render route's fallback shows the filed
    // answers as a clean summary sheet instead of failing.
    return null;
  }

  const signer = signatures.dealerSignerName?.trim();
  if (signer) data = { ...data, dealerSignerName: signer };

  return encodeCompletedLink(
    section,
    data,
    {},
    baseUrl,
    signatures.dealerSignature ?? undefined,
    signatures.dealerSignatureDate ?? undefined,
    signatures.buyerSignature ?? undefined,
    signatures.buyerSignatureDate ?? undefined,
  );
}

/**
 * The inspection program replacement fee and the license plate fee, each on
 * its own line, when the filing carries them (a sale whose government fees
 * were confirmed from webDEALER). Never folded into the registration line
 * (Transp. Code §548.510; OCCC Bulletin B25-1).
 */
function governmentLineKeys(formData: Record<string, unknown>): { inspectionFee?: number; plateFee?: number } {
  const figure = (value: unknown) => {
    const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/[$,\s]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const inspectionFee = figure(formData.inspectionFee);
  const plateFee = figure(formData.plateFee);
  return {
    ...(inspectionFee > 0 ? { inspectionFee } : {}),
    ...(plateFee > 0 ? { plateFee } : {}),
  };
}
