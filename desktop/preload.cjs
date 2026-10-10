/* eslint-disable @typescript-eslint/no-require-imports -- Electron preload uses CommonJS. */
const { contextBridge, ipcRenderer } = require("electron");
if (["win32", "darwin"].includes(process.platform)) {
  contextBridge.exposeInMainWorld("chapterChaseSpeech", {
    speak: (text) => ipcRenderer.invoke("desktop:speak", text),
    pause: () => ipcRenderer.send("desktop:speech-control", "pause"),
    resume: () => ipcRenderer.send("desktop:speech-control", "resume"),
    stop: () => ipcRenderer.send("desktop:speech-control", "stop"),
  });
}
