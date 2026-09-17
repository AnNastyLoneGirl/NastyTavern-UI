import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const digest = async (value: string) => new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
);

const secureEqual = async (left: string, right: string) => {
  const a = await digest(left);
  const b = await digest(right);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) return json({ error: "Supabase environment is not configured" }, 500);
  const providedMaintenanceKey = (req.headers.get("x-nt-maintenance-key") || "").trim();
  if (!providedMaintenanceKey) return json({ error: "Maintenance authorization required" }, 401);

  const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: secretRow, error: secretError } = await admin
    .from("nt_maintenance_secrets")
    .select("secret")
    .eq("name", "community_storage_cleanup")
    .maybeSingle();
  if (secretError || !secretRow?.secret) {
    console.error("[NastyTavern] Storage cleanup maintenance secret is unavailable", secretError);
    return json({ error: "Maintenance authorization is not configured" }, 500);
  }
  if (!await secureEqual(providedMaintenanceKey, String(secretRow.secret))) {
    return json({ error: "Maintenance authorization rejected" }, 403);
  }

  let queuedDeleted = 0;
  let orphanDeleted = 0;
  const { data: queue, error: queueError } = await admin.from("nt_storage_cleanup_queue").select("id,bucket,path").order("created_at", { ascending: true }).limit(200);
  if (queueError) return json({ error: queueError.message }, 500);

  const byBucket = new Map<string, { ids: number[]; paths: string[] }>();
  for (const row of queue || []) {
    const bucket = String(row.bucket || "community-files");
    const group = byBucket.get(bucket) || { ids: [], paths: [] };
    group.ids.push(Number(row.id));
    group.paths.push(String(row.path));
    byBucket.set(bucket, group);
  }
  for (const [bucket, group] of byBucket) {
    const { error } = await admin.storage.from(bucket).remove(group.paths);
    if (error) {
      console.error(`[NastyTavern] Storage cleanup failed for ${bucket}`, error);
      continue;
    }
    const { error: clearError } = await admin.from("nt_storage_cleanup_queue").delete().in("id", group.ids);
    if (!clearError) queuedDeleted += group.paths.length;
  }

  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: objects, error: objectsError } = await admin.schema("storage").from("objects").select("name,created_at").eq("bucket_id", "community-files").lt("created_at", cutoff).limit(500);
  if (!objectsError && objects?.length) {
    const { data: messageRows } = await admin.from("nt_messages").select("metadata").in("message_type", ["attachment", "character_card", "lorebook"]);
    const referenced = new Set((messageRows || []).map((row: any) => row?.metadata?.path).filter(Boolean).map(String));
    const orphanPaths = objects.map((row: any) => String(row.name || "")).filter((name: string) => name && !referenced.has(name)).slice(0, 100);
    if (orphanPaths.length) {
      const { error } = await admin.storage.from("community-files").remove(orphanPaths);
      if (!error) orphanDeleted = orphanPaths.length;
    }
  }
  return json({ ok: true, queuedDeleted, orphanDeleted });
});
