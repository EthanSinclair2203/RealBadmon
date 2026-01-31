const http = require("http");
const PORT = process.env.PORT || 8787;
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const hasSupabase = SUPABASE_URL && SUPABASE_SERVICE_KEY;

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function randomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function defaultState() {
  return {
    sessions: [],
    announcements: [],
    feedbackItems: [],
    chatMessages: [],
    selectedSessionId: "",
    adminPIN: "4242",
  };
}

async function supabaseGetTeam(code) {
  const url = `${SUPABASE_URL}/rest/v1/team_state?team_code=eq.${encodeURIComponent(code)}&select=team_code,state,created_at,updated_at`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data[0] || null;
}

async function supabaseUpsertTeam(code, state) {
  const url = `${SUPABASE_URL}/rest/v1/team_state`;
  const payload = {
    team_code: code,
    state,
    updated_at: new Date().toISOString(),
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data[0] || null;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return json(res, 200, {});
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/teams") {
    const body = await parseBody(req);
    let code = randomCode();
    if (hasSupabase) {
      let existing = await supabaseGetTeam(code);
      while (existing) {
        code = randomCode();
        existing = await supabaseGetTeam(code);
      }
      const created = await supabaseUpsertTeam(code, defaultState());
      return json(res, 200, { teamCode: code, state: created?.state || defaultState() });
    }
    return json(res, 500, { error: "Supabase not configured" });
  }

  if (parts[0] === "teams" && parts[1]) {
    const code = parts[1].toUpperCase();
    if (req.method === "GET" && parts[2] === "state") {
      if (!hasSupabase) return json(res, 500, { error: "Supabase not configured" });
      let team = await supabaseGetTeam(code);
      if (!team) {
        team = await supabaseUpsertTeam(code, defaultState());
      }
      return json(res, 200, { teamCode: code, state: team?.state || defaultState() });
    }

    if (req.method === "PUT" && parts[2] === "state") {
      if (!hasSupabase) return json(res, 500, { error: "Supabase not configured" });
      const body = await parseBody(req);
      const current = await supabaseGetTeam(code);
      const mergedState = { ...(current?.state || defaultState()), ...(body.state || {}) };
      await supabaseUpsertTeam(code, mergedState);
      return json(res, 200, { ok: true });
    }
  }

  return json(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
