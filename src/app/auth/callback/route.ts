import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authDestination } from "@/lib/auth-destination";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = authDestination(request.nextUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(new URL(`/auth/login?error=confirmation&next=${encodeURIComponent(next)}`, request.url));
}
