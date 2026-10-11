import { createHash } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isVerifiedPlatformOwner } from "@/lib/platform-access";
import { buildProducerArchive, safeArchivePath, type ProducerExportSnapshot } from "@/lib/producer-export";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const maxDuration = 300;
const requestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create"), reason: z.string().trim().min(5).max(1000) }),
  z.object({ operation: z.literal("download"), id: z.uuid() }),
]);
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request, { params }: { params: Promise<{ producerId: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply({ message: "Open this download from Platform Admin." }, 403);
  if (!await isVerifiedPlatformOwner()) return reply({ message: "Platform owner two-factor verification is required." }, 403);
  const { producerId } = await params;
  if (!z.uuid().safeParse(producerId).success) return reply({ message: "Producer not found." }, 404);
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ message: "Provide an export reason or select an existing export." }, 400);
  const db = await createClient();
  let exportId: string | null = null;
  let objectPath: string | null = null;
  let ready = false;
  try {
    if (parsed.data.operation === "create") {
      const started = await db.rpc("start_platform_producer_export", { target_producer: producerId, export_reason: parsed.data.reason });
      if (started.error) throw new Error(started.error.message);
      exportId = started.data.id; objectPath = started.data.object_path;
      const snapshot = started.data.snapshot as ProducerExportSnapshot;
      if (snapshot.producer_id !== producerId) throw new Error("Export ownership could not be verified.");
      if (snapshot.assets.length > 2000) throw new Error("Too many uploads for an interactive export. Arrange a managed export.");
      const assets: Record<string, Uint8Array> = Object.create(null);
      let assetBytes = 0;
      const { url } = getSupabaseConfig();
      for (const asset of snapshot.assets) {
        if (!["organization-logos", "sponsor-logos"].includes(asset.bucket) || !safeArchivePath(asset.path) || asset.path.split("/")[0] !== producerId) throw new Error("Uploaded file ownership could not be verified.");
        if (assetBytes + Number(asset.size ?? 0) > 50 * 1024 * 1024) throw new Error("Uploads exceed the interactive export size limit. Arrange a managed export.");
        const fileUrl = `${url}/storage/v1/object/public/${asset.bucket}/${asset.path.split("/").map(encodeURIComponent).join("/")}`;
        const response = await fetch(fileUrl, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error("An uploaded logo could not be downloaded. No partial archive was issued.");
        if (!response.body) throw new Error("An uploaded logo was empty.");
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = []; let fileBytes = 0;
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          assetBytes += value.byteLength; fileBytes += value.byteLength;
          if (assetBytes > 50 * 1024 * 1024) { await reader.cancel(); throw new Error("Uploads exceed the interactive export size limit. Arrange a managed export."); }
          chunks.push(value);
        }
        const bytes = new Uint8Array(fileBytes); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        assets[`${asset.bucket}/${asset.path}`] = bytes;
      }
      const zip = buildProducerArchive(snapshot, assets);
      const stored = await db.storage.from("platform-exports").upload(objectPath!, zip, { contentType: "application/zip", upsert: false });
      if (stored.error) throw new Error("The private archive could not be stored. Please retry.");
      const completed = await db.rpc("finish_platform_producer_export", { target_export: exportId, export_success: true, export_bytes: zip.byteLength, export_hash: createHash("sha256").update(zip).digest("hex"), export_manifest: { snapshot_at: snapshot.snapshot_at, counts: snapshot.counts, asset_count: snapshot.assets.length, exclusions: snapshot.exclusions } });
      if (completed.error) throw new Error("The archive could not be recorded. Please retry.");
      ready = true;
    } else {
      const existing = await db.from("platform_producer_exports").select("id,object_path").eq("id", parsed.data.id).eq("producer_id", producerId).eq("status", "ready").maybeSingle();
      if (existing.error || !existing.data) throw new Error("This export is not available.");
      exportId = existing.data.id; objectPath = existing.data.object_path; ready = true;
    }
    const signed = await db.storage.from("platform-exports").createSignedUrl(objectPath!, 300, { download: `producer-${producerId}-${exportId}.zip` });
    if (signed.error) throw new Error("Download link could not be issued. The archive is saved; retry its download.");
    return reply({ id: exportId, url: signed.data.signedUrl, message: "Archive ready. Download link expires in five minutes." });
  } catch (error) {
    if (exportId && !ready) {
      const state = await db.from("platform_producer_exports").select("status").eq("id",exportId).eq("producer_id",producerId).maybeSingle();
      // A lost response may follow a committed completion; never delete that archive.
      if (!state.error && state.data?.status === "generating") {
        if (objectPath) await db.storage.from("platform-exports").remove([objectPath]);
        await db.rpc("finish_platform_producer_export", { target_export: exportId, export_success: false });
      }
    }
    return reply({ message: error instanceof Error ? error.message : "Export failed. No partial archive was issued." }, 400);
  }
}
