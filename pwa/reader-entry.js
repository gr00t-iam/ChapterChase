let position = { page: 0, percent: 0 }, format = "epub";
const emit = message => {
  if (message.type === "progress") {
    position = { page: message.page, percent: message.percent };
    message = { ...message, total: document.querySelectorAll(".page").length };
  }
  parent.postMessage({ channel: "chapterchase-reader", ...message }, location.origin);
};
let textRequest;
window.webkit = { messageHandlers: { reader: { postMessage: message => emit(message.type === "text" ? { ...message, request: textRequest } : message) } } };

window.addEventListener("message", async event => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.channel !== "chapterchase-command") return;
  const { action, options, request } = event.data;
  try {
    if (action === "open") {
      format = options.format; position = { page: options.pageIndex, percent: options.percent };
      await window.ChapterChase.openBook(options);
      if (!document.querySelector("#status").hidden) return;
      const total = document.querySelectorAll(".page").length;
      const index = options.format === "pdf" ? options.pageIndex : Math.round(options.percent / 100 * Math.max(0, total - 1));
      emit({ type: "loaded", total, page: Math.max(0, Math.min(total - 1, index)), percent: options.percent });
    } else if (action === "read") { textRequest = request; await window.ChapterChase.read(); }
    else if (action === "previous") window.ChapterChase.previous();
    else if (action === "next") window.ChapterChase.next();
    else if (action === "settings") {
      document.documentElement.style.setProperty("--text-size", `${options.fontSize}px`);
      document.documentElement.dataset.theme = options.theme;
      window.dispatchEvent(new Event("resize"));
    }
  } catch (error) { emit({ type: "error", message: error.message }); }
});
let layoutTimer;
window.addEventListener("resize", () => {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => {
    const total = document.querySelectorAll(".page").length;
    if (!total) return;
    const page = format === "pdf" ? position.page : Math.round(position.percent / 100 * Math.max(0, total - 1));
    emit({ type: "layout", total, page: Math.min(total - 1, page) });
  }, 350);
});
void import("../mobile/reader.js");
