// Netlify Function: securely validates a participant invitation against Supabase.
// Required Netlify environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
export default async (request, context) => {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  if (request.method !== "POST") return new Response(JSON.stringify({ valid: false, message: "Method not allowed." }), { status: 405, headers });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Response(JSON.stringify({ valid: false, message: "Invitation service is not configured. Please contact the host." }), { status: 503, headers });
  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ valid: false, message: "Invalid request." }), { status: 400, headers }); }
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!/^[A-F0-9]{10}$/.test(code)) return new Response(JSON.stringify({ valid: false, message: "Enter the 10-character invitation code exactly as provided." }), { status: 400, headers });
  try {
    const endpoint = new URL("/rest/v1/invitation_codes", url);
    endpoint.searchParams.set("select", "id,application_id,code,status");
    endpoint.searchParams.set("code", `eq.${code}`);
    endpoint.searchParams.set("status", "eq.active");
    endpoint.searchParams.set("limit", "1");
    const res = await fetch(endpoint, { headers: { apikey: key, authorization: `Bearer ${key}`, accept: "application/json" } });
    if (!res.ok) throw new Error(`Supabase returned ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length !== 1) return new Response(JSON.stringify({ valid: false, message: "That code was not recognized or is no longer active. Please check with the host." }), { status: 404, headers });
    // Return only the minimum needed by the browser; never expose the service key or applicant data.
    return new Response(JSON.stringify({ valid: true }), { status: 200, headers });
  } catch (err) {
    console.error("Invitation validation error:", err);
    return new Response(JSON.stringify({ valid: false, message: "We could not verify the code right now. Please try again shortly." }), { status: 502, headers });
  }
};
