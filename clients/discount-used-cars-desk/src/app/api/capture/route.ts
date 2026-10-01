import { after, NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyCaptureToken } from "@/lib/sales/capture-token";
import { applyExtraction, gapsOnly, hasUnreadFields, readBuyerId, writeBuyerId } from "@/lib/sales/buyer-id";
import { readLicenceImage } from "@/lib/sales/licence-ocr";
import type { IdFieldKey } from "@/lib/sales/buyer-id";
import { casMergeStepData } from "@/lib/sales/step-data-write";

/**
 * The phone posting a photograph of a licence.
 *
 * A route rather than a server action because the browser here has no session
 * and the bucket is private, so the upload has to happen on the server with the
 * token checked first. The client never touches Supabase.
 *
 * Nothing in the request names a deal. The deal comes out of the signed token,
 * so a caller cannot aim this at a record they were not handed a link for.
 */

export const runtime = "nodejs";

/** Matches the bucket's own limit, so a large file fails here with a sentence
 *  rather than at the storage layer with a stack trace. */
const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function extensionFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic" || mime === "image/heif") return "heic";
  return "jpg";
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the photo as form data." }, { status: 400 });
  }

  const token = form.get("token");
  const verified = verifyCaptureToken(typeof token === "string" ? token : null);
  if (!verified.ok) {
    return NextResponse.json(
      {
        error:
          verified.reason === "expired"
            ? "That link has expired. Ask the desk for a new one."
            : "That link is not valid.",
      },
      { status: verified.reason === "expired" ? 410 : 401 },
    );
  }

  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No photo was attached." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That photo is over 10MB. Take it again at a smaller size." },
      { status: 413 },
    );
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "That file is not a photo." },
      { status: 415 },
    );
  }

  const supabase = createServiceClient();

  // Named by deal and time. A licence must never be at a guessable path, but
  // the bucket is private and reached by signed URL, so the name is for
  // operators reading a file listing rather than for secrecy.
  const stamp = Date.now();
  const path = `${verified.dealId}/${stamp}.${extensionFor(file.type)}`;

  // Read once. The upload needs these bytes and so does the reader below, and
  // a File's stream does not survive being consumed twice.
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("buyer-ids")
    .upload(path, bytes, {
      contentType: file.type,
      // A retake replaces the previous photograph rather than accumulating
      // near-identical scans of somebody's identity.
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: "The photo did not save. Try again." },
      { status: 502 },
    );
  }

  /**
   * The back of the card.
   *
   * Optional in the same way and for the same reason as everything else after
   * the front: the front is what somebody at a desk is waiting on, and losing
   * a second image must never cost the first. A card whose barcode never read
   * sends none, because a photograph nobody framed is not evidence of
   * anything.
   */
  let backPath: string | null = null;
  const back = form.get("back");
  if (back instanceof File && back.size > 0 && back.size <= MAX_BYTES && ALLOWED.has(back.type)) {
    const at = `${verified.dealId}/${stamp}-back.${extensionFor(back.type)}`;
    const { error } = await supabase.storage
      .from("buyer-ids")
      .upload(at, await back.arrayBuffer(), { contentType: back.type, upsert: true });
    if (!error) backPath = at;
  }

  /**
   * The file an office scanner produced, when the licence came off a flatbed
   * rather than out of a camera.
   *
   * Kept as it arrived and stored next to the rasterised page above, not
   * instead of it. The PDF is the better artifact for a filing, and the raster
   * is the one a screen can show, so keeping both costs one small file and
   * saves converting either way later.
   *
   * Optional throughout. A phone never sends one, and a scanner upload whose
   * document fails to store still leaves a licence attached to the sale, which
   * is the part somebody is standing there waiting for.
   */
  let documentPath: string | null = null;
  let documentFailed = false;
  const scanned = form.get("document");
  if (scanned instanceof File && scanned.size > 0 && scanned.size <= MAX_BYTES) {
    if (scanned.type === "application/pdf") {
      const at = `${verified.dealId}/${stamp}.pdf`;
      const { error } = await supabase.storage
        .from("buyer-ids")
        .upload(at, await scanned.arrayBuffer(), {
          contentType: "application/pdf",
          upsert: true,
        });
      if (error) documentFailed = true;
      else documentPath = at;
    } else {
      documentFailed = true;
    }
  }

  // What the barcode said, if the phone managed to read one — parsed here,
  // applied inside the version-checked merge below.
  //
  // Routed through applyExtraction rather than written directly, which is the
  // whole safety property of this feature: extraction only ever fills `read`,
  // so a scan cannot overwrite a value a person already confirmed, and nothing
  // the phone sends can reach a document without someone at the desk looking
  // at it first. The phone is often in the customer's own hand.
  const barcodeFields: Partial<Record<IdFieldKey, string | null>> = {};
  const raw = form.get("fields");
  if (typeof raw === "string" && raw.length > 0 && raw.length < 4096) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const key of [
        "name",
        "licenseNumber",
        "dateOfBirth",
        "expires",
        "address",
      ] as const) {
        const value = parsed[key];
        if (typeof value === "string" && value.trim().length > 0) {
          barcodeFields[key] = value.trim();
        }
      }
    } catch {
      // A malformed body is not worth failing the upload over. The photograph
      // is the part that cannot be redone without the customer still standing
      // there; the fields can be typed.
    }
  }

  /** What the merge actually persisted, for the reader scheduling below. */
  let next = readBuyerId({});
  const buildNext = (current: Record<string, unknown>) => {
    const held = readBuyerId(current);
    let building = {
      ...held,
      image: path,
      // A retake that sent no back does not erase the back already on record.
      backImage: backPath ?? held.backImage,
      // A retake from a phone does not erase the scanner file on record.
      document: documentPath ?? held.document,
      capturedAt: new Date().toISOString(),
    };
    if (Object.keys(barcodeFields).length > 0) {
      building = {
        ...applyExtraction(building, barcodeFields),
        image: building.image,
        backImage: building.backImage,
        document: building.document,
        capturedAt: building.capturedAt,
      };
    }
    next = building;
    return building;
  };

  /**
   * The photograph goes on the sale now, before anything is read from it.
   *
   * This UPDATE is what the desk is subscribed to, so it is the moment the
   * operator's screen moves. Everything after it is an improvement to a record
   * that already exists.
   *
   * It used to come last, after the reader. That put the one thing the desk is
   * waiting for behind the one thing most likely to be slow or broken, and it
   * was both: measured at thirty two seconds, ending with the photograph never
   * reaching the sale at all because the reader could not start and nothing
   * downstream of it ran. The person at the desk saw a spinning phone and a
   * screen that never changed.
   *
   * Ordering it this way also means no reader failure can ever cost a
   * photograph again. The customer is standing there; the picture is the part
   * that cannot be retaken later.
   */
  const attached = await casMergeStepData(supabase, verified.dealId, (current) =>
    writeBuyerId(current, buildNext(current)),
  );

  if (!attached.ok) {
    return NextResponse.json({ error: "Could not attach the photo." }, { status: 502 });
  }

  /**
   * Then read the front, for the fields the barcode did not answer, and write
   * again with whatever it found.
   *
   * `after` runs this once the response is on its way, so the phone stops
   * saying "sending" as soon as the photograph is attached rather than when
   * the reader finishes. The desk is subscribed to the second write as well,
   * so the fields appear underneath the photograph as they are found, on the
   * same screen, without anybody pressing anything.
   *
   * The barcode is what the issuing authority encoded; the front is what a
   * camera made of ink, and it will confuse 0 with O on a card that has been
   * through a wash cycle. `gapsOnly` is what keeps the weaker reader from
   * competing with the stronger one: it fills empty fields and overwrites
   * nothing, so a good scan of the back is never downgraded to a guess about
   * the front.
   */
  /*
    Scheduling the reader must never cost the response.

    Everything this route promises has already happened by here: both files are
    in the bucket and the deal carries them. What follows is an improvement to a
    record that already exists, and `after` itself can throw when there is no
    request scope to hang it on. Letting that escape would turn a licence that
    did attach into a 502 the desk reports as a failure, which is the exact
    inversion the confirmation screen was built to stop.
  */
  if (hasUnreadFields(next)) {
    try {
      after(async () => {
        try {
          const fromFront = await readLicenceImage(Buffer.from(bytes));
          if (!fromFront) return;

          // The version-checked merge reads fresh at every attempt, so a
          // field the operator confirmed while the reader worked outranks
          // it — and a confirmation landing mid-write forces a re-read
          // instead of being replayed over. This delayed write racing the
          // desk was the review's named case (round 3, finding 10).
          await casMergeStepData(supabase, verified.dealId, (current) => {
            const held = readBuyerId(current);
            if (!held.image) return null; // Photo removed while we read.
            const filled = {
              ...applyExtraction(held, gapsOnly(held, fromFront)),
              image: held.image,
              backImage: held.backImage,
              document: held.document,
              capturedAt: held.capturedAt,
            };
            return writeBuyerId(current, filled);
          });
        } catch {
          // A reader that failed is the state this feature started in, not an
          // error. The photograph is already attached and the desk can type.
        }
      });
    } catch {
      // No request scope to schedule against. The licence is filed either way,
      // and the front is read again the next time somebody opens the step.
    }
  }

  /*
    Whether the scanner's own file was kept, when one was sent.

    Reported rather than swallowed. Somebody who chose the scanner over the
    phone did it partly to end up with that file on record, so silently
    keeping only the picture would give them the wrong idea about what the
    sale holds. Reported rather than thrown, too: the licence is attached and
    the fields are read, which is what the customer at the desk is waiting on.
  */
  return NextResponse.json({ ok: true, documentKept: documentFailed ? false : undefined });
}
