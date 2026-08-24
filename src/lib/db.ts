import { supabase } from "@/lib/supabase";

/**
 * RLS silently drops rows a policy rejects instead of erroring — a blocked
 * delete/update looks identical to "nothing matched". These wrappers check
 * the affected-row count and turn that into a real, visible error so a
 * permission-denied mutation never looks like it succeeded.
 */
export async function guardedMutation<T = unknown>(
  builder: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  action: string,
  permissionHint: string
): Promise<{ ok: boolean; error?: string; data: T[] }> {
  const { data, error } = await builder;
  if (error) return { ok: false, error: error.message, data: [] };
  if (!data || data.length === 0) {
    return { ok: false, error: `Nothing was ${action} — this account may not have permission (${permissionHint} is Manager-only).`, data: [] };
  }
  return { ok: true, data };
}

export function guardedDelete(table: string, column: string, value: string | number, permissionHint: string) {
  return guardedMutation(supabase.from(table).delete().eq(column, value).select(column), "deleted", permissionHint);
}

export function guardedUpdate(table: string, column: string, value: string | number, patch: Record<string, unknown>, permissionHint: string) {
  return guardedMutation(supabase.from(table).update(patch).eq(column, value).select(column), "saved", permissionHint);
}
