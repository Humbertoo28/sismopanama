import { NextResponse } from "next/server";
import { DEFAULT_VAPID_PUBLIC_KEY } from "@/lib/push-service";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { publicKey: DEFAULT_VAPID_PUBLIC_KEY },
    {
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
      },
    },
  );
}
