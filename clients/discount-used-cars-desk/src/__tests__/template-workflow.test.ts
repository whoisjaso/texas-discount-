import { describe, expect, it } from "vitest";
import { calculateBillOfSale } from "@/lib/documents/billOfSale";
import {
  TEMPLATE_DEFINITIONS,
  getTemplateSteps,
  initialTemplateValues,
  templatePdfUrl,
  toBillOfSaleData,
  toForm130UData,
  toForm130URequest,
  toPowerOfAttorneyData,
  toSalvageSaleData,
  toVehicleResponsibilityData,
  validateTemplateStep,
  type TemplateId,
  type TemplateValues,
} from "@/lib/documents/template-workflow";

const vehicle = { vehicleVin: "1HGCM82633A004352", vehicleYear: "2003", vehicleMake: "Honda", vehicleModel: "Accord" };
const buyer = { buyerName: "Alex Buyer", buyerIdNumber: "12345678", buyerAddress: "123 Main St", buyerCity: "Houston", buyerState: "tx", buyerZip: "77001" };
function step(id: TemplateId, stepId: string, values: TemplateValues = {}) {
  const found = getTemplateSteps(id, values).find((item) => item.id === stepId);
  if (!found) throw new Error(`Missing ${stepId}`);
  return found;
}

describe("standalone template workflow", () => {
  it("omits purchase questions and stale purchase values for standalone title work", () => {
    const values = { isPurchase: "no", hasTradeIn: "yes", salesPrice: "19000", tradeInAllowance: "500", tradeInVin: vehicle.vehicleVin, saleDate: "2026-09-08" };
    const steps = getTemplateSteps("form-130u", values).map(item => item.id);
    expect(steps).not.toContain("price");
    expect(steps).not.toContain("trade-choice");
    expect(steps).not.toContain("trade");
    const request = toForm130URequest(values);
    expect(request.is_purchase).toBe(false);
    expect(request.sale_price).toBe(0);
    expect(request.trade_in_amount).toBe(0);
    expect(request.trade_in_vin).toBe("");
    expect(request.sale_date).toBe("");
  });

  it("leaves the alternate vehicle-address box blank when mailing address was chosen", () => {
    const request = toForm130URequest({ vehicleLocationSameAsMailing: "yes", mailingAddress: "123 Main St", vehicleLocationAddress: "Old address" });
    expect(request.vehicle_location_address).toBe("");
    expect(request.vehicle_location_city).toBe("");
  });
  it("offers every existing template without creating buyer or transaction defaults", () => {
    expect(TEMPLATE_DEFINITIONS).toHaveLength(10);
    for (const { id } of TEMPLATE_DEFINITIONS) {
      const values = initialTemplateValues(id);
      expect(values.vehicleVin).toBe("");
      expect(values.vehicleYear).toBe("");
      expect(values.buyerName || values.grantorName || values.applicantFirstName || "").toBe("");
      expect(values.salePrice || "").toBe("");
      expect(values.odometerStatus || "").toBe("");
      expect(values.paymentMethod || "").toBe("");
      expect(new Set(getTemplateSteps(id, values).map((item) => item.id)).size).toBe(getTemplateSteps(id, values).length);
      expect(getTemplateSteps(id, values).every((item) => item.fields.length > 0 && item.fields.length <= 4)).toBe(true);
    }
  });

  it("shows only applicable questions and excludes salvage money from tow and responsibility sheets", () => {
    const empty = getTemplateSteps("bill-of-sale", {}).map((item) => item.id);
    expect(empty).not.toContain("co-buyer");
    expect(empty).not.toContain("warranty");
    expect(empty).not.toContain("seller-lien");
    const selected = getTemplateSteps("bill-of-sale", { hasCoBuyer: "yes", hasTradeIn: "yes", sellerLienEnabled: "yes", conditionType: "warranty" }).map((item) => item.id);
    expect(selected).toEqual(expect.arrayContaining(["co-buyer", "trade", "warranty", "seller-lien"]));
    for (const id of ["tow-away-acknowledgment", "buyer-responsibility-statement"] as const) {
      const keys = getTemplateSteps(id, {}).flatMap((item) => item.fields.map((itemField) => itemField.key));
      expect(keys).not.toContain("salePrice");
      expect(keys).not.toContain("paymentMethod");
      expect(keys.includes("howLeaving")).toBe(id === "tow-away-acknowledgment");
    }
  });

  it("drops hidden trade, co-buyer, warranty, fee and lien answers from the document after a decision changes", () => {
    const data = toBillOfSaleData({ ...vehicle, ...buyer, hasCoBuyer: "no", coBuyerName: "Stale Name", coBuyerLicense: "98765432", hasTradeIn: "no", tradeInAllowance: "2000", tradeInVin: vehicle.vehicleVin, hasOtherFees: "no", otherFees: "90", otherFeesDescription: "Old fee", sellerLienEnabled: "no", sellerLienAmount: "500", sellerLienReason: "Old reason", conditionType: "as_is", warrantyDescription: "Old coverage", paymentMethod: "Cash", paymentMethodOther: "Old method", salePrice: "10000", tax: "625", titleFee: "33", docFee: "292", registrationFee: "75" });
    expect(data.coBuyerName).toBe("");
    expect(data.coBuyerLicense).toBe("");
    expect(data.tradeInAllowance).toBe(0);
    expect(data.tradeInVin).toBe("");
    expect(data.otherFees).toBe(0);
    expect(data.otherFeesDescription).toBe("");
    expect(data.sellerLienEnabled).toBe(false);
    expect(data.sellerLienAmount).toBe(0);
    expect(data.sellerLienReason).toBe("");
    expect(data.warrantyDescription).toBe("");
    expect(data.paymentMethodOther).toBe("");
    expect(calculateBillOfSale(data).totalDue).toBe(11025);
  });

  it("requires actual values, validates VIN/money/dates and accepts explicitly quoted zero", () => {
    const registration = step("vehicle-responsibility", "registration");
    expect(validateTemplateStep(registration, { saleDate: "2026-09-08" })).toHaveProperty("quotedRegistrationAmount");
    expect(validateTemplateStep(registration, { saleDate: "2026-09-08", quotedRegistrationAmount: "0" })).toEqual({});
    expect(validateTemplateStep(registration, { saleDate: "2026-02-30", quotedRegistrationAmount: "-2" })).toEqual(expect.objectContaining({ saleDate: expect.any(String), quotedRegistrationAmount: expect.any(String) }));
    expect(validateTemplateStep(registration, { saleDate: "2026-09-08", quotedRegistrationAmount: "Infinity" })).toHaveProperty("quotedRegistrationAmount");
    expect(validateTemplateStep(step("bill-of-sale", "vehicle"), vehicle)).toEqual({});
    expect(validateTemplateStep(step("bill-of-sale", "vehicle"), { ...vehicle, vehicleVin: "1HGCMI2633A004352" })).toHaveProperty("vehicleVin");
    expect(validateTemplateStep(step("bill-of-sale", "vehicle"), { ...vehicle, vehicleYear: "1970", vehicleVin: "0F02F123456" })).toEqual({});
  });

  it("requires the supported guide and POA applicability choices", () => {
    expect(validateTemplateStep(step("buyers-guide", "guide-condition"), { guideAsIsConfirmed: "no" })).toHaveProperty("guideAsIsConfirmed");
    expect(validateTemplateStep(step("buyers-guide", "guide-condition"), { guideAsIsConfirmed: "yes" })).toEqual({});
    expect(validateTemplateStep(step("power-of-attorney", "poa-eligibility"), { poaEligibilityConfirmed: "no" })).toHaveProperty("poaEligibilityConfirmed");
  });

  it("does not ask an entity for personal ID details or retain old individual names", () => {
    const values = { ...vehicle, applicantType: "Trust", applicantEntityName: "Buyer Family Trust", applicantIdNumber: "12-3456789", applicantIdType: "stateLicence", applicantIdState: "TX", applicantFirstName: "Old", applicantLastName: "Person", hasCoApplicant: "no", coApplicantName: "Old Co-Applicant", hasLien: "no", lienholderName: "Old Bank", hasTradeIn: "no", tradeInVin: vehicle.vehicleVin, vehicleLocationSameAsMailing: "yes", mailingAddress: "100 Main", mailingCity: "Houston", mailingState: "tx", mailingZip: "77001", countyOfResidence: "Harris", vehicleLocationAddress: "Old Place" };
    const active = getTemplateSteps("form-130u", values).map((item) => item.id);
    expect(active).toContain("applicant-entity");
    expect(active).not.toContain("applicant-name");
    expect(active).not.toContain("applicant-id");
    expect(active).not.toContain("applicant-id-issuer");
    expect(active).not.toContain("vehicle-location");
    const data = toForm130UData(values);
    expect(data.applicantFirstName).toBe("");
    expect(data.applicantLastName).toBe("");
    expect(data.applicantIdType).toBe("");
    expect(data.applicantIdState).toBe("");
    expect(data.coApplicantName).toBe("");
    expect(data.lienholderName).toBe("");
    expect(data.tradeInVin).toBe("");
    expect(data.vehicleLocationAddress).toBe("100 Main");
    expect(data.vehicleLocationState).toBe("TX");
  });

  it("preserves official form distinctions and full separate vehicle location in the PDF request", () => {
    const values = { ...vehicle, applicationType: "nontitle", applicantType: "Non-Profit", applicantEntityName: "Community Cars", applicantIdNumber: "12-3456789", odometerStatus: "not_actual", hasTradeIn: "yes", tradeInVin: vehicle.vehicleVin.toLowerCase(), tradeInAllowance: "123.45", previousOwnerName: "Prior Owner", previousOwnerCity: "Austin", previousOwnerState: "tx", vehicleLocationSameAsMailing: "no", vehicleLocationAddress: "45 Depot Rd", vehicleLocationCity: "Katy", vehicleLocationState: "tx", vehicleLocationZip: "77449" };
    const request = toForm130URequest(values);
    expect(request.applying_for).toBe("nontitle");
    expect(request.applicant_type).toBe("non_profit");
    expect(request.buyer_entity_name).toBe("Community Cars");
    expect(request.buyer_first_name).toBe("");
    expect(request.buyer_id_kind).toBeUndefined();
    expect(request.odometer_brand).toBe("N");
    expect(request.trade_in_vin).toBe(vehicle.vehicleVin);
    expect(request.trade_in_amount).toBe(123.45);
    expect(request.previous_owner_name).toBe("Prior Owner");
    expect(request.previous_owner_state).toBe("TX");
    expect(request.vehicle_location_address).toBe("45 Depot Rd");
    expect(request.vehicle_location_city).toBe("Katy");
    expect(request.vehicle_location_state).toBe("TX");
    expect(request.vehicle_location_zip).toBe("77449");
  });

  it("uses supported ID enum values and drops irrelevant military issuer", () => {
    const options = step("form-130u", "applicant-id", { applicantType: "Individual" }).fields.find((item) => item.key === "applicantIdType")?.options;
    expect(options?.map((item) => item.value)).toEqual(["stateLicence", "stateIdCard", "passport", "militaryId"]);
    expect(toForm130URequest({ applicantType: "Individual", applicantIdType: "passport" }).buyer_id_kind).toBe("passport");
    expect(toForm130UData({ applicantType: "Individual", applicantIdType: "militaryId", applicantIdState: "TX" }).applicantIdState).toBe("");
  });

  it("keeps POA city/county/state/ZIP separate and never sends source record IDs", () => {
    const values = { ...vehicle, grantorName: "A & B Trust", grantorAddress: "12 Main", grantorCity: "Houston", grantorCounty: "Harris", grantorState: "tx", grantorZip: "77001", titleDocumentNumber: "1234", dealId: "must-not-send", customerId: "must-not-send" };
    const data = toPowerOfAttorneyData(values);
    expect(data.grantorCounty).toBe("Harris");
    expect(data.grantorCity).toBe("Houston");
    expect(data.grantorState).toBe("TX");
    expect(data.executedDate).toBe("");
    const url = new URL(templatePdfUrl("power-of-attorney", values)!, "https://example.test");
    expect(url.searchParams.get("grantorCityName")).toBe("Houston");
    expect(url.searchParams.get("grantorCounty")).toBe("Harris");
    expect(url.searchParams.get("grantorState")).toBe("TX");
    expect(url.searchParams.get("grantorZip")).toBe("77001");
    expect(url.searchParams.get("grantorName")).toBe("A & B Trust");
    expect(url.searchParams.has("dealId")).toBe(false);
    expect(url.searchParams.has("customerId")).toBe(false);
  });

  it("calculates salvage totals from entered figures and respects other payment text", () => {
    const data = toSalvageSaleData({ ...vehicle, ...buyer, salePrice: "1250.50", tax: "78.16", titleFee: "33", docFee: "100", amountPaidToday: "500", paymentMethod: "Other", paymentMethodOther: "Bank transfer", howLeaving: "flatbed", titleOriginState: "la" });
    expect(data.total).toBe(1461.66);
    expect(data.amountPaidToday).toBe(500);
    expect(data.paymentMethod).toBe("Bank transfer");
    expect(data.howLeaving).toBe("flatbed");
    expect(data.titleOriginState).toBe("LA");
    expect(data.buyerAddress).toBe("123 Main St, Houston, TX 77001");
    expect(data.vehicleDescription).toBe("2003 Honda Accord");
  });

  it("keeps registration quote unsigned and independent of a sale", () => {
    const data = toVehicleResponsibilityData({ ...vehicle, ...buyer, quotedRegistrationAmount: "175.25", saleDate: "2026-09-08", dealId: "not-a-sale" });
    expect(data.dealId).toBeNull();
    expect(data.buyerSignatureDataUrl).toBe("");
    expect(data.quotedRegistrationAmount).toBe(175.25);
    expect(data.saleDate).toBe("2026-09-08");
  });

  it("builds Spanish guide requests without carrying buyer PII", () => {
    const url = new URL(templatePdfUrl("buyers-guide", { ...vehicle, ...buyer, guideContact: "Sales Office" }, "es")!, "https://example.test");
    expect(url.searchParams.get("lang")).toBe("es");
    expect(url.searchParams.get("vin")).toBe(vehicle.vehicleVin);
    expect(url.searchParams.get("contact")).toBe("Sales Office");
    expect(url.searchParams.has("buyerName")).toBe(false);
  });
});
