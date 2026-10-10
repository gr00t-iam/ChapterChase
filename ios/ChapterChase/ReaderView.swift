import SwiftUI
import WebKit
import AVFoundation

struct ReaderView: View {
    let book: StoredBook
    @EnvironmentObject var library: LibraryStore
    @StateObject private var controller = ReaderController()
    var body: some View {
        ReaderWebView(controller: controller, book: book, directory: library.directory) { page, percent in
            library.update(id: book.id, page: page, percent: percent)
        }
        .ignoresSafeArea(edges: .bottom)
        .navigationTitle(book.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .bottomBar) {
                Button { controller.command("previous") } label: { Image(systemName: "chevron.left") }.accessibilityLabel("Previous page")
                Spacer()
                Button { controller.toggleSpeech() } label: { Image(systemName: controller.reading ? "pause.fill" : "play.fill") }.accessibilityLabel(controller.reading ? "Pause reading" : "Read aloud")
                Button { controller.stop() } label: { Image(systemName: "stop.fill") }.accessibilityLabel("Stop reading")
                Spacer()
                Button { controller.command("next") } label: { Image(systemName: "chevron.right") }.accessibilityLabel("Next page")
            }
        }
        .alert("Reader", isPresented: Binding(get: { controller.error != nil }, set: { if !$0 { controller.error = nil } })) {
            Button("OK") { controller.error = nil }
        } message: { Text(controller.error ?? "") }
        .onDisappear { controller.stop() }
    }
}

@MainActor
final class ReaderController: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    @Published var reading = false
    @Published var error: String?
    weak var webView: WKWebView?
    private let synthesizer = AVSpeechSynthesizer()
    override init() { super.init(); synthesizer.delegate = self }
    func command(_ name: String) { webView?.evaluateJavaScript("void ChapterChase.\(name)()", completionHandler: nil) }
    func toggleSpeech() {
        if reading { reading = false; synthesizer.pauseSpeaking(at: .immediate); return }
        reading = true
        if synthesizer.isPaused { synthesizer.continueSpeaking() } else { command("read") }
    }
    func speak(_ text: String) {
        guard reading else { return }
        synthesizer.stopSpeaking(at: .immediate)
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            reading = false; error = "This page has no extractable text. Scanned PDFs need OCR before read-aloud is available."; return
        }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
            try AVAudioSession.sharedInstance().setActive(true)
            let utterance = AVSpeechUtterance(string: text)
            synthesizer.speak(utterance)
        } catch { self.error = error.localizedDescription; reading = false }
    }
    func stop() { reading = false; synthesizer.stopSpeaking(at: .immediate) }
    func pageChanged() {
        synthesizer.stopSpeaking(at: .immediate)
        if reading { command("read") }
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in if reading { command("next") } }
    }
}

struct ReaderWebView: UIViewRepresentable {
    let controller: ReaderController
    let book: StoredBook
    let directory: URL
    let progress: (Int, Double) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(context.coordinator, name: "reader")
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.scrollView.isScrollEnabled = false
        view.isOpaque = false
        view.backgroundColor = .black
        controller.webView = view
        if let index = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Reader") {
            view.loadFileURL(index, allowingReadAccessTo: index.deletingLastPathComponent())
        } else { controller.error = "Bundled reader is missing. Rebuild the app with its Reader resources." }
        return view
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        coordinator.parent.controller.stop()
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "reader")
        uiView.stopLoading()
    }
    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        let parent: ReaderWebView
        init(_ parent: ReaderWebView) { self.parent = parent }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.isFileURL == true,
                  let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
            switch type {
            case "ready":
                do {
                    let data = try Data(contentsOf: parent.directory.appendingPathComponent(parent.book.fileName))
                    let options: [String: Any] = ["data": data.base64EncodedString(), "format": parent.book.format, "pageIndex": parent.book.pageIndex, "percent": parent.book.percent]
                    let json = try JSONSerialization.data(withJSONObject: options)
                    let script = "void ChapterChase.openBook(\(String(decoding: json, as: UTF8.self)))"
                    parent.controller.webView?.evaluateJavaScript(script) { _, error in
                        if let error { self.parent.controller.error = error.localizedDescription }
                    }
                } catch { parent.controller.error = error.localizedDescription }
            case "progress":
                parent.progress(body["page"] as? Int ?? 0, body["percent"] as? Double ?? 0)
                parent.controller.pageChanged()
            case "text": parent.controller.speak(body["text"] as? String ?? "")
            case "end": parent.controller.stop()
            case "error":
                parent.controller.error = body["message"] as? String ?? "Unable to open book."
                #if targetEnvironment(simulator)
                if let diagnostic = try? JSONSerialization.data(withJSONObject: body, options: .prettyPrinted) {
                    try? diagnostic.write(to: parent.directory.appendingPathComponent("reader-error.json"))
                }
                #endif
            default: break
            }
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            decisionHandler(navigationAction.request.url?.isFileURL == true ? .allow : .cancel)
        }
    }
}
