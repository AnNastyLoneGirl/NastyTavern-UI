import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const cfg = () => ({
  accountId: Deno.env.get("NT_R2_ACCOUNT_ID") || "",
  accessKeyId: Deno.env.get("NT_R2_ACCESS_KEY_ID") || "",
  secretAccessKey: Deno.env.get("NT_R2_SECRET_ACCESS_KEY") || "",
  bucket: Deno.env.get("NT_R2_BUCKET") || "nasty-catalogue",
});
const r2Client = () => {
  const c = cfg();
  if (!c.accountId || !c.accessKeyId || !c.secretAccessKey || !c.bucket) throw new Error("R2_NOT_CONFIGURED");
  return { c, aws: new AwsClient({ accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, service: "s3", region: "auto" }) };
};
const objectUrl = (accountId: string, bucket: string, key: string) => `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
const signedGet = async (aws: AwsClient, accountId: string, bucket: string, key: string) => (await aws.sign(objectUrl(accountId,bucket,key), { method:"GET", aws:{ signQuery:true } })).url;

const enc = new TextEncoder();
const latin1 = new TextDecoder("latin1");
const PNG_SIG = new Uint8Array([137,80,78,71,13,10,26,10]);
const TRACK_KEYS = new Set(["chara","ccv3"]);
const concat = (...parts: Uint8Array[]) => { const n=parts.reduce((s,p)=>s+p.length,0); const out=new Uint8Array(n); let o=0; for(const p of parts){out.set(p,o);o+=p.length;} return out; };
const pngChunks = (bytes: Uint8Array) => {
  if(bytes.length<12 || PNG_SIG.some((v,i)=>bytes[i]!==v)) throw new Error("INVALID_PNG");
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength); const chunks:any[]=[]; let offset=8;
  while(offset+12<=bytes.length){ const len=view.getUint32(offset,false), end=offset+12+len; if(end>bytes.length)throw new Error("INVALID_PNG"); const type=String.fromCharCode(bytes[offset+4],bytes[offset+5],bytes[offset+6],bytes[offset+7]); chunks.push({type,data:bytes.slice(offset+8,offset+8+len),raw:bytes.slice(offset,end)}); offset=end; if(type==="IEND")break; }
  return chunks;
};
const chunkKeyword=(type:string,data:Uint8Array)=>{ if(!["tEXt","zTXt","iTXt"].includes(type))return ""; const z=data.indexOf(0); return z>0?latin1.decode(data.slice(0,z)):""; };
const stripCardMeta=(bytes:Uint8Array)=>concat(PNG_SIG,...pngChunks(bytes).filter(c=>!TRACK_KEYS.has(chunkKeyword(c.type,c.data))).map(c=>c.raw));
const crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();
const crc32=(bytes:Uint8Array)=>{let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
const u32=(v:number)=>new Uint8Array([(v>>>24)&255,(v>>>16)&255,(v>>>8)&255,v&255]);
const makeChunk=(type:string,data:Uint8Array)=>{const tb=enc.encode(type);return concat(u32(data.length),tb,data,u32(crc32(concat(tb,data))));};
const b64utf8=(value:string)=>{const bytes=enc.encode(value);let bin="";for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(bin);};
const canonicalTracking=(payload:any,ntUuid:string,ntCreator:string)=>{const root=JSON.parse(JSON.stringify(payload&&typeof payload==="object"?payload:{}));const creator=String(ntCreator||"unknown").trim()||"unknown";root.nt_uuid=ntUuid;root.nt_creator=creator;if(root.data&&typeof root.data==="object"){root.data.nt_uuid=ntUuid;root.data.nt_creator=creator;}return root;};
const injectPayload=(base:Uint8Array,payload:any)=>{const chunks=pngChunks(stripCardMeta(base));const data=concat(enc.encode("chara"),new Uint8Array([0]),enc.encode(b64utf8(JSON.stringify(payload))));const out=[PNG_SIG];for(const c of chunks){if(c.type==="IEND")out.push(makeChunk("tEXt",data));out.push(c.raw);}return concat(...out);};

Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed."},405);
  try{
    const supabaseUrl=Deno.env.get("SUPABASE_URL")!, anonKey=Deno.env.get("SUPABASE_ANON_KEY")!, serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader=req.headers.get("Authorization")||"";
    const auth=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false}});
    const {data:{user},error:authError}=await auth.auth.getUser();
    if(authError||!user)return json({error:"Authentication required."},401);
    const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
    const profile=await admin.from("nt_profiles").select("role").eq("id",user.id).maybeSingle();
    const moderator=["moderator","admin"].includes(String(profile.data?.role||"").toLowerCase());
    const canView=(row:any)=>Boolean(row&&(String(row.moderation_status||"approved")==="approved"||row.owner_id===user.id||moderator));
    const body=await req.json().catch(()=>({})); const action=String(body?.action||"");

    if(action==="status"){
      const c=cfg(); const {count}=await admin.from("nt_catalog_items").select("id",{count:"exact",head:true}).eq("owner_id",user.id).eq("published",true);
      return json({r2_configured:Boolean(c.accountId&&c.accessKeyId&&c.secretAccessKey&&c.bucket),uploads_used:count||0,upload_limit:5});
    }
    if(action==="preview_batch"){
      const ids=Array.isArray(body?.item_ids)?body.item_ids.map(String).filter(Boolean).slice(0,60):[]; if(!ids.length)return json({urls:{}});
      const q=await admin.from("nt_catalog_items").select("id,object_key,file_extension,kind,published,owner_id,moderation_status").in("id",ids).eq("published",true).eq("kind","character_card").eq("file_extension","png");
      if(q.error)return json({error:q.error.message},400); const {c,aws}=r2Client(); const urls:Record<string,string>={};
      await Promise.all((q.data||[]).filter(canView).map(async(row:any)=>{urls[row.id]=await signedGet(aws,c.accountId,c.bucket,row.object_key);})); return json({urls});
    }
    if(action==="lineage"){
      const itemId=String(body?.item_id||""); const current=await admin.from("nt_catalog_items").select("id,nt_uuid,published,owner_id,moderation_status").eq("id",itemId).maybeSingle();
      if(current.error||!current.data?.published||!canView(current.data))return json({error:"Catalogue item not found."},404);
      const family=await admin.from("nt_catalog_items").select("id,nt_uuid,version_uuid,owner_id,nt_creator,publisher_name,variant_role,title,description,file_name,file_extension,file_size,downloads,rating_average,rating_count,content_rating,moderation_status,created_at,updated_at").eq("nt_uuid",current.data.nt_uuid).eq("published",true).order("created_at",{ascending:true});
      if(family.error)return json({error:family.error.message},400); return json({nt_uuid:current.data.nt_uuid,versions:(family.data||[]).filter(canView)});
    }
    if(action==="file"){
      const itemId=String(body?.item_id||""); const purpose=["inspect","preview","download","import"].includes(String(body?.purpose||""))?String(body.purpose):"inspect";
      const q=await admin.from("nt_catalog_items").select("id,nt_uuid,nt_creator,kind,object_key,file_name,file_extension,mime_type,published,resource_payload,owner_id,moderation_status").eq("id",itemId).maybeSingle();
      if(q.error||!q.data?.published||!canView(q.data))return json({error:"Catalogue item not found."},404); const row=q.data; const payload=canonicalTracking(row.resource_payload||{},row.nt_uuid,row.nt_creator||"unknown");
      let bytes:Uint8Array; let outputType="application/json";
      if(row.kind==="character_card"&&String(row.file_extension).toLowerCase()==="png"){
        const {c,aws}=r2Client(); const upstream=await aws.fetch(objectUrl(c.accountId,c.bucket,row.object_key),{method:"GET"}); if(!upstream.ok)return json({error:`Cloudflare R2 read failed (${upstream.status}).`},502);
        bytes=injectPayload(new Uint8Array(await upstream.arrayBuffer()),payload); outputType="image/png";
      }else{
        bytes=enc.encode(JSON.stringify(payload,null,2)); outputType="application/json";
      }
      return new Response(bytes,{status:200,headers:{...cors,"content-type":outputType,"cache-control":"private, no-store","x-nt-file-name":encodeURIComponent(row.file_name||"resource"),"x-nt-mime-type":outputType,"x-nt-uuid":row.nt_uuid,"x-nt-creator":encodeURIComponent(row.nt_creator||"unknown"),"x-nt-purpose":purpose}});
    }
    return json({error:"Unsupported action."},400);
  }catch(error){const msg=error instanceof Error?error.message:String(error);if(msg==="R2_NOT_CONFIGURED")return json({error:"Cloudflare R2 is not configured yet on the Nasty Catalogue backend.",code:"R2_NOT_CONFIGURED"},503);if(msg==="INVALID_PNG")return json({error:"Invalid PNG file."},400);console.error(error);return json({error:"Nasty Catalogue access backend error."},500);}
});
