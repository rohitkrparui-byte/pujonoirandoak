
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    if (
      url.pathname === "/netlify/functions/validate-invite" ||
      url.pathname === "/.netlify/functions/validate-invite"
    ) {
      if (request.method !== "POST") {
        return json({ valid: false, message: "Method not allowed." }, 405);
      }

      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        return json({ valid: false, message: "Invitation service is not configured." }, 500);
      }

      try {
        const body = await request.json();
        const code = typeof body.code === "string"
          ? body.code.trim().toUpperCase()
          : "";

        if (!/^[A-F0-9]{10}$/.test(code)) {
          return json({ valid: false, message: "Enter a valid 10-character invitation code." }, 400);
        }

        const endpoint = new URL("/rest/v1/invitation_codes", env.SUPABASE_URL);
        endpoint.searchParams.set("select", "id,application_id,code,status");
        endpoint.searchParams.set("code", `eq.${code}`);
        endpoint.searchParams.set("status", "eq.active");
        endpoint.searchParams.set("limit", "1");

        const response = await fetch(endpoint, {
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          return json({ valid: false, message: "Could not verify the invitation. Please try again." }, 502);
        }

        const rows = await response.json();

        if (!Array.isArray(rows) || rows.length !== 1) {
          return json({ valid: false, message: "That code was not recognized. Please check your invitation." }, 200);
        }

        return json({
          valid: true,
          application_id: rows[0].application_id
        });
      } catch (error) {
        return json({ valid: false, message: "Unable to verify the code right now." }, 500);
      }
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
