
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Invitation validation endpoint
    if (url.pathname === "/netlify/functions/validate-invite") {
      if (request.method !== "POST") {
        return json({ valid: false, message: "Method not allowed." }, 405);
      }

      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        return json({
          valid: false,
          message: "Invitation service is not configured."
        }, 503);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ valid: false, message: "Invalid request." }, 400);
      }

      const code = typeof body.code === "string"
        ? body.code.trim().toUpperCase()
        : "";

      if (!/^[A-Z0-9]{10}$/.test(code)) {
        return json({
          valid: false,
          message: "Enter the 10-character invitation code."
        }, 400);
      }

      try {
        const endpoint = new URL(
          "/rest/v1/invitation_codes",
          env.SUPABASE_URL
        );

        endpoint.searchParams.set(
          "select",
          "id,application_id,code,status"
        );
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
          return json({
            valid: false,
            message: "Could not verify the invitation. Please try again."
          }, 502);
        }

        const rows = await response.json();

        if (!Array.isArray(rows) || rows.length !== 1) {
          return json({
            valid: false,
            message: "That code was not recognized. Please check your invitation."
          }, 404);
        }

        return json({
          valid: true,
          message: "Invitation verified.",
          application_id: rows[0].application_id
        });
      } catch {
        return json({
          valid: false,
          message: "Invitation verification failed. Please try again."
        }, 500);
      }
    }

    // Serve the existing website and static files
    return env.ASSETS.fetch(request);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
