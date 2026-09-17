import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const isRootRole = (value: unknown) => ["original", "legacy_original", "unknown_origin"].includes(String(value || ""));
const objectUrl = (accountId: string, bucket: string, key: string) =>
  `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: "Authentication required." }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "delete").trim().toLowerCase();
    if (!["delete", "reject"].includes(action)) return json({ error: "Unsupported action." }, 400);
    const itemId = String(body?.item_id || "");
    if (!itemId) return json({ error: "Catalogue item not found." }, 404);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const found = await admin.from("nt_catalog_items")
      .select("id,owner_id,object_key,nt_uuid,variant_role,title,kind,publisher_name,moderation_status")
      .eq("id", itemId).maybeSingle();
    if (found.error || !found.data) return json({ error: "Catalogue item not found." }, 404);

    const profile = await admin.from("nt_profiles").select("role,username").eq("id", user.id).maybeSingle();
    const actorRole = String(profile.data?.role || "member").trim().toLowerCase();
    const actorName = String(profile.data?.username || "unknown").trim() || "unknown";
    const moderator = ["moderator", "admin"].includes(actorRole);
    const owner = found.data.owner_id === user.id;
    if (action === "reject" && !moderator) return json({ error: "Moderator access required." }, 403);
    if (action === "delete" && !owner && !moderator) return json({ error: "Catalogue item not found." }, 404);

    const deletesLineage = isRootRole(found.data.variant_role);
    let targets: Array<{ id: string; object_key: string | null }> = [];
    if (deletesLineage) {
      const family = await admin.from("nt_catalog_items").select("id,object_key").eq("nt_uuid", found.data.nt_uuid);
      if (family.error) return json({ error: family.error.message }, 400);
      targets = (family.data || []) as Array<{ id: string; object_key: string | null }>;
    } else {
      targets = [{ id: found.data.id, object_key: found.data.object_key }];
    }

    let rejectionId: string | null = null;
    let rejectionReason = "";
    if (action === "reject") {
      if (String(found.data.moderation_status || "") !== "pending") {
        return json({ error: "Only uploads waiting for review can be rejected." }, 409);
      }
      rejectionReason = String(body?.reason || "").trim().slice(0, 1000);
      if (!rejectionReason) return json({ error: "A rejection reason is required." }, 400);
      const receipt = await admin.from("nt_catalog_rejections").upsert({
        original_item_id: found.data.id,
        owner_id: found.data.owner_id,
        nt_uuid: found.data.nt_uuid,
        title: found.data.title,
        kind: found.data.kind,
        publisher_name: found.data.publisher_name || "unknown",
        reason: rejectionReason,
        rejected_by: user.id,
        rejected_by_name: actorName,
        rejected_at: new Date().toISOString(),
      }, { onConflict: "original_item_id" }).select("id").single();
      if (receipt.error) return json({ error: receipt.error.message }, 400);
      rejectionId = receipt.data?.id || null;
    }

    const objectKeys = [...new Set(targets.map(row => String(row.object_key || "")).filter(Boolean))];
    const removed = deletesLineage
      ? await admin.from("nt_catalog_items").delete().eq("nt_uuid", found.data.nt_uuid)
      : await admin.from("nt_catalog_items").delete().eq("id", found.data.id);
    if (removed.error) {
      if (action === "reject") await admin.from("nt_catalog_rejections").delete().eq("original_item_id", found.data.id);
      return json({ error: removed.error.message }, 400);
    }

    if (moderator) {
      const auditAction = action === "reject" ? "reject" : (deletesLineage ? "delete_lineage" : "delete");
      const details = action === "reject"
        ? { reason: rejectionReason, deleted_scope: deletesLineage ? "lineage" : "item", deleted_count: targets.length || 1 }
        : { deleted_scope: deletesLineage ? "lineage" : "item", deleted_count: targets.length || 1, moderator_delete: true };
      const audit = await admin.from("nt_catalog_audit_log").insert({
        actor_id: user.id,
        actor_name: actorName,
        actor_role: actorRole,
        action: auditAction,
        item_id: found.data.id,
        nt_uuid: found.data.nt_uuid,
        title: String(found.data.title || "").slice(0, 120),
        details,
      });
      if (audit.error) console.error("Catalogue audit insert failed", audit.error.message);
    }

    if (objectKeys.length) {
      const accountId = Deno.env.get("NT_R2_ACCOUNT_ID") || "";
      const accessKeyId = Deno.env.get("NT_R2_ACCESS_KEY_ID") || "";
      const secretAccessKey = Deno.env.get("NT_R2_SECRET_ACCESS_KEY") || "";
      const bucket = Deno.env.get("NT_R2_BUCKET") || "nasty-catalogue";
      if (accountId && accessKeyId && secretAccessKey && bucket) {
        const aws = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
        for (const objectKey of objectKeys) {
          const { count: refs } = await admin.from("nt_catalog_items").select("id", { count: "exact", head: true }).eq("object_key", objectKey);
          if (refs) continue;
          try {
            const del = await aws.fetch(objectUrl(accountId, bucket, objectKey), { method: "DELETE" });
            if (!del.ok && del.status !== 404) console.error(`R2 orphan cleanup failed (${del.status}) for ${objectKey}`);
          } catch (error) { console.error(`R2 orphan cleanup failed for ${objectKey}`, error); }
        }
      } else console.error("R2 cleanup skipped because R2 secrets are not configured.");
    }

    return json({
      ok: true,
      rejected: action === "reject",
      rejection_id: rejectionId,
      deleted_scope: deletesLineage ? "lineage" : "item",
      deleted_count: targets.length || 1,
      nt_uuid: found.data.nt_uuid,
      deleted_by_moderator: moderator && !owner,
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Nasty Catalogue delete backend error." }, 500);
  }
});
