/* eslint-disable @typescript-eslint/no-require-imports -- Electron main process uses CommonJS. */
const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

let server;
let localWindow;
let nasWindow;
let booksDirectory;
let speechProcess;

function stopDesktopSpeech() {
  const previous = speechProcess;
  speechProcess = undefined;
  previous?.kill();
}

ipcMain.handle("desktop:speak", async (event, text) => {
  if (event.sender !== localWindow?.webContents || process.platform !== "win32") throw new Error("Speech unavailable.");
  if (typeof text !== "string" || !text.trim() || text.length > 100000) throw new Error("Invalid speech text.");
  stopDesktopSpeech();
  const controlPath = path.join(app.getPath("userData"), `speech-${require("node:crypto").randomUUID()}.txt`);
  const script = app.isPackaged ? path.join(process.resourcesPath, "app.asar.unpacked", "speech.ps1") : path.join(__dirname, "speech.ps1");
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], {
    windowsHide: true, env: { ...process.env, CHAPTERCHASE_SPEECH_TEXT: Buffer.from(text).toString("base64"), CHAPTERCHASE_SPEECH_CONTROL: controlPath },
    stdio: ["ignore", "ignore", "pipe"],
  });
  speechProcess = child;
  child.controlPath = controlPath;
  let errorText = "";
  child.stderr.on("data", (data) => { errorText = (errorText + data.toString()).slice(-2000); });
  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      void fs.rm(controlPath, { force: true });
      const cancelled = speechProcess !== child;
      if (!cancelled) speechProcess = undefined;
      if (code === 0 || cancelled) resolve();
      else reject(new Error(errorText || "Windows speech failed."));
    });
  });
});
ipcMain.on("desktop:speech-control", (event, command) => {
  if (event.sender !== localWindow?.webContents) return;
  if (command === "stop") stopDesktopSpeech();
  else if (["pause", "resume"].includes(command) && speechProcess?.controlPath) {
    fsSync.writeFileSync(speechProcess.controlPath, command);
  }
});

async function run(node, args, options) {
  await new Promise((resolve, reject) => {
    const child = spawn(node, args, options);
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Database initialization failed (${code}).`)));
  });
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.on("error", reject);
    // A stable origin preserves IndexedDB, cookies, and reader preferences across launches.
    listener.listen(43126, "127.0.0.1", () => {
      const port = listener.address().port;
      listener.close(() => resolve(port));
    });
  });
}

async function downloadCurrentBook() {
  try {
    if (!nasWindow || nasWindow.isDestroyed()) throw new Error("Open your NAS connection and open a book first.");
    const url = new URL(nasWindow.webContents.getURL());
    const match = url.pathname.match(/^\/reader\/([^/]+)$/);
    if (!match) throw new Error("Open a book in the NAS window first.");
    const response = await nasWindow.webContents.session.fetch(`${url.origin}/api/books/${encodeURIComponent(match[1])}/file?download=1`);
    if (!response.ok) throw new Error(`NAS download failed (${response.status}). Sign in and verify access to this book.`);
    const disposition = response.headers.get("content-disposition") || "";
    const filename = path.basename(decodeURIComponent(disposition.match(/filename="([^"]+)"/)?.[1] || `${match[1]}.epub`));
    const result = await dialog.showSaveDialog(localWindow, { defaultPath: path.join(booksDirectory, filename) });
    if (result.canceled || !result.filePath) return;
    await fs.writeFile(result.filePath, Buffer.from(await response.arrayBuffer()));
    dialog.showMessageBox(localWindow, { message: "Book downloaded. Scan your local Books folder in Preferences > Library Folders to add it to your offline library." });
  } catch (error) {
    dialog.showErrorBox("Download book", error.message);
  }
}

async function connectNas() {
  const connectionWindow = new BrowserWindow({ parent: localWindow, modal: true, width: 520, height: 260,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  connectionWindow.setMenu(null);
  connectionWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  connectionWindow.webContents.on("will-navigate", async (event, target) => {
    event.preventDefault();
    try {
    const submitted = new URL(target);
    if (submitted.origin !== "https://chapterchase.invalid") return;
    const url = new URL(submitted.searchParams.get("server"));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Enter an HTTP or HTTPS server URL without credentials.");
    connectionWindow.close();
    nasWindow = new BrowserWindow({ width: 1100, height: 800, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: "persist:nas" } });
    nasWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    nasWindow.webContents.on("will-navigate", (event, target) => {
      if (new URL(target).origin !== url.origin) event.preventDefault();
    });
    await nasWindow.loadURL(url.href);
  } catch (error) { dialog.showErrorBox("NAS connection", error.message); }
  });
  await connectionWindow.loadFile(path.join(__dirname, "connect.html"));
}

app.whenReady().then(async () => {
  const runtime = app.isPackaged ? path.join(process.resourcesPath, "runtime") : path.join(__dirname, "runtime");
  const node = path.join(runtime, process.platform === "win32" ? "node.exe" : "node");
  const cwd = path.join(runtime, "app");
  const data = path.join(app.getPath("userData"), "data");
  booksDirectory = path.join(app.getPath("userData"), "Books");
  await fs.mkdir(data, { recursive: true });
  await fs.mkdir(booksDirectory, { recursive: true });
  const port = await availablePort();
  const env = { ...process.env, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(port),
    DATABASE_URL: `file:${path.join(data, "chapterchase.db").replaceAll("\\", "/")}`,
    CHAPTERCHASE_DATA_DIR: data, CHAPTERCHASE_LIBRARY_DIR: booksDirectory,
    CHAPTERCHASE_MEDIA_ROOTS: booksDirectory, CHAPTERCHASE_SECURE_COOKIES: "false" };
  await run(node, ["init-db.mjs"], { cwd, env, windowsHide: true });
  server = spawn(node, ["server.js"], { cwd, env, windowsHide: true, stdio: "ignore" });
  let startupError;
  server.on("error", (error) => { startupError = error; });
  const address = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (startupError) throw startupError;
    if (server.exitCode !== null) throw new Error("Local ChapterChase server stopped during startup.");
    try { if ((await fetch(address, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("Local ChapterChase server did not start.");
  localWindow = new BrowserWindow({ width: 1280, height: 850, webPreferences: { preload: path.join(__dirname, "preload.cjs"), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  localWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  localWindow.webContents.on("will-navigate", (event, target) => { if (new URL(target).origin !== address) event.preventDefault(); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Library", submenu: [
      { label: "Connect to NAS…", click: connectNas },
      { label: "Download current NAS book", click: downloadCurrentBook },
      { label: "Show local Books folder", click: () => shell.openPath(booksDirectory) },
      { role: "quit" },
    ] },
    { role: "editMenu" }, { role: "viewMenu" },
  ]));
  await localWindow.loadURL(address);
}).catch((error) => { dialog.showErrorBox("ChapterChase startup", error.message); app.quit(); });
app.on("before-quit", () => { stopDesktopSpeech(); server?.kill(); });
app.on("window-all-closed", () => app.quit());
