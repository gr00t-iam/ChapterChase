/* global __ICONS__ */
import { importBook, listBooks, getBook, deleteBook, saveProgress, getSettings, saveSettings, exportBook } from "./library.js";
import { ReaderSpeech } from "./speech.js";

const $ = id => document.getElementById(id);
const icons = __ICONS__;
const prefs = { fontSize: 18, theme: "paper", nasUrl: "", controls: true };
let books = [], filter = "all", current = null, frame = null, total = 0, loaded = false;
let coverUrls = [], requestId = 0, activeUpdate = false, waitingWorker, refreshTimer;
let progressQueue = Promise.resolve();
const textRequests = new Map();
let noticeTimer;
function notify(message) {
  clearTimeout(noticeTimer); $("notice").textContent = message; $("notice").hidden = false;
  noticeTimer = setTimeout(() => { $("notice").hidden = true; }, 7000);
}
function storageError(error) {
  return /quota/i.test(`${error.name} ${error.message}`) ? "Device storage is full. Export or remove a downloaded book, then try again." : error.message || "Device storage is unavailable.";
}
const savePrefs = () => saveSettings({ ...prefs }).catch(error => notify(storageError(error)));
function iconButton(name, label, handler) {
  const button = document.createElement("button"); button.innerHTML = icons[name]; button.title = label; button.setAttribute("aria-label", label); button.addEventListener("click", handler); return button;
}
const palette = ["#722c39", "#24533e", "#273e63", "#56646f", "#33373a", "#89432c", "#696030", "#583b67", "#256268", "#68524b", "#9f7953", "#4f5754"];
function bookCard(book, cover) {
  const card = document.createElement("div"); card.className = `book-card${cover ? " cover-card" : ""}`;
  const read = document.createElement("button"); read.className = `book-read ${cover ? "book-cover" : "book-spine"}`;
  read.title = `${book.title} — ${book.author}`; read.setAttribute("aria-label", `Read ${book.title}`);
  read.addEventListener("click", () => void openBook(book.id));
  if (cover && book.coverBlob) {
    const image = document.createElement("img"); const url = URL.createObjectURL(book.coverBlob); coverUrls.push(url);
    image.src = url; image.alt = book.title; image.loading = "lazy"; image.decoding = "async"; read.append(image);
  } else {
    const title = document.createElement("span"); title.textContent = book.title; if (cover) title.className = "fallback-title"; read.append(title);
  }
  if (!cover) {
    const seed = parseInt(book.id.slice(0, 8), 16);
    const color = palette[seed % palette.length];
    const [r, g, b] = color.slice(1).match(/../g).map(v => parseInt(v, 16));
    read.style.setProperty("--spine-color", color);
    read.style.setProperty("--spine-text", r * .299 + g * .587 + b * .114 > 145 ? "#141411" : "#fff");
    read.style.setProperty("--book-height", `${240 + seed % 31 - 15}px`);
    read.style.setProperty("--spine-width", `${book.title.length > 20 ? 65 : 50}px`);
    read.style.setProperty("--spine-font", `${Math.max(9, Math.min(14, 370 / book.title.length))}px`);
  }
  card.append(read);
  if (cover) {
    const progress = document.createElement("div"); progress.className = "progress"; progress.setAttribute("role", "progressbar"); progress.setAttribute("aria-label", "Reading progress"); progress.setAttribute("aria-valuenow", Math.round(book.percent)); progress.setAttribute("aria-valuemin", "0"); progress.setAttribute("aria-valuemax", "100");
    const fill = document.createElement("div"); fill.className = "progress-fill"; fill.style.width = `${book.percent}%`; progress.append(fill); card.append(progress);
  }
  const remove = iconButton("Trash2", `Remove ${book.title}`, async () => {
    if (!confirm("Remove this device's copy? Your original book file will remain safe.")) return;
    try { await deleteBook(book.id); await refresh(); } catch (error) { notify(storageError(error)); }
  });
  remove.className = "book-remove"; card.append(remove);
  const download = iconButton("Download", `Export ${book.title}`, async () => {
    try { const record = await getBook(book.id); if (record) exportBook(record); } catch (error) { notify(storageError(error)); }
  });
  download.className = "book-export"; card.append(download);
  return card;
}
function render() {
  coverUrls.forEach(url => URL.revokeObjectURL(url)); coverUrls = [];
  const target = $("books"); target.replaceChildren();
  const search = $("search").value.trim().toLowerCase();
  let visible = books.filter(book => `${book.title} ${book.author}`.toLowerCase().includes(search));
  if (filter === "reading") visible = visible.filter(book => book.lastOpened && book.percent < 100);
  const sort = $("sort").value;
  visible.sort((a, b) => sort === "recent" ? (b.lastOpened || "").localeCompare(a.lastOpened || "") : sort === "added" ? b.addedAt.localeCompare(a.addedAt) : a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }));
  const reading = visible.filter(book => book.lastOpened && book.percent < 100).sort((a, b) => b.lastOpened.localeCompare(a.lastOpened)).slice(0, 4);
  const rest = visible.filter(book => !reading.some(item => item.id === book.id));
  const width = Math.max(160, target.clientWidth - 24);
  function shelf(items, cover, heading) {
    const row = document.createElement("section"); row.className = "shelf";
    if (heading) { const label = document.createElement("h2"); label.className = "shelf-heading"; label.textContent = heading; row.append(label); }
    const line = document.createElement("div"); line.className = "shelf-books";
    items.forEach(book => line.append(bookCard(book, cover))); row.append(line);
    const ledge = document.createElement("div"); ledge.className = "shelf-ledge"; row.append(ledge); target.append(row);
  }
  const capacity = Math.max(1, Math.min(4, Math.floor((width + 8) / (matchMedia("(max-width: 700px)").matches ? 153 : 168))));
  for (let i = 0; i < reading.length; i += capacity) shelf(reading.slice(i, i + capacity), true, i === 0 ? "Currently Reading" : null);
  let row = [], used = 0;
  for (const book of rest) {
    const size = (book.title.length > 20 ? 65 : 50) + 8;
    if (row.length && used + size > width) { shelf(row, false); row = []; used = 0; }
    row.push(book); used += size;
  }
  if (row.length) shelf(row, false);
  $("empty").hidden = visible.length > 0; $("empty").querySelector("h2").textContent = books.length ? "No matching books" : "No books yet";
  $("book-count").textContent = `${books.length} ${books.length === 1 ? "book" : "books"}`;
}
async function refresh() { books = await listBooks(); render(); await updateStorage(); }
async function updateStorage() {
  try {
    const estimate = await navigator.storage?.estimate();
    $("storage-status").textContent = estimate ? `${((estimate.usage || 0) / 1048576).toFixed(1)} MB on this device` : "Device storage";
  } catch { $("storage-status").textContent = "Device storage"; }
}
function command(action, options, request) { frame?.contentWindow?.postMessage({ channel: "chapterchase-command", action, options, request }, location.origin); }
function readText() {
  return new Promise((resolve, reject) => {
    const request = ++requestId;
    const timer = setTimeout(() => { textRequests.delete(request); reject(new Error("Page text is still loading. Try again.")); }, 20000);
    textRequests.set(request, { resolve, reject, timer }); command("read", null, request);
  });
}
const speech = new ReaderSpeech({ read: readText, next: () => command("next"), change: state => {
  $("speech-toggle").querySelector("span").textContent = state === "playing" ? "Pause" : state === "paused" ? "Resume" : state === "loading" ? "Loading text" : "Start Reading";
  $("speech-toggle").disabled = state === "loading";
}, error: notify });
function abortText() { for (const pending of textRequests.values()) { clearTimeout(pending.timer); pending.reject(new Error("Reading stopped.")); } textRequests.clear(); }
function setControls(show) { $("reader-controls").hidden = !show; $("show-controls").hidden = show; prefs.controls = show; void savePrefs(); }
async function openBook(id) {
  try {
    await progressQueue;
    const record = await getBook(id); if (!record) throw new Error("Book is no longer on this device.");
    speech.stop(); abortText(); current = record; loaded = false;
    clearTimeout(noticeTimer); $("notice").hidden = true;
    $("reader-title").textContent = record.title; $("page-position").textContent = "Opening…";
    $("library-shell").hidden = true; $("reader-view").hidden = false; $("text-settings").hidden = true;
    frame = document.createElement("iframe"); frame.id = "reader-frame"; frame.title = record.title; frame.src = "reader.html";
    $("reader-host").replaceChildren(frame); setControls(prefs.controls);
    $("speech-toggle").disabled = true; $("next").disabled = true; $("previous").disabled = true;
  } catch (error) { notify(storageError(error)); }
}
function queueProgress(page, percent) {
  if (!current) return;
  const id = current.id;
  current.pageIndex = page; current.percent = percent;
  progressQueue = progressQueue.then(() => saveProgress(id, percent, page)).catch(error => notify(storageError(error)));
}
window.addEventListener("message", async event => {
  if (event.origin !== location.origin || event.source !== frame?.contentWindow || event.data?.channel !== "chapterchase-reader" || !current) return;
  const message = event.data;
  if (message.type === "ready") {
    const thisFrame = frame;
    try {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(",")[1]); reader.onerror = () => reject(new Error("Unable to read stored book.")); reader.readAsDataURL(current.blob); });
      if (frame !== thisFrame) return;
      command("settings", prefs);
      command("open", { data, format: current.format, percent: current.percent, pageIndex: current.pageIndex });
    } catch (error) { notify(error.message); }
  } else if (message.type === "loaded") {
    total = message.total; loaded = true;
    $("page-position").textContent = `${message.page + 1} / ${total}`;
    queueProgress(message.page, message.percent);
    $("speech-toggle").disabled = false; $("next").disabled = false; $("previous").disabled = false;
  } else if (message.type === "progress") {
    if (message.total) total = message.total;
    $("page-position").textContent = `${message.page + 1} / ${total}`; queueProgress(message.page, message.percent); speech.pageChanged();
  } else if (message.type === "layout") {
    total = message.total; $("page-position").textContent = `${message.page + 1} / ${total}`;
    queueProgress(message.page, current.percent);
  } else if (message.type === "text") {
    const pending = textRequests.get(message.request);
    if (pending) { clearTimeout(pending.timer); textRequests.delete(message.request); pending.resolve(message.text); }
  } else if (message.type === "end") { speech.stop(); queueProgress(Math.max(0, total - 1), 100); notify("End of book"); }
  else if (message.type === "error") { speech.stop(); abortText(); notify(message.message || "Unable to open book."); }
});
$("close-reader").onclick = async () => {
  speech.stop(); abortText(); frame?.remove(); frame = null; current = null; loaded = false;
  $("reader-view").hidden = true; $("library-shell").hidden = false;
  await progressQueue; await refresh(); $("import-button").focus();
};
$("previous").onclick = () => command("previous"); $("next").onclick = () => command("next");
$("speech-toggle").onclick = () => { if (loaded) speech.toggle(); };
$("speech-stop").onclick = () => { speech.stop(); abortText(); };
$("hide-controls").onclick = () => setControls(false); $("show-controls").onclick = () => setControls(true);
$("text-settings-toggle").onclick = () => { $("text-settings").hidden = !$("text-settings").hidden; };
$("font-size").oninput = () => {
  prefs.fontSize = Number($("font-size").value); $("font-size-value").textContent = `${prefs.fontSize}px`;
  speech.stop(); command("settings", prefs); void savePrefs();
};
$("reader-theme").onchange = () => { prefs.theme = $("reader-theme").value; speech.stop(); command("settings", prefs); void savePrefs(); };
$("sidebar-toggle").onclick = () => {
  const closed = document.body.classList.toggle("sidebar-closed"); $("sidebar-toggle").setAttribute("aria-expanded", String(!closed));
};
for (const [id, value, title] of [["all-books", "all", "Book Shelf"], ["reading-books", "reading", "Continue Reading"]]) {
  $(id).onclick = () => { filter = value; $("view-title").textContent = title; $("all-books").classList.toggle("active", value === "all"); $("reading-books").classList.toggle("active", value === "reading"); if (innerWidth < 700) document.body.classList.add("sidebar-closed"); render(); };
}
$("search").oninput = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(render, 120); };
$("sort").onchange = render;
new ResizeObserver(() => { clearTimeout(refreshTimer); refreshTimer = setTimeout(render, 120); }).observe($("books"));
$("import-button").onclick = () => $("import-files").click();
$("import-files").onchange = async () => {
  $("import-button").disabled = true;
  for (const file of $("import-files").files) {
    notify(`Importing ${file.name}…`);
    try {
      const result = await importBook(file);
      notify(result.duplicate ? "Already in your library" : `Imported ${result.book.title}`); await refresh();
    } catch (error) { notify(`Could not import ${file.name}: ${storageError(error)}`); }
  }
  $("import-files").value = ""; $("import-button").disabled = false;
};
$("keep-storage").onclick = async () => {
  try {
    const kept = await navigator.storage?.persist?.();
    notify(kept ? "Persistent storage granted. Keep backups of your original books." : "Persistent storage was not granted. Keep backups; device storage may be cleared.");
    await updateStorage();
  } catch (error) { notify(storageError(error)); }
};
$("open-settings").onclick = () => { $("nas-url").value = prefs.nasUrl; $("settings-status").textContent = ""; $("settings-dialog").showModal(); };
function nasAddress() {
  const url = new URL($("nas-url").value.trim());
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Enter an HTTPS NAS address without embedded credentials.");
  return url.href;
}
$("save-nas").onclick = async () => {
  try { const address = nasAddress(); await saveSettings({ ...prefs, nasUrl: address }); prefs.nasUrl = address; $("settings-status").textContent = "Address saved"; } catch (error) { $("settings-status").textContent = error.message; }
};
$("open-nas").onclick = () => {
  try { window.open(nasAddress(), "_blank", "noopener,noreferrer"); } catch (error) { $("settings-status").textContent = error.message; }
};
document.addEventListener("visibilitychange", () => { if (document.hidden && speech.state === "playing") speech.toggle(); });
window.addEventListener("pagehide", () => speech.stop());

async function offlineStatus() {
  const worker = navigator.serviceWorker.controller;
  if (!worker) return;
  const channel = new MessageChannel();
  const result = await new Promise(resolve => {
    const timeout = setTimeout(() => resolve(false), 10000);
    channel.port1.onmessage = event => { clearTimeout(timeout); resolve(event.data?.ready === true); channel.port1.close(); };
    worker.postMessage({ type: "CACHE_STATUS" }, [channel.port2]);
  });
  $("offline-state").textContent = result ? "Ready offline" : "Offline setup incomplete";
}
async function installWorker() {
  if (!navigator.serviceWorker) { $("offline-state").textContent = "HTTPS required"; return; }
  try {
    const registration = await navigator.serviceWorker.register("sw.js", { scope: "./", updateViaCache: "none" });
    function updateReady() { if (registration.waiting && navigator.serviceWorker.controller) { waitingWorker = registration.waiting; $("update-app").hidden = false; } }
    updateReady();
    registration.addEventListener("updatefound", () => { registration.installing?.addEventListener("statechange", updateReady); });
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (activeUpdate) location.reload(); else void offlineStatus(); });
    await navigator.serviceWorker.ready; await offlineStatus();
    $("update-app").onclick = () => {
      if (current) { notify("Close your book before updating."); return; }
      activeUpdate = true; waitingWorker?.postMessage({ type: "ACTIVATE_UPDATE" });
    };
    window.addEventListener("online", () => { void registration.update().catch(() => {}); });
  } catch { $("offline-state").textContent = "Offline setup failed"; notify("Offline installation failed. Reconnect and reload before relying on offline reading."); }
}
async function start() {
  if (innerWidth < 700) { document.body.classList.add("sidebar-closed"); $("sidebar-toggle").setAttribute("aria-expanded", "false"); }
  try {
    const saved = await getSettings();
    prefs.fontSize = Math.max(12, Math.min(36, Number(saved.fontSize) || 18)); prefs.theme = saved.theme === "night" ? "night" : "paper";
    prefs.nasUrl = typeof saved.nasUrl === "string" ? saved.nasUrl : ""; prefs.controls = saved.controls !== false;
    $("font-size").value = prefs.fontSize; $("font-size-value").textContent = `${prefs.fontSize}px`; $("reader-theme").value = prefs.theme;
    await refresh();
  } catch (error) { notify(storageError(error)); }
  void installWorker();
}
void start();
