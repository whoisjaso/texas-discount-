import type { DocumentMap, FactKey } from "@/lib/documents/field-maps/types";
import { BILL_OF_SALE_MAP } from "@/lib/documents/field-maps/bill-of-sale";
import { SALVAGE_BILL_OF_SALE_MAP } from "@/lib/documents/field-maps/salvage-bill-of-sale";
import { FORM_130U_MAP } from "@/lib/documents/field-maps/form-130u";
import { FINANCING_MAP } from "@/lib/documents/field-maps/financing";
import { BUYERS_GUIDE_MAP } from "@/lib/documents/field-maps/buyers-guide";
import { VEHICLE_RESPONSIBILITY_MAP } from "@/lib/documents/field-maps/vehicle-responsibility";
import { INSURANCE_ACKNOWLEDGMENT_MAP } from "@/lib/documents/field-maps/insurance-acknowledgment";
import { REBUILT_DISCLOSURE_MAP } from "@/lib/documents/field-maps/rebuilt-disclosure";
import { POWER_OF_ATTORNEY_MAP } from "@/lib/documents/field-maps/power-of-attorney";
import { TOW_AWAY_ACKNOWLEDGMENT_MAP } from "@/lib/documents/field-maps/tow-away-acknowledgment";
import { BUYER_RESPONSIBILITY_STATEMENT_MAP } from "@/lib/documents/field-maps/buyer-responsibility-statement";
import { VTR_61_MAP } from "@/lib/documents/field-maps/vtr-61";
import { RENTAL_MAP } from "@/lib/documents/field-maps/rental";

/** Every document the desk prints, as its pages. */
export const FIELD_MAPS: DocumentMap[] = [
  REBUILT_DISCLOSURE_MAP,
  BILL_OF_SALE_MAP,
  SALVAGE_BILL_OF_SALE_MAP,
  FORM_130U_MAP,
  FINANCING_MAP,
  BUYERS_GUIDE_MAP,
  VEHICLE_RESPONSIBILITY_MAP,
  INSURANCE_ACKNOWLEDGMENT_MAP,
  POWER_OF_ATTORNEY_MAP,
  TOW_AWAY_ACKNOWLEDGMENT_MAP,
  BUYER_RESPONSIBILITY_STATEMENT_MAP,
  VTR_61_MAP,
  RENTAL_MAP,
];

export function fieldMapFor(documentType: string): DocumentMap | undefined {
  return FIELD_MAPS.find((map) => map.documentType === documentType);
}

/** The order a document's corridor asks the facts it owns. */
export function askOrderFor(documentType: string): FactKey[] {
  return fieldMapFor(documentType)?.askOrder ?? [];
}

export * from "@/lib/documents/field-maps/types";
