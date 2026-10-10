import SwiftUI
import UniformTypeIdentifiers

@main
struct ChapterChaseApp: App {
    @StateObject private var library = LibraryStore()
    var body: some Scene {
        WindowGroup { LibraryView().environmentObject(library) }
    }
}

struct LibraryView: View {
    @EnvironmentObject var library: LibraryStore
    @State private var importing = false
    @State private var connecting = false
    @State private var smokeReader = false
    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 145))], spacing: 20) {
                    ForEach(library.books) { book in
                        NavigationLink { ReaderView(book: book).environmentObject(library) } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 4).fill(Color(white: 0.18))
                                    Image(systemName: "book.closed.fill").font(.system(size: 50)).foregroundStyle(.mint)
                                }.frame(height: 190)
                                Text(book.title).font(.headline).lineLimit(3)
                                Text(book.author).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                ProgressView(value: book.percent / 100)
                            }
                        }.buttonStyle(.plain)
                    }
                }.padding()
                if library.books.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "books.vertical").font(.largeTitle)
                        Text("Your Library").font(.title2)
                        Button("Import EPUB or PDF") { importing = true }
                        Button("Connect to NAS") { connecting = true }
                    }.padding(40)
                }
            }
            .navigationTitle("ChapterChase")
            .toolbar {
                ToolbarItemGroup(placement: .navigationBarTrailing) {
                    Button { importing = true } label: { Image(systemName: "plus") }.accessibilityLabel("Import book")
                    Button { connecting = true } label: { Image(systemName: "externaldrive.connected.to.line.below") }.accessibilityLabel("Connect to NAS")
                }
            }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf, UTType(filenameExtension: "epub") ?? .data]) { result in
                do { try library.importFile(result.get()) } catch { library.error = error.localizedDescription }
            }
            .sheet(isPresented: $connecting) { NASView().environmentObject(library) }
            .navigationDestination(isPresented: $smokeReader) {
                if let book = library.books.first { ReaderView(book: book).environmentObject(library) }
            }
            .onAppear {
                #if targetEnvironment(simulator)
                if ProcessInfo.processInfo.arguments.contains("--reader-smoke") { smokeReader = true }
                #endif
            }
            .alert("ChapterChase", isPresented: Binding(get: { library.error != nil }, set: { if !$0 { library.error = nil } })) {
                Button("OK") { library.error = nil }
            } message: { Text(library.error ?? "") }
        }
    }
}

struct NASView: View {
    @EnvironmentObject var library: LibraryStore
    @Environment(\.dismiss) var dismiss
    @State private var address = ""
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var message = ""
    var body: some View {
        NavigationStack {
            Form {
                Section("ChapterChase Server") {
                    TextField("https://your-nas.ts.net", text: $address).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                    TextField("Email", text: $email).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.emailAddress)
                    SecureField("Password", text: $password)
                    Button("Sign In and Browse") {
                        busy = true
                        Task {
                            do { try await library.connect(address: address, email: email, password: password); password = ""; message = "" }
                            catch { message = error.localizedDescription }
                            busy = false
                        }
                    }.disabled(busy)
                    if busy { ProgressView() }
                    if !message.isEmpty { Text(message).foregroundStyle(.red) }
                }
                Section("Remote Books") {
                    ForEach(library.remoteBooks) { book in
                        HStack {
                            VStack(alignment: .leading) { Text(book.title); Text(book.author ?? "").font(.caption).foregroundStyle(.secondary) }
                            Spacer()
                            Button { busy = true; Task {
                                do { try await library.download(book); message = "Downloaded for offline reading." }
                                catch { message = error.localizedDescription }
                                busy = false
                            } } label: { Image(systemName: "arrow.down.circle") }.disabled(busy)
                        }
                    }
                }
            }.navigationTitle("NAS Library").toolbar { Button("Done") { dismiss() } }
        }.onAppear { address = library.serverAddress }
    }
}
