
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle browser preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    // Invitation validation endpoint
    if (
      url.pathname === "/netlify/functions/validate-invite" ||
      url.pathname === "/.netlify/functions/validate-invite"
    ) {
      if (request.method !== "POST") {
        return json(
          { valid: false, message: "Method not allowed." },
          405
        );
      }

      // Check Cloudflare environment settings
      const missing = [];

      if (!env.SUPABASE_URL) {
        missing.push("SUPABASE_URL");
      }

      if (!env.SUPABASE_SERVICE_ROLE_KEY) {
        missing.push("SUPABASE_SERVICE_ROLE_KEY");
      }

      if (missing.length > 0) {
        return json(
          {
            valid: false,
            message:
              "Missing Cloudflare setting: " +
              missing.join(", ") +
              ". Add it under Worker Settings > Variables and Secrets."
          },
          500
        );
      }

      // Validate Supabase URL configuration
      let supabaseUrl;

      try {
        supabaseUrl = new URL(env.SUPABASE_URL);

        if (supabaseUrl.protocol !== "https:") {
          throw new Error("HTTPS required");
        }
      } catch {
        return json(
          {
            valid: false,
            message: "SUPABASE_URL is invalid. Check your Cloudflare setting."
          },
          500
        );
      }

      // Read and validate request body
      let body;

      try {
        body = await request.json();
      } catch {
        return json(
          { valid: false, message: "Invalid request. Please try again." },
          400
        );
      }

      const code =
        typeof body?.code === "string"
          ? body.code.trim().toUpperCase()
          : "";

      if (!/^[A-F0-9]{10}$/.test(code)) {
        return json(
          {
            valid: false,
            message: "Enter the 10-character invitation code exactly as provided."
          },
          400
        );
      }

      // Query Supabase for one active invitation
      try {
        const endpoint = new URL(
          "/rest/v1/invitation_codes",
          supabaseUrl
        );

        endpoint.searchParams.set(
          "select",
          "id,application_id,code,status"
        );
        endpoint.searchParams.set("code", `eq.${code}`);
        endpoint.searchParams.set("status", "eq.active");
        endpoint.searchParams.set("limit", "1");

        const response = await fetch(endpoint, {
          method: "GET",
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization:
              `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          // Log status only; never log the secret key or invitation code
          console.error(
            "Supabase invitation lookup failed:",
            response.status
          );

          return json(
            {
              valid: false,
              message:
                "Supabase could not verify the invitation. Check the Worker secret and database configuration."
            },
            502
          );
        }

        const rows = await response.json();

        if (!Array.isArray(rows) || rows.length !== 1) {
          return json(
            {
              valid: false,
              message:
                "That code was not recognized or is no longer active. Please check with the host."
            },
            200
          );
        }

        // Return only the information needed by the participant portal
        return json({
          valid: true,
          application_id: rows[0].application_id
        });
      } catch (error) {
        console.error(
          "Invitation validation request failed:",
          error?.message || "Unknown error"
        );

        return json(
          {
            valid: false,
            message:
              "Unable to verify the invitation right now. Please try again."
          },
          502
        );
      }
    }

    // Serve website assets for all other routes
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
};

// CORS headers for the participant portal
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  };
}

// Standard JSON response helper
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
