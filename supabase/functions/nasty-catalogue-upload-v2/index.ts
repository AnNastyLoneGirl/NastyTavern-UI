import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const cors = {"access-control-allow-origin":"*","access-control-allow-headers":"authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage","access-control-allow-methods":"POST, OPTIONS"};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const safeName = (value: string) => (value || "file").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
const lower = (value: unknown) => String(value || "").trim().toLocaleLowerCase();
const isRootRole = (value: unknown) => ["original", "legacy_original", "unknown_origin"].includes(String(value || ""));
const isUnlimitedRole = (role: unknown) => ["vip", "moderator", "admin"].includes(lower(role));
const maxBytesForRole = (role: unknown) => isUnlimitedRole(role) ? 5767168 : 2097152;
const bytesHex = (buffer: ArrayBuffer | Uint8Array) => { const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer); return [...bytes].map(v => v.toString(16).padStart(2, "0")).join(""); };
const digestHex = async (bytes: ArrayBuffer | Uint8Array) => bytesHex(await crypto.subtle.digest("SHA-256", bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)));
const textEncoder = new TextEncoder();
const utf8 = new TextDecoder("utf-8", { fatal: false });
const latin1 = new TextDecoder("latin1");
const PNG_SIG = new Uint8Array([137,80,78,71,13,10,26,10]);
const TRACK_KEYS = new Set(["chara", "ccv3"]);
const concatBytes = (...parts: Uint8Array[]) => { const size = parts.reduce((sum, part) => sum + part.length, 0); const out = new Uint8Array(size); let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; } return out; };
const inflateBytes = async (bytes: Uint8Array) => { try { const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate")); return new Uint8Array(await new Response(stream).arrayBuffer()); } catch (_) { return null; } };
const decodeCardPayload = async (raw: string) => { const value = String(raw || "").trim(); if (!value) return null; const attempts = [value]; try { const decoded = Uint8Array.from(atob(value.replace(/\s+/g, "")), c => c.charCodeAt(0)); attempts.push(utf8.decode(decoded)); const inflated = await inflateBytes(decoded); if (inflated) attempts.push(utf8.decode(inflated)); } catch (_) {} for (const attempt of attempts) { try { const parsed = JSON.parse(attempt); if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>; } catch (_) {} } return null; };
const pngChunks = (bytes: Uint8Array) => { if (bytes.length < 12 || PNG_SIG.some((value, index) => bytes[index] !== value)) throw new Error("INVALID_PNG"); const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const chunks: Array<{ type: string; data: Uint8Array; raw: Uint8Array }> = []; let offset = 8; while (offset + 12 <= bytes.length) { const length = view.getUint32(offset, false); const end = offset + 12 + length; if (end > bytes.length) throw new Error("INVALID_PNG"); const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]); chunks.push({ type, data: bytes.slice(offset + 8, offset + 8 + length), raw: bytes.slice(offset, end) }); offset = end; if (type === "IEND") break; } return chunks; };
const chunkKeyword = (type: string, data: Uint8Array) => { if (!["tEXt", "zTXt", "iTXt"].includes(type)) return ""; const zero = data.indexOf(0); return zero > 0 ? latin1.decode(data.slice(0, zero)) : ""; };
const extractPngPayload = async (bytes: Uint8Array) => { const candidates: Array<[string, string]> = []; for (const chunk of pngChunks(bytes)) { if (!["tEXt", "zTXt", "iTXt"].includes(chunk.type)) continue; const key = chunkKeyword(chunk.type, chunk.data); if (!TRACK_KEYS.has(key)) continue; if (chunk.type === "tEXt") { const zero = chunk.data.indexOf(0); candidates.push([key, latin1.decode(chunk.data.slice(zero + 1))]); } else if (chunk.type === "zTXt") { const zero = chunk.data.indexOf(0); const inflated = await inflateBytes(chunk.data.slice(zero + 2)); if (inflated) candidates.push([key, utf8.decode(inflated)]); } else { const first = chunk.data.indexOf(0); let cursor = first + 1; const compressionFlag = chunk.data[cursor++]; cursor += 1; const langEnd = chunk.data.indexOf(0, cursor); cursor = langEnd >= 0 ? langEnd + 1 : chunk.data.length; const translatedEnd = chunk.data.indexOf(0, cursor); cursor = translatedEnd >= 0 ? translatedEnd + 1 : chunk.data.length; let payload = chunk.data.slice(cursor); if (compressionFlag === 1) payload = await inflateBytes(payload) || payload; candidates.push([key, utf8.decode(payload)]); } } candidates.sort(([a], [b]) => a === "ccv3" ? -1 : b === "ccv3" ? 1 : 0); for (const [, raw] of candidates) { const parsed = await decodeCardPayload(raw); if (parsed) return parsed; } return null; };
const stripPngCardMetadata = (bytes: Uint8Array) => concatBytes(PNG_SIG, ...pngChunks(bytes).filter(chunk => !TRACK_KEYS.has(chunkKeyword(chunk.type, chunk.data))).map(chunk => chunk.raw));
const parseJsonBytes = (bytes: Uint8Array) => { try { const parsed = JSON.parse(utf8.decode(bytes)); return parsed && typeof parsed === "object" ? parsed : null; } catch (_) { return null; } };
const trackingValue = (payload: any, key: string) => { const root = payload && typeof payload === "object" ? payload : {}; const data = root?.data && typeof root.data === "object" ? root.data : null; return String(root?.[key] ?? data?.[key] ?? "").trim(); };
const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? {}));
const ensureTracking = (payload: any, ntUuid: string, ntCreator: string) => { const root: any = cloneJson(payload && typeof payload === "object" ? payload : {}); const data = root?.data && typeof root.data === "object" ? root.data : null; if (!trackingValue(root, "nt_uuid")) root.nt_uuid = ntUuid; if (!trackingValue(root, "nt_creator")) root.nt_creator = ntCreator || "unknown"; if (data) { if (!String(data.nt_uuid || "").trim() && !String(root.nt_uuid || "").trim()) data.nt_uuid = ntUuid; if (!String(data.nt_creator || "").trim() && !String(root.nt_creator || "").trim()) data.nt_creator = ntCreator || "unknown"; } return root; };
const validUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const cfg = () => ({ accountId: Deno.env.get("NT_R2_ACCOUNT_ID") || "", accessKeyId: Deno.env.get("NT_R2_ACCESS_KEY_ID") || "", secretAccessKey: Deno.env.get("NT_R2_SECRET_ACCESS_KEY") || "", bucket: Deno.env.get("NT_R2_BUCKET") || "nasty-catalogue", publicBaseUrl: (Deno.env.get("NT_R2_PUBLIC_BASE_URL") || "").replace(/\/$/, "") });
const objectUrl = (accountId: string, bucket: string, key: string) => `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: "Authentication required." }, 401);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) return json({ error: "Multipart upload required." }, 400);
    const form = await req.formData();
    if (String(form.get("action") || "upload") !== "upload") return json({ error: "Unsupported action." }, 400);
    const confirmReplace = String(form.get("confirm_replace") || "").toLowerCase() === "true";
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "Missing file." }, 400);
    const profile = await admin.from("nt_profiles").select("username,role,banned_at").eq("id", user.id).maybeSingle();
    if (profile.error || !profile.data) return json({ error: "Community profile required." }, 403);
    if (profile.data.banned_at) return json({ error: "This Community account cannot upload catalogue files." }, 403);
    const communityName = String(profile.data.username || "").trim();
    const role = lower(profile.data.role || "member");
    const maxFileBytes = maxBytesForRole(role);
    if (file.size <= 0 || file.size > maxFileBytes) return json({ error: role === "member" ? "Member accounts are limited to 2 MiB per catalogue file." : "VIP, moderator and administrator accounts are limited to 5.5 MiB per catalogue file.", code: "FILE_SIZE_LIMIT", max_file_bytes: maxFileBytes }, 413);
    const kind = String(form.get("kind") || "");
    if (!["character_card", "lorebook"].includes(kind)) return json({ error: "Invalid catalogue type." }, 400);
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (kind === "character_card" && !["png", "json"].includes(ext)) return json({ error: "Character Cards must be PNG or JSON." }, 400);
    if (kind === "lorebook" && !["json", "lorebook"].includes(ext)) return json({ error: "Lorebooks must be JSON or .lorebook." }, 400);
    const title = String(form.get("title") || "").trim().slice(0, 120);
    const description = String(form.get("description") || "").trim().slice(0, 4000);
    const language = String(form.get("language") || "en").trim().slice(0, 16) || "en";
    const tags = String(form.get("tags") || "").split(",").map(v => v.trim()).filter(Boolean).slice(0, 16);
    let metadata: Record<string, unknown> = {}; try { metadata = JSON.parse(String(form.get("metadata") || "{}")); } catch (_) {}
    if (!title) return json({ error: "A title is required." }, 400);

    const rawBytes = new Uint8Array(await file.arrayBuffer());
    const rawSha = await digestHex(rawBytes);
    let resourcePayload: any = null;
    if (kind === "character_card" && ext === "png") resourcePayload = await extractPngPayload(rawBytes);
    else if (ext === "json" || ext === "lorebook") resourcePayload = parseJsonBytes(rawBytes);
    if (kind === "character_card" && !resourcePayload) return json({ error: "Character Card metadata could not be read from this file." }, 400);
    const embeddedUuidRaw = trackingValue(resourcePayload, "nt_uuid");
    const embeddedUuid = validUuid(embeddedUuidRaw) ? embeddedUuidRaw : "";
    const embeddedCreator = trackingValue(resourcePayload, "nt_creator").trim();
    let incomingAssetSha: string | null = null;
    let strippedPng: Uint8Array | null = null;
    if (kind === "character_card" && ext === "png") { strippedPng = stripPngCardMetadata(rawBytes); incomingAssetSha = await digestHex(strippedPng); }

    const candidateMap = new Map<string, any>();
    const addRows = (rows: any[] | null) => (rows || []).forEach(row => candidateMap.set(row.id, row));
    const candidateSelect = "id,nt_uuid,version_uuid,owner_id,nt_creator,publisher_name,variant_role,nt_sha,asset_sha,kind,title,description,tags,language,file_name,file_extension,mime_type,file_size,object_key,storage_url,preview_url,metadata,resource_payload,downloads,rating_average,rating_count,created_at,updated_at,published";
    if (embeddedUuid) { const q = await admin.from("nt_catalog_items").select(candidateSelect).eq("nt_uuid", embeddedUuid).eq("published", true); if (q.error) return json({ error: q.error.message }, 400); addRows(q.data); }
    { const q = await admin.from("nt_catalog_items").select(candidateSelect).eq("nt_sha", rawSha).eq("published", true); if (q.error) return json({ error: q.error.message }, 400); addRows(q.data); }
    if (incomingAssetSha) { const q = await admin.from("nt_catalog_items").select(candidateSelect).eq("asset_sha", incomingAssetSha).eq("published", true); if (q.error) return json({ error: q.error.message }, 400); addRows(q.data); }
    const candidateRows = [...candidateMap.values()];
    const candidateLineages = [...new Set(candidateRows.map(row => String(row.nt_uuid || "")).filter(Boolean))];
    if (candidateLineages.length > 1) return json({ error: "The card identifiers point to more than one existing Nasty Catalogue lineage. Upload cancelled to protect the original card.", code: "LINEAGE_IDENTITY_CONFLICT", nt_uuid: embeddedUuid || null, nt_sha: rawSha, asset_sha: incomingAssetSha }, 409);
    const lineageUuid = candidateLineages[0] || embeddedUuid || crypto.randomUUID();
    let family: any[] = [];
    if (candidateLineages.length || embeddedUuid) { const familyResult = await admin.from("nt_catalog_items").select(candidateSelect).eq("nt_uuid", lineageUuid).eq("published", true).order("created_at", { ascending: true }); if (familyResult.error) return json({ error: familyResult.error.message }, 400); family = familyResult.data || []; }
    const root = family.find(row => isRootRole(row.variant_role)) || family[0] || null;
    const originalCreator = String(root?.nt_creator || embeddedCreator || "unknown").trim() || "unknown";
    const payloadForStorage = resourcePayload && typeof resourcePayload === "object" ? ensureTracking(resourcePayload, lineageUuid, originalCreator) : {};
    const creatorMatch = Boolean(root && lower(originalCreator) !== "unknown" && lower(originalCreator) === lower(communityName));
    const ownVersion = family.find(row => row.owner_id === user.id) || null;
    const replaceTarget = root && creatorMatch ? root : ownVersion;
    const replaceScope = root && creatorMatch ? "original" : ownVersion ? "modification" : null;
    if (replaceTarget && !confirmReplace) return json({ error: replaceScope === "original" ? "Your Community username matches the original creator. Confirm if you want to replace the catalogue metadata for the original card. The original PNG will never be changed." : "You already published a modification of this card. Confirm if you want to replace your existing metadata with this upload. The original PNG will never be changed.", code: "REPLACE_CONFIRMATION_REQUIRED", replace_scope: replaceScope, replace_target_id: replaceTarget.id, replace_target_title: replaceTarget.title, nt_uuid: lineageUuid, nt_creator: originalCreator, publisher_name: replaceTarget.publisher_name, original_png_locked: Boolean(root?.kind === "character_card" && root?.file_extension === "png"), incoming_image_differs: Boolean(incomingAssetSha && root?.asset_sha && incomingAssetSha !== root.asset_sha) }, 409);

    const { count: ownedCount } = await admin.from("nt_catalog_items").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("published", true);
    const wouldCreateNew = !replaceTarget;
    const wouldClaimOriginal = Boolean(replaceTarget && replaceScope === "original" && replaceTarget.owner_id !== user.id);
    if (!isUnlimitedRole(role) && (wouldCreateNew || wouldClaimOriginal) && (ownedCount || 0) >= 5) return json({ error: "Member accounts can keep up to 5 files in Nasty Catalogue.", code: "UPLOAD_SLOT_LIMIT", upload_limit: 5 }, 409);

    const c = cfg();
    if (!c.accountId || !c.accessKeyId || !c.secretAccessKey || !c.bucket) throw new Error("R2_NOT_CONFIGURED");
    const aws = new AwsClient({ accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, service: "s3", region: "auto" });
    let objectKey = "";
    let canonicalAssetSha: string | null = null;
    let uploadedNewObject = false;
    let imageIgnored = false;
    if (kind === "character_card" && ext === "png") {
      if (root) {
        if (root.kind !== "character_card" || root.file_extension !== "png" || !root.object_key) return json({ error: "This lineage was created without an original PNG. A later upload cannot add or replace the image.", code: "ORIGINAL_PNG_UNAVAILABLE" }, 409);
        objectKey = root.object_key; canonicalAssetSha = root.asset_sha || null; imageIgnored = Boolean(incomingAssetSha && canonicalAssetSha && incomingAssetSha !== canonicalAssetSha);
      } else {
        canonicalAssetSha = incomingAssetSha;
        if (!strippedPng || !canonicalAssetSha) return json({ error: "Could not prepare the original PNG asset." }, 400);
        objectKey = `catalogue-assets/${lineageUuid}/${canonicalAssetSha}.png`;
        const put = await aws.fetch(objectUrl(c.accountId, c.bucket, objectKey), { method: "PUT", headers: { "content-type": "image/png", "if-none-match": "*" }, body: strippedPng });
        if (!put.ok && put.status !== 412) return json({ error: `Cloudflare R2 upload failed (${put.status}).` }, 502);
        uploadedNewObject = put.ok;
      }
    } else {
      const versionKey = replaceTarget?.version_uuid || crypto.randomUUID();
      objectKey = `catalogue/${user.id}/${versionKey}/${safeName(file.name)}`;
      const put = await aws.fetch(objectUrl(c.accountId, c.bucket, objectKey), { method: "PUT", headers: { "content-type": file.type || "application/octet-stream" }, body: rawBytes });
      if (!put.ok) return json({ error: `Cloudflare R2 upload failed (${put.status}).` }, 502);
      uploadedNewObject = true;
    }

    const publicUrl = c.publicBaseUrl && kind === "character_card" && ext === "png" ? `${c.publicBaseUrl}/${objectKey.split("/").map(encodeURIComponent).join("/")}` : "";
    const variantRole = root ? (replaceScope === "original" ? (root.variant_role || "original") : "community_modification") : (lower(originalCreator) === "unknown" ? "unknown_origin" : "original");
    const commonData = { nt_sha: rawSha, asset_sha: kind === "character_card" && ext === "png" ? canonicalAssetSha : null, kind, title, description, tags, language, file_name: file.name, file_extension: ext, mime_type: file.type || (ext === "png" ? "image/png" : "application/json"), file_size: file.size, object_key: objectKey, storage_url: `r2://${c.bucket}/${objectKey}`, preview_url: publicUrl || root?.preview_url || null, publisher_name: communityName, variant_role: variantRole, metadata: { ...metadata, uploaded_at: new Date().toISOString(), lineage_detected: Boolean(root), source_nt_uuid: embeddedUuidRaw || null, source_nt_creator: embeddedCreator || null, incoming_asset_sha: incomingAssetSha, original_image_immutable: kind === "character_card" && ext === "png", image_ignored: imageIgnored }, resource_payload: payloadForStorage };

    if (replaceTarget) {
      const oldObjectKey = replaceTarget.object_key;
      const updateData: Record<string, unknown> = { ...commonData };
      if (replaceScope === "original" && replaceTarget.owner_id !== user.id) updateData.owner_id = user.id;
      if (kind === "character_card" && ext === "png") { updateData.object_key = replaceTarget.object_key; updateData.storage_url = replaceTarget.storage_url; updateData.asset_sha = replaceTarget.asset_sha; updateData.preview_url = replaceTarget.preview_url; }
      const updated = await admin.from("nt_catalog_items").update(updateData).eq("id", replaceTarget.id).select("id,nt_uuid,version_uuid,title,kind,nt_creator,publisher_name,variant_role,downloads,rating_average,rating_count,preview_url,created_at,updated_at").single();
      if (updated.error) { if (uploadedNewObject && objectKey !== oldObjectKey) try { await aws.fetch(objectUrl(c.accountId, c.bucket, objectKey), { method: "DELETE" }); } catch (_) {} return json({ error: updated.error.message }, 400); }
      if (uploadedNewObject && oldObjectKey && oldObjectKey !== objectKey) { const { count: refs } = await admin.from("nt_catalog_items").select("id", { count: "exact", head: true }).eq("object_key", oldObjectKey); if (!refs) try { await aws.fetch(objectUrl(c.accountId, c.bucket, oldObjectKey), { method: "DELETE" }); } catch (_) {} }
      return json({ item: updated.data, replaced: true, replace_scope: replaceScope, nt_uuid: lineageUuid, nt_creator: originalCreator, original_png_kept: kind === "character_card" && ext === "png", image_ignored: imageIgnored, lineage_size: family.length });
    }

    const versionUuid = crypto.randomUUID();
    const row = { nt_uuid: lineageUuid, version_uuid: versionUuid, owner_id: user.id, nt_creator: originalCreator, ...commonData };
    const inserted = await admin.from("nt_catalog_items").insert(row).select("id,nt_uuid,version_uuid,title,kind,nt_creator,publisher_name,variant_role,downloads,rating_average,rating_count,preview_url,created_at").single();
    if (inserted.error) { if (uploadedNewObject) { const { count: refs } = await admin.from("nt_catalog_items").select("id", { count: "exact", head: true }).eq("object_key", objectKey); if (!refs) try { await aws.fetch(objectUrl(c.accountId, c.bucket, objectKey), { method: "DELETE" }); } catch (_) {} } return json({ error: inserted.error.message }, 400); }
    return json({ item: inserted.data, replaced: false, nt_uuid: lineageUuid, nt_creator: originalCreator, original_png_created: kind === "character_card" && ext === "png" && !root, original_png_reused: kind === "character_card" && ext === "png" && Boolean(root), image_ignored: imageIgnored, lineage_size: family.length + 1 }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "R2_NOT_CONFIGURED") return json({ error: "Cloudflare R2 is not configured yet on the Nasty Catalogue backend." }, 503);
    if (message === "INVALID_PNG") return json({ error: "Invalid PNG file." }, 400);
    console.error(error);
    return json({ error: "Nasty Catalogue backend error." }, 500);
  }
});
