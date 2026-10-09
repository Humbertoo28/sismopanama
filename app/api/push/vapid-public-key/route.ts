import { NextResponse } from "next/server";
import { DEFAULT_VAPID_PUBLIC_KEY } from "@/lib/push-service";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    publicKey: DEFAULT_VAPID_PUBLIC_KEY,
  });
}
