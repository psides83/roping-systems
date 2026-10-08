import { z } from "zod";
import { recordRun } from "../../../actions";
import { createClient } from "@/lib/supabase/server";
import { getActiveProducer } from "@/lib/producers";

type Context = { params: Promise<{ eventId: string; runId: string }> };
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request, { params }: Context) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ success: false }, { status: 403, headers });
  const { eventId, runId } = await params;
  if (!z.uuid().safeParse(eventId).success || !z.uuid().safeParse(runId).success) return Response.json({ success: false }, { status: 400, headers });
  try {
    const db = await createClient();
    const { data } = await db.auth.getUser();
    if (!data.user) return Response.json({ success: false }, { status: 401, headers });
    const form = await request.formData();
    form.set("runId", runId);
    const result = await recordRun(eventId, {}, form);
    return Response.json({ ...result, success: Boolean(result.success) }, { headers });
  } catch {
    return Response.json({ success: false, message: "Unable to confirm this save." }, { status: 503, headers });
  }
}

export async function GET(request: Request, { params }: Context) {
  const { eventId, runId } = await params;
  const submissionId = new URL(request.url).searchParams.get("submission");
  if (![eventId,runId,submissionId].every((id) => z.uuid().safeParse(id).success)) return Response.json({ message: "Invalid submission" }, { status: 400, headers });
  try {
    const producer = await getActiveProducer();
    if (!producer) return Response.json({ message: "Sign in again" }, { status: 401, headers });
    const db = await createClient();
    const run = await db.from("competition_runs").select("id,event_ropings!inner(event_id)")
      .eq("id",runId).eq("producer_id",producer.id).eq("event_ropings.event_id",eventId).maybeSingle();
    if (run.error || !run.data) return Response.json({ message: "Run unavailable" }, { status: 403, headers });
    const result = await db.rpc("run_submission_status", { target_run_id: runId, target_submission_id: submissionId });
    if (result.error) throw result.error;
    return Response.json(result.data, { headers });
  } catch { return Response.json({ message: "Unable to check saved status" }, { status: 503, headers }); }
}
