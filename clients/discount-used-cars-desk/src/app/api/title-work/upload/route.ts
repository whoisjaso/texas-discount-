import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isTitlePathStepKey } from "@/lib/vehicles/title-path";
import {
  STEP_FILE_KINDS,
  isTitleWorkFileKind,
  readFiles,
  type TitleWorkFile,
} from "@/lib/vehicles/title-work-evidence";
import { TITLE_WORK_BUCKET } from "@/lib/vehicles/title-work-load";

/**
 * A file that proves a step of the title work.
 *
 * POST multipart: vehicleId, step, kind, file. The bucket is private and
 * the browser never touches storage; the upload runs here after the
 * inventory permission check, and the row for the step grows one entry in
 * its `files` list. Ten megabytes for a photo, twenty for a scanned PDF,
 * which is what the bucket allows.
 */

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"]);

function extensionFor(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic" || mime === "image/heif") return "heic";
  return "jpg";
}

export async function POST(req: NextRequest) {
  const authError = await requireAdmin(req, "inventory:manage");
  if (authError) return authError;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the file as form data." }, { status: 400 });
  }

  const vehicleId = String(form.get("vehicleId") ?? "").trim();
  const step = String(form.get("step") ?? "").trim();
  const kind = String(form.get("kind") ?? "").trim();
  const file = form.get("file");

  // A UUID in production; the preview's mock ids are plain words. Either
  // way only path-safe characters, because the id becomes a folder name.
  if (!/^[A-Za-z0-9-]{1,64}$/.test(vehicleId)) return NextResponse.json({ error: "No vehicle named." }, { status: 400 });
  if (!isTitlePathStepKey(step)) return NextResponse.json({ error: "That is not a step on the path." }, { status: 400 });
  if (!isTitleWorkFileKind(kind) || !(STEP_FILE_KINDS[step] ?? []).includes(kind)) {
    return NextResponse.json({ error: "That step does not take that kind of file." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "No file was attached." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is over 20MB." }, { status: 413 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Send a photo or a PDF." }, { status: 415 });

  const supabase = createServiceClient();
  const stamp = Date.now();
  const path = `${vehicleId}/${step}/${kind}-${stamp}.${extensionFor(file.type)}`;
  const { error: uploadError } = await supabase.storage
    .from(TITLE_WORK_BUCKET)
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: "The file did not save. Try again." }, { status: 502 });

  const entry: TitleWorkFile = {
    kind,
    path,
    name: file.name || path.split("/").pop() || path,
    contentType: file.type,
    uploadedAt: new Date(stamp).toISOString(),
  };

  // The row for the step, grown by one file; created open if it did not
  // exist, because a file can arrive before anybody ticks the step.
  const { data: existing } = await supabase
    .from("vehicle_title_work")
    .select("files, completed_at, completed_by, note, data")
    .eq("vehicle_id", vehicleId)
    .eq("step", step)
    .maybeSingle();
  const files = [...readFiles((existing as { files?: unknown } | null)?.files), entry];
  const now = new Date().toISOString();
  const { error: rowError } = await supabase.from("vehicle_title_work").upsert(
    {
      vehicle_id: vehicleId,
      step,
      files,
      updated_at: now,
      ...(existing ? {} : { completed_at: null, completed_by: null, note: null, data: {} }),
    },
    { onConflict: "vehicle_id,step" },
  );
  if (rowError) return NextResponse.json({ error: `Could not record the file: ${rowError.message}` }, { status: 500 });

  const { data: link } = await supabase.storage.from(TITLE_WORK_BUCKET).createSignedUrl(path, 600);
  return NextResponse.json({ ok: true, file: { ...entry, url: link?.signedUrl ?? null } });
}
