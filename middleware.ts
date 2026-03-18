import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { ALLOWED_EMAILS } from "@/lib/config";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/activities(.*)",
  "/chat(.*)",
  "/plan(.*)",
  "/profile(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();

    const { sessionClaims } = await auth();
    const email = sessionClaims?.email as string | undefined;

    if (!email || !ALLOWED_EMAILS.includes(email.toLowerCase())) {
      return new Response("Forbidden", { status: 403 });
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
