import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const state = crypto.randomUUID();

  const cookieStore = await cookies();
  cookieStore.set("strava_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID!,
    redirect_uri: process.env.STRAVA_REDIRECT_URI!,
    response_type: "code",
    scope: "read,activity:read_all",
    state,
  });

  redirect(`https://www.strava.com/oauth/authorize?${params.toString()}`);
}
