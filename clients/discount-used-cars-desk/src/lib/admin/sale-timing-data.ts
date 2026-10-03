import { createAdminDataClient } from "@/lib/supabase/admin-data";
import { standings, type Sale, type Standing } from "@/lib/sales/elapsed";

/**
 * What the board is built from.
 *
 * The owner asked for elapsed times so the floor has something to compete on.
 * This reads the finished sales, puts a name to each one and hands the whole
 * lot to `standings`, which owns every judgement about what counts.
 *
 * Nothing here decides anything. The split matters: the rules about overnight
 * sales, medians and unmeasured people are tested against arrays in a pure
 * module, and this file's only job is to fetch rows and match names to ids.
 */

/** Far enough back to be a season, near enough that last year is not on it. */
export const BOARD_WINDOW_DAYS = 90;

export type Board = {
  rows: Standing[];
  /** How many finished sales in the window had no start recorded at all. */
  untimed: number;
  since: string;
};

export async function getSaleBoard(days = BOARD_WINDOW_DAYS): Promise<Board> {
  const supabase = await createAdminDataClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("deals")
    .select("started_at, completed_at, created_by")
    .eq("status", "completed")
    .gte("completed_at", since)
    .order("completed_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    started_at: string | null;
    completed_at: string | null;
    created_by: string | null;
  }[];

  /*
    One lookup for every name rather than one per row: a hundred sales made by
    three people is three names, and asking per row would be a hundred round
    trips to learn three things.
  */
  const ids = [...new Set(rows.map((row) => row.created_by).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: members } = await supabase
      .from("team_members")
      .select("auth_user_id, full_name, display_name")
      .in("auth_user_id", ids);
    for (const raw of members ?? []) {
      const member = raw as unknown as {
        auth_user_id: string | null;
        full_name: string | null;
        display_name: string | null;
      };
      const name = member.display_name?.trim() || member.full_name?.trim();
      if (member.auth_user_id && name) names.set(member.auth_user_id, name);
    }
  }

  const sales: Sale[] = rows.map((row) => ({
    startedAt: row.started_at,
    completedAt: row.completed_at,
    personId: row.created_by,
    /*
      A sale whose author left the team, or was made by a path with no author,
      still happened and still belongs in the totals. It gets a name that says
      what is actually known rather than being dropped, because a board that
      quietly omits sales is a board somebody will catch out.
    */
    personName: (row.created_by ? names.get(row.created_by) : null) ?? "Unattributed",
  }));

  return {
    rows: standings(sales, Date.now()),
    // Said out loud on the page. Every deal from before the clock existed is
    // in here, and the number shrinking to nothing is how anybody knows the
    // board has become complete.
    untimed: sales.filter((sale) => !sale.startedAt).length,
    since,
  };
}
