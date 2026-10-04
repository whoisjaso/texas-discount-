import { createClient } from "@/lib/supabase/server";
import { readFiles, type TitleWorkFile } from "@/lib/vehicles/title-work-evidence";
import type { TitleWorkRow } from "@/lib/vehicles/title-path";

/**
 * One car's title work, for a screen: the rows with their facts and their
 * files, each file signed for ten minutes so the browser can open it from a
 * private bucket. Both screens that draw the checklist read through here,
 * so neither can forget the files.
 */
export const TITLE_WORK_BUCKET = "title-work";

export async function loadTitleWork(vehicleId: string): Promise<TitleWorkRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vehicle_title_work")
    .select("step, completed_at, note, data, files")
    .eq("vehicle_id", vehicleId);
  const rows = (data ?? []) as TitleWorkRow[];

  const signed: TitleWorkRow[] = [];
  for (const row of rows) {
    const files: TitleWorkFile[] = [];
    for (const file of readFiles(row.files)) {
      let url: string | undefined;
      try {
        const { data: link } = await supabase.storage.from(TITLE_WORK_BUCKET).createSignedUrl(file.path, 600);
        url = link?.signedUrl ?? undefined;
      } catch {
        url = undefined;
      }
      files.push({ ...file, url });
    }
    signed.push({ ...row, files });
  }
  return signed;
}
