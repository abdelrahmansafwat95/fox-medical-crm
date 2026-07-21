import { supabase } from "./supabase";

/** Insert an in-app notification for a user. RLS (`notifications_insert_for_team`)
 *  permits inserting for yourself, your subordinates, or (top roles) anyone —
 *  which covers a manager notifying a rep on approve/reject. Best-effort:
 *  failures are swallowed so they never block the approval action itself. */
export async function notifyUser(
  userId: string | null | undefined,
  n: { type: string; title: string; body?: string | null; link_url?: string | null }
): Promise<void> {
  if (!userId) return;
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    link_url: n.link_url ?? null
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[notify] failed:", error.message);
  }
}
