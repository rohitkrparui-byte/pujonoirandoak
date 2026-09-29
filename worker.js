
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Host-Key",
  "Cache-Control": "no-store"
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8"
    }
  });

const enc = encodeURIComponent;
const now = () => new Date().toISOString();

async function db(env, path, method = "GET", body, prefer) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are missing.");
  }

  const endpoint = new URL("/rest/v1/" + path, url);

  const response = await fetch(endpoint, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: prefer || "return=representation"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();

  if (!response.ok) {
    console.error("Supabase error:", response.status, text);
    throw new Error(`Database request failed (${response.status}).`);
  }

  return text ? JSON.parse(text) : [];
}

async function question(env, round, order) {
  const rows = await db(
    env,
    `game_questions?select=round_number,question_order,category,prompt,timer_seconds&round_number=eq.${round}&question_order=eq.${order}&is_active=eq.true&limit=1`
  );
  return rows[0] || null;
}

async function publishQuestion(env, round, order) {
  const q = await question(env, round, order);
  if (!q) return null;

  const started = now();
  const deadline = new Date(
    Date.now() + Number(q.timer_seconds || 60) * 1000
  ).toISOString();

  await db(
    env,
    "game_state?id=eq.1",
    "PATCH",
    {
      status: "live",
      round_number: round,
      question_order: order,
      prompt: q.prompt,
      round_started_at: started,
      deadline_at: deadline,
      updated_at: started
    }
  );

  return { ...q, deadline_at: deadline };
}

async function validateInvite(env, request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ valid: false, message: "Invalid JSON request." }, 400);
  }

  const code = typeof body?.code === "string"
    ? body.code.trim().toUpperCase()
    : "";

  if (!/^[A-F0-9]{10}$/.test(code)) {
    return json({
      valid: false,
      message: "Enter the 10-character invitation code exactly as provided."
    }, 400);
  }

  const rows = await db(
    env,
    `invitation_codes?select=id,application_id,code,status&code=eq.${enc(code)}&status=eq.active&limit=1`
  );

  if (rows.length !== 1) {
    return json({
      valid: false,
      message: "That code was not recognized or is no longer active."
    }, 404);
  }

  return json({ valid: true });
}

async function gameApi(env, request) {
  let b;
  try {
    b = await request.json();
  } catch {
    return json({ error: "Invalid JSON request." }, 400);
  }

  const action = String(b.action || "");
  const hostActions = [
    "host_state",
    "create_session",
    "set_round",
    "start_game",
    "next_question",
    "reveal",
    "score",
    "finish"
  ];

  if (hostActions.includes(action)) {
    if (
      !env.HOST_ACCESS_KEY ||
      request.headers.get("x-host-key") !== env.HOST_ACCESS_KEY
    ) {
      return json({ error: "Host authorization failed." }, 401);
    }
  }

  try {
    // Player actions
    if (
      action === "join" ||
      action === "player_state" ||
      action === "submit_answer"
    ) {
      const code = String(b.code || "").trim().toUpperCase();

      if (!/^[A-F0-9]{10}$/.test(code)) {
        return json({
          error: "Enter your 10-character invitation code."
        }, 400);
      }

      const invitations = await db(
        env,
        `invitation_codes?select=application_id&code=eq.${enc(code)}&status=eq.active&limit=1`
      );

      if (!invitations.length) {
        return json({
          error: "Invitation code is invalid or inactive."
        }, 404);
      }

      const appid = invitations[0].application_id;

      if (action === "submit_answer") {
        const answer = String(b.answer || "").trim().slice(0, 1000);

        if (!answer) {
          return json({ error: "Please enter an answer." }, 400);
        }

        const states = await db(
          env,
          "game_state?select=status,round_number,question_order,deadline_at&limit=1"
        );
        const state = states[0];

        if (!state || state.status !== "live") {
          return json({
            error: "The host has not opened a live question."
          }, 409);
        }

        if (
          state.deadline_at &&
          Date.now() > Date.parse(state.deadline_at)
        ) {
          return json({
            error: "Time is up for this question."
          }, 409);
        }

        const prior = await db(
          env,
          `game_answers?select=id&application_id=eq.${enc(appid)}&round_number=eq.${state.round_number}&question_order=eq.${state.question_order}&limit=1`
        );

        if (prior.length) {
          return json({
            error: "Your answer for this question is already submitted."
          }, 409);
        }

        await db(env, "game_answers", "POST", {
          application_id: appid,
          round_number: state.round_number,
          question_order: state.question_order,
          answer
        });

        return json({
          ok: true,
          message: "Answer submitted. Wait for the next question."
        });
      }

      const states = await db(
        env,
        "game_state?select=id,session_name,status,round_number,question_order,prompt,round_started_at,deadline_at,total_questions,updated_at&limit=1"
      );
      const state = states[0] || null;

      const scores = await db(
        env,
        `game_scores?select=points&application_id=eq.${enc(appid)}`
      );

      const result = {
        state,
        points: scores.reduce(
          (sum, item) => sum + Number(item.points || 0),
          0
        )
      };

      if (action === "join") {
        const apps = await db(
          env,
          `applications?select=id,name,partner&id=eq.${enc(appid)}&status=eq.approved&limit=1`
        );

        if (!apps.length) {
          return json({
            error: "Your application is not approved yet."
          }, 403);
        }

        result.valid = true;
        result.team = apps[0];
      } else {
        const answers = await db(
          env,
          `game_answers?select=id,round_number,question_order,answer,submitted_at&application_id=eq.${enc(appid)}&order=submitted_at.desc&limit=1`
        );
        result.lastAnswer = answers[0] || null;
      }

      return json(result);
    }

    // Host dashboard state
    if (action === "host_state") {
      const states = await db(env, "game_state?select=*&limit=1");
      const state = states[0] || null;

      const teams = await db(
        env,
        "applications?select=id,name,partner,status&status=eq.approved&order=created_at.asc"
      );

      const scores = await db(
        env,
        "game_scores?select=application_id,points"
      );

      const answers = await db(
        env,
        "game_answers?select=id,application_id,round_number,question_order,answer,submitted_at&order=submitted_at.asc"
      );

      const questions = await db(
        env,
        "game_questions?select=round_number,question_order,category,prompt,timer_seconds&is_active=eq.true&order=round_number.asc,question_order.asc"
      );

      return json({
        state,
        teams: teams.map(team => ({
          ...team,
          points: scores
            .filter(score => score.application_id === team.id)
            .reduce(
              (sum, score) => sum + Number(score.points || 0),
              0
            )
        })),
        answers,
        questions
      });
    }

    // Create/reset game session
    if (action === "create_session") {
      await db(
        env,
        "game_state?on_conflict=id",
        "POST",
        {
          id: 1,
          session_name: String(
            b.session_name || "Pujo Secret Society"
          ).slice(0, 100),
          status: "waiting",
          round_number: 0,
          question_order: 0,
          prompt: "",
          round_started_at: null,
          deadline_at: null,
          total_questions: 20,
          updated_at: now()
        },
        "resolution=merge-duplicates,return=representation"
      );

      return json({ ok: true });
    }

    // Start game
    if (action === "start_game") {
      const q = await publishQuestion(env, 1, 1);

      if (!q) {
        return json({
          error: "No active questions found. Check game_questions in Supabase."
        }, 409);
      }

      return json({ ok: true, question: q });
    }

    // Advance to next question
    if (action === "next_question") {
      const states = await db(
        env,
        "game_state?select=round_number,question_order,status&limit=1"
      );
      const state = states[0];

      if (!state) {
        return json({ error: "Create a session first." }, 409);
      }

      const nextOrder = Number(state.question_order || 0) + 1;
      const nextRound =
        Number(state.round_number || 0) + (nextOrder > 4 ? 1 : 0);
      const order = nextOrder > 4 ? 1 : nextOrder;

      if (nextRound > 5) {
        await db(
          env,
          "game_state?id=eq.1",
          "PATCH",
          {
            status: "finished",
            deadline_at: null,
            updated_at: now()
          }
        );

        return json({ ok: true, finished: true });
      }

      const q = await publishQuestion(env, nextRound, order);

      if (!q) {
        return json({
          error: "Next question is missing from the question bank."
        }, 409);
      }

      return json({ ok: true, question: q });
    }

    // Set a custom round prompt
    if (action === "set_round") {
      const round = Math.max(
        1,
        Math.min(5, Number(b.round_number) || 1)
      );
      const order = Math.max(
        1,
        Math.min(4, Number(b.question_order) || 1)
      );
      const prompt = String(b.prompt || "").trim().slice(0, 1000);

      if (!prompt) {
        return json({ error: "Add a round prompt." }, 400);
      }

      const started = now();

      await db(
        env,
        "game_state?id=eq.1",
        "PATCH",
        {
          status: "live",
          round_number: round,
          question_order: order,
          prompt,
          round_started_at: started,
          deadline_at: new Date(Date.now() + 60000).toISOString(),
          updated_at: started
        }
      );

      return json({ ok: true });
    }

    // Reveal results
    if (action === "reveal") {
      await db(
        env,
        "game_state?id=eq.1",
        "PATCH",
        {
          status: "revealed",
          deadline_at: null,
          updated_at: now()
        }
      );

      return json({ ok: true });
    }

    // Finish game
    if (action === "finish") {
      await db(
        env,
        "game_state?id=eq.1",
        "PATCH",
        {
          status: "finished",
          deadline_at: null,
          updated_at: now()
        }
      );

      return json({ ok: true });
    }

    // Award points
    if (action === "score") {
      const application_id = String(b.application_id || "");
      const points = Math.max(
        -100,
        Math.min(100, Number(b.points) || 0)
      );

      if (!application_id) {
        return json({ error: "Select a couple." }, 400);
      }

      await db(env, "game_scores", "POST", {
        application_id,
        points,
        note: String(b.note || "Host award").slice(0, 150)
      });

      return json({ ok: true });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error("Game API error:", error);
    return json({
      error: error.message || "Server error."
    }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (path === "/.netlify/functions/validate-invite" ||
        path === "/netlify/functions/validate-invite") {
      if (request.method !== "POST") {
        return json({ valid: false, message: "POST required." }, 405);
      }

      try {
        return await validateInvite(env, request);
      } catch (error) {
        console.error("Invitation validation error:", error);
        return json({
          valid: false,
          message: "Unable to verify the invitation right now."
        }, 500);
      }
    }

    if (path === "/.netlify/functions/game-api" ||
        path === "/netlify/functions/game-api" ||
        path === "/api/game") {
      if (request.method !== "POST") {
        return json({ error: "POST required." }, 405);
      }

      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        return json({
          error: "Supabase environment variables are missing."
        }, 500);
      }

      return gameApi(env, request);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  }
};
