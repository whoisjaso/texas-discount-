"use server";

import { revalidatePath } from "next/cache";
import { mergeBuyerProfile, toE164 } from "@/lib/admin/buyer-profile";
import { readIdKind } from "@/lib/forms/id-document";
import { issueCaptureToken } from "@/lib/sales/capture-token";
import { splitAddress, type AamvaAddress } from "@/lib/sales/aamva";
import { languageConfirmationPatch } from "@/lib/sales/deal-language";
import { stampStart } from "@/lib/sales/elapsed";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import {
  gateTitleStatus,
  isTitleStatus,
  saleMayBegin,
  TITLE_STATUS_LABELS,
  type TitleStatus,
} from "@/lib/vehicles/title-status";
import { isSalvagePath, writeSalvagePlan } from "@/lib/sales/salvage-plan";
import { writeTitleOrigin } from "@/lib/vehicles/title-kinds";

/**
 * Start a sale.
 *
 * This is the one place a buyer is typed in. Everything downstream — bill of
 * sale, 130-U, buyer's guide, responsibility acknowledgment, power of attorney
 * — reads back off the deal record created here, so the ID number and phone
 * captured at the desk are never asked for a second time.
 *
 * The buyer's ID number and address live on the customer's `profile_data`
 * under the same `dealership.buyerProfile` shape the sale portal already
 * writes, so both paths fill the same fields rather than each inventing one.
 */

export type StartSaleInput = {
  /** Either an existing vehicle... */
  vehicleId?: string;
  /** ...or a VIN typed at the desk for a car not listed yet. */
  vin?: string;
  /**
   * Year, make and model for a VIN that is not in inventory yet.
   *
   * These come from the NHTSA lookup on the start screen, shown to the
   * operator in editable fields and corrected by them before submit. That is
   * the whole distinction: the server still guesses nothing, and anything
   * stored here was read by a person off a screen and left or changed. Absent
   * means absent; nothing is inferred from the VIN on this side.
   */
  vehicleYear?: number | null;
  vehicleMake?: string;
  vehicleModel?: string;
  /**
   * The three facts a VIN decode cannot supply, for a car typed in at the
   * desk. Colour and body style are on the 130-U, so a manually-entered
   * vehicle carries them from the start rather than arriving at title time
   * with holes. Sent only on the manual path, and only what was chosen.
   */
  vehicleExteriorColor?: string;
  vehicleInteriorColor?: string;
  vehicleBodyStyle?: string;
  /** Odometer reading taken at the sale, in miles. */
  mileage?: number | null;
  /** Co-buyer name, when there is one on the paperwork. */
  coBuyerName?: string;
  buyerName: string;
  buyerPhone: string;
  buyerIdNumber?: string;
  /**
   * The two letters on the card, from the intake screen's own picker.
   *
   * Collected there since the ID-type work and then dropped on the floor: it
   * never reached this action, so the bill of sale had to ask for it a second
   * time, one screen after somebody had already answered it. The barcode
   * cannot supply it either, because AAMVA has no issuing-state element.
   */
  buyerIdState?: string;
  /**
   * Licence, ID card, passport or military ID, from the same picker. The
   * 130-U ticks a different box for each and writes the issuing country
   * beside a passport's, so the kind has to reach the deal with the number.
   * When it is a passport, `buyerIdState` carries the country code.
   */
  buyerIdKind?: string;
  buyerEmail?: string;
  /**
   * The name in the four boxes the state forms print.
   *
   * `buyerName` above is the same name written out, for the customer row and
   * for display. These are what a 130-U or a power of attorney fills its
   * boxes from, so nothing downstream has to work out where the surname
   * begins. Absent on callers that only have a whole name, where the forms
   * fall back to splitting it.
   */
  buyerFirstName?: string;
  buyerMiddleName?: string;
  buyerLastName?: string;
  buyerSuffix?: string;
  buyerAddress?: string;
  /**
   * The address in the pieces the desk actually typed.
   *
   * Intake collects street, city, state and ZIP as four separate boxes, and
   * used to join them into one line that this action then re-parsed with a
   * guesser to get the same four values back. The round trip could only ever
   * lose information, never add any, so the parts travel directly and
   * `buyerAddress` stays for callers that only have a line.
   */
  buyerStreet?: string;
  buyerCity?: string;
  buyerState?: string;
  buyerZip?: string;
  /**
   * The county the buyer lives in. The 130-U has a box for it, and asking at
   * intake is the difference between one question now and a hunt through a
   * title application later.
   */
  buyerCounty?: string;
  /**
   * Whether somebody read the mailing address back to the buyer.
   *
   * The title is MAILED there, so this is not a formality: a typo produces a
   * title in a stranger's letterbox, not a wrong line on a form. Recorded as
   * evidence rather than assumed, the same way the sale's language is.
   */
  mailingConfirmed?: boolean;
  language?: "en" | "es";
  /**
   * What the title is, answered at the desk on every sale.
   *
   * For a VIN typed at the desk this is the acquisition moment and the
   * only place the fact can come from. For a listed vehicle the inventory
   * answer prefills the question, and the desk's answer is written back
   * when it differs: the person starting the sale is holding the title, and
   * the owner's rule is that the funnel asks. A car whose status was never
   * verified is asked instead of refused.
   */
  titleStatus?: string;
  /**
   * What happens with a salvage title, when the desk already knows. Sent
   * only with a salvage answer; the guide asks it first otherwise, and
   * "undecided" is a real answer that holds the documents.
   */
  salvagePath?: string;
  /**
   * The issuing state of an out-of-state title, two letters. Texas wants a
   * VIN inspection (VTR-68-A) before it titles such a car; recorded on the
   * sale so the title step says so, and left alone for a Texas title.
   */
  titleOriginState?: string;
  /**
   * When the person actually started working this sale.
   *
   * Reported by intake, because the moment — the pick-a-vehicle screen
   * opening — happens several minutes before this row exists. Passed through
   * `stampStart`, which refuses a future or a stale one: whatever it refuses
   * is stored as null and the sale is simply untimed rather than fast.
   */
  startedAt?: string;
};

export type StartSaleResult =
  | {
      success: true;
      dealId: string;
      customerId: string;
      /**
       * A short-lived token for attaching a licence to the sale that has just
       * been created.
       *
       * The desk can scan the card before the deal exists, which is the moment
       * the card is actually on the counter. The photographs are held in the
       * browser until there is something to attach them to, and this is that
       * something: the same signed token the customer's phone is handed, so
       * both paths post to one upload route instead of two.
       */
      captureToken: string;
    }
  | {
      success: false;
      error: string;
      existingDealId?: string;
      /**
       * Set when the refusal is the title gate, so the screen can point at
       * the inventory resolve route instead of showing a dead-end error.
       */
      titleBlock?: { vehicleId: string; status: TitleStatus; reason: "unverified" | "unsellable" };
    };

export async function startSale(
  input: StartSaleInput,
): Promise<StartSaleResult> {
  const gate = await requireAdminActionPermission("sales:manage");
  if (!gate.ok) return { success: false, error: gate.error };

  const buyerName = input.buyerName?.trim() ?? "";
  const buyerPhoneRaw = input.buyerPhone?.trim() ?? "";
  const buyerIdNumber = input.buyerIdNumber?.trim() ?? "";
  const buyerEmail = input.buyerEmail?.trim() ?? "";
  const buyerAddress = input.buyerAddress?.trim() ?? "";
  /**
   * Refused, not defaulted. The deal column has a DEFAULT 'en', which is a
   * schema fact and not an answer; the sale's conducted language decides
   * which disclosures the packet legally requires, so it is asked and the
   * record carries who answered it and when. The intake select is required,
   * so a person never sees this error — it exists for any other caller.
   */
  if (input.language !== "en" && input.language !== "es") {
    return { success: false, error: "Choose the language the sale is conducted in." };
  }
  const language: "en" | "es" = input.language;

  const typedVin = input.vin?.trim().toUpperCase() ?? "";
  if (!input.vehicleId && !typedVin) {
    return { success: false, error: "Choose the vehicle being sold." };
  }
  if (!buyerName) {
    return { success: false, error: "The buyer's name is required." };
  }
  if (buyerPhoneRaw.replace(/\D/g, "").length < 10) {
    return { success: false, error: "Enter the buyer's phone number." };
  }

  const buyerPhone = toE164(buyerPhoneRaw);

  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Unauthorized" };
    }

    // The car is settled before anything is written. A title-blocked sale
    // that had already created or updated a customer would leave half an
    // intake behind every time the gate refuses.
    const vehicle = await resolveVehicle(supabase, {
      vehicleId: input.vehicleId,
      vin: typedVin,
      mileage: input.mileage ?? null,
      year: input.vehicleYear ?? null,
      make: input.vehicleMake?.trim() || undefined,
      model: input.vehicleModel?.trim() || undefined,
      exteriorColor: input.vehicleExteriorColor?.trim() || undefined,
      interiorColor: input.vehicleInteriorColor?.trim() || undefined,
      bodyStyle: input.vehicleBodyStyle?.trim() || undefined,
      titleStatus: input.titleStatus,
      verifiedBy: user.id,
    });
    if (!vehicle.ok) {
      return { success: false, error: vehicle.error };
    }
    const vehicleId = vehicle.id;

    /**
     * The title gate. An unverified title is not a detail to sort out later:
     * a rebuilt vehicle owes the buyer a written disclosure BEFORE any sale
     * document exists, and a salvage or nonrepairable vehicle cannot be
     * retailed at all. Refused here, named, with the resolve route attached.
     */
    const titleGate = gateTitleStatus(vehicle.titleStatus);
    const beginning = saleMayBegin(vehicle.titleStatus);
    if (!beginning.ok) {
      /*
        Refused only for a title no sale can begin on. A salvage title is
        not one of those any more: the sale begins on the rebuild-first path
        and the guide holds the documents until the title is rebuilt in our
        name. An unverified title is asked at the desk, so it reaches here
        only from a caller that skipped the question.
      */
      return {
        success: false,
        error:
          beginning.reason === "unverified"
            ? "Say what the title is first. The desk asks on the car's screen."
            : `This vehicle cannot be sold: ${TITLE_STATUS_LABELS[beginning.status]}.`,
        titleBlock: { vehicleId, status: titleGate.status, reason: beginning.reason },
      };
    }

    const { data: existing, error: lookupError } = await supabase
      .from("customers")
      .select("id, name, email, language, profile_data")
      .eq("phone", buyerPhone)
      .maybeSingle();

    if (lookupError) {
      return {
        success: false,
        error: `Could not look the buyer up: ${lookupError.message}`,
      };
    }

    // Only the fields the desk actually captured are written, so starting a
    // second sale for a returning buyer never blanks details we already hold.
    const capturedProfile: Record<string, unknown> = {};
    if (buyerIdNumber) capturedProfile.buyerLicense = buyerIdNumber;
    const buyerIdState = input.buyerIdState?.trim().toUpperCase() ?? "";
    if (buyerIdState) capturedProfile.buyerLicenseState = buyerIdState;
    if (buyerIdNumber) capturedProfile.buyerIdKind = readIdKind(input.buyerIdKind);
    if (input.coBuyerName?.trim()) {
      capturedProfile.coBuyerName = input.coBuyerName.trim();
    }
    if (buyerAddress) capturedProfile.buyerAddress = buyerAddress;
    if (input.buyerCounty?.trim()) capturedProfile.buyerCounty = input.buyerCounty.trim();
    if (buyerEmail) capturedProfile.buyerEmail = buyerEmail;
    capturedProfile.buyerName = buyerName;
    capturedProfile.buyerPhone = buyerPhone;

    let customerId: string;

    if (existing?.id) {
      customerId = existing.id;
      /**
       * The sale's language is the sale's, not the customer's.
       *
       * This update used to copy the deal's language onto the customer row,
       * silently rewriting how every future reminder and text addresses a
       * returning buyer because one deal was conducted in the other language.
       * A returning customer's communications preference is theirs; a NEW
       * customer (below) gets the sale's language as an initial value only,
       * because a fresh row has no preference to protect and the schema's
       * own default is not an observation about this person either.
       */
      const { error: updateError } = await supabase
        .from("customers")
        .update({
          name: buyerName,
          email: buyerEmail || existing.email || null,
          profile_data: mergeBuyerProfile(
            existing.profile_data,
            capturedProfile,
          ),
        })
        .eq("id", existing.id);

      if (updateError) {
        return {
          success: false,
          error: `Could not update the buyer: ${updateError.message}`,
        };
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("customers")
        .insert({
          name: buyerName,
          phone: buyerPhone,
          email: buyerEmail || null,
          language,
          profile_data: { dealership: { buyerProfile: capturedProfile } },
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        return {
          success: false,
          error: `Could not create the buyer: ${insertError?.message ?? "No customer returned."}`,
        };
      }
      customerId = inserted.id as string;
    }

    /**
     * What intake already collected, handed to the licence step.
     *
     * These went into `capturedProfile` and stopped there, which is a
     * customer record rather than a deal record, and nothing bridged the two.
     * So the intake screen took an address and a licence number, and one
     * screen later the licence step asked for the same address again from an
     * empty box. Typing a customer's address twice in ninety seconds is the
     * kind of friction that makes somebody stop using the flow.
     *
     * Seeded as values, not as confirmations. `mailingConfirmed` stays false
     * and the reader's fields stay unconfirmed, because a pre-filled box
     * nobody has read is exactly what this record is built to distinguish from
     * a checked one. The saving is the retyping, and the check survives.
     */
    const seededBuyerId = (() => {
      const seeded: Record<string, unknown> = {};
      if (buyerAddress) {
        /*
          The typed parts win. Splitting a joined line is a guess, and this
          screen already knows the answer: it rendered four boxes and a person
          filled them in. The split remains only for a caller that supplies a
          line and nothing else.
        */
        const parsed = splitAddress(buyerAddress);
        const part = (value: string | undefined) => value?.trim() || null;
        const mailing: AamvaAddress = {
          street: part(input.buyerStreet) ?? parsed.street,
          city: part(input.buyerCity) ?? parsed.city,
          state: part(input.buyerState)?.toUpperCase() ?? parsed.state,
          postal: part(input.buyerZip) ?? parsed.postal,
          // The county rides with the address it belongs to, so the 130-U
          // reads one record rather than two half-answers.
          county: part(input.buyerCounty),
        };
        seeded.mailing = mailing;
      }
      // Seeded as a confirmation only when a person actually gave one. An
      // address nobody read back stays unconfirmed, which is exactly the
      // distinction the licence step is built to surface.
      if (input.mailingConfirmed && buyerAddress) {
        seeded.mailingConfirmed = true;
        seeded.mailingConfirmedAt = new Date().toISOString();
      }
      /*
        The name boxes, stored as typed. Written whenever any box was filled,
        so a deal either has real parts or has none, never a mixture of typed
        and inferred that nothing downstream can tell apart.
      */
      const nameParts = {
        first: input.buyerFirstName?.trim() || null,
        middle: input.buyerMiddleName?.trim() || null,
        last: input.buyerLastName?.trim() || null,
        suffix: input.buyerSuffix?.trim() || null,
      };
      if (Object.values(nameParts).some(Boolean)) seeded.nameParts = nameParts;

      if (buyerIdNumber) seeded.licenseNumber = { read: null, confirmed: buyerIdNumber };
      // The name was typed on the intake screen by a person looking at the
      // card, so it is confirmed rather than proposed.
      if (buyerName) seeded.name = { read: null, confirmed: buyerName };
      return Object.keys(seeded).length > 0 ? { buyerId: seeded } : {};
    })();

    /*
      The title's two extra facts, when the desk gave them.

      The salvage path is written only on a salvage car, so a stale answer
      cannot ride onto a clean one; the issuing state only when it is not
      Texas. Both are the sale's, not the vehicle's: the same car sold
      twice could go two ways.
    */
    let stepData: Record<string, unknown> = {
      ...seededBuyerId,
      ...languageConfirmationPatch(language, user.id),
    };
    if (vehicle.titleStatus === "salvage_unrebuilt" && isSalvagePath(input.salvagePath)) {
      stepData = writeSalvagePlan(stepData, {
        path: input.salvagePath,
        decidedAt: new Date().toISOString(),
      });
    }
    const origin = input.titleOriginState?.trim().toUpperCase() ?? "";
    if (/^[A-Z]{2}$/.test(origin) && origin !== "TX") {
      stepData = writeTitleOrigin(stepData, { state: origin });
    }

    const { data: deal, error: dealError } = await supabase
      .from("deals")
      .insert({
        vehicle_id: vehicleId,
        customer_id: customerId,
        created_by: user.id,
        language,
        // Not created_at. The row is written here, at the end of intake; the
        // work began at the pick-a-vehicle screen and this is that moment,
        // checked. Null when it could not be believed — untimed, not instant.
        started_at: stampStart(input.startedAt, Date.now()),
        // The answer's evidence rides with the deal: who confirmed the
        // sale's language and when. The documents gate on this, not on the
        // column's schema default.
        step_data: stepData,
      })
      .select("id")
      .single();

    if (dealError || !deal) {
      // A partial unique index keeps one open deal per vehicle. Point at the
      // sale that already exists rather than telling the operator "failed".
      if (dealError?.code === "23505") {
        const { data: open } = await supabase
          .from("deals")
          .select("id")
          .eq("vehicle_id", vehicleId)
          .eq("status", "in_progress")
          .maybeSingle();

        return {
          success: false,
          error: "This vehicle already has a sale open.",
          existingDealId: (open?.id as string | undefined) ?? undefined,
        };
      }

      return {
        success: false,
        error: `Could not start the sale: ${dealError?.message ?? "No deal returned."}`,
      };
    }

    revalidatePath("/admin/sales");
    revalidatePath("/admin/dealership/dashboard");

    const dealId = deal.id as string;
    return {
      success: true,
      dealId,
      customerId,
      captureToken: issueCaptureToken(dealId),
    };
  } catch (error) {
    console.error("startSale exception:", error);
    return { success: false, error: "Unexpected error while starting the sale." };
  }
}

type VehicleResolution =
  | { ok: true; id: string; titleStatus: TitleStatus }
  | { ok: false; error: string };

/**
 * Turn whatever the vehicle step produced into a vehicle row.
 *
 * A VIN typed at the desk means the car is ours but was never listed. It is
 * created here as Pending, a car under contract, and marked Sold when the
 * sale closes, so it ends up in inventory with a buyer against it either
 * way, and on Past Sales, rather than the sale hanging off a vehicle that
 * does not exist.
 */
async function resolveVehicle(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  input: {
    vehicleId?: string;
    vin: string;
    mileage: number | null;
    year?: number | null;
    make?: string;
    model?: string;
    exteriorColor?: string;
    interiorColor?: string;
    bodyStyle?: string;
    titleStatus?: string;
    verifiedBy: string;
  },
): Promise<VehicleResolution> {
  const mileageUpdate =
    input.mileage != null && Number.isFinite(input.mileage)
      ? { mileage: Math.round(input.mileage) }
      : null;

  const readStatus = (raw: unknown): TitleStatus =>
    isTitleStatus(raw) ? raw : "unknown";

  if (input.vehicleId) {
    // The title fact is read with the row, then compared with what the desk
    // answered. The desk's answer wins when it is a real status and differs,
    // and the row records who said so and when, the same as any other
    // verification. "unknown" is not an answer here either.
    const { data: row, error: readError } = await supabase
      .from("vehicles")
      .select("id, title_status")
      .eq("id", input.vehicleId)
      .maybeSingle();
    if (readError) {
      return { ok: false, error: `Could not read the vehicle: ${readError.message}` };
    }
    if (!row) {
      return { ok: false, error: "That vehicle no longer exists." };
    }
    const onRow = readStatus(row.title_status);
    const answered: TitleStatus | null =
      isTitleStatus(input.titleStatus) && input.titleStatus !== "unknown" ? input.titleStatus : null;
    const titleUpdate =
      answered && answered !== onRow
        ? {
            title_status: answered,
            title_status_verified_at: new Date().toISOString(),
            title_status_verified_by: input.verifiedBy,
            title_status_evidence: "Verified at the desk when the sale started",
          }
        : null;
    // The odometer moves between listing and sale; record what was read today.
    if (mileageUpdate || titleUpdate) {
      const { error } = await supabase
        .from("vehicles")
        .update({ ...(mileageUpdate ?? {}), ...(titleUpdate ?? {}) })
        .eq("id", input.vehicleId);
      if (error) {
        return { ok: false, error: `Could not update the vehicle: ${error.message}` };
      }
    }
    return { ok: true, id: input.vehicleId, titleStatus: answered ?? onRow };
  }

  const { data: existing, error: lookupError } = await supabase
    .from("vehicles")
    .select("id, title_status")
    .eq("vin", input.vin)
    .maybeSingle();

  if (lookupError) {
    return { ok: false, error: `Could not look the VIN up: ${lookupError.message}` };
  }

  if (existing?.id) {
    if (mileageUpdate) {
      await supabase.from("vehicles").update(mileageUpdate).eq("id", existing.id);
    }
    return {
      ok: true,
      id: existing.id as string,
      titleStatus: readStatus(existing.title_status),
    };
  }

  // A VIN typed at the desk is the acquisition moment for a car nobody
  // listed, so the title question is answered right here or not at all.
  // 'unknown' is refused as an answer: the point of the gate is that no
  // vehicle enters a sale unverified, and this is the one path where the
  // person creating the record is holding the car's paperwork.
  if (!isTitleStatus(input.titleStatus) || input.titleStatus === "unknown") {
    return {
      ok: false,
      error: "Say what the title is for this vehicle: clean, rebuilt salvage, or bonded.",
    };
  }
  const newTitleStatus: TitleStatus = input.titleStatus;

  // Nothing is invented here. Year, make and model are written only when the
  // caller passes them, and the only caller that does is the start screen,
  // where they were decoded from the VIN, shown to the operator in editable
  // fields, and submitted by them. A blank stays blank rather than being
  // guessed from the VIN on this side.
  const slug = `vin-${input.vin.slice(-8).toLowerCase()}-${input.vin.slice(0, 3).toLowerCase()}`;
  const { data: created, error: insertError } = await supabase
    .from("vehicles")
    .insert({
      vin: input.vin,
      /*
        Pending, not Available. A car typed in at the desk is being sold
        this minute; it was never on the lot to browse. Inserting it as
        Available put an unpriced, unphotographed listing on the public
        inventory page for as long as the sale took, and the desk summary
        counted it as a car for sale. Pending is the status the automation
        already gives a car under contract, and the completion writes Sold
        over it, which is what makes it a past sale.
      */
      status: "Pending",
      price: 0,
      mileage: mileageUpdate?.mileage ?? 0,
      slug,
      gallery: [],
      title_status: newTitleStatus,
      title_status_verified_at: new Date().toISOString(),
      title_status_verified_by: input.verifiedBy,
      title_status_evidence: "Verified at the desk when the VIN was typed in",
      ...(input.year != null ? { year: input.year } : {}),
      ...(input.make ? { make: input.make } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.exteriorColor ? { exterior_color: input.exteriorColor } : {}),
      ...(input.interiorColor ? { interior_color: input.interiorColor } : {}),
      ...(input.bodyStyle ? { body_style: input.bodyStyle } : {}),
    })
    .select("id")
    .single();

  if (insertError || !created) {
    return {
      ok: false,
      error: `Could not add this vehicle to inventory: ${insertError?.message ?? "no row returned"}`,
    };
  }

  return { ok: true, id: created.id as string, titleStatus: newTitleStatus };
}
