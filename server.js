const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8787;
const DATA_PATH = path.join(__dirname, "data.json");

function readData() {
  if (!fs.existsSync(DATA_PATH)) {
    return { teams: {} };
  }
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return { teams: {} };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

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
    const data = readData();
    let code = randomCode();
    while (data.teams[code]) code = randomCode();
    data.teams[code] = {
      teamCode: code,
      adminDeviceId: body.deviceId || "",
      members: body.deviceId ? { [body.deviceId]: { name: body.name || "Captain" } } : {},
      state: defaultState(),
      createdAt: new Date().toISOString(),
    };
    writeData(data);
    return json(res, 200, { teamCode: code, state: data.teams[code].state });
  }

  if (parts[0] === "teams" && parts[1]) {
    const code = parts[1].toUpperCase();
    const data = readData();
    const team = data.teams[code];

    if (!team) {
      return json(res, 404, { error: "Team not found" });
    }

    if (req.method === "GET" && parts[2] === "state") {
      return json(res, 200, { teamCode: code, state: team.state });
    }

    if (req.method === "POST" && parts[2] === "join") {
      const body = await parseBody(req);
      if (body.deviceId) {
        team.members[body.deviceId] = { name: body.name || "Player" };
      }
      writeData(data);
      return json(res, 200, { teamCode: code, state: team.state });
    }

    if (req.method === "PUT" && parts[2] === "state") {
      const body = await parseBody(req);
      if (body.deviceId && body.name) {
        team.members[body.deviceId] = { name: body.name };
      }
      team.state = { ...team.state, ...body.state };
      writeData(data);
      return json(res, 200, { ok: true });
    }
  }

  return json(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
