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
    lastUpdated: new Date().toISOString(),
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
  if (!res.ok) {
    const text = await res.text();
    return { error: text || "Supabase get failed" };
  }
  const data = await res.json();
  return { data: data[0] || null };
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
  if (!res.ok) {
    const text = await res.text();
    return { error: text || "Supabase upsert failed" };
  }
  const data = await res.json();
  return { data: data[0] || null };
}

function applyAction(current, action, data) {
  const state = { ...current };
  switch (action) {
    case "createSession": {
      state.sessions = [data.session, ...(state.sessions || [])];
      state.selectedSessionId = data.session.id;
      return state;
    }
    case "updateSession": {
      state.sessions = (state.sessions || []).map((s) => (s.id === data.session.id ? data.session : s));
      return state;
    }
    case "addAnnouncement": {
      state.announcements = [data.announcement, ...(state.announcements || [])];
      return state;
    }
    case "addFeedback": {
      state.feedbackItems = [data.feedback, ...(state.feedbackItems || [])];
      return state;
    }
    case "addChat": {
      state.chatMessages = [...(state.chatMessages || []), data.message];
      return state;
    }
    case "updateRSVP": {
      state.sessions = (state.sessions || []).map((s) => {
        if (s.id !== data.sessionId) return s;
        return {
          ...s,
          rsvpByPlayer: { ...(s.rsvpByPlayer || {}), [data.player]: data.status },
        };
      });
      return state;
    }
    case "vote": {
      state.sessions = (state.sessions || []).map((s) => {
        if (s.id !== data.sessionId) return s;
        const votesByPlayer = { ...(s.votesByPlayer || {}) };
        const playerVotes = { ...(votesByPlayer[data.player] || {}) };
        if (data.candidate) {
          playerVotes[data.position] = data.candidate;
        } else {
          delete playerVotes[data.position];
        }
        votesByPlayer[data.player] = playerVotes;
        return { ...s, votesByPlayer };
      });
      return state;
    }
    case "updateAdminPIN": {
      state.adminPIN = data.adminPIN || state.adminPIN;
      return state;
    }
    case "resetState": {
      if (!data || data.adminPIN !== state.adminPIN) return null;
      return defaultState();
    }
    default:
      return null;
  }
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
      while (existing?.data) {
        code = randomCode();
        existing = await supabaseGetTeam(code);
      }
      const created = await supabaseUpsertTeam(code, defaultState());
      if (created?.error) return json(res, 500, { error: created.error });
      return json(res, 200, { teamCode: code, state: created?.data?.state || defaultState() });
    }
    return json(res, 500, { error: "Supabase not configured" });
  }

  if (parts[0] === "teams" && parts[1]) {
    const code = parts[1].toUpperCase();
    if (req.method === "GET" && parts[2] === "state") {
      if (!hasSupabase) return json(res, 500, { error: "Supabase not configured" });
      const teamRes = await supabaseGetTeam(code);
      if (teamRes?.error) return json(res, 500, { error: teamRes.error });
      if (!teamRes?.data) {
        return json(res, 404, { error: "Team not found" });
      }
      return json(res, 200, { teamCode: code, state: teamRes.data.state });
    }

    if (req.method === "PUT" && parts[2] === "state") {
      return json(res, 405, { error: "PUT /state disabled. Use /action." });
    }

    if (req.method === "POST" && parts[2] === "action") {
      if (!hasSupabase) return json(res, 500, { error: "Supabase not configured" });
      const body = await parseBody(req);
      if (!body.action) return json(res, 400, { error: "Missing action" });
      const currentRes = await supabaseGetTeam(code);
      if (currentRes?.error) return json(res, 500, { error: currentRes.error });
      const baseState = currentRes?.data?.state || defaultState();
      const nextState = applyAction(baseState, body.action, body.data || {});
      if (!nextState) return json(res, 400, { error: "Unknown action" });
      const baseSessions = baseState.sessions || [];
      const nextSessions = nextState.sessions || [];
      if (baseSessions.length && nextSessions.length < baseSessions.length && body.action !== "resetState") {
        return json(res, 200, { teamCode: code, state: baseState, ignored: true });
      }
      nextState.lastUpdated = new Date().toISOString();
      const updated = await supabaseUpsertTeam(code, nextState);
      if (updated?.error) return json(res, 500, { error: updated.error });
      return json(res, 200, { teamCode: code, state: updated?.data?.state || nextState });
    }
  }

  return json(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
