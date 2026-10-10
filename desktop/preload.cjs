/* eslint-disable @typescript-eslint/no-require-imports -- Electron preload uses CommonJS. */
const { contextBridge, ipcRenderer } = require("electron");
if (process.platform === "win32") {
  contextBridge.exposeInMainWorld("chapterChaseSpeech", {
    speak: (text) => ipcRenderer.invoke("desktop:speak", text),
    pause: () => ipcRenderer.send("desktop:speech-control", "pause"),
    resume: () => ipcRenderer.send("desktop:speech-control", "resume"),
    stop: () => ipcRenderer.send("desktop:speech-control", "stop"),
  });
}
