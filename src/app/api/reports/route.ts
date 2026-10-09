import { parseReportFilters, reportCsvChunks, reportDate } from "@/lib/producer-reports";
import { loadProducerReport } from "@/lib/producer-report-data";

export async function GET(request: Request) {
  try {
    const { report, options } = await loadProducerReport(parseReportFilters(new URL(request.url).searchParams));
    const filename = `${options.producer.slug.replace(/[^a-z0-9-]/gi, "-")}-${new URL(request.url).searchParams.get("report") ?? "standings"}-${reportDate(new Date().toISOString(), options.producer.timezone)}.csv`;
    const chunks = reportCsvChunks(report); const encoder = new TextEncoder();
    const stream = new ReadableStream({ pull(controller) { const chunk = chunks.next(); if (chunk.done) controller.close(); else controller.enqueue(encoder.encode(chunk.value)); } });
    return new Response(stream, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("Report export failed", error);
    return Response.json({ error: "Unable to export this report. Check your access and report filters, then try again." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
}
