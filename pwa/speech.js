export function speechChunks(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length > 220 && current) { chunks.push(current); current = ""; }
    current += `${current ? " " : ""}${word}`;
  }
  if (current) chunks.push(current);
  return chunks;
}

export class ReaderSpeech {
  constructor({ read, next, change, error }, synthesis = window.speechSynthesis) {
    this.read = read; this.next = next; this.change = change; this.error = error;
    this.synth = synthesis; this.state = "stopped"; this.revision = 0; this.chunks = []; this.index = 0;
  }
  setState(state) { this.state = state; this.change(state); }
  stop() {
    this.revision++; clearTimeout(this.timer); clearTimeout(this.watchdog);
    this.synth?.cancel(); this.utterance = null; this.setState("stopped");
  }
  async start() {
    if (!this.synth || !window.SpeechSynthesisUtterance) { this.error("Speech is unavailable on this device."); return; }
    this.stop();
    this.setState("loading");
    const revision = this.revision;
    // The initial user gesture primes mobile speech without selecting a voice.
    this.synth.speak(new SpeechSynthesisUtterance(""));
    try {
      const text = await this.read();
      if (revision !== this.revision) return;
      this.chunks = speechChunks(text); this.index = 0;
      if (!this.chunks.length) { this.stop(); this.error("This page has no extractable text. Scanned PDFs need OCR before read-aloud."); return; }
      this.setState("playing"); this.speak(revision);
    } catch (error) { if (revision === this.revision) { this.stop(); this.error(error.message); } }
  }
  speak(revision) {
    this.synth.cancel();
    this.timer = setTimeout(() => {
      if (revision !== this.revision || this.state !== "playing") return;
      const utterance = new SpeechSynthesisUtterance(this.chunks[this.index]);
      this.utterance = utterance;
      utterance.onstart = () => clearTimeout(this.watchdog);
      utterance.onend = () => {
        if (revision !== this.revision || this.state !== "playing") return;
        clearTimeout(this.watchdog);
        if (++this.index < this.chunks.length) this.speak(revision); else this.next();
      };
      utterance.onerror = event => {
        if (revision !== this.revision) return;
        this.stop(); this.error(`Speech could not start (${event.error}). Check your device's installed offline voice.`);
      };
      this.synth.speak(utterance);
      this.watchdog = setTimeout(() => {
        if (revision !== this.revision) return;
        this.stop(); this.error("Speech did not start. Check your device's installed voice and try again.");
      }, 12000);
    }, 100);
  }
  toggle() {
    if (this.state === "playing") {
      this.revision++; clearTimeout(this.timer); clearTimeout(this.watchdog); this.synth.cancel(); this.setState("paused");
    } else if (this.state === "paused") { this.setState("playing"); this.speak(this.revision); }
    else void this.start();
  }
  pageChanged() { if (["loading", "playing"].includes(this.state)) void this.start(); else this.stop(); }
}
