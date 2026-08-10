import type { SupabaseClient } from "@supabase/supabase-js";

export const readLatestPersistedAgentId = async (
  client: SupabaseClient,
): Promise<string | null> => {
  const { data, error } = await client
    .from("agent_heartbeats")
    .select("agent_id")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const agentId = data?.agent_id;
  return typeof agentId === "string" && agentId.length > 0 ? agentId : null;
};
