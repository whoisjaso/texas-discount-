import { describe, expect, it } from "vitest";
import { buildOwnerDocumentNotification } from "@/lib/notifications/owner";

describe("owner document notifications", () => {
  it("formats first-time signing alerts in the required order", () => {
    const message = buildOwnerDocumentNotification({
      agreementId: "agreement-1",
      customerName: "Wendy Johnson",
      vehicleDescription: "2019 Dodge Journey",
      signedAt: "2026-04-26T20:30:00.000Z",
      isRenewal: false,
    });

    expect(message).toContain(
      "Wendy Johnson has finished signing for the first time 2019 Dodge Journey.",
    );
    expect(message).toContain("Signed:");
  });

  it("formats renewal alerts from structured vehicle data", () => {
    const message = buildOwnerDocumentNotification({
      agreementId: "agreement-2",
      customerName: "Kevin Smith",
      vehicleDescription: null,
      signedAt: "2026-04-26T20:30:00.000Z",
      isRenewal: true,
      vehicle: { year: 2019, make: "Dodge", model: "Journey" },
    });

    expect(message).toContain(
      "Kevin Smith has finished renewing 2019 Dodge Journey.",
    );
  });
});
