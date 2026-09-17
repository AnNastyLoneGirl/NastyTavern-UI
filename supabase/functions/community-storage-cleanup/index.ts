import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) return json({ error: "Supabase environment is not configured" }, 500);

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Authentication required" }, 401);

  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: "Invalid session" }, 401);

  let queuedDeleted = 0;
  let orphanDeleted = 0;

  const { data: queue, error: queueError } = await admin
    .from("nt_storage_cleanup_queue")
    .select("id,bucket,path")
    .order("created_at", { ascending: true })
    .limit(200);

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
    const { error: clearError } = await admin
      .from("nt_storage_cleanup_queue")
      .delete()
      .in("id", group.ids);
    if (!clearError) queuedDeleted += group.paths.length;
  }

  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: objects, error: objectsError } = await admin
    .schema("storage")
    .from("objects")
    .select("name,created_at")
    .eq("bucket_id", "community-files")
    .lt("created_at", cutoff)
    .limit(500);

  if (!objectsError && objects?.length) {
    const { data: messageRows } = await admin
      .from("nt_messages")
      .select("metadata")
      .in("message_type", ["attachment", "character_card", "lorebook"]);

    const referenced = new Set(
      (messageRows || [])
        .map((row: any) => row?.metadata?.path)
        .filter(Boolean)
        .map(String),
    );

    const orphanPaths = objects
      .map((row: any) => String(row.name || ""))
      .filter((name: string) => name && !referenced.has(name))
      .slice(0, 100);

    if (orphanPaths.length) {
      const { error } = await admin.storage.from("community-files").remove(orphanPaths);
      if (!error) orphanDeleted = orphanPaths.length;
    }
  }

  return json({ ok: true, queuedDeleted, orphanDeleted });
});
