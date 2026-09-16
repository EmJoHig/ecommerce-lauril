import { NextResponse } from "next/server";
import { isDatabaseReachable } from "@/shared/infrastructure/database-health";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get("deep") === "1";
  if (!deep) {
    return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
  }

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  if (await isDatabaseReachable()) {
    return NextResponse.json({ status: "ok", database: "reachable", timestamp: new Date().toISOString() });
  }

  return NextResponse.json({ status: "degraded", database: "unreachable", timestamp: new Date().toISOString() }, { status: 503 });
}
