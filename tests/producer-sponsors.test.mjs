import test from "node:test";
import assert from "node:assert/strict";
import { sponsorSchema,sponsorLogoExtension,sponsorLogoLimit } from "../src/lib/producer-sponsors.ts";
const sponsor={id:"00000000-0000-4000-8000-000000000001",revision:0,name:"Arena Outfitters",website:"https://example.com",sortOrder:1};
test("sponsor details accept optional website and normalize web addresses",()=>{
  assert.ok(sponsorSchema.safeParse({...sponsor,website:""}).success);
  assert.equal(sponsorSchema.parse({...sponsor,website:"HTTPS://EXAMPLE.COM"}).website,"https://example.com/");
  for(const patch of [{website:"javascript:alert(1)"},{website:"https://user:secret@example.com"},{website:"example.com"},{name:" "},{sortOrder:0},{revision:-1}])
    assert.equal(sponsorSchema.safeParse({...sponsor,...patch}).success,false);
});
test("logo uploads require allowed MIME, matching signatures and bounded size",()=>{
  const png=new Uint8Array([137,80,78,71,13,10,26,10]);
  assert.equal(sponsorLogoExtension("image/png",png,100),"png");
  assert.equal(sponsorLogoExtension("image/jpeg",new Uint8Array([255,216,255]),100),"jpg");
  assert.equal(sponsorLogoExtension("image/webp",new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80]),100),"webp");
  assert.equal(sponsorLogoExtension("image/svg+xml",png,100),null);
  assert.equal(sponsorLogoExtension("image/png",new TextEncoder().encode('<svg onload="alert(1)">'),100),null);
  assert.equal(sponsorLogoExtension("image/jpeg",png,100),null);
  assert.equal(sponsorLogoExtension("image/png",png,sponsorLogoLimit+1),null);
  assert.equal(sponsorLogoExtension("image/png",png,0),null);
});
