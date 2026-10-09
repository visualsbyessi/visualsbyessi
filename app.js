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

const SUPABASE_URL = "https://hbyvddtczxjmjiommlcg.supabase.co";
const SUPABASE_KEY = "sb_publishable_JpMQkv99uAgopgWsRtxwOA_RWiB6-2S";
const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1`;
let remoteEnabled = true;
let remotePaidAtEnabled = true;
const PAID_DELETE_AFTER_DAYS = 7;

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_REST_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Supabase request failed: ${response.status}`);
  }
  if (response.status === 204) return [];
  return response.json();
}

function rebuildAccessLists() {
  nicolasEditors.splice(0, nicolasEditors.length);
  mdEditors.splice(0, mdEditors.length);
  editors.forEach(name => addEditorAccess(name, users[name]?.access || "nicolas"));
}

async function loadRemoteData() {
  if (!remoteEnabled) return;
  try {
    const remoteEditors = await supabaseRequest("/editors?select=*&order=created_at.asc");
    if (remoteEditors.length) {
      editors.splice(0, editors.length);
      Object.keys(users).forEach(name => delete users[name]);
      remoteEditors.forEach(editor => {
        editors.push(editor.name);
        users[editor.name] = {
          id: editor.id,
          role: "Editor",
          username: editor.username,
          password: editor.password || "",
          access: editor.access
        };
      });
      rebuildAccessLists();
    }

    const remoteProjects = await supabaseRequest("/projects?select=*,editors(name)&order=created_at.asc");
    projects.splice(0, projects.length, ...remoteProjects.map(project => ({
      id: project.id,
      client: project.client,
      project: project.project_name,
      type: project.type || "",
      script: Boolean(project.script_link),
      raw: Boolean(project.raw_link),
      scriptLink: project.script_link || "",
      rawLink: project.raw_link || "",
      editor: project.editors?.name || "",
      status: project.status || "",
      deliverable: project.deliverable_link || "",
      paidAt: project.paid_at || ""
    })));
    await cleanupExpiredPaidProjects();

    const remoteLinks = await supabaseRequest("/quick_links?select=*&order=created_at.desc");
    if (remoteLinks.length) {
      quickLinks.splice(0, quickLinks.length, ...remoteLinks.map(link => ({
        id: link.id,
        name: link.name || link.title,
        client: link.client || link.visible || "All",
        notes: link.notes || link.description || "",
        url: link.url || "#"
      })));
      saveQuickLinks();
    }
    refreshEditorOptions();
  } catch (error) {
    remoteEnabled = false;
    console.warn("Using local data because Supabase is not ready.", error);
  }
}

function editorIdByName(name) {
  return users[name]?.id || null;
}

async function saveEditorRemote(name) {
  if (!remoteEnabled) return;
  const user = users[name];
  const payload = {
    name,
    username: user.username,
    password: user.password,
    access: user.access
  };
  try {
    if (user.id) {
      const [updated] = await supabaseRequest(`/editors?id=eq.${user.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      if (updated?.id) user.id = updated.id;
    } else {
      const [created] = await supabaseRequest("/editors", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (created?.id) user.id = created.id;
    }
  } catch (error) {
    alert("Could not save editor to Supabase. Check your database policies.");
    console.error(error);
  }
}

async function deleteEditorRemote(name) {
  if (!remoteEnabled || !users[name]?.id) return;
  try {
    await supabaseRequest(`/editors?id=eq.${users[name].id}`, { method: "DELETE" });
  } catch (error) {
    alert("Could not delete editor from Supabase. Check your database policies.");
    console.error(error);
  }
}

async function saveProjectRemote(project) {
  if (!remoteEnabled) return;
  const payload = {
    client: project.client,
    project_name: project.project,
    type: project.type,
    editor_id: editorIdByName(project.editor),
    status: project.status || "Ongoing",
    script_link: project.scriptLink || null,
    raw_link: project.rawLink || null,
    deliverable_link: project.deliverable || null
  };
  if (remotePaidAtEnabled) payload.paid_at = project.paidAt || null;
  try {
    if (typeof project.id === "string" && project.id.length > 20) {
      await supabaseRequest(`/projects?id=eq.${project.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else {
      const [created] = await supabaseRequest("/projects", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (created?.id) project.id = created.id;
    }
  } catch (error) {
    if (remotePaidAtEnabled && String(error.message || "").includes("paid_at")) {
      remotePaidAtEnabled = false;
      delete payload.paid_at;
      if (typeof project.id === "string" && project.id.length > 20) {
        await supabaseRequest(`/projects?id=eq.${project.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      } else {
        const [created] = await supabaseRequest("/projects", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        if (created?.id) project.id = created.id;
      }
      return;
    }
    alert("Could not save project to Supabase. Check your database policies.");
    console.error(error);
  }
}

async function deleteProjectRemote(project) {
  if (!remoteEnabled || !(typeof project.id === "string" && project.id.length > 20)) return;
  try {
    await supabaseRequest(`/projects?id=eq.${project.id}`, { method: "DELETE" });
  } catch (error) {
    alert("Could not delete project from Supabase. Check your database policies.");
    console.error(error);
  }
}

async function saveQuickLinkRemote(link) {
  if (!remoteEnabled) return;
  const payload = {
    name: link.name,
    notes: link.notes,
    url: link.url,
    client: link.client || "All",
    visible: link.client || "All",
    category: "Quick Link"
  };
  try {
    if (typeof link.id === "string" && link.id.length > 20) {
      await supabaseRequest(`/quick_links?id=eq.${link.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else {
      const [created] = await supabaseRequest("/quick_links", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (created?.id) link.id = created.id;
    }
  } catch (error) {
    alert("Could not save quick link to Supabase. Check the quick_links table update.");
    console.error(error);
  }
}

async function deleteQuickLinkRemote(link) {
  if (!remoteEnabled || !(typeof link.id === "string" && link.id.length > 20)) return;
  try {
    await supabaseRequest(`/quick_links?id=eq.${link.id}`, { method: "DELETE" });
  } catch (error) {
    alert("Could not delete quick link from Supabase. Check your database policies.");
    console.error(error);
  }
}

async function cleanupExpiredPaidProjects() {
  const cutoff = Date.now() - PAID_DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const expired = projects.filter(project => {
    if (project.status !== "Paid" || !project.paidAt) return false;
    return new Date(project.paidAt).getTime() < cutoff;
  });
  if (!expired.length) return;
  for (const project of expired) {
    await deleteProjectRemote(project);
  }
  for (let index = projects.length - 1; index >= 0; index -= 1) {
    if (expired.some(project => String(project.id) === String(projects[index].id))) {
      selectedProjectIds.delete(String(projects[index].id));
      projects.splice(index, 1);
    }
  }
}

function saveEditorState() {
  try {
    localStorage.setItem("visualsByEssiEditors", JSON.stringify({
      editors,
      nicolasEditors,
      mdEditors,
      users
    }));
  } catch (error) {
    alert("This browser blocked saving. Please allow site storage or try another browser.");
  }
}

function loadEditorState() {
  const saved = localStorage.getItem("visualsByEssiEditors");
  if (!saved) return;
  try {
    const data = JSON.parse(saved);
    editors.splice(0, editors.length, ...(data.editors || editors));
    nicolasEditors.splice(0, nicolasEditors.length, ...(data.nicolasEditors || nicolasEditors));
    mdEditors.splice(0, mdEditors.length, ...(data.mdEditors || mdEditors));
    Object.keys(users).forEach(name => delete users[name]);
    Object.assign(users, data.users || {});
  } catch (error) {
    console.warn("Could not load saved editor data.", error);
  }
}

function saveQuickLinks() {
  try {
    localStorage.setItem("visualsByEssiQuickLinks", JSON.stringify(quickLinks));
  } catch (error) {
    alert("This browser blocked saving quick links. Please allow site storage or try another browser.");
  }
}

function loadQuickLinks() {
  const saved = localStorage.getItem("visualsByEssiQuickLinks");
  if (!saved) return;
  try {
    const links = JSON.parse(saved);
    if (Array.isArray(links)) {
      quickLinks.splice(0, quickLinks.length, ...links.map(link => ({
        id: link.id || `local-${crypto.randomUUID()}`,
        name: link.name,
        client: link.client || link.visible || "All",
        notes: link.notes,
        url: link.url || "#"
      })));
    }
  } catch (error) {
    console.warn("Could not load saved quick links.", error);
  }
}

loadEditorState();

let currentUser = null;
let activeEditor = "Essi";
let previewEditor = "Essi";
let workspaceMode = "mine";
let currentView = "dashboard";
let searchTerm = "";
let editingEditorName = null;
let editingProjectId = null;
let editingLinkId = null;
const selectedProjectIds = new Set();
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
  { id: "sample-1", name: "Main Upload Folder", client: "All", notes: "Final exports and handoff files", url: "#" },
  { id: "sample-2", name: "Editing Guidelines", client: "All", notes: "General editing standards", url: "#" },
  { id: "sample-3", name: "Caption Style Guide", client: "All", notes: "Caption format and styling", url: "#" },
  { id: "sample-4", name: "Deniss Script Folder", client: "Mehdi & Deniss", notes: "Scripts for Deniss work", url: "#" },
  { id: "sample-5", name: "Nicolas References", client: "Nicolas", notes: "Sample edits and references", url: "#" },
  { id: "sample-6", name: "Rate Sheet", client: "Private", notes: "Rates and payouts", url: "#" }
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
  pen: "M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 11v6M14 11v6",
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
  if (mdEditors.includes(project.editor)) return 350;
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

function canSeeQuickLink(link, user = currentUser) {
  if (isAdmin()) return true;
  const client = link.client || "All";
  if (client === "All") return true;
  if (client === "Private") return false;
  if (client === "Nicolas") return nicolasEditors.includes(user);
  if (client === "Mehdi & Deniss") return mdEditors.includes(user);
  return false;
}

function statusPill(status) {
  return `<span class="pill status-${status.replaceAll(" ", "-")}">${status}</span>`;
}

function chipClass(value) {
  return String(value || "unassigned").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function typeChip(project) {
  const duration = project.duration ? `, ${project.duration} min` : "";
  return `<span class="chip type-${chipClass(project.type)}">${project.type || "Untyped"}${duration}</span>`;
}

function editorChip(editor) {
  return editor ? `<span class="chip editor-chip editor-${chipClass(editor)}">${editor}</span>` : `<span class="chip editor-unassigned">Unassigned</span>`;
}

function actionButton(p, editor = activeEditor, admin = false) {
  const allowed = allowedEditors(p.client).includes(editor);
  const canEdit = p.status !== "Paid" && (admin || (p.client === "Nicolas" && p.editor === editor));
  const canDelete = admin || p.editor === editor;
  const toggle = (checked, action, title) => `
    <button class="project-toggle ${checked ? "is-on" : ""}" data-action="${action}" data-id="${p.id}" title="${title}" aria-label="${title}">
      <span></span>
    </button>
  `;
  const baseActions = `
    ${canEdit ? `<button class="icon-action" data-action="edit-project" data-id="${p.id}" title="Edit">${icon("pen")}</button>` : ""}
    ${canDelete ? `<button class="icon-action danger-icon" data-action="delete-project" data-id="${p.id}" title="Delete">${icon("trash")}</button>` : ""}
  `;
  if (p.status === "Paid") return `<div class="icon-actions"><button class="icon-action" disabled title="Locked">${icon("lock")}</button>${baseActions}</div>`;
  if (admin && p.editor) return `<div class="icon-actions">${toggle(true, "release", "Release")}${baseActions}</div>`;
  if (!p.editor && allowed) return `<div class="icon-actions">${toggle(false, "take", "Take Project")}${baseActions}</div>`;
  if (p.editor === editor) return `<div class="icon-actions">${toggle(true, "release", "Release")}${baseActions}</div>`;
  return `<div class="icon-actions"><button class="icon-action" disabled title="Locked">${icon("lock")}</button></div>`;
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
  return `<select class="status-select status-${chipClass(p.status)}" data-action="status" data-id="${p.id}" data-admin="${admin ? "true" : "false"}">${options}</select>`;
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
  const visibleIds = new Set(filteredRows.map(p => String(p.id)));
  [...selectedProjectIds].forEach(id => {
    if (!visibleIds.has(id)) selectedProjectIds.delete(id);
  });
  const selectedCount = admin ? selectedProjectIds.size : 0;
  return `
    ${admin ? `
      <div class="bulk-actions ${selectedCount ? "" : "hidden"}">
        <strong>${selectedCount} selected</strong>
        <button class="danger-button" data-action="delete-selected">${icon("trash")} Delete selected</button>
      </div>
    ` : ""}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${admin ? "<th class='mark-col'>Mark</th>" : ""}
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
            <tr class="${selectedProjectIds.has(String(p.id)) ? "row-selected" : ""}">
              ${admin ? `<td class="mark-col"><input class="mark-project" type="checkbox" data-action="mark-project" data-id="${p.id}" ${selectedProjectIds.has(String(p.id)) ? "checked" : ""} aria-label="Mark ${p.project}" /></td>` : ""}
              <td><strong>${p.project}</strong></td>
              ${includeClient ? `<td>${p.client}</td>` : ""}
              <td>${typeChip(p)}</td>
              ${includeScriptRaw ? `<td>${linkCell(p.script)}</td><td>${linkCell(p.raw)}</td>` : ""}
              <td>${renderStatusSelect(p, admin)}</td>
              <td>${editorChip(p.editor)}</td>
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
  const visibleRows = workspaceMode === "all" ? rows : workspaceMode === "available" ? rows.filter(p => !p.editor) : rows.filter(p => p.editor === editor);
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
            <button class="${workspaceMode === "all" ? "active" : ""}" data-mode="all">All</button>
          </div>
        </div>
      </div>
      ${projectTable(visibleRows, { editor, admin: false, includeClient: !nicolasOnly, includeScriptRaw: !nicolasOnly, includeDeliverable: !nicolasOnly })}
    </div>
  `;
}

function renderLinks() {
  const visibleLinks = quickLinks.filter(link => canSeeQuickLink(link));
  document.querySelector("#view-links").innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div><h2>Quick Links</h2></div>
        ${isAdmin() ? `<button class="primary-button" data-action="add-link">${icon("plus")} Add Link</button>` : ""}
      </div>
      <div class="grid quick-links">
        ${visibleLinks.map(link => `
          <div class="card quick-link">
            ${isAdmin() ? `
              <div class="quick-link-actions">
                <button class="icon-action light-icon" data-action="edit-link" data-id="${link.id}" title="Edit">${icon("pen")}</button>
                <button class="icon-action light-icon danger-light" data-action="delete-link" data-id="${link.id}" title="Delete">${icon("trash")}</button>
              </div>
            ` : ""}
            <h3>${link.name}</h3>
            <p>${link.notes}</p>
            <a href="${link.url || "#"}" target="_blank" rel="noopener" class="linkish">${icon("link")} Open link</a>
          </div>
        `).join("") || `<div class="empty-card">No quick links yet.</div>`}
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
              const deleteButton = name === "Essi" ? `<button class="ghost-button" disabled>${icon("lock")} Locked</button>` : `<button class="danger-button" data-action="delete-editor" data-editor="${name}">${icon("release")} Delete</button>`;
              return `<tr><td><strong>${name}</strong></td><td>${user.username || name.toLowerCase()}</td><td>${accessLabel(user.access || "nicolas")}</td><td>${user.password || "demo"}</td><td class="row-actions"><button class="ghost-button" data-action="edit-editor" data-editor="${name}">${icon("file")} Edit</button>${deleteButton}</td></tr>`;
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
  const hideProjectButton = showWorkspaceEarnings || view === "links";
  topEarningsBox.classList.add("hidden");
  search.classList.toggle("hidden", showWorkspaceEarnings);
  if (!showWorkspaceEarnings) search.value = searchTerm;
  addProjectButton.classList.toggle("hidden", hideProjectButton);
  eyebrow.classList.toggle("hidden", showWorkspaceEarnings);
}

function applySession(user) {
  currentUser = user;
  activeEditor = user;
  workspaceMode = "mine";
  localStorage.setItem("visualsByEssiSession", user);
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
  localStorage.removeItem("visualsByEssiSession");
  document.querySelector("#appShell").classList.add("hidden");
  document.querySelector("#loginScreen").classList.remove("hidden");
}

function configureProjectForm(clientPreset = "") {
  const form = document.querySelector("#projectForm");
  const clientSelect = form.elements.client;
  const editorSelect = form.elements.editor;
  const typeSelect = form.elements.type;
  const editingProject = projects.find(project => String(project.id) === String(editingProjectId));
  const selectedClient = editingProject?.client || clientPreset || clientSelect.value || "Mehdi";
  const isNicolasProject = selectedClient === "Nicolas";
  const editorLockedToCurrentUser = !isAdmin();

  [...clientSelect.options].forEach(option => {
    option.disabled = !isAdmin() && option.value !== "Nicolas";
  });
  [...editorSelect.options].forEach(option => {
    const value = option.value;
    const allowedForClient = value === "Unassigned" || allowedEditors(selectedClient).includes(value);
    option.disabled = (!isAdmin() && value !== currentUser) || !allowedForClient;
  });
  [...typeSelect.options].forEach(option => {
    const nicolasType = ["Easy", "Hard"].includes(option.value);
    option.disabled = isNicolasProject ? !nicolasType : nicolasType;
    option.hidden = !isAdmin() && isNicolasProject ? !nicolasType : false;
  });

  if (editingProject) {
    clientSelect.value = editingProject.client;
    form.elements.project.value = editingProject.project;
    typeSelect.value = editingProject.type;
    editorSelect.value = editingProject.editor || "Unassigned";
    form.elements.script.value = editingProject.scriptLink || "";
    form.elements.raw.value = editingProject.rawLink || "";
  } else if (clientPreset) {
    clientSelect.value = clientPreset;
  }
  if (!isAdmin() && !editingProject) {
    clientSelect.value = "Nicolas";
    editorSelect.value = currentUser;
  }
  if (isNicolasProject && !["Easy", "Hard"].includes(typeSelect.value)) typeSelect.value = "Easy";
  if (!isNicolasProject && ["Easy", "Hard"].includes(typeSelect.value)) typeSelect.value = "Regular Edit";
  if (![...editorSelect.options].some(option => option.value === editorSelect.value && !option.disabled)) {
    editorSelect.value = isAdmin() ? "Unassigned" : currentUser;
  }

  document.querySelector("#modalTitle").textContent = editingProject ? "Edit Project" : isNicolasProject ? "Add Nicolas Project" : "Add Project";
  document.querySelector("#projectSubmitButton").textContent = editingProject ? "Save Changes" : "Create Project";
  document.querySelectorAll("[data-form-field]").forEach(field => {
    const name = field.dataset.formField;
    const shouldHide =
      (name === "client" && (isNicolasProject || !isAdmin())) ||
      (isNicolasProject && ["script", "raw"].includes(name)) ||
      (editorLockedToCurrentUser && name === "editor");
    field.classList.toggle("hidden", shouldHide);
  });
}

function openModal(clientPreset = "") {
  configureProjectForm(clientPreset);
  document.querySelector("#modal").classList.add("open");
}

function closeModal() {
  editingProjectId = null;
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

function openLinkModal(linkId = "") {
  editingLinkId = linkId || null;
  const form = document.querySelector("#linkForm");
  const link = quickLinks.find(item => String(item.id) === String(editingLinkId));
  form.reset();
  document.querySelector("#linkModalTitle").textContent = link ? "Edit Link" : "Add Link";
  document.querySelector("#linkSubmitButton").textContent = link ? "Save Link" : "Add Link";
  if (link) {
    form.elements.title.value = link.name || "";
    form.elements.description.value = link.notes || "";
    form.elements.client.value = link.client || "All";
    form.elements.url.value = link.url || "";
  }
  document.querySelector("#linkModal").classList.add("open");
}

function closeLinkModal() {
  editingLinkId = null;
  document.querySelector("#linkModal").classList.remove("open");
}

document.addEventListener("click", async (event) => {
  const nav = event.target.closest(".nav-item");
  if (nav) setView(nav.dataset.view);

  const actionButtonEl = event.target.closest("[data-action]");
  const action = actionButtonEl?.dataset.action;
  if (action === "take" || action === "release") {
    const p = projects.find(project => String(project.id) === actionButtonEl.dataset.id);
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
    await saveProjectRemote(p);
    renderAll();
  }

  const mode = event.target.dataset.mode;
  if (mode) {
    workspaceMode = mode;
    renderAll();
  }

  if (action === "add-nicolas") {
    openModal("Nicolas");
  }

  if (action === "add-link") {
    openLinkModal();
  }

  if (action === "edit-link") {
    openLinkModal(actionButtonEl.dataset.id);
  }

  if (action === "delete-link") {
    const link = quickLinks.find(item => String(item.id) === actionButtonEl.dataset.id);
    if (!link) return;
    if (!confirm(`Delete ${link.name}?`)) return;
    await deleteQuickLinkRemote(link);
    const index = quickLinks.findIndex(item => String(item.id) === String(link.id));
    if (index > -1) quickLinks.splice(index, 1);
    saveQuickLinks();
    renderAll();
    setView("links");
  }

  if (action === "edit-editor") {
    openEditorModal(actionButtonEl.dataset.editor);
  }

  if (action === "edit-project") {
    const project = projects.find(item => String(item.id) === actionButtonEl.dataset.id);
    if (!project || project.status === "Paid") return;
    editingProjectId = project.id;
    openModal(project.client);
  }

  if (action === "delete-project") {
    const project = projects.find(item => String(item.id) === actionButtonEl.dataset.id);
    if (!project) return;
    if (!confirm(`Delete ${project.project}?`)) return;
    await deleteProjectRemote(project);
    const index = projects.findIndex(item => String(item.id) === String(project.id));
    if (index > -1) projects.splice(index, 1);
    selectedProjectIds.delete(String(project.id));
    renderAll();
    setView(currentView);
  }

  if (action === "delete-selected") {
    const selectedProjects = projects.filter(project => selectedProjectIds.has(String(project.id)));
    if (!selectedProjects.length) return;
    if (!confirm(`Delete ${selectedProjects.length} selected project${selectedProjects.length > 1 ? "s" : ""}?`)) return;
    for (const project of selectedProjects) {
      await deleteProjectRemote(project);
    }
    for (let index = projects.length - 1; index >= 0; index -= 1) {
      if (selectedProjectIds.has(String(projects[index].id))) projects.splice(index, 1);
    }
    selectedProjectIds.clear();
    renderAll();
    setView(currentView);
  }

  if (action === "delete-editor") {
    const name = actionButtonEl.dataset.editor;
    if (name === "Essi") return;
    if (!confirm(`Delete ${name}?`)) return;
    await deleteEditorRemote(name);
    const editorIndex = editors.indexOf(name);
    if (editorIndex > -1) editors.splice(editorIndex, 1);
    removeEditorAccess(name);
    delete users[name];
    projects.forEach(project => {
      if (project.editor === name) {
        project.editor = "";
        project.status = "";
        project.deliverable = "";
      }
    });
    saveEditorState();
    refreshEditorOptions();
    renderAll();
    setView("editors");
  }
});

document.addEventListener("change", async (event) => {
  if (event.target.dataset.action === "mark-project") {
    const id = event.target.dataset.id;
    if (event.target.checked) selectedProjectIds.add(id);
    else selectedProjectIds.delete(id);
    renderAll();
    setView(currentView);
    return;
  }

  if (event.target.dataset.action === "status") {
    const p = projects.find(project => String(project.id) === event.target.dataset.id);
    if (p && (event.target.dataset.admin === "true" || event.target.value !== "Paid")) {
      p.status = event.target.value;
      if (p.status === "Paid" && !p.paidAt) p.paidAt = new Date().toISOString();
      if (p.status !== "Paid") p.paidAt = "";
      await saveProjectRemote(p);
    }
    await cleanupExpiredPaidProjects();
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
document.querySelector("#closeLinkModal").onclick = closeLinkModal;
document.querySelector("#cancelLinkModal").onclick = closeLinkModal;
document.querySelector("#logoutButton").onclick = endSession;
document.querySelector("#toggleLoginPassword").onclick = () => {
  const input = document.querySelector("#loginPassword");
  const button = document.querySelector("#toggleLoginPassword");
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  button.classList.toggle("is-showing", !showing);
  button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
};
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
document.querySelector("#projectForm").elements.client.onchange = () => configureProjectForm(document.querySelector("#projectForm").elements.client.value);
document.querySelector("#editorForm").onsubmit = async (event) => {
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
    id: oldName && users[oldName]?.id ? users[oldName].id : users[name]?.id,
    role: "Editor",
    username: data.username.trim() || name.toLowerCase(),
    password: data.password,
    access: data.access
  };
  addEditorAccess(name, data.access);
  await saveEditorRemote(name);
  saveEditorState();
  refreshEditorOptions();
  closeEditorModal();
  event.currentTarget.reset();
  renderAll();
  setView("editors");
};
document.querySelector("#linkForm").onsubmit = (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const existingLink = quickLinks.find(item => String(item.id) === String(editingLinkId));
  const link = existingLink || {
    id: `local-${crypto.randomUUID()}`
  };
  Object.assign(link, {
    name: data.title.trim(),
    client: data.client,
    notes: data.description.trim(),
    url: data.url.trim()
  });
  if (!existingLink) quickLinks.unshift(link);
  saveQuickLinks();
  closeLinkModal();
  renderAll();
  setView("links");
  saveQuickLinkRemote(link).then(saveQuickLinks);
};
document.querySelector("#projectForm").onsubmit = async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (!isAdmin() && data.client !== "Nicolas") return;
  const selectedClient = !isAdmin() ? "Nicolas" : data.client;
  const isNicolasProject = selectedClient === "Nicolas";
  if (isNicolasProject && !["Easy", "Hard"].includes(data.type)) return;
  if (!isNicolasProject && ["Easy", "Hard"].includes(data.type)) return;
  const existingProject = projects.find(item => String(item.id) === String(editingProjectId));
  const project = existingProject || {
    id: nextId++,
    status: !isAdmin() ? "Ongoing" : data.editor === "Unassigned" ? "" : "Ongoing",
    deliverable: "",
    paidAt: ""
  };
  Object.assign(project, {
    client: selectedClient,
    project: data.project,
    type: data.type,
    script: !isAdmin() || isNicolasProject ? false : Boolean(data.script),
    raw: !isAdmin() || isNicolasProject ? false : Boolean(data.raw),
    scriptLink: !isAdmin() || isNicolasProject ? "" : data.script,
    rawLink: !isAdmin() || isNicolasProject ? "" : data.raw,
    editor: !isAdmin() ? currentUser : data.editor === "Unassigned" ? "" : data.editor
  });
  if (!existingProject) projects.unshift(project);
  event.currentTarget.reset();
  closeModal();
  renderAll();
  setView(currentView);
  saveProjectRemote(project).then(() => {
    renderAll();
    setView(currentView);
  });
};

loadQuickLinks();

loadRemoteData().then(() => {
  const savedSession = localStorage.getItem("visualsByEssiSession");
  if (savedSession && users[savedSession]) {
    applySession(savedSession);
  } else {
    renderAll();
    if (currentUser) setView(currentView);
  }
});
