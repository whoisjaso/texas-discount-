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
    buyerState: codeCase(mailing.state) || "TX",
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
    buyerLicenseState: codeCase(sale.buyer?.idState) || (idDocumentType(idKind).needsState ? "TX" : ""),
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
  } = {},
): string | null {
  const facts = baseFacts(sale);
  const funding = sale.funding.type;
  const lenderName = lenderNameFor(sale);

  const sellerLien =
    funding !== "lender" && Boolean(formData.sellerLienEnabled) && num(formData.sellerLienAmount) > 0
      ? {
          sellerLienEnabled: true,
          sellerLienAmount: num(formData.sellerLienAmount),
          sellerLienReason: text(formData.sellerLienReason) || BALANCE_OWED_REASON,
          sellerLienDate: today(),
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
    saleDate: today(),
    balanceOwed: sellerLien.sellerLienEnabled ? sellerLien.sellerLienAmount : 0,
    reason: text(formData.sellerLienReason) || BALANCE_OWED_REASON,
    seller: sellerAsLienholder(dealership),
    lender: lenderFor(sale),
    lenderOther: sale.funding.lenderOther,
  });

  let section: DocumentSection;
  let data: Record<string, unknown>;

  if (documentType === "billOfSale") {
    section = "billOfSale";
    data = {
      saleDate: today(),
      stockNumber: "",
      outstanding: stillToDo(sale),
      ...facts,
      coBuyerName: "",
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
      tradeInDescription: text(formData.tradeInDescription),
      tradeInVin: "",
      tradeInPayoff: 0,
      tax: num(formData.tax),
      titleFee: num(formData.titleFee),
      docFee: num(formData.docFee),
      registrationFee: num(formData.registrationFee),
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
      warrantyDuration: text(formData.warrantyDuration),
      warrantyDescription: "",
      amountPaidToday: num(formData.paidToday),
      ...sellerLien,
      ...bankLienKeys(lien),
    };
  } else if (documentType === "financing") {
    section = "financing";
    const cashPrice = num(formData.salePrice);
    data = {
      contractDate: today(),
      stockNumber: "",
      buyerName: facts.buyerName,
      buyerAddress: [facts.buyerAddress, facts.buyerCity, facts.buyerState, facts.buyerZip]
        .filter(Boolean)
        .join(", "),
      buyerPhone: facts.buyerPhone,
      buyerEmail: facts.buyerEmail,
      coBuyerName: "",
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
      downPayment: num(formData.downPayment),
      tax: num(formData.tax),
      titleFee: num(formData.titleFee),
      registrationFee: num(formData.registrationFee),
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
    };
  } else if (documentType === "form130U") {
    section = "form130U";
    data = {
      ...facts,
      saleDate: today(),
      odometerReading: text(formData.odometerReading) || facts.vehicleMileage,
      odometerStatus: text(formData.odometerStatus) || "actual",
      salesPrice: num(formData.salePrice),
      salePrice: num(formData.salePrice),
      tradeInAllowance: num(formData.tradeInAllowance),
      tax: num(formData.tax),
      countyOfResidence: text(formData.countyOfResidence),
      applicationType: text(formData.applicationType) || "titleAndRegistration",
      applicantType: text(formData.applicantType) || "Individual",
      emptyWeight: text(formData.emptyWeight),
      carryingCapacity: text(formData.carryingCapacity),
      // The seller-lien keys ride along only when the lien is the seller's:
      // a lender-funded 130-U titling the car with the dealership as
      // lienholder was the audit's worst finding.
      ...(lien?.holder === "seller" ? sellerLien : {}),
      ...form130ULienKeys(lien),
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
      buyerPhone: facts.buyerPhone,
      buyerAddress: [facts.buyerAddress, facts.buyerCity, facts.buyerState, facts.buyerZip]
        .filter(Boolean)
        .join(", "),
      vehicleDescription: [facts.vehicleYear, facts.vehicleMake, facts.vehicleModel]
        .filter(Boolean)
        .join(" "),
      // The parts as well as the line: the state's rebuilt disclosure form
      // has a rule for the year and a rule for the make, not one for both.
      vehicleYear: facts.vehicleYear,
      vehicleMake: facts.vehicleMake,
      vehicleModel: facts.vehicleModel,
      vin: facts.vehicleVin,
      saleDate: today(),
      quotedRegistrationAmount: num(formData.quotedRegistrationAmount),
      language: sale.language === "es" ? "es" : "en",
      ...(documentType === "rebuiltDisclosure" ? { officialForm: "ENF-MV-RBLT-DSCLMR" } : {}),
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
      buyerPhone: facts.buyerPhone,
      buyerAddress: [facts.buyerAddress, facts.buyerCity, facts.buyerState, facts.buyerZip]
        .filter(Boolean)
        .join(", "),
      vehicleDescription: [facts.vehicleYear, facts.vehicleMake, facts.vehicleModel]
        .filter(Boolean)
        .join(" "),
      vehicleYear: facts.vehicleYear,
      vehicleMake: facts.vehicleMake,
      vehicleModel: facts.vehicleModel,
      vin: facts.vehicleVin,
      vehicleMileage: text(formData.odometerReading) || facts.vehicleMileage,
      odometerStatus: text(formData.odometerStatus) || text(bill.odometerStatus) || "actual",
      saleDate: today(),
      salePrice: price,
      tax,
      titleFee,
      docFee,
      total: Math.round((price + tax + titleFee + docFee) * 100) / 100,
      amountPaidToday: num(formData.paidToday),
      paymentMethod:
        funding === "lender" || funding === "inHouse"
          ? "Financing"
          : text(formData.paymentMethod) || text(bill.paymentMethod) || "Cash",
      // Answered on the salvage bill of sale, printed on the acknowledgment.
      howLeaving: text(formData.howLeaving) || text(bill.howLeaving),
      salvageLicense: dealership.salvageDealerLicense ?? "",
      titleOriginState: readTitleOrigin(sale.stepData).state ?? "",
      language: sale.language === "es" ? "es" : "en",
    };
  } else {
    // A type with no renderer. The render route's fallback shows the filed
    // answers as a clean summary sheet instead of failing.
    return null;
  }

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
