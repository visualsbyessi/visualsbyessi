const editors = ["Essi", "Aimae", "Thea", "Siren", "David", "Mc", "Drix"];
const nicolasEditors = ["Essi", "Siren", "David", "Mc", "Drix"];
const mdEditors = ["Essi", "Aimae", "Thea"];
const users = {
  Essi: { role: "Editor", username: "Visualsbyessi", password: "Cielo122900!", access: "all" },
  Aimae: { role: "Editor", username: "aimae", password: "demo", access: "md" },
  Thea: { role: "Editor", username: "thea", password: "demo", access: "md" },
  Siren: { role: "Editor", username: "siren", password: "demo", access: "nicolas" },
  David: { role: "Editor", username: "david", password: "demo", access: "nicolas" },
  Mc: { role: "Editor", username: "mc", password: "demo", access: "nicolas" },
  Drix: { role: "Editor", username: "drix", password: "demo", access: "nicolas" }
};

let currentUser = null;
let activeEditor = "Essi";
let previewEditor = "Essi";
let workspaceMode = "mine";
let currentView = "dashboard";
let searchTerm = "";
let editingEditorName = null;
let nextId = 15;

const projects = [
  { id: 1, client: "Deniss", project: "Shorts Batch 41", type: "Regular Edit", script: true, raw: true, editor: "Aimae", status: "Ongoing", deliverable: "" },
  { id: 2, client: "Deniss", project: "Long Story - Founder", type: "Long Story", duration: 6, script: true, raw: true, editor: "Thea", status: "Done", deliverable: "View link" },
  { id: 3, client: "Mehdi", project: "Cafe Promo Edit", type: "Regular Edit", script: true, raw: false, editor: "Essi", status: "For Checking", deliverable: "View link" },
  { id: 4, client: "Mehdi", project: "Testimonials Pack", type: "Regular Edit", script: true, raw: true, editor: "", status: "", deliverable: "" },
  { id: 5, client: "Deniss", project: "Product Reel", type: "Regular Edit", script: true, raw: true, editor: "", status: "", deliverable: "" },
  { id: 6, client: "Nicolas", project: "Easy Clip 108", type: "Easy", script: false, raw: true, editor: "Siren", status: "Done", deliverable: "View link" },
  { id: 7, client: "Nicolas", project: "Hard Story 24", type: "Hard", script: false, raw: true, editor: "David", status: "Revision", deliverable: "View link" },
  { id: 8, client: "Nicolas", project: "Easy Clip 109", type: "Easy", script: false, raw: true, editor: "", status: "", deliverable: "" },
  { id: 9, client: "Nicolas", project: "Hard Clip 31", type: "Hard", script: false, raw: true, editor: "Mc", status: "Paid", deliverable: "View link" },
  { id: 10, client: "Deniss", project: "Long Story - Product", type: "Long Story", duration: 4, script: true, raw: true, editor: "Aimae", status: "Paid", deliverable: "View link" },
  { id: 11, client: "Mehdi", project: "Brand B-Roll", type: "Regular Edit", script: true, raw: true, editor: "Thea", status: "For Revision", deliverable: "View link" },
  { id: 12, client: "Nicolas", project: "Hard Clip 32", type: "Hard", script: false, raw: true, editor: "Essi", status: "Ongoing", deliverable: "" },
  { id: 13, client: "Nicolas", project: "Easy Clip 110", type: "Easy", script: false, raw: true, editor: "Drix", status: "For Checking", deliverable: "View link" },
  { id: 14, client: "Deniss", project: "Shorts Batch 42", type: "Regular Edit", script: true, raw: true, editor: "Essi", status: "Done", deliverable: "View link" }
];

const quickLinks = [
  { name: "Main Upload Folder", category: "Uploads", visible: "All", notes: "Final exports and handoff files" },
  { name: "Editing Guidelines", category: "Guides", visible: "All", notes: "General editing standards" },
  { name: "Caption Style Guide", category: "Guides", visible: "All", notes: "Caption format and styling" },
  { name: "Deniss Script Folder", category: "Scripts", visible: "Mehdi & Deniss", notes: "Scripts for Deniss work" },
  { name: "Nicolas References", category: "References", visible: "Nicolas", notes: "Sample edits and references" },
  { name: "Rate Sheet", category: "Rates", visible: "Private", notes: "Rates and payouts" }
];

const statusOptions = ["Ongoing", "For Checking", "Revision", "For Revision", "Done", "Paid"];
const iconPaths = {
  video: "M15 10l4.5-2.5v9L15 14M4 6h11v12H4z",
  clock: "M12 6v6l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  search: "M21 21l-4.3-4.3M10.5 18a7.5 7.5 0 110-15 7.5 7.5 0 010 15z",
  refresh: "M3 12a9 9 0 019-9 9.5 9.5 0 016.7 2.8M21 12a9 9 0 01-9 9 9.5 9.5 0 01-6.7-2.8M18 3v5h-5M6 21v-5h5",
  check: "M20 6L9 17l-5-5",
  wallet: "M4 7h16v12H4zM16 11h4M7 7V5h10v2",
  file: "M7 3h7l4 4v14H7zM14 3v5h4",
  link: "M10 13a5 5 0 007.1 0l2-2a5 5 0 00-7.1-7.1l-1.1 1.1M14 11a5 5 0 00-7.1 0l-2 2A5 5 0 0012 20.1l1.1-1.1",
  lock: "M7 10V8a5 5 0 0110 0v2M6 10h12v10H6z",
  plus: "M12 5v14M5 12h14",
  upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
  release: "M9 7H5v12h12v-4M14 5h5v5M19 5l-9 9",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z"
};

function icon(name) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${iconPaths[name]}" /></svg>`;
}

function money(n, currency = "$") {
  return currency + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function allowedEditors(client) {
  if (client === "Nicolas") return nicolasEditors;
  return mdEditors;
}

function addEditorAccess(name, access) {
  if (!editors.includes(name)) editors.push(name);
  const hasNicolas = ["nicolas", "md+nicolas", "all"].includes(access);
  const hasMd = ["md", "md+nicolas", "all"].includes(access);
  if (hasNicolas && !nicolasEditors.includes(name)) nicolasEditors.push(name);
  if (hasMd && !mdEditors.includes(name)) mdEditors.push(name);
}

function removeEditorAccess(name) {
  const nicolasIndex = nicolasEditors.indexOf(name);
  const mdIndex = mdEditors.indexOf(name);
  if (nicolasIndex > -1) nicolasEditors.splice(nicolasIndex, 1);
  if (mdIndex > -1) mdEditors.splice(mdIndex, 1);
}

function accessLabel(access) {
  return ({ all: "All", md: "MD", "md+nicolas": "MD + Nicolas", nicolas: "Nicolas" })[access] || "Nicolas";
}

function findUserByLogin(username) {
  const normalized = username.trim().toLowerCase();
  return Object.keys(users).find(name => {
    const user = users[name];
    return name.toLowerCase() === normalized || user.username.toLowerCase() === normalized;
  });
}

function editorPay(project) {
  if (!project.editor) return 0;
  if (project.client === "Nicolas") return project.type === "Hard" ? 500 : 350;
  if (["Aimae", "Thea", "Essi"].includes(project.editor)) return 350;
  return 0;
}

function invoiceAmount(project) {
  if (project.client === "Deniss") {
    if (project.type === "Long Story") return Math.ceil((project.duration || 2) / 2) * 25;
    return 20;
  }
  if (project.client === "Nicolas") return project.type === "Hard" ? 20 : 15;
  return 0;
}

function counts(rows) {
  return {
    total: rows.length,
    ongoing: rows.filter(p => p.status === "Ongoing").length,
    checking: rows.filter(p => p.status === "For Checking").length,
    revision: rows.filter(p => ["Revision", "For Revision"].includes(p.status)).length,
    done: rows.filter(p => ["Done", "Paid"].includes(p.status)).length
  };
}

function earningsFor(editor) {
  const rows = projects.filter(p => p.editor === editor);
  const unpaid = rows.filter(p => p.status === "Done").reduce((sum, p) => sum + editorPay(p), 0);
  const paid = rows.filter(p => p.status === "Paid").reduce((sum, p) => sum + editorPay(p), 0);
  return { unpaid, paid, total: unpaid + paid };
}

function isAdmin() {
  return currentUser === "Essi";
}

function canCreateNicolasProject(user = currentUser) {
  return nicolasEditors.includes(user);
}

function statusPill(status) {
  return `<span class="pill status-${status.replaceAll(" ", "-")}">${status}</span>`;
}

function actionButton(p, editor = activeEditor, admin = false) {
  const allowed = allowedEditors(p.client).includes(editor);
  if (p.status === "Paid") return `<button class="ghost-button" disabled>${icon("lock")} Locked</button>`;
  if (admin && p.editor) return `<button class="ghost-button" data-action="release" data-id="${p.id}">${icon("release")} Release</button>`;
  if (!p.editor && allowed) return `<button class="primary-button" data-action="take" data-id="${p.id}">${icon("plus")} Take Project</button>`;
  if (p.editor === editor) return `<button class="ghost-button" data-action="release" data-id="${p.id}">${icon("release")} Release</button>`;
  return `<button class="ghost-button" disabled>${icon("lock")} Locked</button>`;
}

function linkCell(hasLink) {
  return hasLink ? `<a href="#" class="linkish">${icon("file")} View</a>` : `<span class="muted">None</span>`;
}

function deliverableCell(p) {
  if (p.status === "Paid" || p.deliverable) return `<a href="#" class="linkish">${icon("link")} ${p.deliverable || "View link"}</a>`;
  if (p.editor) return `<input class="table-input" placeholder="Paste link" />`;
  return `<span class="muted">-</span>`;
}

function renderStatusSelect(p, admin = false) {
  if (!p.editor) return `<span class="open-slot">Open to take</span>`;
  const options = statusOptions.map(status => {
    const disabled = status === "Paid" && !admin ? "disabled" : "";
    return `<option ${status === p.status ? "selected" : ""} ${disabled}>${status}</option>`;
  }).join("");
  return `<select data-action="status" data-id="${p.id}" data-admin="${admin ? "true" : "false"}">${options}</select>`;
}

function matchesSearch(project) {
  if (!searchTerm.trim()) return true;
  const haystack = [
    project.project,
    project.client,
    project.type,
    project.editor,
    project.status
  ].join(" ").toLowerCase();
  return haystack.includes(searchTerm.trim().toLowerCase());
}

function projectTable(rows, opts = {}) {
  const admin = opts.admin || false;
  const editor = opts.editor || activeEditor;
  const includeClient = opts.includeClient !== false;
  const includeScriptRaw = opts.includeScriptRaw !== false;
  const includeDeliverable = opts.includeDeliverable !== false;
  const filteredRows = rows.filter(matchesSearch);
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Project</th>
            ${includeClient ? "<th>Client</th>" : ""}
            <th>Type</th>
            ${includeScriptRaw ? "<th>Script</th><th>Raw</th>" : ""}
            <th>Status</th>
            <th>Editor</th>
            ${includeDeliverable ? "<th>Deliverable Link</th>" : ""}
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${filteredRows.length ? filteredRows.map(p => `
            <tr>
              <td><strong>${p.project}</strong></td>
              ${includeClient ? `<td>${p.client}</td>` : ""}
              <td>${p.type}${p.duration ? `, ${p.duration} min` : ""}</td>
              ${includeScriptRaw ? `<td>${linkCell(p.script)}</td><td>${linkCell(p.raw)}</td>` : ""}
              <td>${renderStatusSelect(p, admin)}</td>
              <td>${p.editor || "<span class='muted'>Unassigned</span>"}</td>
              ${includeDeliverable ? `<td>${deliverableCell(p)}</td>` : ""}
              <td>${actionButton(p, editor, admin)}</td>
            </tr>
          `).join("") : `<tr><td colspan="9" class="empty-row">No projects found</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function summaryCards(c) {
  return `
    <div class="card"><span class="card-icon">${icon("video")}</span><span class="label">Total videos</span><strong>${c.total}</strong><small>All visible projects</small></div>
    <div class="card"><span class="card-icon amber-icon">${icon("clock")}</span><span class="label">Ongoing</span><strong>${c.ongoing}</strong><small>In progress</small></div>
    <div class="card"><span class="card-icon gold-icon">${icon("search")}</span><span class="label">For checking</span><strong>${c.checking}</strong><small>Awaiting review</small></div>
    <div class="card"><span class="card-icon red-icon">${icon("refresh")}</span><span class="label">Revision</span><strong>${c.revision}</strong><small>Needs changes</small></div>
    <div class="card"><span class="card-icon green-icon">${icon("check")}</span><span class="label">Done</span><strong>${c.done}</strong><small>Done or paid</small></div>
  `;
}

function earningsCard(editor) {
  const e = earningsFor(editor);
  return `
    <div class="card earnings-card">
      <h3>${icon("wallet")} My Earnings</h3>
      <div class="earnings-row">
        <div><small>Unpaid</small><div class="money">₱${e.unpaid.toLocaleString()}</div></div>
        <div><small>Paid</small><div class="money">₱${e.paid.toLocaleString()}</div></div>
        <div><small>Total</small><div class="money">₱${e.total.toLocaleString()}</div></div>
      </div>
    </div>
  `;
}

function topEarnings(editor) {
  const e = earningsFor(editor);
  return `
    <div class="top-earnings-title">${icon("wallet")} My Earnings</div>
    <div class="top-earnings-values">
      <span><em>Unpaid</em> <strong>₱${e.unpaid.toLocaleString()}</strong></span>
      <span><em>Paid</em> <strong>₱${e.paid.toLocaleString()}</strong></span>
      <span><em>Total</em> <strong>₱${e.total.toLocaleString()}</strong></span>
    </div>
  `;
}

function renderDashboard() {
  const billable = projects.filter(p => ["Done", "Paid"].includes(p.status));
  const deniss = billable.filter(p => p.client === "Deniss");
  const nicolas = billable.filter(p => p.client === "Nicolas");
  const payouts = billable.reduce((sum, p) => sum + editorPay(p), 0);
  const invoices = deniss.concat(nicolas).reduce((sum, p) => sum + invoiceAmount(p), 0);
  const regular = deniss.filter(p => p.type === "Regular Edit");
  const longStory = deniss.filter(p => p.type === "Long Story");
  const easy = nicolas.filter(p => p.type === "Easy");
  const hard = nicolas.filter(p => p.type === "Hard");

  document.querySelector("#view-dashboard").innerHTML = `
    <div class="cards">
      <div class="card"><span class="card-icon">${icon("file")}</span><span class="label">Deniss invoice</span><strong>${money(deniss.reduce((s, p) => s + invoiceAmount(p), 0))}</strong><small>${deniss.length} billable videos</small></div>
      <div class="card"><span class="card-icon">${icon("file")}</span><span class="label">Nicolas invoice</span><strong>${money(nicolas.reduce((s, p) => s + invoiceAmount(p), 0))}</strong><small>${nicolas.length} billable videos</small></div>
      <div class="card"><span class="card-icon green-icon">${icon("wallet")}</span><span class="label">Editor payouts</span><strong>₱${payouts.toLocaleString()}</strong><small>Done and paid work</small></div>
      <div class="card"><span class="card-icon">${icon("wallet")}</span><span class="label">Invoice total</span><strong>${money(invoices)}</strong><small>Total billable</small></div>
    </div>
    <div class="two-col">
      <div class="panel breakdown-table">
        <div class="panel-header"><h2>Client Invoice Breakdown</h2></div>
        <div class="breakdown-scroll">
          <table>
            <thead><tr><th>Client</th><th>Type</th><th>Videos</th><th>Rate</th><th>Total</th></tr></thead>
            <tbody>
              <tr><td>Deniss</td><td>Regular Edit</td><td>${regular.length}</td><td>$20/video</td><td>${money(regular.length * 20)}</td></tr>
              <tr><td>Deniss</td><td>Long Story</td><td>${longStory.length}</td><td>$25 per 2 min</td><td>${money(longStory.reduce((s, p) => s + invoiceAmount(p), 0))}</td></tr>
              <tr><td>Nicolas</td><td>Easy</td><td>${easy.length}</td><td>$15/video</td><td>${money(easy.length * 15)}</td></tr>
              <tr><td>Nicolas</td><td>Hard</td><td>${hard.length}</td><td>$20/video</td><td>${money(hard.length * 20)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="panel breakdown-table">
        <div class="panel-header"><h2>Editor Payouts</h2></div>
        <div class="breakdown-scroll">
          <table>
            <thead><tr><th>Editor</th><th>Videos</th><th>Total Pay</th></tr></thead>
            <tbody>
              ${editors.map(ed => {
                const rows = billable.filter(p => p.editor === ed);
                return `<tr><td>${ed}</td><td>${rows.length}</td><td>₱${rows.reduce((s, p) => s + editorPay(p), 0).toLocaleString()}</td></tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header"><h2>All Active Projects</h2></div>
      ${projectTable(projects, { admin: true })}
    </div>
  `;
}

function renderClientPage(id, title, rows) {
  const isNicolasPage = id === "#view-nicolas";
  const canAdd = isAdmin() || (isNicolasPage && canCreateNicolasProject());
  document.querySelector(id).innerHTML = `
    <div class="cards">${summaryCards(counts(rows)).replace("grid", "")}</div>
    <div class="panel">
      <div class="panel-header">
        <div><h2>${title}</h2></div>
        ${canAdd ? `<button class="primary-button inline-add" data-client="${isNicolasPage ? "Nicolas" : ""}">${icon("plus")} Add Project</button>` : ""}
      </div>
      ${projectTable(rows, { admin: true, includeClient: !isNicolasPage, includeScriptRaw: !isNicolasPage, includeDeliverable: !isNicolasPage })}
    </div>
  `;
  document.querySelectorAll(".inline-add").forEach(add => {
    add.onclick = () => openModal(add.dataset.client || "");
  });
}

function renderWorkspace(editor = activeEditor, target = "#view-workspace") {
  const rows = projects.filter(p => p.editor === editor || (!p.editor && allowedEditors(p.client).includes(editor)));
  const addNicolas = canCreateNicolasProject(editor) && target === "#view-workspace";
  const visibleRows = workspaceMode === "available" ? rows.filter(p => !p.editor) : rows.filter(p => p.editor === editor);
  const nicolasOnly = visibleRows.length > 0 && visibleRows.every(p => p.client === "Nicolas");
  document.querySelector(target).innerHTML = `
    <div class="cards workspace-summary">
      ${summaryCards(counts(rows))}
      ${earningsCard(editor)}
    </div>
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2>${editor} Workspace</h2>
          <input class="table-search" type="search" placeholder="Search projects..." value="${searchTerm}" />
        </div>
        <div class="workspace-actions">
          ${addNicolas ? `<button class="primary-button" data-action="add-nicolas">${icon("plus")} Add Nicolas Project</button>` : ""}
          <div class="segmented">
            <button class="${workspaceMode === "mine" ? "active" : ""}" data-mode="mine">My Projects</button>
            <button class="${workspaceMode === "available" ? "active" : ""}" data-mode="available">Available</button>
          </div>
        </div>
      </div>
      ${projectTable(visibleRows, { editor, admin: false, includeClient: !nicolasOnly, includeScriptRaw: !nicolasOnly, includeDeliverable: !nicolasOnly })}
    </div>
  `;
}

function renderLinks() {
  const visibleLinks = quickLinks.filter(link => isAdmin() || link.visible !== "Private");
  document.querySelector("#view-links").innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div><h2>Quick Links</h2></div>
        ${isAdmin() ? `<button class="primary-button">${icon("plus")} Add Link</button>` : ""}
      </div>
      <div class="grid quick-links">
        ${visibleLinks.map(link => `
          <div class="card quick-link">
            <span class="label">${link.category}</span>
            <h3>${link.name}</h3>
            <p class="muted">${link.notes}</p>
            <small>Visible to: ${link.visible}</small>
            <a href="#" class="linkish">${icon("link")} Open link</a>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderEditors() {
  document.querySelector("#view-editors").innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div><h2>Editors</h2></div>
        <button class="primary-button" id="openEditorModal">${icon("plus")} Add Editor</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Username</th><th>Access</th><th>Password</th><th>Action</th></tr></thead>
          <tbody>
            ${editors.map(name => {
              const user = users[name] || {};
              return `<tr><td><strong>${name}</strong></td><td>${user.username || name.toLowerCase()}</td><td>${accessLabel(user.access || "nicolas")}</td><td>${user.password || "demo"}</td><td><button class="ghost-button" data-action="edit-editor" data-editor="${name}">${icon("file")} Edit</button></td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  document.querySelector("#openEditorModal").onclick = openEditorModal;
}

function refreshEditorOptions() {
  document.querySelectorAll("select[name='editor']").forEach(select => {
    const current = select.value;
    select.innerHTML = `<option>Unassigned</option>${editors.map(editor => `<option>${editor}</option>`).join("")}`;
    if ([...select.options].some(option => option.value === current)) select.value = current;
  });
}

function renderViewAs() {
  document.querySelector("#view-viewas").innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2>View As Editor</h2>
          <p class="muted">Preview editor workspaces.</p>
        </div>
        <select id="viewAsSelect">${editors.map(e => `<option ${e === previewEditor ? "selected" : ""}>${e}</option>`).join("")}</select>
      </div>
      <div id="previewWorkspace"></div>
    </div>
  `;
  renderWorkspace(previewEditor, "#previewWorkspace");
  document.querySelector("#viewAsSelect").onchange = (event) => {
    previewEditor = event.target.value;
    renderViewAs();
  };
}

function renderAll() {
  renderDashboard();
  renderClientPage("#view-md", "Mehdi & Deniss Workspace", projects.filter(p => p.client === "Mehdi" || p.client === "Deniss"));
  renderClientPage("#view-nicolas", "Nicolas Workspace", projects.filter(p => p.client === "Nicolas"));
  renderEditors();
  renderWorkspace(currentUser || "Essi", "#view-workspace");
  renderLinks();
  renderViewAs();
}

function setView(view) {
  if (!isAdmin() && !["workspace", "links"].includes(view)) view = "workspace";
  currentView = view;
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active-view"));
  document.querySelector(`#view-${view}`).classList.add("active-view");
  document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === view));
  const labels = { dashboard: "Dashboard", md: "Mehdi & Deniss", nicolas: "Nicolas", editors: "Editors", workspace: `${currentUser || "Essi"} Workspace`, links: "Quick Links", viewas: "View As Editor" };
  document.querySelector("#page-title").textContent = labels[view];
  updateTopbar(view);
}

function updateTopbar(view) {
  const topEarningsBox = document.querySelector("#topEarnings");
  const search = document.querySelector("#search");
  const addProjectButton = document.querySelector("#addProjectButton");
  const eyebrow = document.querySelector(".eyebrow");
  const showWorkspaceEarnings = view === "workspace";
  topEarningsBox.classList.add("hidden");
  search.classList.toggle("hidden", showWorkspaceEarnings);
  if (!showWorkspaceEarnings) search.value = searchTerm;
  addProjectButton.classList.toggle("hidden", showWorkspaceEarnings);
  eyebrow.classList.toggle("hidden", showWorkspaceEarnings);
}

function applySession(user) {
  currentUser = user;
  activeEditor = user;
  workspaceMode = "mine";
  refreshEditorOptions();
  document.querySelector("#loginScreen").classList.add("hidden");
  document.querySelector("#appShell").classList.remove("hidden");
  document.querySelector("#signedInName").textContent = user;
  document.querySelector("#signedInRole").textContent = users[user].role;
  document.querySelectorAll(".admin-only").forEach(item => item.classList.toggle("hidden", !isAdmin()));
  document.querySelector("#addProjectButton").classList.toggle("hidden", !isAdmin());
  renderAll();
  setView(isAdmin() ? "dashboard" : "workspace");
}

function endSession() {
  currentUser = null;
  document.querySelector("#appShell").classList.add("hidden");
  document.querySelector("#loginScreen").classList.remove("hidden");
}

function configureProjectForm(clientPreset = "") {
  const form = document.querySelector("#projectForm");
  const clientSelect = form.elements.client;
  const editorSelect = form.elements.editor;
  const typeSelect = form.elements.type;
  const nicolasEditorForm = !isAdmin();

  [...clientSelect.options].forEach(option => {
    option.disabled = !isAdmin() && option.value !== "Nicolas";
  });
  [...editorSelect.options].forEach(option => {
    const value = option.value;
    option.disabled = !isAdmin() && value !== currentUser;
  });
  [...typeSelect.options].forEach(option => {
    const nicolasType = ["Easy", "Hard"].includes(option.value);
    option.disabled = !isAdmin() && !nicolasType;
  });

  if (clientPreset) clientSelect.value = clientPreset;
  if (!isAdmin()) {
    clientSelect.value = "Nicolas";
    editorSelect.value = currentUser;
    if (!["Easy", "Hard"].includes(typeSelect.value)) typeSelect.value = "Easy";
  }

  document.querySelector("#modalTitle").textContent = nicolasEditorForm ? "Add Nicolas Project" : "Add Project";
  document.querySelectorAll("[data-form-field]").forEach(field => {
    const name = field.dataset.formField;
    const shouldHide = nicolasEditorForm && ["client", "editor", "script", "raw"].includes(name);
    field.classList.toggle("hidden", shouldHide);
  });
}

function openModal(clientPreset = "") {
  configureProjectForm(clientPreset);
  document.querySelector("#modal").classList.add("open");
}

function closeModal() {
  document.querySelector("#modal").classList.remove("open");
}

function openEditorModal(name = "") {
  editingEditorName = name || null;
  const form = document.querySelector("#editorForm");
  document.querySelector("#editorModalTitle").textContent = editingEditorName ? "Edit Editor" : "Add Editor";
  if (editingEditorName) {
    const user = users[editingEditorName];
    form.elements.name.value = editingEditorName;
    form.elements.username.value = user.username || editingEditorName.toLowerCase();
    form.elements.password.value = user.password || "";
    form.elements.access.value = user.access || "nicolas";
  } else {
    form.reset();
  }
  document.querySelector("#editorModal").classList.add("open");
}

function closeEditorModal() {
  editingEditorName = null;
  document.querySelector("#editorModal").classList.remove("open");
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest(".nav-item");
  if (nav) setView(nav.dataset.view);

  const action = event.target.dataset.action;
  if (action === "take" || action === "release") {
    const p = projects.find(project => project.id === Number(event.target.dataset.id));
    if (!p || p.status === "Paid") return;
    if (action === "take") {
      p.editor = activeEditor;
      p.status = "Ongoing";
    }
    if (action === "release") {
      p.editor = "";
      p.status = "";
      p.deliverable = "";
    }
    renderAll();
  }

  const mode = event.target.dataset.mode;
  if (mode) {
    workspaceMode = mode;
    renderAll();
  }

  if (event.target.dataset.action === "add-nicolas") {
    openModal("Nicolas");
  }

  if (event.target.dataset.action === "edit-editor") {
    openEditorModal(event.target.dataset.editor);
  }
});

document.addEventListener("change", (event) => {
  if (event.target.dataset.action === "status") {
    const p = projects.find(project => project.id === Number(event.target.dataset.id));
    if (p && (event.target.dataset.admin === "true" || event.target.value !== "Paid")) p.status = event.target.value;
    renderAll();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.matches("#search, .table-search")) {
    const selector = event.target.matches("#search") ? "#search" : ".table-search";
    searchTerm = event.target.value;
    renderAll();
    setView(currentView);
    const nextInput = document.querySelector(selector);
    if (nextInput) {
      nextInput.focus();
      nextInput.setSelectionRange(searchTerm.length, searchTerm.length);
    }
  }
});

document.querySelector("#addProjectButton").onclick = () => openModal("");
document.querySelector("#closeModal").onclick = closeModal;
document.querySelector("#cancelModal").onclick = closeModal;
document.querySelector("#closeEditorModal").onclick = closeEditorModal;
document.querySelector("#cancelEditorModal").onclick = closeEditorModal;
document.querySelector("#logoutButton").onclick = endSession;
document.querySelector("#loginForm").onsubmit = (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const matchedUser = findUserByLogin(data.user || "");
  if (!matchedUser || users[matchedUser].password !== data.password) {
    alert("Invalid username or password.");
    return;
  }
  applySession(matchedUser);
};
document.querySelector("#editorForm").onsubmit = (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const name = data.name.trim();
  if (!name) return;
  const oldName = editingEditorName;
  if (oldName && oldName !== name) {
    const editorIndex = editors.indexOf(oldName);
    if (editorIndex > -1) editors[editorIndex] = name;
    projects.forEach(project => {
      if (project.editor === oldName) project.editor = name;
    });
    delete users[oldName];
    removeEditorAccess(oldName);
  } else if (oldName) {
    removeEditorAccess(oldName);
  }
  users[name] = {
    role: "Editor",
    username: data.username.trim() || name.toLowerCase(),
    password: data.password,
    access: data.access
  };
  addEditorAccess(name, data.access);
  refreshEditorOptions();
  closeEditorModal();
  event.currentTarget.reset();
  renderAll();
  setView("editors");
};
document.querySelector("#projectForm").onsubmit = (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (!isAdmin() && data.client !== "Nicolas") return;
  if (!isAdmin() && !["Easy", "Hard"].includes(data.type)) return;
  projects.unshift({
    id: nextId++,
    client: !isAdmin() ? "Nicolas" : data.client,
    project: data.project,
    type: data.type,
    script: !isAdmin() ? false : Boolean(data.script),
    raw: !isAdmin() ? false : Boolean(data.raw),
    editor: !isAdmin() ? currentUser : data.editor === "Unassigned" ? "" : data.editor,
    status: !isAdmin() ? "Ongoing" : data.editor === "Unassigned" ? "" : "Ongoing",
    deliverable: ""
  });
  event.currentTarget.reset();
  closeModal();
  renderAll();
};
