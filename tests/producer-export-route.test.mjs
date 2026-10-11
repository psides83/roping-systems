import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { unzipSync, strFromU8 } from "fflate";
import * as archive from "../src/lib/producer-export.ts";
const require = createRequire(import.meta.url);
const producerId="11111111-1111-4111-8111-111111111111", exportId="22222222-2222-4222-8222-222222222222";
const source=ts.transpileModule(readFileSync(new URL("../src/app/api/platform/producers/[producerId]/export/route.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({verified=true,lostCompletion=false}={}) {
  const state={status:"generating",bytes:null,removed:false,calls:[]};
  const db={
    rpc:async(name,args)=>{state.calls.push([name,args]);if(name==="start_platform_producer_export")return {data:{id:exportId,object_path:`${producerId}/${exportId}.zip`,snapshot:{version:1,producer_id:producerId,snapshot_at:"2026-10-10T12:00:00Z",tables:{memberships:[{member_number:"321"}]},counts:{memberships:1},assets:[],exclusions:[],redacted_fields:"Tokens excluded"}}};if(name==="finish_platform_producer_export"){state.status=args.export_success?"ready":"failed";return lostCompletion&&args.export_success?{error:{message:"Lost completion response"}}:{error:null};}throw Error(name);},
    from:()=>{const filters={};const query={select:()=>query,eq:(key,value)=>{filters[key]=value;return query;},maybeSingle:async()=>({data:filters.producer_id===producerId?{id:exportId,object_path:`${producerId}/${exportId}.zip`,status:state.status}:null,error:null})};return query;},
    storage:{from:()=>({upload:async(path,bytes)=>{state.bytes=bytes;return {error:null};},remove:async()=>{state.removed=true;return {error:null};},createSignedUrl:async(path,seconds)=>{assert.equal(seconds,300);return {data:{signedUrl:`https://example.invalid/${path}?signed=1`},error:null};}})},
  };
  const loaded={exports:{}};
  new Function("require","exports",source)(id=>{
    if(id==="@/lib/platform-access")return {isVerifiedPlatformOwner:async()=>verified};
    if(id==="@/lib/supabase/server")return {createClient:async()=>db};
    if(id==="@/lib/producer-export")return archive;
    if(id==="@/lib/supabase/config")return {getSupabaseConfig:()=>({url:"https://example.invalid"})};
    return require(id);
  },loaded.exports);
  return {state,post:loaded.exports.POST};
}
const request=(body,origin="https://app.example")=>new Request("https://app.example/api/platform/producers/producer/export",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify(body)});
const context={params:Promise.resolve({producerId})};
test("export endpoint rejects cross-origin and unverified requests before reading records",async()=>{
  const f=fixture();assert.equal((await f.post(request({operation:"create",reason:"Backup records"},"https://other.example"),context)).status,403);assert.equal(f.state.calls.length,0);
  const denied=fixture({verified:false});assert.equal((await denied.post(request({operation:"create",reason:"Backup records"}),context)).status,403);assert.equal(denied.state.calls.length,0);
});
test("export endpoint builds and records a private ZIP before issuing a link",async()=>{
  const f=fixture();const response=await f.post(request({operation:"create",reason:"Migration backup"}),context);assert.equal(response.status,200);assert.equal(f.state.status,"ready");assert.match((await response.json()).url,/signed=1/);
  const files=unzipSync(f.state.bytes);assert.deepEqual(JSON.parse(strFromU8(files["records/memberships.json"])),[{member_number:"321"}]);
  const completion=f.state.calls.find(([name])=>name==="finish_platform_producer_export")[1];assert.match(completion.export_hash,/^[a-f0-9]{64}$/);assert.equal(completion.export_bytes,f.state.bytes.byteLength);
});
test("an ambiguous completion response never deletes a committed archive",async()=>{
  const f=fixture({lostCompletion:true});assert.equal((await f.post(request({operation:"create",reason:"Migration backup"}),context)).status,400);assert.equal(f.state.status,"ready");assert.equal(f.state.removed,false);
});
test("existing downloads are scoped to the selected producer",async()=>{
  const f=fixture();const wrong={params:Promise.resolve({producerId:"33333333-3333-4333-8333-333333333333"})};assert.equal((await f.post(request({operation:"download",id:exportId}),wrong)).status,400);
});
