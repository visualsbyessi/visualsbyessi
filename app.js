const editors = ["Essi", "Aimae", "Thea", "Siren", "David", "Mc", "Drix"];
const nicolasEditors = ["Essi", "Siren", "David", "Mc", "Drix"];
const mdEditors = ["Essi", "Aimae", "Thea"];
const users = {
  Essi: { role: "Editor", username: "Visualsbyessi", password: "Cielo122900!", access: "all", discordId: "" },
  Aimae: { role: "Editor", username: "aimae", password: "demo", access: "md", discordId: "" },
  Thea: { role: "Editor", username: "thea", password: "demo", access: "md", discordId: "" },
  Siren: { role: "Editor", username: "siren", password: "demo", access: "nicolas", discordId: "" },
  David: { role: "Editor", username: "david", password: "demo", access: "nicolas", discordId: "" },
  Mc: { role: "Editor", username: "mc", password: "demo", access: "nicolas", discordId: "" },
  Drix: { role: "Editor", username: "drix", password: "demo", access: "nicolas", discordId: "" }
};

const clients = [
  { id: "legacy-deniss", name: "Deniss", rates: [
    { type: "Regular Edit", invoiceRate: 20, editorRate: 350, billing: "video" },
    { type: "Long Story", invoiceRate: 25, editorRate: 350, billing: "2_minutes" },
    { type: "Translation", invoiceRate: 15, editorRate: 350, billing: "video" }
  ] },
  { id: "legacy-mehdi", name: "Mehdi", rates: [
    { type: "Regular Edit", invoiceRate: 20, editorRate: 350, billing: "video" }
  ] },
  { id: "legacy-nicolas", name: "Nicolas", rates: [
    { type: "Easy", invoiceRate: 15, editorRate: 350, billing: "video" },
    { type: "Hard", invoiceRate: 20, editorRate: 500, billing: "video" }
  ] }
];

const SUPABASE_URL = "https://hbyvddtczxjmjiommlcg.supabase.co";
const SUPABASE_KEY = "sb_publishable_JpMQkv99uAgopgWsRtxwOA_RWiB6-2S";
const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1`;
const DISCORD_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/discord-notify`;
let remoteEnabled = true;
let remotePaidAtEnabled = true;
let remoteTrashEnabled = true;
let remoteProjectNotesEnabled = true;
let remoteClientsEnabled = true;
let liveSyncRunning = false;
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
  dedupeEditors();
  nicolasEditors.splice(0, nicolasEditors.length);
  mdEditors.splice(0, mdEditors.length);
  editors.forEach(name => addEditorAccess(name, users[name]?.access || "nicolas"));
}

function dedupeEditors() {
  const seen = new Set();
  for (let index = editors.length - 1; index >= 0; index -= 1) {
    const cleanName = String(editors[index] || "").trim();
    const key = cleanName.toLowerCase();
    if (!cleanName || seen.has(key)) {
      editors.splice(index, 1);
      continue;
    }
    editors[index] = cleanName;
    seen.add(key);
  }
}

async function loadRemoteData() {
  if (!remoteEnabled) return;
  try {
    if (remoteClientsEnabled) {
      try {
        const remoteClients = await supabaseRequest("/clients?select=*&order=name.asc");
        clients.splice(0, clients.length, ...remoteClients.map(client => ({
          id: client.id,
          name: client.name,
          rates: Array.isArray(client.rates) ? client.rates.map(rate => ({
            type: rate.type || "Project",
            invoiceRate: Number(rate.invoiceRate ?? rate.invoice_rate ?? 0),
            editorRate: Number(rate.editorRate ?? rate.editor_rate ?? 0),
            billing: rate.billing === "2_minutes" ? "minutes" : (rate.billing || "video"),
            billingMinutes: Number(rate.billingMinutes ?? rate.billing_minutes ?? (rate.billing === "2_minutes" ? 2 : 0))
          })) : []
        })));
      } catch (error) {
        remoteClientsEnabled = false;
        console.warn("Client management needs the clients table update.", error);
      }
    }

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
          access: editor.access,
          discordId: editor.discord_id || editor.discordId || ""
        };
      });
      rebuildAccessLists();
    }

    const remoteProjects = await supabaseRequest("/projects?select=*,editors(name)&order=created_at.desc");
    projects.splice(0, projects.length, ...remoteProjects.map(project => ({
      id: project.id,
      client: project.client,
      project: project.project_name,
      type: project.type || "",
      script: Boolean(project.script_link),
      raw: Boolean(project.raw_link),
      scriptLink: project.script_link || "",
      rawLink: project.raw_link || "",
      notes: project.notes || "",
      editor: project.editors?.name || "",
      status: project.status || "To Do",
      deliverable: project.deliverable_link || "",
      duration: Number(project.duration_minutes || 0),
      paidAt: project.paid_at || "",
      deletedAt: project.deleted_at || "",
      deletedBy: project.deleted_by || ""
    })));
    await cleanupExpiredPaidProjects();
    await cleanupExpiredTrashProjects();

    const remoteLinks = await supabaseRequest("/quick_links?select=*&order=created_at.desc");
    quickLinks.splice(0, quickLinks.length, ...remoteLinks.map(link => ({
      id: link.id,
      name: link.name || link.title,
      client: link.client || link.visible || "All",
      notes: link.notes || link.description || "",
      url: link.url || "#"
    })));
    saveQuickLinks();
    refreshEditorOptions();
  } catch (error) {
    remoteEnabled = false;
    console.warn("Using local data because Supabase is not ready.", error);
  }
}

function clientByName(name) {
  return clients.find(client => client.name.toLowerCase() === String(name || "").toLowerCase());
}

function rateForProject(project) {
  const client = clientByName(project.client);
  return client?.rates?.find(rate => rate.type.toLowerCase() === String(project.type || "").toLowerCase()) || null;
}

function rateBillingMinutes(rate) {
  if (!rate) return 0;
  if (rate.billing === "2_minutes") return 2;
  return rate.billing === "minutes" ? Math.max(Number(rate.billingMinutes || 1), 0.01) : 0;
}

async function saveClientRemote(client) {
  if (!remoteEnabled || !remoteClientsEnabled) return;
  const payload = { name: client.name, rates: client.rates };
  if (client.id && !String(client.id).startsWith("local-") && !String(client.id).startsWith("legacy-")) {
    await supabaseRequest(`/clients?id=eq.${encodeURIComponent(client.id)}`, { method: "PATCH", body: JSON.stringify(payload) });
    return;
  }
  const [created] = await supabaseRequest("/clients", { method: "POST", body: JSON.stringify(payload) });
  if (created?.id) client.id = created.id;
}

async function deleteClientRemote(client) {
  if (!remoteEnabled || !remoteClientsEnabled || !client?.id || String(client.id).startsWith("local-") || String(client.id).startsWith("legacy-")) return;
  await supabaseRequest(`/clients?id=eq.${encodeURIComponent(client.id)}`, { method: "DELETE" });
}

function formIsOpen() {
  return Boolean(document.querySelector(".modal.open"));
}

function deliverableInputIsActive() {
  return Boolean(document.activeElement?.matches("[data-action='deliverable-input']"));
}

async function liveSyncRemoteData() {
  if (!remoteEnabled || liveSyncRunning || formIsOpen() || deliverableInputIsActive() || !currentUser || currentView === "invoices") return;
  liveSyncRunning = true;
  try {
    await loadRemoteData();
    renderAll();
    setView(currentView);
  } finally {
    liveSyncRunning = false;
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
    access: user.access,
    discord_id: user.discordId || ""
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
    deliverable_link: project.deliverable || null,
    duration_minutes: project.duration || null
  };
  if (remoteProjectNotesEnabled) payload.notes = project.notes || null;
  if (remotePaidAtEnabled) payload.paid_at = project.paidAt || null;
  if (remoteTrashEnabled) {
    payload.deleted_at = project.deletedAt || null;
    payload.deleted_by = project.deletedBy || null;
  }
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
    if (remoteTrashEnabled && String(error.message || "").includes("deleted_")) {
      remoteTrashEnabled = false;
      delete payload.deleted_at;
      delete payload.deleted_by;
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
    if (remoteProjectNotesEnabled && String(error.message || "").includes("notes")) {
      remoteProjectNotesEnabled = false;
      delete payload.notes;
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
    const hasRemoteId = typeof link.id === "string" && link.id.length > 20 && !link.id.startsWith("local-") && !link.id.startsWith("sample-");
    if (hasRemoteId) {
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
  const id = String(link.id || "");
  const hasRemoteId = remoteEnabled && id.length > 20 && !id.startsWith("sample-") && !id.startsWith("local-");
  if (!hasRemoteId) return;
  try {
    await supabaseRequest(`/quick_links?id=eq.${id}`, { method: "DELETE" });
  } catch (error) {
    alert("Could not delete quick link from Supabase. Please run the quick_links SQL permissions again.");
    console.error(error);
  }
}

async function cleanupExpiredPaidProjects() {
  const cutoff = Date.now() - PAID_DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const expired = projects.filter(project => {
    if (project.deletedAt || project.status !== "Paid" || !project.paidAt) return false;
    return new Date(project.paidAt).getTime() < cutoff;
  });
  if (!expired.length) return;
  for (const project of expired) {
    await softDeleteProject(project, "System");
  }
}

async function cleanupExpiredTrashProjects() {
  const cutoff = Date.now() - PAID_DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const expired = projects.filter(project => {
    if (!project.deletedAt) return false;
    return new Date(project.deletedAt).getTime() < cutoff;
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
  dedupeEditors();
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
    rebuildAccessLists();
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

function discordMention(name) {
  const id = users[name]?.discordId || "";
  return id ? `<@${id}>` : name;
}

function editorsForProjectClient(client) {
  if (client === "Nicolas") return nicolasEditors;
  if (client === "Mehdi" || client === "Deniss") return mdEditors;
  return editors;
}

function discordMentionsForClient(client, exceptName = "") {
  return editorsForProjectClient(client)
    .filter(name => name !== exceptName && users[name]?.discordId)
    .map(name => discordMention(name));
}

function discordProjectContent(action, project, actor = currentUser || "Essi", previousStatus = "") {
  const projectTitle = project.project || "Untitled project";
  const details = [
    `Client: ${project.client}`,
    `Project: ${projectTitle}`,
    project.type ? `Type: ${project.type}` : "",
    project.editor ? `Editor: ${project.editor}` : "",
    project.status ? `Status: ${project.status}` : ""
  ].filter(Boolean).join("\n");
  const otherEditors = discordMentionsForClient(project.client, actor).join(" ");
  const adminMention = users.Essi?.discordId ? discordMention("Essi") : "";
  const assignedMention = project.editor && users[project.editor]?.discordId ? discordMention(project.editor) : "";

  if (action === "take") return `🎬 ${actor} took a project.\n${details}${otherEditors ? `\n\n${otherEditors}` : ""}`;
  if (action === "release") return `↩️ ${actor} released a project.\n${details}${otherEditors ? `\n\n${otherEditors}` : ""}`;
  if (action === "assigned") return `📌 ${actor} assigned a project${assignedMention ? ` to ${assignedMention}` : ""}.\n${details}`;
  if (action === "unassigned_added") return `🆕 ${actor} added a new unassigned project.\n${details}${otherEditors ? `\n\n${otherEditors}` : ""}`;
  if (action === "add_nicolas") return `➕ ${actor} added a Nicolas project.\n${details}${otherEditors ? `\n\n${otherEditors}` : ""}`;
  if (action === "todo") return `📝 Project is now to do.\n${details}`;
  if (action === "ongoing") return `▶️ ${actor} started working on a project.\n${details}`;
  if (action === "checking") return `🔎 Project is ready for checking.${adminMention ? ` ${adminMention}` : ""}\n${details}`;
  if (action === "revision") return `🔁 Project needs revision.${assignedMention ? ` ${assignedMention}` : ""}\n${details}`;
  if (action === "paid") return `✅ Project marked paid.${assignedMention ? ` ${assignedMention}` : ""}\n${details}`;
  return `Project updated${previousStatus ? ` from ${previousStatus}` : ""}.\n${details}`;
}

async function sendDiscordUpdate(action, project, actor = currentUser || "Essi", previousStatus = "") {
  try {
    await fetch(DISCORD_FUNCTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: discordProjectContent(action, project, actor, previousStatus),
        action,
        actor,
        previousStatus,
        project: {
          id: project.id,
          client: project.client,
          project: project.project,
          type: project.type,
          editor: project.editor,
          status: project.status
        }
      })
    });
  } catch (error) {
    console.warn("Discord notification was not sent.", error);
  }
}

function applyTheme(theme = currentTheme) {
  currentTheme = theme === "night" ? "night" : "day";
  document.body.classList.toggle("night-mode", currentTheme === "night");
  const label = document.querySelector("#themeToggleText");
  const button = document.querySelector("#themeToggle");
  if (label) label.textContent = currentTheme === "night" ? "Night" : "Day";
  if (button) button.setAttribute("aria-label", `Switch to ${currentTheme === "night" ? "day" : "night"} mode`);
  localStorage.setItem("visualsByEssiTheme", currentTheme);
}

loadEditorState();

let currentUser = null;
let activeEditor = "Essi";
let previewEditor = "Essi";
let workspaceMode = "mine";
let workspaceStatusFilter = "all";
let clientStatusFilters = { md: "all", nicolas: "all" };
let dashboardInvoiceFilter = "all";
let dashboardBreakdownMode = "invoice";
let dashboardPayoutEditor = "all";
let currentView = "dashboard";
let searchTerm = "";
let editingEditorName = null;
let editingProjectId = null;
let editingLinkId = null;
let editingClientId = null;
let detailsProjectId = null;
let invoices = JSON.parse(localStorage.getItem("vbeInvoices") || "[]");
let invoiceContacts = JSON.parse(localStorage.getItem("vbeInvoiceContacts") || "[]");
let contracts = JSON.parse(localStorage.getItem("vbeContracts") || "[]");
let draggingQuickLinkGroup = "";
const selectedProjectIds = new Set();
let nextId = 15;
const defaultNavOrder = ["dashboard", "clients", "invoices", "contracts", "editors", "workspace", "links", "trash", "viewas"];
let currentTheme = localStorage.getItem("visualsByEssiTheme") || "day";

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
  { id: "sample-1", name: "Main Upload Folder", client: "Nicolas", notes: "Final exports and handoff files", url: "#" },
  { id: "sample-2", name: "Editing Guidelines", client: "Nicolas", notes: "General editing standards", url: "#" },
  { id: "sample-3", name: "Caption Style Guide", client: "Mehdi", notes: "Caption format and styling", url: "#" },
  { id: "sample-4", name: "Deniss Script Folder", client: "Deniss", notes: "Scripts for Deniss work", url: "#" },
  { id: "sample-5", name: "Nicolas References", client: "Nicolas", notes: "Sample edits and references", url: "#" },
  { id: "sample-6", name: "Rate Sheet", client: "Private", notes: "Rates and payouts", url: "#" }
];

const statusOptions = ["To Do", "Ongoing", "For Checking", "Revision", "Done", "Paid"];
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
  if (clientByName(client)) return editors;
  if (client === "Nicolas") return nicolasEditors;
  return mdEditors;
}

function editorNameExists(name) {
  const key = String(name || "").trim().toLowerCase();
  return editors.some(editor => editor.toLowerCase() === key);
}

function addEditorAccess(name, access) {
  if (!editorNameExists(name)) editors.push(name);
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
  const configuredRate = rateForProject(project);
  if (configuredRate) {
    const minutes = rateBillingMinutes(configuredRate);
    if (minutes) return Math.ceil((project.duration || minutes) / minutes) * configuredRate.editorRate;
    return configuredRate.editorRate;
  }
  if (project.client === "Nicolas") return project.type === "Hard" ? 500 : 350;
  if (mdEditors.includes(project.editor)) return 350;
  return 0;
}

function activeProjects() {
  return projects.filter(project => !project.deletedAt);
}

function trashProjectsForCurrentUser() {
  if (isAdmin()) return projects.filter(project => project.deletedAt);
  return projects.filter(project => project.deletedAt && project.deletedBy === currentUser);
}

function softDeleteProject(project, deletedBy = currentUser || activeEditor || "Essi") {
  project.deletedAt = new Date().toISOString();
  project.deletedBy = deletedBy;
  selectedProjectIds.delete(String(project.id));
  return saveProjectRemote(project);
}

function restoreProject(project) {
  if (!isAdmin() && project.deletedBy !== currentUser) return Promise.resolve();
  project.deletedAt = "";
  project.deletedBy = "";
  selectedProjectIds.delete(String(project.id));
  return saveProjectRemote(project);
}

function isDuplicateProject(candidate, ignoreId = "") {
  const clean = value => String(value || "").trim().toLowerCase();
  return activeProjects().some(project =>
    String(project.id) !== String(ignoreId) &&
    clean(project.client) === clean(candidate.client) &&
    clean(project.project) === clean(candidate.project) &&
    clean(project.type) === clean(candidate.type)
  );
}

function invoiceAmount(project) {
  const configuredRate = rateForProject(project);
  if (configuredRate) {
    const minutes = rateBillingMinutes(configuredRate);
    if (minutes) return Math.ceil((project.duration || minutes) / minutes) * configuredRate.invoiceRate;
    return configuredRate.invoiceRate;
  }
  if (project.client === "Deniss") {
    if (project.type === "Long Story") return Math.ceil((project.duration || 2) / 2) * 25;
    if (project.type === "Translation") return 15;
    return 20;
  }
  if (project.client === "Nicolas") return project.type === "Hard" ? 20 : 15;
  return 0;
}

function invoiceRate(project) {
  const configuredRate = rateForProject(project);
  if (configuredRate) {
    const minutes = rateBillingMinutes(configuredRate);
    return minutes ? `$${configuredRate.invoiceRate} per ${minutes} min` : `$${configuredRate.invoiceRate}/project`;
  }
  if (project.client === "Deniss") {
    if (project.type === "Long Story") return "$25 per 2 min";
    if (project.type === "Translation") return "$15/video";
    return "$20/video";
  }
  if (project.client === "Nicolas") return project.type === "Hard" ? "$20/video" : "$15/video";
  return "-";
}

function counts(rows) {
  return {
    total: rows.length,
    todo: rows.filter(p => p.status === "To Do" || !p.status).length,
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
  return allowedEditors(client).includes(user);
}

function saveNavOrder() {
  const order = [...document.querySelectorAll(".nav-item")].map(item => item.dataset.view);
  localStorage.setItem("visualsByEssiNavOrder", JSON.stringify(order));
}

function applyNavOrder() {
  const nav = document.querySelector(".nav-group");
  if (!nav) return;
  let order = defaultNavOrder;
  try {
    const saved = JSON.parse(localStorage.getItem("visualsByEssiNavOrder") || "[]");
    if (Array.isArray(saved) && saved.length) {
      order = [...saved.filter(view => defaultNavOrder.includes(view)), ...defaultNavOrder.filter(view => !saved.includes(view))];
    }
  } catch (error) {
    order = defaultNavOrder;
  }
  order.forEach(view => {
    const item = nav.querySelector(`[data-view="${view}"]`);
    if (item) nav.appendChild(item);
  });
}

function initNavDrag() {
  const nav = document.querySelector(".nav-group");
  if (!nav) return;
  nav.querySelectorAll(".nav-item").forEach(item => {
    item.draggable = true;
    item.addEventListener("dragstart", event => {
      event.dataTransfer.setData("text/plain", item.dataset.view);
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      saveNavOrder();
    });
  });
  nav.addEventListener("dragover", event => {
    event.preventDefault();
    const dragging = nav.querySelector(".dragging");
    if (!dragging) return;
    const afterElement = [...nav.querySelectorAll(".nav-item:not(.dragging)")].find(item => {
      const box = item.getBoundingClientRect();
      return event.clientY < box.top + box.height / 2;
    });
    if (afterElement) nav.insertBefore(dragging, afterElement);
    else nav.appendChild(dragging);
  });
}

function saveQuickLinkOrderFromDom() {
  const orderedIds = [...new Set([...document.querySelectorAll(".quick-link[data-link-id]")]
    .map(card => String(card.dataset.linkId)))];
  if (!orderedIds.length) return;
  const orderedLinks = orderedIds
    .map(id => quickLinks.find(link => String(link.id) === id))
    .filter(Boolean);
  const remainingLinks = quickLinks.filter(link => !orderedIds.includes(String(link.id)));
  quickLinks.splice(0, quickLinks.length, ...orderedLinks, ...remainingLinks);
  saveQuickLinks();
}

function initQuickLinkDrag() {
  document.querySelectorAll(".quick-link[data-link-id]").forEach(card => {
    card.draggable = true;
    card.addEventListener("dragstart", event => {
      if (event.target.closest("button, a")) {
        event.preventDefault();
        return;
      }
      const group = card.closest(".quick-links");
      draggingQuickLinkGroup = group?.dataset.linkGroup || "";
      event.dataTransfer.setData("text/plain", card.dataset.linkId);
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      draggingQuickLinkGroup = "";
      saveQuickLinkOrderFromDom();
    });
  });
  document.querySelectorAll(".quick-links[data-link-group]").forEach(group => {
    group.addEventListener("dragover", event => {
      event.preventDefault();
      const dragging = document.querySelector(".quick-link.dragging");
      if (!dragging || draggingQuickLinkGroup !== group.dataset.linkGroup) return;
      const afterElement = [...group.querySelectorAll(".quick-link:not(.dragging)")].find(card => {
        const box = card.getBoundingClientRect();
        return event.clientY < box.top + box.height / 2;
      });
      if (afterElement) group.insertBefore(dragging, afterElement);
      else group.appendChild(dragging);
    });
  });
}

function formatDuration(minutes = 0) {
  const totalSeconds = Math.round(Number(minutes || 0) * 60);
  const wholeMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(wholeMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseDuration(value = "") {
  const match = String(value).trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return 0;
  return Number(match[1]) + Number(match[2]) / 60;
}

function updateDurationField() {
  const form = document.querySelector("#projectForm");
  const showDuration = rateBillingMinutes(rateForProject({ client: form.elements.client.value, type: form.elements.type.value })) > 0;
  const field = document.querySelector("[data-form-field='duration']");
  field.classList.toggle("hidden", !showDuration);
  form.elements.duration.required = showDuration;
  if (showDuration && !form.elements.duration.value) form.elements.duration.value = "02:00";
  if (!showDuration) form.elements.duration.value = "";
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

function safeUrl(url = "") {
  const clean = String(url || "").trim();
  if (!clean) return "";
  if (/^(https?:)?\/\//i.test(clean)) return clean;
  return `https://${clean}`;
}

function editorPalette(editor) {
  const palettes = [
    ["#dcf4e8", "#034b2b", "#17382a", "#9ff0c6"],
    ["#e4f0ff", "#164c8b", "#132d4c", "#a9d2ff"],
    ["#fff0cc", "#805000", "#3b2c12", "#ffd980"],
    ["#efe7ff", "#56349a", "#2e2348", "#d2bdff"],
    ["#e2f7f5", "#006b64", "#143a38", "#8ee5df"],
    ["#ffe8d7", "#8d3f05", "#422414", "#ffbd8d"],
    ["#ffe1e4", "#b4232c", "#442127", "#ff9aa2"],
    ["#edf2f7", "#344054", "#25313f", "#c7d5e5"],
    ["#dff7ff", "#075985", "#123747", "#9be5ff"],
    ["#f4e8ff", "#6b21a8", "#352042", "#dfb5ff"],
    ["#e9fbe8", "#166534", "#183a22", "#9ff5a9"],
    ["#fff7d6", "#854d0e", "#402d12", "#ffe28f"],
    ["#fce7f3", "#9d174d", "#4a1730", "#f9a8d4"],
    ["#ede9fe", "#5b21b6", "#2e224f", "#c4b5fd"],
    ["#dcfce7", "#14532d", "#173522", "#86efac"],
    ["#fee2e2", "#991b1b", "#461d1d", "#fca5a5"],
    ["#e0f2fe", "#075985", "#13354a", "#7dd3fc"],
    ["#fae8ff", "#86198f", "#3f1d45", "#f0abfc"],
    ["#fef3c7", "#92400e", "#432915", "#fcd34d"],
    ["#ccfbf1", "#115e59", "#123a37", "#5eead4"]
  ];
  const key = String(editor || "unassigned");
  const editorIndex = editors.findIndex(name => name.toLowerCase() === key.toLowerCase());
  if (editorIndex > -1) return palettes[editorIndex % palettes.length];
  const total = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palettes[total % palettes.length];
}

function editorChip(editor) {
  if (!editor) return `<span class="chip editor-unassigned">Unassigned</span>`;
  const [bg, fg, nightBg, nightFg] = editorPalette(editor);
  return `<span class="chip editor-chip editor-${chipClass(editor)}" style="--editor-bg:${bg};--editor-fg:${fg};--editor-night-bg:${nightBg};--editor-night-fg:${nightFg};">${editor}</span>`;
}

function actionButton(p, editor = activeEditor, admin = false) {
  const allowed = allowedEditors(p.client).includes(editor);
  const canEdit = admin || (p.status !== "Paid" && p.client === "Nicolas" && p.editor === editor);
  const canDelete = admin || (p.status !== "Paid" && p.editor === editor);
  const toggle = (checked, action, title) => `
    <button class="project-toggle ${checked ? "is-on" : ""}" data-action="${action}" data-id="${p.id}" title="${title}" aria-label="${title}">
      <span></span>
    </button>
  `;
  const baseActions = `
    ${canEdit ? `<button class="icon-action" data-action="edit-project" data-id="${p.id}" title="Edit">${icon("pen")}</button>` : ""}
    ${canDelete ? `<button class="icon-action danger-icon" data-action="delete-project" data-id="${p.id}" title="Delete">${icon("trash")}</button>` : ""}
  `;
  if (p.status === "Paid" && !admin) return `<div class="icon-actions"><button class="icon-action" disabled title="Locked">${icon("lock")}</button></div>`;
  if (admin && p.editor) return `<div class="icon-actions">${toggle(true, "release", "Release")}${baseActions}</div>`;
  if (!p.editor && allowed) return `<div class="icon-actions">${toggle(false, "take", "Take Project")}${baseActions}</div>`;
  if (p.editor === editor) return `<div class="icon-actions">${toggle(true, "release", "Release")}${baseActions}</div>`;
  return `<div class="icon-actions"><button class="icon-action" disabled title="Locked">${icon("lock")}</button></div>`;
}

function linkCell(url) {
  const href = safeUrl(url);
  return href ? `<a href="${href}" class="linkish" target="_blank" rel="noopener noreferrer">${icon("file")} View</a>` : `<span class="muted">None</span>`;
}

function escapeAttr(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function canEditDeliverable(p) {
  return isAdmin() || (p.editor === currentUser && p.status !== "Paid" && !p.paidAt);
}

function deliverableCell(p) {
  const href = safeUrl(p.deliverable);
  if (href || (p.editor && canEditDeliverable(p))) {
    return `
      <span class="deliverable-tools">
        ${canEditDeliverable(p) ? `<input class="table-input" data-action="deliverable-input" data-id="${p.id}" placeholder="Paste link" aria-label="Deliverable link" value="${escapeAttr(p.deliverable || "")}" />` : ""}
        ${href ? `<button class="linkish linkish-button" data-action="preview-deliverable" data-id="${p.id}" type="button">${icon("eye")} Preview</button>
        <button class="copy-link-button" data-action="copy-deliverable" data-id="${p.id}" type="button">Copy</button>` : ""}
      </span>
    `;
  }
  if (p.status === "Paid") return `<span class="muted">Paid</span>`;
  return `<span class="muted">-</span>`;
}

async function saveDeliverableInput(input) {
  const project = projects.find(item => String(item.id) === input.dataset.id);
  if (!project || !canEditDeliverable(project)) return;
  const nextLink = input.value.trim();
  if (!nextLink) return;
  project.deliverable = nextLink;
  await saveProjectRemote(project);
  renderAll();
  setView(currentView);
}

function renderStatusSelect(p, admin = false) {
  if (!p.editor) return `<span class="open-slot">Open to take</span>`;
  if (!admin && (p.status === "Paid" || p.paidAt)) return statusPill("Paid");
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
  const allowBulk = opts.allowBulk || admin;
  const includeClient = opts.includeClient !== false;
  const includeScriptRaw = opts.includeScriptRaw !== false;
  const includeDeliverable = opts.includeDeliverable !== false;
  const filteredRows = rows.filter(matchesSearch);
  const selectedCount = allowBulk ? selectedProjectIds.size : 0;
  return `
    ${allowBulk ? `
      <div class="bulk-actions ${selectedCount ? "" : "hidden"}">
        <strong>${selectedCount} selected</strong>
        <button class="danger-button" data-action="delete-selected">${icon("trash")} Delete selected</button>
      </div>
    ` : ""}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${allowBulk ? "<th class='mark-col'>Mark</th>" : ""}
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
              ${allowBulk ? `<td class="mark-col"><input class="mark-project" type="checkbox" data-action="mark-project" data-id="${p.id}" ${selectedProjectIds.has(String(p.id)) ? "checked" : ""} ${p.status === "Paid" ? "disabled" : ""} aria-label="Mark ${p.project}" /></td>` : ""}
              <td><button class="project-name-button" data-action="view-project" data-id="${p.id}" type="button">${escapeAttr(p.project)}</button>${p.notes ? `<span class="project-note">${escapeAttr(p.notes)}</span>` : ""}</td>
              ${includeClient ? `<td>${p.client}</td>` : ""}
              <td>${typeChip(p)}</td>
              ${includeScriptRaw ? `<td>${linkCell(p.scriptLink)}</td><td>${linkCell(p.rawLink)}</td>` : ""}
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

function summaryCards(c, activeFilter = "total") {
  const activeClass = filter => activeFilter === filter ? " active-filter" : "";
  return `
    <div class="card${activeClass("all")}" data-status-filter="all"><span class="card-icon">${icon("video")}</span><span class="label">Total videos</span><strong>${c.total}</strong><small>All visible projects</small></div>
    <div class="card${activeClass("todo")}" data-status-filter="todo"><span class="card-icon">${icon("file")}</span><span class="label">To do</span><strong>${c.todo}</strong><small>Ready to start</small></div>
    <div class="card${activeClass("ongoing")}" data-status-filter="ongoing"><span class="card-icon amber-icon">${icon("clock")}</span><span class="label">Ongoing</span><strong>${c.ongoing}</strong><small>In progress</small></div>
    <div class="card${activeClass("checking")}" data-status-filter="checking"><span class="card-icon gold-icon">${icon("search")}</span><span class="label">For checking</span><strong>${c.checking}</strong><small>Awaiting review</small></div>
    <div class="card${activeClass("revision")}" data-status-filter="revision"><span class="card-icon red-icon">${icon("refresh")}</span><span class="label">Revision</span><strong>${c.revision}</strong><small>Needs changes</small></div>
    <div class="card${activeClass("done")}" data-status-filter="done"><span class="card-icon green-icon">${icon("check")}</span><span class="label">Done</span><strong>${c.done}</strong><small>Done or paid</small></div>
  `;
}

function filterRowsByStatus(rows, filter) {
  return rows.filter(project => {
    if (filter === "all") return true;
    if (filter === "todo") return project.status === "To Do" || !project.status;
    if (filter === "ongoing") return project.status === "Ongoing";
    if (filter === "checking") return project.status === "For Checking";
    if (filter === "revision") return ["Revision", "For Revision"].includes(project.status);
    if (filter === "done") return ["Done", "Paid"].includes(project.status);
    return true;
  });
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
  const active = activeProjects();
  const billable = active.filter(p => p.status === "Done");
  const dashboardClientNames = [...new Set([...clients.map(client => client.name), ...active.map(project => project.client)].filter(Boolean))].sort();
  if (dashboardInvoiceFilter !== "all" && !dashboardClientNames.includes(dashboardInvoiceFilter)) dashboardInvoiceFilter = "all";
  const payable = active.filter(p => p.status === "Done");
  const payouts = payable.reduce((sum, p) => sum + editorPay(p), 0);
  const invoices = billable.reduce((sum, p) => sum + invoiceAmount(p), 0);
  const invoiceRows = billable.filter(p => dashboardInvoiceFilter === "all" || p.client === dashboardInvoiceFilter);
  const invoiceCardClass = dashboardBreakdownMode === "invoice" ? " active-filter" : "";
  const payoutCardClass = dashboardBreakdownMode === "payout" ? " active-filter" : "";
  const typeSummary = [...new Set(invoiceRows.map(project => project.type))]
    .map(type => ({ type, count: invoiceRows.filter(project => project.type === type).length }))
    .filter(item => item.count > 0);
  const payoutRows = payable.filter(project => project.editor);
  const filteredPayoutRows = payoutRows.filter(project => dashboardPayoutEditor === "all" || project.editor === dashboardPayoutEditor);
  const summaryTitle = dashboardBreakdownMode === "payout" ? "Payout Summary" : "Invoice Summary";

  document.querySelector("#view-dashboard").innerHTML = `
    <div class="cards">
      <div class="card invoice-filter-card${invoiceCardClass}" data-invoice-mode="true">
        <span class="card-icon">${icon("file")}</span>
        <span class="label">Client invoices</span>
        <strong>${money(invoiceRows.reduce((sum, project) => sum + invoiceAmount(project), 0))}</strong>
        <small>${invoiceRows.length} unpaid videos${dashboardInvoiceFilter === "all" ? "" : ` · ${escapeAttr(dashboardInvoiceFilter)}`}</small>
      </div>
      <div class="card invoice-filter-card${payoutCardClass}" data-payout-filter="true"><span class="card-icon green-icon">${icon("wallet")}</span><span class="label">Editor payouts</span><strong>₱${payouts.toLocaleString()}</strong><small>Unpaid done work</small></div>
      <div class="card"><span class="card-icon">${icon("wallet")}</span><span class="label">Invoice total</span><strong>${money(invoices)}</strong><small>Total unpaid billable</small></div>
      <div class="card dashboard-filter-card">
        <span class="card-icon">${icon("search")}</span>
        <span class="label">Filter client</span>
        <select class="dashboard-client-select" data-action="invoice-client-filter" aria-label="Filter dashboard by client">
          <option value="all"${dashboardInvoiceFilter === "all" ? " selected" : ""}>All clients</option>
          ${dashboardClientNames.map(name => `<option value="${escapeAttr(name)}"${dashboardInvoiceFilter === name ? " selected" : ""}>${escapeAttr(name)}</option>`).join("")}
        </select>
        <small>Updates invoices and breakdown</small>
      </div>
    </div>
    <div class="two-col">
      <div class="panel breakdown-table">
        <div class="panel-header">
          <h2>Work Breakdown</h2>
          ${dashboardBreakdownMode === "payout" ? `
            <select class="compact-select" data-action="payout-editor-filter" aria-label="Filter editor payout breakdown">
              <option value="all"${dashboardPayoutEditor === "all" ? " selected" : ""}>All editors</option>
              ${editors.map(editor => `<option value="${editor}"${dashboardPayoutEditor === editor ? " selected" : ""}>${editor}</option>`).join("")}
            </select>
          ` : `<span class="filter-caption">${dashboardInvoiceFilter === "all" ? "All clients" : escapeAttr(dashboardInvoiceFilter)}</span>`}
        </div>
        <div class="breakdown-scroll">
          ${dashboardBreakdownMode === "payout" ? `
            <table>
              <thead><tr><th>Project</th><th>Editor</th><th>Client</th><th>Type</th><th>Total Pay</th><th>Paid</th></tr></thead>
              <tbody>
                ${filteredPayoutRows.length ? filteredPayoutRows.map(project => `
                  <tr>
                    <td><strong>${project.project}</strong></td>
                    <td>${editorChip(project.editor)}</td>
                    <td>${project.client}</td>
                    <td>${typeChip(project)}</td>
                    <td>₱${editorPay(project).toLocaleString()}</td>
                    <td>
                      <button class="project-toggle" data-action="invoice-paid" data-id="${project.id}" title="Mark paid" aria-label="Mark ${project.project} paid">
                        <span></span>
                      </button>
                    </td>
                  </tr>
                `).join("") : `<tr><td colspan="6" class="empty-row">No payout items for this editor</td></tr>`}
              </tbody>
            </table>
          ` : `
            <table>
              <thead><tr><th>Project</th><th>Client</th><th>Type</th><th>Rate</th><th>Total</th><th>Paid</th></tr></thead>
              <tbody>
                ${invoiceRows.length ? invoiceRows.map(project => `
                  <tr>
                    <td><strong>${project.project}</strong></td>
                    <td>${project.client}</td>
                    <td>${typeChip(project)}</td>
                    <td>${invoiceRate(project)}</td>
                    <td>${money(invoiceAmount(project))}</td>
                    <td>
                      <button class="project-toggle" data-action="invoice-paid" data-id="${project.id}" title="Mark paid" aria-label="Mark ${project.project} paid">
                        <span></span>
                      </button>
                    </td>
                  </tr>
                `).join("") : `<tr><td colspan="6" class="empty-row">No unpaid invoice items</td></tr>`}
              </tbody>
            </table>
          `}
        </div>
      </div>
      <div class="panel breakdown-table payout-table">
        <div class="panel-header"><h2>${summaryTitle}</h2></div>
        <div class="breakdown-scroll">
          ${dashboardBreakdownMode === "payout" ? `
            <table>
              <thead><tr><th>Editor</th><th>Videos</th><th>Total Pay</th></tr></thead>
              <tbody>
                ${editors.map(ed => {
                  const rows = payable.filter(p => p.editor === ed);
                  return `<tr><td>${ed}</td><td>${rows.length}</td><td>₱${rows.reduce((s, p) => s + editorPay(p), 0).toLocaleString()}</td></tr>`;
                }).join("")}
              </tbody>
            </table>
          ` : `
            <table>
              <thead><tr><th>Type</th><th>Videos</th><th>Total</th></tr></thead>
              <tbody>
                ${typeSummary.length ? typeSummary.map(item => {
                  const rows = invoiceRows.filter(project => project.type === item.type);
                  return `<tr><td>${typeChip({ type: item.type })}</td><td>${item.count}</td><td>${money(rows.reduce((sum, project) => sum + invoiceAmount(project), 0))}</td></tr>`;
                }).join("") : `<tr><td colspan="3" class="empty-row">No invoice summary yet</td></tr>`}
              </tbody>
            </table>
          `}
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header"><h2>All Active Projects</h2></div>
      ${projectTable(active, { admin: true })}
    </div>
  `;
}

function renderClientPage(id, title, rows) {
  const isNicolasPage = id === "#view-nicolas";
  const filterKey = isNicolasPage ? "nicolas" : "md";
  const activeFilter = clientStatusFilters[filterKey] || "all";
  const visibleRows = filterRowsByStatus(rows, activeFilter);
  const canAdd = isAdmin() || (isNicolasPage && canCreateNicolasProject());
  document.querySelector(id).innerHTML = `
    <div class="cards filter-summary" data-client-filter="${filterKey}">${summaryCards(counts(rows), activeFilter).replace("grid", "")}</div>
    <div class="panel">
      <div class="panel-header">
        <div><h2>${title}</h2></div>
        ${canAdd ? `<button class="primary-button inline-add" data-client="${isNicolasPage ? "Nicolas" : "Mehdi"}">${icon("plus")} ${isNicolasPage ? "Add Nicolas Project" : "Add Mehdi & Deniss Project"}</button>` : ""}
      </div>
      ${projectTable(visibleRows, { admin: true, includeClient: !isNicolasPage, includeScriptRaw: !isNicolasPage, includeDeliverable: !isNicolasPage })}
    </div>
  `;
  document.querySelectorAll(".inline-add").forEach(add => {
    add.onclick = () => openModal(add.dataset.client || "");
  });
}

function renderWorkspace(editor = activeEditor, target = "#view-workspace") {
  const clientRows = activeProjects().filter(p => allowedEditors(p.client).includes(editor));
  const addNicolas = canCreateNicolasProject(editor) && target === "#view-workspace";
  const modeRows = workspaceMode === "all"
    ? clientRows
    : workspaceMode === "available"
      ? clientRows.filter(p => !p.editor)
      : clientRows.filter(p => p.editor === editor);
  const visibleRows = filterRowsByStatus(modeRows, workspaceStatusFilter);
  const nicolasOnly = visibleRows.length > 0 && visibleRows.every(p => p.client === "Nicolas");
  document.querySelector(target).innerHTML = `
    <div class="cards workspace-summary" data-workspace-cards="true">
      ${summaryCards(counts(modeRows), workspaceStatusFilter)}
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
      ${projectTable(visibleRows, { editor, admin: false, allowBulk: target === "#view-workspace", includeClient: !nicolasOnly, includeScriptRaw: !nicolasOnly, includeDeliverable: !nicolasOnly })}
    </div>
  `;
}

function renderLinks() {
  const visibleLinks = quickLinks.filter(link => canSeeQuickLink(link));
  const groups = [...clients.map(client => client.name), "Private"]
    .map(client => ({
      client,
      links: visibleLinks.filter(link => (link.client || "Private") === client)
    }))
    .filter(group => group.links.length || isAdmin());
  const renderLinkCard = link => `
    <div class="card quick-link" data-link-id="${link.id}">
      ${isAdmin() ? `
        <div class="quick-link-actions">
          <button class="icon-action light-icon" data-action="edit-link" data-id="${link.id}" title="Edit">${icon("pen")}</button>
          <button class="icon-action light-icon danger-light" data-action="delete-link" data-id="${link.id}" title="Delete">${icon("trash")}</button>
        </div>
      ` : ""}
      <h3>${link.name}</h3>
      ${link.notes ? `<p>${link.notes}</p>` : ""}
      <a href="${link.url || "#"}" target="_blank" rel="noopener" class="linkish">${icon("link")} Open link</a>
    </div>
  `;
  document.querySelector("#view-links").innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div><h2>Quick Links</h2></div>
        ${isAdmin() ? `<button class="primary-button" data-action="add-link">${icon("plus")} Add Link</button>` : ""}
      </div>
      <div class="quick-link-groups">
        ${groups.length ? groups.map(group => `
          <section class="link-client-card">
            <div class="link-client-header">
              <h3>${group.client}</h3>
              <span>${group.links.length} link${group.links.length === 1 ? "" : "s"}</span>
            </div>
            <div class="grid quick-links" data-link-group="${group.client}">
              ${group.links.map(renderLinkCard).join("") || `<div class="empty-card">No links yet.</div>`}
            </div>
          </section>
        `).join("") : `<div class="empty-card">No quick links yet.</div>`}
      </div>
    </div>
  `;
  initQuickLinkDrag();
}

function renderClients() {
  document.querySelector("#view-clients").innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2>Clients</h2>
          <p class="muted">Manage active clients, project types, billing rates, and editor payouts.</p>
        </div>
        <button class="primary-button" data-action="add-client">${icon("plus")} Add Client</button>
      </div>
      <div class="client-list">
        ${clients.length ? clients.map(client => `
          <article class="client-card">
            <div class="client-card-header">
              <div><span class="label">Client</span><h3>${escapeAttr(client.name)}</h3></div>
              <div class="icon-actions">
                <button class="ghost-button" data-action="add-client-project" data-client="${escapeAttr(client.name)}">${icon("plus")} Project</button>
                <button class="icon-action" data-action="edit-client" data-id="${escapeAttr(client.id)}" title="Edit client">${icon("pen")}</button>
                <button class="icon-action danger-icon" data-action="delete-client" data-id="${escapeAttr(client.id)}" title="Delete client">${icon("trash")}</button>
              </div>
            </div>
            <div class="client-rate-list">
              ${(client.rates || []).length ? client.rates.map(rate => `
                <div class="client-rate-item">
                  <strong>${escapeAttr(rate.type)}</strong>
                  <span>Client: $${Number(rate.invoiceRate || 0).toLocaleString()}${rateBillingMinutes(rate) ? ` / ${rateBillingMinutes(rate)} min` : " / project"}</span>
                  <span>Editor: ₱${Number(rate.editorRate || 0).toLocaleString()}${rateBillingMinutes(rate) ? ` / ${rateBillingMinutes(rate)} min` : " / project"}</span>
                </div>
              `).join("") : `<p class="muted">No project types configured.</p>`}
            </div>
          </article>
        `).join("") : `<div class="empty-state"><strong>No clients yet</strong><span>Add your first client to create projects.</span></div>`}
      </div>
    </div>
  `;
}

function addClientRateRow(rate = {}) {
  const container = document.querySelector("#clientRateRows");
  const row = document.createElement("div");
  row.className = "client-rate-row";
  row.innerHTML = `
    <label>Project type<input data-rate-field="type" required value="${escapeAttr(rate.type || "")}" placeholder="e.g. Regular Edit" /></label>
    <label>Client rate ($)<input data-rate-field="invoiceRate" required type="number" min="0" step="0.01" value="${Number(rate.invoiceRate || 0)}" /></label>
    <label>Editor pay (₱)<input data-rate-field="editorRate" required type="number" min="0" step="0.01" value="${Number(rate.editorRate || 0)}" /></label>
    <label>Billing<select data-rate-field="billing"><option value="video"${!rateBillingMinutes(rate) ? " selected" : ""}>Per project</option><option value="minutes"${rateBillingMinutes(rate) ? " selected" : ""}>Per custom minutes</option></select></label>
    <label class="billing-minutes-field">Minutes per rate<input data-rate-field="billingMinutes" type="number" min="0.01" step="0.01" value="${rateBillingMinutes(rate) || 2}" /></label>
    <button class="icon-action danger-icon remove-rate-row" type="button" title="Remove type">${icon("trash")}</button>
  `;
  row.querySelector(".remove-rate-row").onclick = () => row.remove();
  const updateBillingField = () => {
    const usesMinutes = row.querySelector("[data-rate-field='billing']").value === "minutes";
    row.querySelector(".billing-minutes-field").classList.toggle("hidden", !usesMinutes);
    row.querySelector("[data-rate-field='billingMinutes']").required = usesMinutes;
  };
  row.querySelector("[data-rate-field='billing']").onchange = updateBillingField;
  updateBillingField();
  container.appendChild(row);
}

function openClientModal(clientId = "") {
  editingClientId = clientId || null;
  const client = clients.find(item => String(item.id) === String(editingClientId));
  const form = document.querySelector("#clientForm");
  form.reset();
  document.querySelector("#clientRateRows").innerHTML = "";
  document.querySelector("#clientModalTitle").textContent = client ? "Edit Client" : "Add Client";
  document.querySelector("#clientSubmitButton").textContent = client ? "Save Client" : "Add Client";
  form.elements.name.value = client?.name || "";
  (client?.rates?.length ? client.rates : [{}]).forEach(addClientRateRow);
  document.querySelector("#clientModal").classList.add("open");
}

function closeClientModal() {
  editingClientId = null;
  document.querySelector("#clientModal").classList.remove("open");
}

function openProjectDetails(projectId) {
  const project = projects.find(item => String(item.id) === String(projectId));
  if (!project) return;
  detailsProjectId = project.id;
  document.querySelector("#projectDetailsTitle").textContent = project.project || "Untitled Project";
  document.querySelector("#projectDetailsSubtitle").textContent = `${project.client || "No client"} · ${project.type || "No type"}`;
  document.querySelector("#projectDetailsBody").innerHTML = `
    <div><span class="label">Client</span><strong>${escapeAttr(project.client || "-")}</strong></div>
    <div><span class="label">Project type</span><strong>${escapeAttr(project.type || "-")}</strong></div>
    <div><span class="label">Status</span>${statusPill(project.status || "To Do")}</div>
    <div><span class="label">Editor</span>${editorChip(project.editor)}</div>
    ${isAdmin() && currentView !== "viewas" ? `<div><span class="label">Client rate</span><strong>${invoiceRate(project)}</strong></div>` : ""}
    <div><span class="label">Editor payout</span><strong>₱${editorPay(project).toLocaleString()}</strong></div>
    <div><span class="label">Script</span>${linkCell(project.scriptLink)}</div>
    <div><span class="label">Raw files</span>${linkCell(project.rawLink)}</div>
    <div class="details-wide"><span class="label">Deliverable</span>${project.deliverable ? deliverableCell(project) : `<span class="muted">None</span>`}</div>
    <div class="details-wide"><span class="label">Notes</span><p>${escapeAttr(project.notes || "No notes")}</p></div>
  `;
  document.querySelector("#editProjectFromDetails").classList.toggle("hidden", !isAdmin() || currentView === "viewas");
  document.querySelector("#projectDetailsModal").classList.add("open");
}

function closeProjectDetails() {
  detailsProjectId = null;
  document.querySelector("#projectDetailsModal").classList.remove("open");
}

function renderEditors() {
  document.querySelector("#view-editors").innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div><h2>Editors</h2></div>
        <button class="primary-button" data-action="add-editor">${icon("plus")} Add Editor</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Username</th><th>Access</th><th>Discord ID</th><th>Password</th><th>Action</th></tr></thead>
          <tbody>
            ${editors.map(name => {
              const user = users[name] || {};
              const deleteButton = name === "Essi" ? `<button class="ghost-button" disabled>${icon("lock")} Locked</button>` : `<button class="danger-button" data-action="delete-editor" data-editor="${name}">${icon("release")} Delete</button>`;
              return `<tr><td><strong>${name}</strong></td><td>${user.username || name.toLowerCase()}</td><td>${accessLabel(user.access || "nicolas")}</td><td>${user.discordId || "Not set"}</td><td>${user.password || "demo"}</td><td class="row-actions"><button class="ghost-button" data-action="edit-editor" data-editor="${name}">${icon("file")} Edit</button>${deleteButton}</td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
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

function renderTrash() {
  const rows = trashProjectsForCurrentUser().filter(matchesSearch);
  document.querySelector("#view-trash").innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2>Trash</h2>
          <p class="muted">${isAdmin() ? "Deleted projects from all editors." : "Projects you deleted."} Trash empties after one week.</p>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Project</th><th>Client</th><th>Type</th><th>Status</th><th>Editor</th><th>Deleted By</th><th>Action</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(project => `
              <tr>
                <td><strong>${project.project}</strong></td>
                <td>${project.client}</td>
                <td>${typeChip(project)}</td>
                <td>${statusPill(project.status || "To Do")}</td>
                <td>${editorChip(project.editor)}</td>
                <td>${project.deletedBy || "-"}</td>
                <td><button class="ghost-button" data-action="restore-project" data-id="${project.id}">${icon("release")} Restore</button></td>
              </tr>
            `).join("") : `<tr><td colspan="7" class="empty-row">Trash is empty</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function documentClientsOptions(selected = "") {
  return clients.map(client => `<option value="${escapeAttr(client.name)}"${selected === client.name ? " selected" : ""}>${escapeAttr(client.name)}</option>`).join("");
}

function parseInvoiceItems(value = "") {
  return String(value).split("\n").map(line => {
    const [description, quantity = "1", rate = "0"] = line.split("|").map(part => part.trim());
    return { description, quantity: Math.max(Number(quantity || 1), 0), rate: Math.max(Number(rate || 0), 0) };
  }).filter(item => item.description);
}

function invoiceTotal(invoice) {
  const subtotal = invoice.items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const tax = subtotal * (Number(invoice.tax || 0) / 100);
  return { subtotal, tax, total: subtotal + tax - Number(invoice.discount || 0) };
}

function invoiceContactOptions(selected = "") {
  const names = [...new Set([...clients.map(client => client.name), ...invoiceContacts.map(client => client.name)])];
  return names.map(name => `<option value="${escapeAttr(name)}"${name === selected ? " selected" : ""}>${escapeAttr(name)}</option>`).join("");
}

function invoiceItemRow(item = { description: "", quantity: 1, rate: 0 }) {
  return `<div class="invoice-line-row">
    <label>Item<input data-invoice-item="description" value="${escapeAttr(item.description || "")}" placeholder="Video editing" /></label>
    <label>Quantity<input data-invoice-item="quantity" type="number" min="0" step="1" value="${Number(item.quantity || 1)}" /></label>
    <label>Price<input data-invoice-item="rate" type="number" min="0" step="0.01" value="${Number(item.rate || 0)}" /></label>
    <button type="button" class="danger-button invoice-line-remove" aria-label="Remove line item">×</button>
  </div>`;
}

function readInvoiceDraft() {
  const form = document.querySelector("#invoiceMakerForm");
  if (!form) return null;
  const data = Object.fromEntries(new FormData(form).entries());
  const items = [...form.querySelectorAll(".invoice-line-row")].map(row => ({
    description: row.querySelector('[data-invoice-item="description"]').value.trim(),
    quantity: Math.max(Number(row.querySelector('[data-invoice-item="quantity"]').value || 0), 0),
    rate: Math.max(Number(row.querySelector('[data-invoice-item="rate"]').value || 0), 0)
  })).filter(item => item.description);
  return { ...data, items, tax: Number(data.tax || 0), discount: Number(data.discount || 0) };
}

function updateInvoicePreview() {
  const invoice = readInvoiceDraft();
  const preview = document.querySelector("#invoiceLivePreview");
  if (!invoice || !preview) return;
  const totals = invoiceTotal(invoice);
  preview.innerHTML = `<div class="modern-invoice-head"><div><span>INVOICE</span><strong>VISUALS BY ESSI</strong></div><div><b>INVOICE NO</b>${escapeAttr(invoice.number || "—")}<b>DATE ISSUED</b>${escapeAttr(invoice.issueDate || "—")}</div></div>
    <div class="modern-invoice-client"><span>BILL TO</span><strong>${escapeAttr(invoice.clientName || invoice.client || "Client name")}</strong><small>${escapeAttr(invoice.clientEmail || "")}${invoice.clientAddress ? ` · ${escapeAttr(invoice.clientAddress)}` : ""}</small></div>
    <table><thead><tr><th>DESCRIPTION OF WORK</th><th>PRICE</th><th>QTY</th><th>TOTAL</th></tr></thead><tbody>${invoice.items.length ? invoice.items.map(item => `<tr><td>${escapeAttr(item.description)}</td><td>$${item.rate.toFixed(2)}</td><td>${item.quantity}</td><td>$${(item.quantity * item.rate).toFixed(2)}</td></tr>`).join("") : `<tr><td>Video editing</td><td>$0.00</td><td>1</td><td>$0.00</td></tr>`}<tr><td colspan="3">Subtotal</td><td>$${totals.subtotal.toFixed(2)}</td></tr></tbody></table>
    <div class="modern-invoice-total"><span>Total due</span><strong>$${totals.total.toFixed(2)}</strong></div>
    <div class="modern-invoice-bottom"><div><span>BILL FROM</span><strong>${escapeAttr(invoice.fromName || "Visuals by Essi")}</strong><small>${escapeAttr(invoice.fromEmail || "")}</small></div><div><span>PAYMENT DETAILS</span><small>${escapeAttr(invoice.paymentDetails || "Add payment details")}</small></div></div><div class="modern-invoice-wordmark">INVOICE</div>`;
}

function renderInvoices() {
  const today = new Date().toISOString().slice(0, 10);
  document.querySelector("#view-invoices").innerHTML = `<div class="native-invoice-layout">
    <section class="panel native-invoice-form"><div class="panel-header"><h2>New Invoice</h2></div>
      <form id="invoiceMakerForm" class="maker-form">
        <div class="form-grid"><label>Invoice number<input name="number" required value="INV-${String(invoices.length + 1).padStart(4, "0")}" /></label><label>Issue date<input name="issueDate" type="date" required value="${today}" /></label></div>
        <div class="invoice-section-title">Bill from</div><div class="form-grid"><label>Business name<input name="fromName" value="Visuals by Essi" /></label><label>Email<input name="fromEmail" type="email" /></label></div>
        <div class="invoice-section-title">Bill to</div><div class="invoice-client-tools"><label>Saved clients<select name="client"><option value="">Choose client</option>${invoiceContactOptions()}</select></label><button type="button" class="ghost-button" id="saveInvoiceClient">Save Client Details</button></div>
        <div class="form-grid"><label>Client name<input name="clientName" required /></label><label>Client email<input name="clientEmail" type="email" /></label><label class="form-wide">Client address<textarea name="clientAddress"></textarea></label></div>
        <div class="invoice-section-title">Line items</div><div id="invoiceLineItems">${invoiceItemRow({ description: "Video Editing", quantity: 1, rate: 0 })}</div><button type="button" class="ghost-button" id="addInvoiceLine">+ Add item</button>
        <div class="form-grid"><label>Tax (%)<input name="tax" type="number" min="0" value="0" /></label><label>Discount ($)<input name="discount" type="number" min="0" value="0" /></label><label class="form-wide">Payment details<textarea name="paymentDetails" placeholder="Bank name and account details"></textarea></label><label class="form-wide">Note (optional)<textarea name="notes"></textarea></label></div>
        <div class="invoice-form-actions"><button class="ghost-button" type="submit">Save Invoice</button><button class="primary-button" type="button" id="printInvoiceDraft">Download PDF</button></div>
      </form></section>
    <section class="panel native-invoice-preview-panel"><div class="panel-header"><h2>Live Preview</h2><span class="muted">Modern invoice</span></div><div id="invoiceLivePreview" class="modern-invoice-paper"></div></section></div>`;
  const form = document.querySelector("#invoiceMakerForm");
  form.addEventListener("input", updateInvoicePreview);
  form.elements.client.onchange = event => {
    const contact = invoiceContacts.find(item => item.name === event.target.value);
    form.elements.clientName.value = contact?.name || event.target.value;
    form.elements.clientEmail.value = contact?.email || "";
    form.elements.clientAddress.value = contact?.address || "";
    updateInvoicePreview();
  };
  document.querySelector("#addInvoiceLine").onclick = () => { document.querySelector("#invoiceLineItems").insertAdjacentHTML("beforeend", invoiceItemRow()); updateInvoicePreview(); };
  document.querySelector("#invoiceLineItems").onclick = event => { if (event.target.closest(".invoice-line-remove")) { event.target.closest(".invoice-line-row").remove(); updateInvoicePreview(); } };
  document.querySelector("#saveInvoiceClient").onclick = () => {
    const name = form.elements.clientName.value.trim();
    if (!name) return alert("Enter the client name first.");
    const contact = { name, email: form.elements.clientEmail.value.trim(), address: form.elements.clientAddress.value.trim() };
    invoiceContacts = invoiceContacts.filter(item => item.name.toLowerCase() !== name.toLowerCase());
    invoiceContacts.push(contact);
    localStorage.setItem("vbeInvoiceContacts", JSON.stringify(invoiceContacts));
    alert("Client details saved.");
  };
  form.onsubmit = event => { event.preventDefault(); const invoice = readInvoiceDraft(); if (!invoice.items.length) return alert("Add at least one item."); invoices.unshift({ id: crypto.randomUUID(), ...invoice }); localStorage.setItem("vbeInvoices", JSON.stringify(invoices)); alert("Invoice saved."); };
  document.querySelector("#printInvoiceDraft").onclick = () => { const invoice = readInvoiceDraft(); updateInvoicePreview(); printDocument(invoice.number || "Invoice", document.querySelector("#invoiceLivePreview").innerHTML); };
  updateInvoicePreview();
}

function renderContracts() {
  const today = new Date().toISOString().slice(0, 10);
  document.querySelector("#view-contracts").innerHTML = `
    <div class="maker-layout">
      <section class="panel maker-form-panel">
        <div class="panel-header"><h2>New Contract</h2></div>
        <form id="contractMakerForm" class="maker-form">
          <div class="form-grid">
            <label>Contract title<input name="title" required placeholder="Video Editing Agreement" /></label>
            <label>Client<select name="client" required><option value="">Select client</option>${documentClientsOptions()}</select></label>
            <label>Effective date<input name="effectiveDate" type="date" required value="${today}" /></label>
            <label>Service fee<input name="fee" required placeholder="$500 per month" /></label>
            <label class="form-wide">Scope of work<textarea name="scope" required placeholder="Editing services, deliverables, and turnaround"></textarea></label>
            <label class="form-wide">Payment terms<textarea name="paymentTerms" required placeholder="Payment schedule and accepted method"></textarea></label>
            <label class="form-wide">Additional terms<textarea name="terms" placeholder="Revisions, confidentiality, ownership, and termination"></textarea></label>
          </div>
          <button class="primary-button" type="submit">Save Contract</button>
        </form>
      </section>
      <section class="panel maker-library">
        <div class="panel-header"><h2>Contracts</h2><span class="muted">${contracts.length} saved</span></div>
        <div class="document-list">
          ${contracts.length ? contracts.map(contract => `<article class="document-row"><div><strong>${escapeAttr(contract.title)}</strong><span>${escapeAttr(contract.client)} · ${escapeAttr(contract.effectiveDate)}</span></div><span>${escapeAttr(contract.fee)}</span><div class="row-actions"><button class="ghost-button" data-action="print-contract" data-id="${contract.id}">Print / PDF</button><button class="danger-button" data-action="delete-contract" data-id="${contract.id}">Delete</button></div></article>`).join("") : `<div class="empty-state"><strong>No contracts yet</strong></div>`}
        </div>
      </section>
    </div>`;
  document.querySelector("#contractMakerForm").onsubmit = event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    contracts.unshift({ id: crypto.randomUUID(), ...data });
    localStorage.setItem("vbeContracts", JSON.stringify(contracts));
    renderContracts();
  };
}

function printDocument(title, body) {
  const popup = window.open("", "_blank", "width=900,height=900");
  if (!popup) return alert("Please allow popups to print this document.");
  popup.document.write(`<!doctype html><html><head><title>${escapeAttr(title)}</title><style>body{font:15px Arial;color:#17211d;margin:48px}header{display:flex;justify-content:space-between;border-bottom:3px solid #034b2b;padding-bottom:20px;margin-bottom:28px}h1,h2{margin:0 0 12px}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}.right{text-align:right}.section{margin:26px 0;white-space:pre-wrap}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:70px}.signature{border-top:1px solid #222;padding-top:8px}@media print{button{display:none}}</style></head><body>${body}<script>window.onload=()=>window.print()<\/script></body></html>`);
  popup.document.close();
}

function renderAll() {
  renderDashboard();
  renderClients();
  renderInvoices();
  renderContracts();
  renderEditors();
  renderWorkspace(currentUser || "Essi", "#view-workspace");
  renderLinks();
  renderTrash();
  renderViewAs();
}

function setView(view) {
  if (!isAdmin() && !["workspace", "links", "trash"].includes(view)) view = "workspace";
  currentView = view;
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active-view"));
  document.querySelector(`#view-${view}`).classList.add("active-view");
  document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === view));
  const labels = { dashboard: "Dashboard", clients: "Clients", invoices: "Invoice Maker", contracts: "Contract Maker", editors: "Editors", workspace: `${currentUser || "Essi"} Workspace`, links: "Quick Links", trash: "Trash", viewas: "View As Editor" };
  document.querySelector("#page-title").textContent = labels[view];
  updateTopbar(view);
}

function updateTopbar(view) {
  const topEarningsBox = document.querySelector("#topEarnings");
  const search = document.querySelector("#search");
  const addProjectButton = document.querySelector("#addProjectButton");
  const showWorkspaceEarnings = view === "workspace";
  topEarningsBox.classList.add("hidden");
  search.classList.toggle("hidden", showWorkspaceEarnings);
  if (!showWorkspaceEarnings) search.value = searchTerm;
  addProjectButton.classList.add("hidden");
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
  document.querySelector("#addProjectButton").classList.add("hidden");
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
  const selectedClient = editingProject?.client || clientPreset || clientSelect.value || clients[0]?.name || "";
  const editorLockedToCurrentUser = !isAdmin();
  const clientNames = clients.map(client => client.name);
  if (editingProject?.client && !clientNames.includes(editingProject.client)) clientNames.push(editingProject.client);
  clientSelect.innerHTML = clientNames.map(name => `<option value="${escapeAttr(name)}">${escapeAttr(name)}</option>`).join("");
  clientSelect.value = selectedClient;
  const configuredTypes = clientByName(selectedClient)?.rates?.map(rate => rate.type) || [];
  if (editingProject?.type && !configuredTypes.includes(editingProject.type)) configuredTypes.push(editingProject.type);
  typeSelect.innerHTML = configuredTypes.map(type => `<option value="${escapeAttr(type)}">${escapeAttr(type)}</option>`).join("");
  [...editorSelect.options].forEach(option => {
    const value = option.value;
    const allowedForClient = value === "Unassigned" || allowedEditors(selectedClient).includes(value);
    option.disabled = (!isAdmin() && value !== currentUser) || !allowedForClient;
  });

  if (editingProject) {
    clientSelect.value = editingProject.client;
    form.elements.project.value = editingProject.project;
    typeSelect.value = editingProject.type;
    editorSelect.value = editingProject.editor || "Unassigned";
    form.elements.script.value = editingProject.scriptLink || "";
    form.elements.raw.value = editingProject.rawLink || "";
    form.elements.notes.value = editingProject.notes || "";
    form.elements.duration.value = editingProject.duration ? formatDuration(editingProject.duration) : "";
  } else if (clientPreset) {
    clientSelect.value = clientPreset;
  }
  if (!isAdmin() && !editingProject) editorSelect.value = currentUser;
  if (![...editorSelect.options].some(option => option.value === editorSelect.value && !option.disabled)) {
    editorSelect.value = isAdmin() ? "Unassigned" : currentUser;
  }

  const modalTitle = selectedClient ? `Add ${selectedClient} Project` : "Add Project";
  document.querySelector("#modalTitle").textContent = editingProject ? "Edit Project" : modalTitle;
  document.querySelector("#projectSubmitButton").textContent = editingProject ? "Save Changes" : "Create Project";
  document.querySelectorAll("[data-form-field]").forEach(field => {
    const name = field.dataset.formField;
    const shouldHide =
      (name === "client" && !isAdmin()) ||
      (name === "duration" && !rateBillingMinutes(rateForProject({ client: clientSelect.value, type: typeSelect.value }))) ||
      (editorLockedToCurrentUser && name === "editor");
    field.classList.toggle("hidden", shouldHide);
  });
  updateDurationField();
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
    form.elements.discordId.value = user.discordId || "";
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
  const validLinkClients = [...clients.map(client => client.name), "Private"];
  form.elements.client.innerHTML = validLinkClients.map(name => `<option value="${escapeAttr(name)}">${escapeAttr(name)}</option>`).join("");
  form.reset();
  document.querySelector("#linkModalTitle").textContent = link ? "Edit Link" : "Add Link";
  document.querySelector("#linkSubmitButton").textContent = link ? "Save Link" : "Add Link";
  if (link) {
    form.elements.title.value = link.name || "";
    form.elements.description.value = link.notes || "";
    form.elements.client.value = validLinkClients.includes(link.client) ? link.client : validLinkClients[0];
    form.elements.url.value = link.url || "";
  }
  document.querySelector("#linkModal").classList.add("open");
}

function closeLinkModal() {
  editingLinkId = null;
  document.querySelector("#linkModal").classList.remove("open");
}

function deliverablePreviewSource(url) {
  const href = safeUrl(url);
  if (!href) return { href: "", type: "" };

  const driveFolderId = href.match(/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|embeddedfolderview\?id=)([^/?&#]+)/i)?.[1];
  if (driveFolderId) {
    return {
      href: `https://drive.google.com/embeddedfolderview?id=${driveFolderId}#grid`,
      type: "folder"
    };
  }

  const driveId = href.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([^/?&#]+)/i)?.[1];
  if (driveId) return { href: `https://drive.google.com/file/d/${driveId}/preview`, type: "frame" };

  const youtubeId = href.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^?&#/]+)/i)?.[1];
  if (youtubeId) return { href: `https://www.youtube.com/embed/${youtubeId}`, type: "frame" };

  if (/\.(mp4|webm|ogg|mov|m4v)(?:[?#].*)?$/i.test(href)) return { href, type: "video" };
  return { href, type: "frame" };
}

function openDeliverablePreview(projectId) {
  const project = projects.find(item => String(item.id) === String(projectId));
  const source = deliverablePreviewSource(project?.deliverable);
  if (!project || !source.href) return;

  const modal = document.querySelector("#deliverablePreviewModal");
  const stage = document.querySelector("#deliverablePreviewStage");
  document.querySelector("#deliverablePreviewTitle").textContent = project.project || "Deliverable preview";
  document.querySelector("#deliverablePreviewMeta").textContent = [project.client, project.editor].filter(Boolean).join(" · ");
  document.querySelector("#deliverablePreviewNote").textContent = source.type === "folder"
    ? "Open folders here until you find the video, then select it to preview."
    : "Use the player controls for volume, playback, and fullscreen.";
  stage.innerHTML = source.type === "video"
    ? `<video src="${escapeAttr(source.href)}" controls autoplay playsinline></video>`
    : `<iframe src="${escapeAttr(source.href)}" title="${escapeAttr(project.project || "Deliverable preview")}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("preview-open");
}

function closeDeliverablePreview() {
  const modal = document.querySelector("#deliverablePreviewModal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.querySelector("#deliverablePreviewStage").innerHTML = "";
  document.body.classList.remove("preview-open");
}

document.addEventListener("click", async (event) => {
  const nav = event.target.closest(".nav-item");
  if (nav) setView(nav.dataset.view);

  const actionButtonEl = event.target.closest("[data-action]");
  const action = actionButtonEl?.dataset.action;
  if (action === "mark-project") return;

  if (action === "print-invoice") {
    const invoice = invoices.find(item => item.id === actionButtonEl.dataset.id);
    if (!invoice) return;
    const totals = invoiceTotal(invoice);
    printDocument(invoice.number, `<header><div><h1>INVOICE</h1><strong>VISUALS BY ESSI</strong></div><div><strong>${escapeAttr(invoice.number)}</strong><br>Issued: ${escapeAttr(invoice.issueDate)}<br>Due: ${escapeAttr(invoice.dueDate)}</div></header><h2>Bill To</h2><p>${escapeAttr(invoice.client)}</p><table><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th class="right">Amount</th></tr></thead><tbody>${invoice.items.map(item => `<tr><td>${escapeAttr(item.description)}</td><td>${item.quantity}</td><td>$${item.rate.toFixed(2)}</td><td class="right">$${(item.quantity * item.rate).toFixed(2)}</td></tr>`).join("")}</tbody></table><div class="right">Subtotal: $${totals.subtotal.toFixed(2)}<br>Tax: $${totals.tax.toFixed(2)}<br>Discount: $${Number(invoice.discount).toFixed(2)}<h2>Total: $${totals.total.toFixed(2)}</h2></div><div class="section"><strong>Notes</strong><br>${escapeAttr(invoice.notes || "")}</div>`);
    return;
  }

  if (action === "delete-invoice") {
    if (!confirm("Delete this invoice?")) return;
    invoices = invoices.filter(item => item.id !== actionButtonEl.dataset.id);
    localStorage.setItem("vbeInvoices", JSON.stringify(invoices));
    renderInvoices();
    return;
  }

  if (action === "print-contract") {
    const contract = contracts.find(item => item.id === actionButtonEl.dataset.id);
    if (!contract) return;
    printDocument(contract.title, `<header><div><h1>${escapeAttr(contract.title)}</h1><strong>VISUALS BY ESSI</strong></div><div>Effective: ${escapeAttr(contract.effectiveDate)}</div></header><p>This agreement is entered into between <strong>Visuals by Essi</strong> and <strong>${escapeAttr(contract.client)}</strong>.</p><div class="section"><h2>Scope of Work</h2>${escapeAttr(contract.scope)}</div><div class="section"><h2>Service Fee</h2>${escapeAttr(contract.fee)}</div><div class="section"><h2>Payment Terms</h2>${escapeAttr(contract.paymentTerms)}</div><div class="section"><h2>Additional Terms</h2>${escapeAttr(contract.terms || "None")}</div><div class="signatures"><div class="signature">Visuals by Essi<br>Date:</div><div class="signature">${escapeAttr(contract.client)}<br>Date:</div></div>`);
    return;
  }

  if (action === "delete-contract") {
    if (!confirm("Delete this contract?")) return;
    contracts = contracts.filter(item => item.id !== actionButtonEl.dataset.id);
    localStorage.setItem("vbeContracts", JSON.stringify(contracts));
    renderContracts();
    return;
  }

  if (action === "view-project") {
    openProjectDetails(actionButtonEl.dataset.id);
    return;
  }

  if (action === "add-client") {
    openClientModal();
    return;
  }

  if (action === "add-client-project") {
    openModal(actionButtonEl.dataset.client);
    return;
  }

  if (action === "edit-client") {
    openClientModal(actionButtonEl.dataset.id);
    return;
  }

  if (action === "delete-client") {
    const client = clients.find(item => String(item.id) === String(actionButtonEl.dataset.id));
    if (!client || !confirm(`Delete ${client.name}? Existing projects will be kept.`)) return;
    clients.splice(clients.indexOf(client), 1);
    await deleteClientRemote(client);
    renderAll();
    setView("clients");
    return;
  }

  if (action === "preview-deliverable") {
    openDeliverablePreview(actionButtonEl.dataset.id);
    return;
  }

  if (action === "copy-deliverable") {
    const project = projects.find(item => String(item.id) === actionButtonEl.dataset.id);
    const href = safeUrl(project?.deliverable);
    if (!href) return;
    await navigator.clipboard.writeText(href);
    actionButtonEl.textContent = "Copied";
    setTimeout(() => {
      actionButtonEl.textContent = "Copy";
    }, 1200);
    return;
  }

  if (action === "take" || action === "release") {
    const p = projects.find(project => String(project.id) === actionButtonEl.dataset.id);
    if (!p || p.status === "Paid") return;
    const actor = activeEditor || currentUser || "Essi";
    if (action === "take") {
      p.editor = actor;
      p.status = "To Do";
    }
    if (action === "release") {
      p.editor = "";
      p.status = "";
      p.deliverable = "";
    }
    await saveProjectRemote(p);
    sendDiscordUpdate(action, p, actor);
    renderAll();
  }

  const mode = event.target.dataset.mode;
  if (mode) {
    workspaceMode = mode;
    renderAll();
  }

  const filterCard = event.target.closest("[data-status-filter]");
  if (filterCard) {
    const clientGroup = filterCard.closest("[data-client-filter]");
    if (clientGroup) {
      clientStatusFilters[clientGroup.dataset.clientFilter] = filterCard.dataset.statusFilter;
    } else {
      workspaceStatusFilter = filterCard.dataset.statusFilter;
    }
    renderAll();
    setView(currentView);
  }

  const invoiceFilterCard = event.target.closest("[data-invoice-filter]");
  if (invoiceFilterCard) {
    dashboardBreakdownMode = "invoice";
    dashboardInvoiceFilter = invoiceFilterCard.dataset.invoiceFilter || "all";
    renderAll();
    setView("dashboard");
  }

  const payoutFilterCard = event.target.closest("[data-payout-filter]");
  if (payoutFilterCard) {
    dashboardBreakdownMode = "payout";
    renderAll();
    setView("dashboard");
  }

  const invoiceModeCard = event.target.closest("[data-invoice-mode]");
  if (invoiceModeCard && !event.target.closest("select")) {
    dashboardBreakdownMode = "invoice";
    renderAll();
    setView("dashboard");
  }

  if (action === "invoice-paid") {
    const project = projects.find(item => String(item.id) === actionButtonEl.dataset.id);
    if (!project || project.status === "Paid") return;
    const previousStatus = project.status || "";
    project.status = "Paid";
    project.paidAt = new Date().toISOString();
    await saveProjectRemote(project);
    sendDiscordUpdate("paid", project, currentUser || "Essi", previousStatus);
    renderAll();
    setView("dashboard");
  }

  if (action === "add-nicolas") {
    openModal("Nicolas");
  }

  if (action === "add-link") {
    openLinkModal();
  }

  if (action === "add-editor") {
    openEditorModal();
  }

  if (action === "edit-link") {
    event.preventDefault();
    event.stopPropagation();
    openLinkModal(actionButtonEl.dataset.id);
  }

  if (action === "delete-link") {
    event.preventDefault();
    event.stopPropagation();
    const link = quickLinks.find(item => String(item.id) === actionButtonEl.dataset.id);
    if (!link) return;
    if (!confirm(`Delete ${link.name}?`)) return;
    const index = quickLinks.findIndex(item => String(item.id) === String(link.id));
    if (index > -1) quickLinks.splice(index, 1);
    saveQuickLinks();
    renderAll();
    setView("links");
    deleteQuickLinkRemote(link).then(saveQuickLinks);
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
    if (!project || project.status === "Paid") return;
    if (!confirm(`Move ${project.project} to Trash?`)) return;
    await softDeleteProject(project);
    renderAll();
    setView(currentView);
  }

  if (action === "delete-selected") {
    const selectedProjects = projects.filter(project => selectedProjectIds.has(String(project.id)) && project.status !== "Paid");
    if (!selectedProjects.length) return;
    if (!confirm(`Move ${selectedProjects.length} selected project${selectedProjects.length > 1 ? "s" : ""} to Trash?`)) return;
    for (const project of selectedProjects) {
      await softDeleteProject(project);
    }
    selectedProjectIds.clear();
    renderAll();
    setView(currentView);
  }

  if (action === "restore-project") {
    const project = projects.find(item => String(item.id) === actionButtonEl.dataset.id);
    if (!project) return;
    await restoreProject(project);
    renderAll();
    setView("trash");
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
    if ((p?.status === "Paid" || p?.paidAt) && event.target.dataset.admin !== "true") {
      if (p && p.status !== "Paid") {
        p.status = "Paid";
        saveProjectRemote(p);
      }
      renderAll();
      setView(currentView);
      return;
    }
    if (p && (event.target.dataset.admin === "true" || event.target.value !== "Paid")) {
      const previousStatus = p.status || "";
      p.status = event.target.value;
      if (p.status === "Paid" && !p.paidAt) p.paidAt = new Date().toISOString();
      if (p.status !== "Paid") p.paidAt = "";
      await saveProjectRemote(p);
      if (previousStatus !== p.status) {
        const statusAction = ({
          "To Do": "todo",
          "Ongoing": "ongoing",
          "For Checking": "checking",
          "For Revision": "revision",
          "Revision": "revision",
          "Paid": "paid"
        })[p.status];
        if (statusAction) sendDiscordUpdate(statusAction, p, currentUser || activeEditor || "Essi", previousStatus);
      }
    }
    await cleanupExpiredPaidProjects();
    renderAll();
  }

  if (event.target.dataset.action === "payout-editor-filter") {
    dashboardPayoutEditor = event.target.value || "all";
    renderAll();
    setView("dashboard");
  }

  if (event.target.dataset.action === "invoice-client-filter") {
    dashboardBreakdownMode = "invoice";
    dashboardInvoiceFilter = event.target.value || "all";
    renderAll();
    setView("dashboard");
  }

  if (event.target.dataset.action === "deliverable-input") {
    await saveDeliverableInput(event.target);
  }
});

document.addEventListener("paste", (event) => {
  if (event.target.dataset.action !== "deliverable-input") return;
  setTimeout(() => saveDeliverableInput(event.target), 0);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.querySelector("#deliverablePreviewModal")?.classList.contains("open")) {
    closeDeliverablePreview();
    return;
  }
  if (event.target.dataset.action !== "deliverable-input" || event.key !== "Enter") return;
  event.preventDefault();
  saveDeliverableInput(event.target);
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
document.querySelector("#closeClientModal").onclick = closeClientModal;
document.querySelector("#cancelClientModal").onclick = closeClientModal;
document.querySelector("#addRateRow").onclick = () => addClientRateRow();
document.querySelector("#closeProjectDetails").onclick = closeProjectDetails;
document.querySelector("#closeProjectDetailsButton").onclick = closeProjectDetails;
document.querySelector("#editProjectFromDetails").onclick = () => {
  const project = projects.find(item => String(item.id) === String(detailsProjectId));
  if (!project) return;
  editingProjectId = project.id;
  closeProjectDetails();
  openModal(project.client);
};
document.querySelector("#closeDeliverablePreview").onclick = closeDeliverablePreview;
document.querySelector("#deliverablePreviewModal").addEventListener("click", event => {
  if (event.target.id === "deliverablePreviewModal") closeDeliverablePreview();
});
document.querySelector("#logoutButton").onclick = endSession;
document.querySelector("#themeToggle").onclick = () => applyTheme(currentTheme === "night" ? "day" : "night");
document.querySelector("#toggleLoginPassword").onclick = () => {
  const input = document.querySelector("#loginPassword");
  const checkbox = document.querySelector("#toggleLoginPassword");
  input.type = checkbox.checked ? "text" : "password";
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
document.querySelector("#projectForm").elements.type.onchange = updateDurationField;
document.querySelector("#clientForm").onsubmit = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.elements.name.value.trim();
  const existing = clients.find(item => String(item.id) === String(editingClientId));
  if (!name || clients.some(client => client !== existing && client.name.toLowerCase() === name.toLowerCase())) {
    alert("Please use a unique client name.");
    return;
  }
  const rates = [...document.querySelectorAll("#clientRateRows .client-rate-row")].map(row => ({
    type: row.querySelector("[data-rate-field='type']").value.trim(),
    invoiceRate: Number(row.querySelector("[data-rate-field='invoiceRate']").value || 0),
    editorRate: Number(row.querySelector("[data-rate-field='editorRate']").value || 0),
    billing: row.querySelector("[data-rate-field='billing']").value,
    billingMinutes: row.querySelector("[data-rate-field='billing']").value === "minutes"
      ? Number(row.querySelector("[data-rate-field='billingMinutes']").value || 1)
      : 0
  })).filter(rate => rate.type);
  if (!rates.length || new Set(rates.map(rate => rate.type.toLowerCase())).size !== rates.length) {
    alert("Add at least one project type and do not repeat a type name.");
    return;
  }
  const client = existing || { id: `local-${crypto.randomUUID()}`, name, rates: [] };
  const previousName = client.name;
  client.name = name;
  client.rates = rates;
  if (!existing) clients.push(client);
  if (existing && previousName !== name) {
    for (const project of projects.filter(item => item.client === previousName)) {
      project.client = name;
      await saveProjectRemote(project);
    }
    quickLinks.filter(link => link.client === previousName).forEach(link => { link.client = name; saveQuickLinkRemote(link); });
  }
  await saveClientRemote(client);
  closeClientModal();
  renderAll();
  setView("clients");
};
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
  } else if (!editorNameExists(name)) {
    editors.push(name);
  }
  users[name] = {
    id: oldName && users[oldName]?.id ? users[oldName].id : users[name]?.id,
    role: "Editor",
    username: data.username.trim() || name.toLowerCase(),
    password: data.password,
    access: data.access,
    discordId: data.discordId.trim()
  };
  addEditorAccess(name, data.access);
  saveEditorState();
  refreshEditorOptions();
  closeEditorModal();
  event.currentTarget.reset();
  renderAll();
  setView("editors");
  saveEditorRemote(name).then(() => {
    saveEditorState();
    renderAll();
    setView("editors");
  });
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
  if (!isAdmin()) return;
  const selectedClient = data.client;
  const configuredRate = rateForProject({ client: selectedClient, type: data.type });
  if (!clientByName(selectedClient) || !configuredRate) return;
  const existingProject = projects.find(item => String(item.id) === String(editingProjectId));
  const previousEditor = existingProject?.editor || "";
  const project = existingProject || {
    id: nextId++,
    status: "To Do",
    deliverable: "",
    paidAt: ""
  };
  Object.assign(project, {
    client: selectedClient,
    project: data.project,
    type: data.type,
    script: Boolean(data.script),
    raw: Boolean(data.raw),
    scriptLink: data.script,
    rawLink: data.raw,
    notes: data.notes || "",
    duration: rateBillingMinutes(configuredRate) ? parseDuration(data.duration) : 0,
    editor: data.editor === "Unassigned" ? "" : data.editor
  });
  if (!existingProject && isDuplicateProject(project)) {
    alert("This project already exists. Duplicate entry was not added.");
    return;
  }
  if (!existingProject && !isDuplicateProject(project)) projects.unshift(project);
  const shouldNotifyAssigned = isAdmin() && project.editor && previousEditor !== project.editor;
  const shouldNotifyUnassignedAdded = isAdmin() && !existingProject && !project.editor;
  event.currentTarget.reset();
  closeModal();
  renderAll();
  setView(currentView);
  if (shouldNotifyAssigned) {
    sendDiscordUpdate("assigned", project, currentUser || "Essi", previousEditor);
  }
  if (shouldNotifyUnassignedAdded) {
    sendDiscordUpdate("unassigned_added", project, currentUser || "Essi");
  }
  saveProjectRemote(project).then(() => {
    renderAll();
    setView(currentView);
  });
};

loadQuickLinks();
applyTheme();
applyNavOrder();
initNavDrag();

loadRemoteData().then(() => {
  const savedSession = localStorage.getItem("visualsByEssiSession");
  if (savedSession && users[savedSession]) {
    applySession(savedSession);
  } else {
    renderAll();
    if (currentUser) setView(currentView);
  }
});

setInterval(liveSyncRemoteData, 5000);
