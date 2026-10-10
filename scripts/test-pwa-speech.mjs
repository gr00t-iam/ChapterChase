import assert from "node:assert/strict";
import { ReaderSpeech, speechChunks } from "../pwa/speech.js";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const spoken = [], changes = [], errors = [];
let cancels = 0, next = 0;
class Utterance { constructor(text) { this.text = text; this.voice = null; } }
globalThis.SpeechSynthesisUtterance = Utterance;
globalThis.window = { SpeechSynthesisUtterance: Utterance };
const synth = { cancel: () => { cancels++; }, speak: utterance => { spoken.push(utterance); utterance.onstart?.(); } };
const text = "A library travels with its reader. ".repeat(25);
const speech = new ReaderSpeech({ read: async () => text, next: () => next++, change: state => changes.push(state), error: error => errors.push(error) }, synth);
assert.equal(speechChunks(text).join(" "), text.trim());
assert.ok(speechChunks(text).every(chunk => chunk.length <= 220));
await speech.start();
assert.equal(spoken.length, 1, "Only unlock speech runs immediately");
await delay(130);
assert.equal(spoken[1].voice, null, "Use native default, not a selected voice");
assert.ok(cancels >= 2, "Cancel before starting and before speaking");
const stale = spoken.at(-1);
speech.toggle(); assert.equal(speech.state, "paused"); stale.onend(); assert.equal(next, 0);
speech.toggle(); await delay(130); assert.equal(speech.state, "playing");
while (speech.index < speech.chunks.length - 1) { spoken.at(-1).onend(); await delay(130); }
spoken.at(-1).onend(); assert.equal(next, 1, "Advance after finishing the current spread");
speech.stop(); stale.onend(); assert.equal(next, 1);
let resolveText;
speech.read = () => new Promise(resolve => { resolveText = resolve; });
const opening = speech.start(); speech.stop(); resolveText("Stale text"); await opening; await delay(130);
assert.equal(speech.state, "stopped");
speech.read = async () => ""; await speech.start(); assert.equal(speech.state, "stopped"); assert.match(errors.at(-1), /no extractable text/);
speech.read = async () => "Offline voice test"; await speech.start(); await delay(130); spoken.at(-1).onerror({ error: "voice-unavailable" });
assert.equal(speech.state, "stopped"); assert.match(errors.at(-1), /installed offline voice/);
speech.stop();
console.log("PASS speech: default voice, chunking, mobile delay, pause/resume, cancellation, auto-advance, stale callbacks and empty/error states.");
