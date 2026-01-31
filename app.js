const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const STORAGE_KEY = "reeealbadmon.state.v1";
const LOCAL_KEY = "reeealbadmon.local.v1";
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

const defaultPlayers = [];

const state = loadState() ?? seedState();
applyLocalSettings();
state.syncStatus = state.syncStatus || "idle";
state.syncError = state.syncError || "";
state.lastServerSessions = state.lastServerSessions || 0;
state.deviceId = deviceId;
state.baseUrl = baseUrl;
state.teamCode = TEAM_CODE;
state.lastUpdated = state.lastUpdated || new Date().toISOString();
state.sessionsView = state.sessionsView || "list";

const captainDraft = {
  title: "",
  date: "",
  time: "",
  notes: "",
  formation: Formation.fourOneTwoOneTwoWide.id,
  revealOffsetMinutes: 10,
  editId: "",
  editTitle: "",
  editDate: "",
  editTime: "",
  editNotes: "",
  editFormation: Formation.fourOneTwoOneTwoWide.id,
  editRevealOffsetMinutes: 10,
  feedbackTitle: "",
  feedbackYouTube: "",
  feedbackDrive: "",
  feedbackTime: "",
  feedbackNote: "",
};

function seedState() {
  const now = new Date();
  const sessions = [];

  return {
    sessions,
    announcements: [],
    feedbackItems: [],
    chatMessages: [],
    currentUserName: "",
    selectedSessionId: "",
    adminPIN: "4242",
    captainUnlocked: false,
    sessionsView: "list",
    teamCode: TEAM_CODE,
    deviceId,
    baseUrl,
    lastUpdated: now.toISOString()
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

function applyLocalSettings() {
  const raw = localStorage.getItem(LOCAL_KEY);
  if (!raw) return;
  try {
    const local = JSON.parse(raw);
    if (typeof local.currentUserName === "string") state.currentUserName = local.currentUserName;
    if (typeof local.captainUnlocked === "boolean") state.captainUnlocked = local.captainUnlocked;
    if (typeof local.sessionsView === "string") state.sessionsView = local.sessionsView;
  } catch {
    // ignore
  }
}

function saveLocalSettings() {
  const payload = {
    currentUserName: state.currentUserName || "",
    captainUnlocked: state.captainUnlocked || false,
    sessionsView: state.sessionsView || "list",
  };
  localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
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

function toYouTubeEmbed(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace("/", "");
      return id ? `https://www.youtube.com/embed/${id}` : "";
    }
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : "";
    }
  } catch {
    return "";
  }
  return "";
}

function toDriveEmbed(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("drive.google.com")) return "";
    const parts = u.pathname.split("/");
    const fileIndex = parts.indexOf("d");
    if (fileIndex !== -1 && parts[fileIndex + 1]) {
      return `https://drive.google.com/file/d/${parts[fileIndex + 1]}/preview`;
    }
  } catch {
    return "";
  }
  return "";
}

function render() {
  $("#current-user").textContent = `You: ${state.currentUserName || ""}`;
  const statusEl = $("#sync-status");
  if (statusEl) {
    const localCount = state.sessions ? state.sessions.length : 0;
    const serverCount = state.lastServerSessions ?? 0;
    statusEl.textContent = state.syncStatus === "error" ? `Sync error` : `Sync ok (${localCount}/${serverCount})`;
    statusEl.className = `user-pill ${state.syncStatus === "error" ? "pill-error" : "pill-ok"}`;
  }
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
  const isMobile = window.innerWidth <= 600;
  const emptyMessage = '<div class="muted">No sessions yet. Captain can create one.</div>';
  const activeEl = document.activeElement;
  if (activeEl && ["INPUT", "SELECT", "TEXTAREA"].includes(activeEl.tagName)) {
    return;
  }

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

  if (isMobile) {
    const showingDetail = state.sessionsView === "detail" && state.selectedSessionId;
    container.innerHTML = `
      <div class="card">
        <div class="row">
          <h3>${showingDetail ? "Session" : "Upcoming sessions"}</h3>
          ${showingDetail ? `<button id="back-to-list" class="btn">Back</button>` : ""}
        </div>
        <div class="grid">
          ${showingDetail ? `<div id="session-detail"></div>` : (list || emptyMessage)}
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="grid two">
        <div class="card">
          <h3>Upcoming sessions</h3>
          <div class="grid">
            ${list || emptyMessage}
          </div>
        </div>
        <div class="card" id="session-detail"></div>
      </div>
    `;
  }

  $$(".session-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedSessionId = card.dataset.session;
      state.sessionsView = isMobile ? "detail" : state.sessionsView;
      saveLocalSettings();
      render();
    });
  });

  if (isMobile && state.sessionsView === "detail") {
    const back = $("#back-to-list");
    if (back) {
      back.addEventListener("click", () => {
        state.sessionsView = "list";
        saveLocalSettings();
        render();
      });
    }
  }

  renderSessionDetail();
}

function renderSessionDetail() {
  const detail = $("#session-detail");
  if (!detail) return;
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
    <div class="muted">${formatTime(new Date(session.startTime))} - ${statusLabel(session)}</div>
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
    btn.addEventListener("click", async () => {
      session.rsvpByPlayer[state.currentUserName] = btn.dataset.status;
      const res = await apiAction("updateRSVP", {
        sessionId: session.id,
        player: state.currentUserName,
        status: btn.dataset.status,
      });
      if (!res) await forceSyncState();
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
  const positions = getFormationPositions(session.formation).slice().reverse();
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
    select.addEventListener("change", async (e) => {
      const pos = e.target.dataset.pos;
      const candidate = e.target.value;
      session.votesByPlayer[state.currentUserName] ||= {};
      if (candidate) session.votesByPlayer[state.currentUserName][pos] = candidate;
      else delete session.votesByPlayer[state.currentUserName][pos];
      const res = await apiAction("vote", {
        sessionId: session.id,
        player: state.currentUserName,
        position: pos,
        candidate: candidate || "",
      });
      if (!res) await forceSyncState();
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
  const rows = getFormationPositions(session.formation).slice().reverse()
    .map((pos) => `<div class="row"><strong>${pos}</strong><span>${lineup[pos] || "TBD"}</span></div>`)
    .join("");

  panel.innerHTML = `
    <div class="card">
      <h3>${session.title} - Final XI</h3>
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
    $("#chat-send").addEventListener("click", async () => {
      const input = $("#chat-input");
      const text = input.value.trim();
      if (!text) return;
      const message = { id: crypto.randomUUID(), sender: state.currentUserName, text, createdAt: new Date() };
      state.chatMessages.push(message);
      input.value = "";
      const res = await apiAction("addChat", { message });
      if (!res) await forceSyncState();
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
  const youTubeEmbed = active?.videoURL ? toYouTubeEmbed(active.videoURL) : "";
  const driveEmbed = active?.driveURL ? toDriveEmbed(active.driveURL) : "";
  panel.innerHTML = `
    <div class="card">
      <h3>Feedback</h3>
      <div class="muted">${active ? `Expires at ${formatClock(new Date(active.expiresAt))}` : "No active feedback"}</div>
      ${active ? `
        <div class="card" style="margin-top:12px;">
          <strong>${active.title}</strong>
          ${active.videoURL ? `<div class="muted" style="margin-top:6px;">YouTube: <a href="${active.videoURL}" target="_blank" rel="noopener">${active.videoURL}</a></div>` : ""}
          ${active.driveURL ? `<div class="muted" style="margin-top:6px;">Drive: <a href="${active.driveURL}" target="_blank" rel="noopener">${active.driveURL}</a></div>` : ""}
          ${youTubeEmbed ? `<div class="video-frame"><iframe src="${youTubeEmbed}" title="YouTube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>` : ""}
          ${driveEmbed ? `<div class="video-frame"><iframe src="${driveEmbed}" title="Drive video" allow="autoplay"></iframe></div>` : ""}
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

  if (!captainDraft.date) {
    const now = new Date();
    captainDraft.date = now.toISOString().slice(0, 10);
    captainDraft.time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }

  panel.innerHTML = `
    <div class="grid two">
      <div class="card">
        <h3>Create session</h3>
        <div class="grid">
          <input id="new-title" class="input" placeholder="Title" value="${escapeHtml(captainDraft.title)}" />
          <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 8px;">
            <input id="new-date" class="input" type="date" value="${captainDraft.date}" />
            <input id="new-time" class="input" type="time" value="${captainDraft.time}" />
          </div>
          <textarea id="new-notes" class="input" placeholder="Notes">${escapeHtml(captainDraft.notes)}</textarea>
          <select id="new-formation" class="input">
            ${Object.values(Formation).map((f) => `<option value="${f.id}" ${f.id === captainDraft.formation ? "selected" : ""}>${f.id}</option>`).join("")}
          </select>
          <input id="new-reveal" class="input" type="number" min="5" max="30" step="5" value="${captainDraft.revealOffsetMinutes}" />
          <button id="create-session" class="btn primary">Create Session</button>
        </div>
      </div>

      <div class="card">
        <h3>Set session</h3>
        <div class="muted">Edit an existing session</div>
        <div class="grid" style="margin-top:10px;">
          <select id="edit-id" class="input">
            <option value="">Select session</option>
            ${state.sessions.map((s) => `<option value="${s.id}" ${s.id === captainDraft.editId ? "selected" : ""}>${s.title}</option>`).join("")}
          </select>
          <input id="edit-title" class="input" placeholder="Title" value="${escapeHtml(captainDraft.editTitle)}" />
          <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 8px;">
            <input id="edit-date" class="input" type="date" value="${captainDraft.editDate}" />
            <input id="edit-time" class="input" type="time" value="${captainDraft.editTime}" />
          </div>
          <textarea id="edit-notes" class="input" placeholder="Notes">${escapeHtml(captainDraft.editNotes)}</textarea>
          <select id="edit-formation" class="input">
            ${Object.values(Formation).map((f) => `<option value="${f.id}" ${f.id === captainDraft.editFormation ? "selected" : ""}>${f.id}</option>`).join("")}
          </select>
          <input id="edit-reveal" class="input" type="number" min="5" max="30" step="5" value="${captainDraft.editRevealOffsetMinutes}" />
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
        <h3>Post feedback</h3>
        <div class="grid">
          <input id="fb-title" class="input" placeholder="Title" value="${escapeHtml(captainDraft.feedbackTitle)}" />
          <input id="fb-youtube" class="input" placeholder="YouTube link (optional)" value="${escapeHtml(captainDraft.feedbackYouTube)}" />
          <input id="fb-drive" class="input" placeholder="Google Drive link (optional)" value="${escapeHtml(captainDraft.feedbackDrive)}" />
          <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 8px;">
            <input id="fb-time" class="input" placeholder="Timestamp (e.g. 02:12)" value="${escapeHtml(captainDraft.feedbackTime)}" />
            <input id="fb-note" class="input" placeholder="Note" value="${escapeHtml(captainDraft.feedbackNote)}" />
          </div>
          <button id="post-feedback" class="btn">Post Feedback</button>
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

  $("#create-session").addEventListener("click", async () => {
    const title = $("#new-title").value.trim() || "New Session";
    const date = $("#new-date").value;
    const time = $("#new-time").value;
    const start = combineDateTime(date, time) || new Date();
    const notes = $("#new-notes").value.trim();
    const formation = $("#new-formation").value;
    const revealOffsetMinutes = Number($("#new-reveal").value || 10);

    const rsvpByPlayer = makeInitialRSVP(Array.from(new Set([...defaultPlayers, state.currentUserName])));

    const session = {
      id: crypto.randomUUID(),
      title,
      startTime: start,
      notes,
      formation,
      revealOffsetMinutes,
      rsvpByPlayer,
      votesByPlayer: {},
    };
    state.sessions.unshift(session);
    state.selectedSessionId = session.id;
    const res = await apiAction("createSession", { session });
    if (!res) {
      await forceSyncState();
    }
    captainDraft.title = "";
    captainDraft.notes = "";
    render();
  });

  $("#edit-id").addEventListener("change", (e) => {
    const session = state.sessions.find((s) => s.id === e.target.value);
    if (!session) return;
    const dt = new Date(session.startTime);
    captainDraft.editId = session.id;
    captainDraft.editTitle = session.title;
    captainDraft.editDate = dt.toISOString().slice(0, 10);
    captainDraft.editTime = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
    captainDraft.editNotes = session.notes;
    captainDraft.editFormation = session.formation;
    captainDraft.editRevealOffsetMinutes = session.revealOffsetMinutes;
    renderCaptain();
  });

  $("#update-session").addEventListener("click", async () => {
    const id = $("#edit-id").value;
    if (!id) return;
    const session = state.sessions.find((s) => s.id === id);
    if (!session) return;
    session.title = $("#edit-title").value.trim() || session.title;
    session.startTime = combineDateTime($("#edit-date").value, $("#edit-time").value) || session.startTime;
    session.notes = $("#edit-notes").value.trim();
    session.formation = $("#edit-formation").value;
    session.revealOffsetMinutes = Number($("#edit-reveal").value || session.revealOffsetMinutes);
    const res = await apiAction("updateSession", { session });
    if (!res) await forceSyncState();
    render();
  });

  $("#send-ann").addEventListener("click", async () => {
    const title = $("#ann-title").value.trim();
    const message = $("#ann-body").value.trim();
    if (!title || !message) return;
    const announcement = { id: crypto.randomUUID(), title, message, createdAt: new Date() };
    state.announcements.unshift(announcement);
    $("#ann-title").value = "";
    $("#ann-body").value = "";
    const res = await apiAction("addAnnouncement", { announcement });
    if (!res) await forceSyncState();
    renderFeedChat();
  });

  $("#post-feedback").addEventListener("click", async () => {
    const title = $("#fb-title").value.trim() || "Session Feedback";
    const youTube = $("#fb-youtube").value.trim();
    const drive = $("#fb-drive").value.trim();
    const time = $("#fb-time").value.trim();
    const note = $("#fb-note").value.trim();
    const notes = time && note ? [{ id: crypto.randomUUID(), time, note }] : [];
    const feedback = {
      id: crypto.randomUUID(),
      title,
      videoURL: youTube,
      driveURL: drive,
      notes,
      expiresAt: addHours(new Date(), 24),
    };
    state.feedbackItems.unshift(feedback);
    captainDraft.feedbackTitle = "";
    captainDraft.feedbackYouTube = "";
    captainDraft.feedbackDrive = "";
    captainDraft.feedbackTime = "";
    captainDraft.feedbackNote = "";
    const res = await apiAction("addFeedback", { feedback });
    if (!res) await forceSyncState();
    render();
  });

  $("#set-coach").addEventListener("click", () => {
    const name = $("#coach-name").value.trim() || "Coach";
    state.currentUserName = name;
    saveLocalSettings();
    render();
  });

  $("#update-pin").addEventListener("click", async () => {
    const pin = $("#new-pin").value.trim();
    if (!pin) return;
    state.adminPIN = pin;
    $("#new-pin").value = "";
    const res = await apiAction("updateAdminPIN", { adminPIN: pin });
    if (!res) await forceSyncState();
  });

  wireCaptainDraftInputs();
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
  const localHasSessions = state.sessions && state.sessions.length > 0;
  const serverSessions = serverState.sessions || [];
  if (localHasSessions && serverSessions.length < state.sessions.length) {
    return;
  }
  if (localHasSessions && serverSessions.length) {
    const localIds = new Set(state.sessions.map((s) => s.id));
    const serverIds = new Set(serverSessions.map((s) => s.id));
    let missing = false;
    for (const id of localIds) {
      if (!serverIds.has(id)) {
        missing = true;
        break;
      }
    }
    if (missing) return;
  }
  if (!serverState.lastUpdated && localHasSessions && (!serverState.sessions || serverState.sessions.length === 0)) {
    return;
  }
  if (serverState.lastUpdated && state.lastUpdated) {
    const incoming = new Date(serverState.lastUpdated);
    const local = new Date(state.lastUpdated);
    if (incoming < local) return;
  }
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
  const localSelected = state.selectedSessionId;
  const serverSelected = serverState.selectedSessionId;
  const exists = (id) => state.sessions.find((s) => s.id === id);
  if (localSelected && exists(localSelected)) {
    state.selectedSessionId = localSelected;
  } else if (serverSelected && exists(serverSelected)) {
    state.selectedSessionId = serverSelected;
  } else {
    state.selectedSessionId = state.sessions[0]?.id || "";
  }
  state.adminPIN = serverState.adminPIN || state.adminPIN;
  state.lastUpdated = serverState.lastUpdated || state.lastUpdated || new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function apiAction(action, data) {
  try {
    state.syncStatus = "syncing";
    const res = await fetch(`${state.baseUrl}/teams/${TEAM_CODE}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data }),
    });
    if (!res.ok) {
      state.syncStatus = "error";
      return null;
    }
    const payload = await res.json();
    if (payload?.state) {
      applyServerState(payload.state);
      state.lastServerSessions = payload.state.sessions ? payload.state.sessions.length : 0;
      if ((payload.state.sessions || []).length === 0 && (state.sessions || []).length > 0) {
        await forceSyncState();
      }
      state.syncStatus = "ok";
      return payload.state;
    }
    state.syncStatus = "error";
    return null;
  } catch {
    // ignore
    state.syncStatus = "error";
    return null;
  }
}

async function forceSyncState() {
  try {
    const res = await fetch(`${state.baseUrl}/teams/${TEAM_CODE}/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: {
          sessions: state.sessions,
          announcements: state.announcements,
          feedbackItems: state.feedbackItems,
          chatMessages: state.chatMessages,
          selectedSessionId: state.selectedSessionId,
          adminPIN: state.adminPIN,
          lastUpdated: new Date().toISOString(),
        },
      }),
    });
    if (res.ok) {
      state.syncStatus = "ok";
      return true;
    }
  } catch {
    // ignore
  }
  state.syncStatus = "error";
  return false;
}

async function syncFromServer() {
  try {
    const res = await fetch(`${state.baseUrl}/teams/${TEAM_CODE}/state`);
    if (!res.ok) return;
    const data = await res.json();
    applyServerState(data.state || {});
    state.lastServerSessions = data.state?.sessions ? data.state.sessions.length : 0;
    const active = document.activeElement;
    const captainPanel = $("#tab-captain");
    const sessionsPanel = $("#tab-sessions");
    const isEditingCaptain = captainPanel && active && captainPanel.contains(active);
    const isEditingSessions = sessionsPanel && active && sessionsPanel.contains(active);
    if (!isEditingCaptain && !isEditingSessions) {
      render();
    }
  } catch {
    // ignore
  }
}

function showPinGate() {
  $("#pin-gate").classList.remove("hidden");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function combineDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date();
  dt.setFullYear(y, m - 1, d);
  dt.setHours(hh || 0, mm || 0, 0, 0);
  return dt;
}

function wireCaptainDraftInputs() {
  const set = (key) => (e) => { captainDraft[key] = e.target.value; };

  const newTitle = $("#new-title");
  const newDate = $("#new-date");
  const newTime = $("#new-time");
  const newNotes = $("#new-notes");
  const newFormation = $("#new-formation");
  const newReveal = $("#new-reveal");

  if (newTitle) newTitle.addEventListener("input", set("title"));
  if (newDate) newDate.addEventListener("input", set("date"));
  if (newTime) newTime.addEventListener("input", set("time"));
  if (newNotes) newNotes.addEventListener("input", set("notes"));
  if (newFormation) newFormation.addEventListener("change", set("formation"));
  if (newReveal) newReveal.addEventListener("input", set("revealOffsetMinutes"));

  const editTitle = $("#edit-title");
  const editDate = $("#edit-date");
  const editTime = $("#edit-time");
  const editNotes = $("#edit-notes");
  const editFormation = $("#edit-formation");
  const editReveal = $("#edit-reveal");

  if (editTitle) editTitle.addEventListener("input", set("editTitle"));
  if (editDate) editDate.addEventListener("input", set("editDate"));
  if (editTime) editTime.addEventListener("input", set("editTime"));
  if (editNotes) editNotes.addEventListener("input", set("editNotes"));
  if (editFormation) editFormation.addEventListener("change", set("editFormation"));
  if (editReveal) editReveal.addEventListener("input", set("editRevealOffsetMinutes"));

  const fbTitle = $("#fb-title");
  const fbYouTube = $("#fb-youtube");
  const fbDrive = $("#fb-drive");
  const fbTime = $("#fb-time");
  const fbNote = $("#fb-note");

  if (fbTitle) fbTitle.addEventListener("input", set("feedbackTitle"));
  if (fbYouTube) fbYouTube.addEventListener("input", set("feedbackYouTube"));
  if (fbDrive) fbDrive.addEventListener("input", set("feedbackDrive"));
  if (fbTime) fbTime.addEventListener("input", set("feedbackTime"));
  if (fbNote) fbNote.addEventListener("input", set("feedbackNote"));
}

function setupGates() {
  const nameSave = $("#name-save");
  if (nameSave) {
    nameSave.addEventListener("click", () => {
      const name = $("#name-input").value.trim();
      if (!name) return;
      state.currentUserName = name;
      saveLocalSettings();
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
      saveLocalSettings();
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
