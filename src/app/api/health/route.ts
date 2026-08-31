import { NextResponse } from "next/server";
import { getPrisma } from "@/shared/infrastructure/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get("deep") === "1";
  if (!deep) {
    return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
  }

  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "reachable", timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unreachable", timestamp: new Date().toISOString() }, { status: 503 });
  }
}
