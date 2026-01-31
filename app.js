const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const STORAGE_KEY = "reeealbadmon.state.v1";
const BASE_URL_KEY = "reeealbadmon.baseurl";
const DEVICE_ID_KEY = "reeealbadmon.deviceid";
const TEAM_CODE = "REALBADMON";

const deviceId = localStorage.getItem(DEVICE_ID_KEY) || crypto.randomUUID();
localStorage.setItem(DEVICE_ID_KEY, deviceId);

let baseUrl = localStorage.getItem(BASE_URL_KEY) || "https://realbadmon.onrender.com";

const Formation = {
  fourOneTwoOneTwoWide: {
    id: "4-1-2-1-2 Wide",
    positions: ["GK", "LB", "LCB", "RCB", "RB", "CDM", "LM", "RM", "CAM", "ST1", "ST2"],
  },
  threeTwoThreeTwo: {
    id: "3-2-3-2",
    positions: ["GK", "LCB", "CB", "RCB", "LDM", "RDM", "LM", "CAM", "RM", "ST1", "ST2"],
  },
};

const defaultPlayers = ["Ethan", "Mason", "Rafa", "Ezra", "Kai", "Jules", "Santi", "Noah", "Ari", "Diego"];

const state = loadState() ?? seedState();
state.deviceId = deviceId;
state.baseUrl = baseUrl;
state.teamCode = TEAM_CODE;

function seedState() {
  const now = new Date();
  const sessions = [
    {
      id: crypto.randomUUID(),
      title: "Friday Night XI",
      startTime: addHours(now, 3),
      notes: "Show up early for warmup. We’re testing a new formation.",
      formation: Formation.fourOneTwoOneTwoWide.id,
      revealOffsetMinutes: 10,
      rsvpByPlayer: makeInitialRSVP(defaultPlayers),
      votesByPlayer: {},
    },
    {
      id: crypto.randomUUID(),
      title: "Sunday League",
      startTime: addDays(now, 1),
      notes: "Bring your A game.",
      formation: Formation.threeTwoThreeTwo.id,
      revealOffsetMinutes: 10,
      rsvpByPlayer: makeInitialRSVP(defaultPlayers),
      votesByPlayer: {},
    },
  ];

  return {
    sessions,
    announcements: [
      { id: crypto.randomUUID(), title: "Lineup reveal in 30", message: "Keep your phones close. Reveal hits at 8:20.", createdAt: new Date() },
      { id: crypto.randomUUID(), title: "Formation test", message: "We’re trying 4-1-2-1-2 wide today. Vote honestly.", createdAt: new Date() },
      { id: crypto.randomUUID(), title: "Reminder", message: "Warmup 15 mins early.", createdAt: new Date() },
    ],
    feedbackItems: [
      {
        id: crypto.randomUUID(),
        title: "Friday Night XI Feedback",
        videoURL: "https://youtube.com/watch?v=example",
        notes: [
          { id: crypto.randomUUID(), time: "02:12", note: "Press was late — gaps opened in midfield." },
          { id: crypto.randomUUID(), time: "05:40", note: "Great switch to the right, keep it wide." },
          { id: crypto.randomUUID(), time: "11:03", note: "Need a tighter line when we lose possession." },
        ],
        expiresAt: addHours(now, 14),
      },
    ],
    chatMessages: [
      { id: crypto.randomUUID(), sender: "Coach", text: "Welcome to Reeeal Badmon chat.", createdAt: new Date() },
      { id: crypto.randomUUID(), sender: "Ethan", text: "Let’s go.", createdAt: new Date() },
    ],
    currentUserName: "Ethan",
    selectedSessionId: sessions[0].id,
    adminPIN: "4242",
    captainUnlocked: false,
    teamCode: TEAM_CODE,
    deviceId,
    baseUrl
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    parsed.sessions.forEach((s) => (s.startTime = new Date(s.startTime)));
    parsed.announcements.forEach((a) => (a.createdAt = new Date(a.createdAt)));
    parsed.feedbackItems.forEach((f) => (f.expiresAt = new Date(f.expiresAt)));
    parsed.chatMessages.forEach((m) => (m.createdAt = new Date(m.createdAt)));
    return parsed;
  } catch {
    return null;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  syncToServer();
}

function addHours(date, hours) {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function makeInitialRSVP(players) {
  return players.reduce((acc, p) => {
    acc[p] = "Maybe";
    return acc;
  }, {});
}

function getFormationPositions(formationId) {
  return Object.values(Formation).find((f) => f.id === formationId)?.positions || Formation.fourOneTwoOneTwoWide.positions;
}

function revealAt(session) {
  const d = new Date(session.startTime);
  d.setMinutes(d.getMinutes() - session.revealOffsetMinutes);
  return d;
}

function isRevealed(session) {
  return new Date() >= revealAt(session);
}

function statusLabel(session) {
  if (isRevealed(session)) {
    return new Date(session.startTime) < new Date() ? "Completed" : "Lineup Revealed";
  }
  return "Voting Open";
}

function rsvpCounts(session) {
  const values = Object.values(session.rsvpByPlayer);
  return {
    inCount: values.filter((v) => v === "In").length,
    maybeCount: values.filter((v) => v === "Maybe").length,
    outCount: values.filter((v) => v === "Out").length,
  };
}

function eligiblePlayers(session) {
  return Object.entries(session.rsvpByPlayer)
    .filter(([, status]) => status === "In")
    .map(([name]) => name)
    .sort();
}

function lineupFor(session) {
  const positions = getFormationPositions(session.formation);
  const eligible = new Set(eligiblePlayers(session));
  const votesByPosition = {};

  Object.entries(session.votesByPlayer).forEach(([voter, votes]) => {
    if (!eligible.has(voter)) return;
    Object.entries(votes).forEach(([position, candidate]) => {
      if (!eligible.has(candidate)) return;
      votesByPosition[position] ||= {};
      votesByPosition[position][candidate] = (votesByPosition[position][candidate] || 0) + 1;
    });
  });

  const assigned = new Set();
  const lineup = {};

  positions.forEach((pos) => {
    const tally = votesByPosition[pos] || {};
    const sorted = Object.entries(tally).sort((a, b) => {
      if (a[1] === b[1]) return a[0].localeCompare(b[0]);
      return b[1] - a[1];
    });
    let pick = "TBD";
    for (const [candidate] of sorted) {
      if (!assigned.has(candidate)) {
        pick = candidate;
        assigned.add(candidate);
        break;
      }
    }
    lineup[pos] = pick;
  });
  return lineup;
}

function formatTime(date) {
  return date.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function formatClock(date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function render() {
  $("#current-user").textContent = `You: ${state.currentUserName || ""}`;
  renderSessions();
  renderLineup();
  renderFeedChat();
  renderFeedback();
  renderCaptain();
  handleGates();
}

function renderSessions() {
  const container = $("#tab-sessions");
  const sessions = state.sessions;

  const list = sessions.map((s) => {
    const counts = rsvpCounts(s);
    return `
      <div class="session-card ${s.id === state.selectedSessionId ? "active" : ""}" data-session="${s.id}">
        <div class="row">
          <strong>${s.title}</strong>
          <span class="badge">${statusLabel(s).toUpperCase()}</span>
        </div>
        <div class="muted">${formatTime(new Date(s.startTime))}</div>
        <div class="chips">
          <span class="chip">In ${counts.inCount}</span>
          <span class="chip">Maybe ${counts.maybeCount}</span>
          <span class="chip">Out ${counts.outCount}</span>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="grid two">
      <div class="card">
        <h3>Upcoming sessions</h3>
        <div class="grid">
          ${list || "<div class=\"muted\">No sessions yet. Captain can create one.</div>"}
        </div>
      </div>
      <div class="card" id="session-detail"></div>
    </div>
  `;

  $$(".session-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedSessionId = card.dataset.session;
      saveState();
      render();
    });
  });

  renderSessionDetail();
}

function renderSessionDetail() {
  const detail = $("#session-detail");
  const session = state.sessions.find((s) => s.id === state.selectedSessionId);
  if (!session) {
    detail.innerHTML = `<div class="muted">Select a session</div>`;
    return;
  }

  const counts = rsvpCounts(session);
  const current = session.rsvpByPlayer[state.currentUserName] || "Maybe";
  const reveal = revealAt(session);
  const remaining = Math.max(0, Math.floor((reveal - new Date()) / 1000));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  detail.innerHTML = `
    <h3>${session.title}</h3>
    <div class="muted">${formatTime(new Date(session.startTime))} • ${statusLabel(session)}</div>
    <div class="row" style="margin-top:10px;">
      <span class="badge">${isRevealed(session) ? "Reveal unlocked" : `Reveal in ${minutes}m ${seconds}s`}</span>
      <span class="badge">${session.formation}</span>
    </div>

    <div class="card" style="margin-top:12px;">
      <strong>Notes</strong>
      <div class="muted" style="margin-top:6px;">${session.notes || "No notes yet."}</div>
    </div>

    <div class="card" style="margin-top:12px;">
      <strong>RSVP</strong>
      <div class="row" style="margin:10px 0;">
        <button class="btn success rsvp" data-status="In">In</button>
        <button class="btn warn rsvp" data-status="Maybe">Maybe</button>
        <button class="btn danger rsvp" data-status="Out">Out</button>
      </div>
      <div class="chips">
        <span class="chip">In ${counts.inCount}</span>
        <span class="chip">Maybe ${counts.maybeCount}</span>
        <span class="chip">Out ${counts.outCount}</span>
      </div>
    </div>

    <div class="card" style="margin-top:12px;">
      <strong>Your vote</strong>
      <div class="muted" style="margin-top:6px;">${voteHelpText(session, current)}</div>
      <div style="display:grid; gap:8px; margin-top:10px;">
        <button class="btn primary" id="go-vote">Go to Voting</button>
        <button class="btn" id="view-lineup">View Lineup</button>
      </div>
    </div>
  `;

  $$(".rsvp").forEach((btn) => {
    if (btn.dataset.status === current) btn.classList.add("selected");
    btn.addEventListener("click", () => {
      session.rsvpByPlayer[state.currentUserName] = btn.dataset.status;
      saveState();
      render();
    });
  });

  $("#go-vote").addEventListener("click", () => switchTab("sessions", () => renderVoting(session)));
  $("#view-lineup").addEventListener("click", () => switchTab("lineup"));

  renderVoting(session);
}

function voteHelpText(session, current) {
  if (isRevealed(session)) return "Voting is closed. Lineup has been revealed.";
  if (current !== "In") return "RSVP In to vote.";
  return "Vote once per position. Results stay hidden until reveal.";
}

function renderVoting(session) {
  const detail = $("#session-detail");
  const eligible = eligiblePlayers(session);
  const positions = getFormationPositions(session.formation);
  const canVote = !isRevealed(session) && (session.rsvpByPlayer[state.currentUserName] === "In");

  const menu = positions.map((pos) => {
    const current = session.votesByPlayer[state.currentUserName]?.[pos] || "";
    const options = eligible.map((p) => `<option value="${p}" ${p === current ? "selected" : ""}>${p}</option>`).join("");
    return `
      <div class="card">
        <div class="row">
          <strong>${pos}</strong>
          <span class="muted">${current || "Select player"}</span>
        </div>
        <select class="input vote-select" data-pos="${pos}" ${canVote ? "" : "disabled"}>
          <option value="">Select player</option>
          ${options}
        </select>
      </div>
    `;
  }).join("");

  detail.insertAdjacentHTML("beforeend", `
    <div class="card" style="margin-top:12px;">
      <strong>Voting</strong>
      <div class="muted" style="margin-top:6px;">${canVote ? "Select players per position." : "Voting locked."}</div>
      <div class="grid" style="margin-top:10px;">
        ${menu}
      </div>
    </div>
  `);

  $$(".vote-select").forEach((select) => {
    select.addEventListener("change", (e) => {
      const pos = e.target.dataset.pos;
      const candidate = e.target.value;
      session.votesByPlayer[state.currentUserName] ||= {};
      if (candidate) session.votesByPlayer[state.currentUserName][pos] = candidate;
      else delete session.votesByPlayer[state.currentUserName][pos];
      saveState();
    });
  });
}

function renderLineup() {
  const panel = $("#tab-lineup");
  const session = state.sessions.find((s) => s.id === state.selectedSessionId);

  if (!session) {
    panel.innerHTML = `<div class="card">Select a session first.</div>`;
    return;
  }

  if (!isRevealed(session)) {
    panel.innerHTML = `
      <div class="card">
        <h3>Lineup Hidden</h3>
        <div class="muted">Reveal at ${formatClock(revealAt(session))}</div>
      </div>
    `;
    return;
  }

  const lineup = lineupFor(session);
  const rows = getFormationPositions(session.formation)
    .map((pos) => `<div class="row"><strong>${pos}</strong><span>${lineup[pos] || "TBD"}</span></div>`)
    .join("");

  panel.innerHTML = `
    <div class="card">
      <h3>${session.title} — Final XI</h3>
      <div class="muted">Locked at ${formatClock(revealAt(session))}</div>
      <div class="grid" style="margin-top:12px;">
        ${rows}
      </div>
    </div>
  `;
}

function renderFeedChat() {
  const panel = $("#tab-feed");
  panel.innerHTML = `
    <div class="card">
      <div class="row">
        <h3>Feed + Chat</h3>
        <div class="segment">
          <button data-mode="feed" class="mode-btn active">Feed</button>
          <button data-mode="chat" class="mode-btn">Chat</button>
        </div>
      </div>
      <div id="feed-chat-body" style="margin-top:12px;"></div>
    </div>
  `;
  const body = $("#feed-chat-body");

  const renderFeed = () => {
    body.innerHTML = state.announcements.length
      ? state.announcements.map((a) => `
          <div class="card" style="margin-bottom:10px;">
            <strong>${a.title}</strong>
            <div class="muted" style="margin-top:6px;">${a.message}</div>
          </div>
        `).join("")
      : `<div class="muted">No announcements yet.</div>`;
  };

  const renderChat = () => {
    body.innerHTML = `
      <div>
        ${state.chatMessages.map((m) => `
          <div class="chat-bubble ${m.sender === state.currentUserName ? "me" : "them"}">
            <div class="chat-meta">${m.sender}</div>
            <div>${m.text}</div>
          </div>
        `).join("")}
      </div>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <input id="chat-input" class="input" placeholder="Message" />
        <button id="chat-send" class="btn primary">Send</button>
      </div>
    `;
    $("#chat-send").addEventListener("click", () => {
      const input = $("#chat-input");
      const text = input.value.trim();
      if (!text) return;
      state.chatMessages.push({ id: crypto.randomUUID(), sender: state.currentUserName, text, createdAt: new Date() });
      input.value = "";
      saveState();
      renderFeedChat();
    });
  };

  renderFeed();

  $$(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".mode-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (btn.dataset.mode === "feed") renderFeed();
      else renderChat();
    });
  });
}

function renderFeedback() {
  const panel = $("#tab-feedback");
  const active = state.feedbackItems.find((f) => new Date(f.expiresAt) > new Date());
  panel.innerHTML = `
    <div class="card">
      <h3>Video Feedback</h3>
      <div class="muted">${active ? `Expires at ${formatClock(new Date(active.expiresAt))}` : "No active feedback"}</div>
      ${active ? `
        <div class="card" style="margin-top:12px;">
          <strong>${active.title}</strong>
          <div class="muted" style="margin-top:6px;">${active.videoURL}</div>
          <div style="margin-top:10px;"><strong>Key moments</strong></div>
          ${active.notes.map((n) => `<div class="row"><span class="muted">${n.time}</span><span>${n.note}</span></div>`).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderCaptain() {
  const panel = $("#tab-captain");
  if (!state.captainUnlocked) {
    panel.innerHTML = `
      <div class="card">
        <h3>Captain locked</h3>
        <div class="muted">Enter the PIN to unlock</div>
        <button id="open-pin" class="btn primary" style="margin-top:10px;">Enter PIN</button>
      </div>
    `;
    $("#open-pin").addEventListener("click", () => showPinGate());
    return;
  }

  const sessionOptions = state.sessions.map((s) => `<option value="${s.id}">${s.title}</option>`).join("");

  panel.innerHTML = `
    <div class="grid two">
      <div class="card">
        <h3>Create session</h3>
        <div class="grid">
          <input id="new-title" class="input" placeholder="Title" />
          <input id="new-start" class="input" type="datetime-local" />
          <textarea id="new-notes" class="input" placeholder="Notes"></textarea>
          <select id="new-formation" class="input">
            ${Object.values(Formation).map((f) => `<option value="${f.id}">${f.id}</option>`).join("")}
          </select>
          <input id="new-reveal" class="input" type="number" min="5" max="30" step="5" value="10" />
          <button id="create-session" class="btn primary">Create Session</button>
        </div>
      </div>

      <div class="card">
        <h3>Set session</h3>
        <div class="muted">Edit an existing session</div>
        <div class="grid" style="margin-top:10px;">
          <select id="edit-id" class="input">
            <option value="">Select session</option>
            ${sessionOptions}
          </select>
          <input id="edit-title" class="input" placeholder="Title" />
          <input id="edit-start" class="input" type="datetime-local" />
          <textarea id="edit-notes" class="input" placeholder="Notes"></textarea>
          <select id="edit-formation" class="input">
            ${Object.values(Formation).map((f) => `<option value="${f.id}">${f.id}</option>`).join("")}
          </select>
          <input id="edit-reveal" class="input" type="number" min="5" max="30" step="5" />
          <button id="update-session" class="btn">Update Session</button>
        </div>
      </div>

      <div class="card">
        <h3>Send announcement</h3>
        <div class="grid">
          <input id="ann-title" class="input" placeholder="Title" />
          <textarea id="ann-body" class="input" placeholder="Message"></textarea>
          <button id="send-ann" class="btn">Send</button>
        </div>
      </div>

      <div class="card">
        <h3>Coach identity</h3>
        <div class="grid">
          <input id="coach-name" class="input" placeholder="Coach name" />
          <button id="set-coach" class="btn">Set display name to Coach</button>
        </div>
      </div>

      <div class="card">
        <h3>Change PIN</h3>
        <div class="grid">
          <input id="new-pin" class="input" placeholder="New PIN" />
          <button id="update-pin" class="btn">Update PIN</button>
        </div>
      </div>
    </div>
  `;

  $("#create-session").addEventListener("click", () => {
    const title = $("#new-title").value.trim() || "New Session";
    const start = new Date($("#new-start").value || new Date());
    const notes = $("#new-notes").value.trim();
    const formation = $("#new-formation").value;
    const revealOffsetMinutes = Number($("#new-reveal").value || 10);

    const rsvpByPlayer = makeInitialRSVP(Array.from(new Set([...defaultPlayers, state.currentUserName])));

    state.sessions.unshift({
      id: crypto.randomUUID(),
      title,
      startTime: start,
      notes,
      formation,
      revealOffsetMinutes,
      rsvpByPlayer,
      votesByPlayer: {},
    });
    state.selectedSessionId = state.sessions[0].id;
    saveState();
    render();
  });

  $("#edit-id").addEventListener("change", (e) => {
    const session = state.sessions.find((s) => s.id === e.target.value);
    if (!session) return;
    $("#edit-title").value = session.title;
    $("#edit-start").value = toDateTimeLocal(new Date(session.startTime));
    $("#edit-notes").value = session.notes;
    $("#edit-formation").value = session.formation;
    $("#edit-reveal").value = session.revealOffsetMinutes;
  });

  $("#update-session").addEventListener("click", () => {
    const id = $("#edit-id").value;
    if (!id) return;
    const session = state.sessions.find((s) => s.id === id);
    if (!session) return;
    session.title = $("#edit-title").value.trim() || session.title;
    session.startTime = new Date($("#edit-start").value || session.startTime);
    session.notes = $("#edit-notes").value.trim();
    session.formation = $("#edit-formation").value;
    session.revealOffsetMinutes = Number($("#edit-reveal").value || session.revealOffsetMinutes);
    saveState();
    render();
  });

  $("#send-ann").addEventListener("click", () => {
    const title = $("#ann-title").value.trim();
    const message = $("#ann-body").value.trim();
    if (!title || !message) return;
    state.announcements.unshift({ id: crypto.randomUUID(), title, message, createdAt: new Date() });
    $("#ann-title").value = "";
    $("#ann-body").value = "";
    saveState();
    renderFeedChat();
  });

  $("#set-coach").addEventListener("click", () => {
    const name = $("#coach-name").value.trim() || "Coach";
    state.currentUserName = name;
    saveState();
    render();
  });

  $("#update-pin").addEventListener("click", () => {
    const pin = $("#new-pin").value.trim();
    if (!pin) return;
    state.adminPIN = pin;
    $("#new-pin").value = "";
    saveState();
  });
}

function switchTab(tabId, callback) {
  $$(".tab").forEach((t) => t.classList.remove("active"));
  $$(".tab-panel").forEach((p) => p.classList.remove("active"));
  $(`.tab[data-tab='${tabId}']`).classList.add("active");
  $(`#tab-${tabId}`).classList.add("active");
  if (callback) callback();
}

function handleTabs() {
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
}

function handleGates() {
  const nameGate = $("#name-gate");
  const pinGate = $("#pin-gate");

  if (nameGate) {
    if (!state.currentUserName) {
      nameGate.classList.remove("hidden");
    } else {
      nameGate.classList.add("hidden");
    }
  }

  if (pinGate && state.captainUnlocked) {
    pinGate.classList.add("hidden");
  }
}

function applyServerState(serverState) {
  state.sessions = (serverState.sessions || []).map((s) => ({
    ...s,
    startTime: new Date(s.startTime),
  }));
  state.announcements = (serverState.announcements || []).map((a) => ({
    ...a,
    createdAt: new Date(a.createdAt),
  }));
  state.feedbackItems = (serverState.feedbackItems || []).map((f) => ({
    ...f,
    expiresAt: new Date(f.expiresAt),
  }));
  state.chatMessages = (serverState.chatMessages || []).map((m) => ({
    ...m,
    createdAt: new Date(m.createdAt),
  }));
  state.selectedSessionId = serverState.selectedSessionId || state.sessions[0]?.id || "";
  state.adminPIN = serverState.adminPIN || state.adminPIN;
  saveState();
}

async function syncToServer() {
  try {
    await fetch(`${state.baseUrl}/teams/${TEAM_CODE}/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId,
        name: state.currentUserName || "Player",
        state: {
          sessions: state.sessions,
          announcements: state.announcements,
          feedbackItems: state.feedbackItems,
          chatMessages: state.chatMessages,
          selectedSessionId: state.selectedSessionId,
          adminPIN: state.adminPIN,
        },
      }),
    });
  } catch {
    // silent offline fail
  }
}

async function syncFromServer() {
  try {
    const res = await fetch(`${state.baseUrl}/teams/${TEAM_CODE}/state`);
    if (!res.ok) return;
    const data = await res.json();
    applyServerState(data.state || {});
    render();
  } catch {
    // ignore
  }
}

function showPinGate() {
  $("#pin-gate").classList.remove("hidden");
}

function setupGates() {
  const nameSave = $("#name-save");
  if (nameSave) {
    nameSave.addEventListener("click", () => {
      const name = $("#name-input").value.trim();
      if (!name) return;
      state.currentUserName = name;
      saveState();
      render();
    });
  }

  const pinUnlock = $("#pin-unlock");
  if (pinUnlock) {
    pinUnlock.addEventListener("click", () => {
      const pin = $("#pin-input").value.trim();
      if (pin === state.adminPIN) {
        state.captainUnlocked = true;
        $("#pin-error").textContent = "";
        $("#pin-gate").classList.add("hidden");
        saveState();
        render();
      } else {
        $("#pin-error").textContent = "Incorrect PIN";
      }
    });
  }

}

function toDateTimeLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

handleTabs();
setupGates();
render();
setInterval(() => renderSessions(), 1000);
setInterval(() => syncFromServer(), 10000);
syncFromServer();
