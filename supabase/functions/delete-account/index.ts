import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://expiry-aware-food-inventory-priorit.vercel.app",
  "https://freshtrack-inventory.vercel.app",
]);
function headersFor(origin: string | null) {
  const allowed = origin && allowedOrigins.has(origin) ? origin : "https://freshtrack-inventory.vercel.app";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}
function json(status: number, payload: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(payload), { status, headers: headersFor(origin) });
}
function readClaims(token: string): Record<string, unknown> | null {
  try {
    const segment = token.split(".")[1];
    if (!segment) return null;
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
  } catch {
    return null;
  }
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    if (origin && !allowedOrigins.has(origin)) return new Response("Origin not allowed", { status: 403 });
    return new Response("ok", { headers: headersFor(origin) });
  }
  if (request.method !== "POST") return json(405, { error: "Method not allowed." }, origin);
  if (origin && !allowedOrigins.has(origin)) return json(403, { error: "Origin not allowed." }, origin);

  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return json(401, { error: "Sign in again before deleting your account." }, origin);
  const token = match[1];

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "Account deletion is not configured on the server." }, origin);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) return json(401, { error: "Your session is invalid. Sign in again." }, origin);

  const claims = readClaims(token);
  const authTime = Number(claims?.auth_time || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!authTime || authTime > now + 60 || now - authTime > 15 * 60) {
    return json(403, { error: "For safety, sign in again and delete your account within 15 minutes." }, origin);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid request." }, origin);
  }
  if (body.confirmation !== "DELETE") return json(400, { error: "Explicit account deletion confirmation is required." }, origin);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) {
    console.error("Account deletion failed for authenticated user:", deleteError.message);
    return json(500, { error: "Account deletion failed. Your account has not been confirmed as deleted; contact support before retrying." }, origin);
  }
  return json(200, { deleted: true, message: "Account and associated FreshTrack data deleted." }, origin);
});
