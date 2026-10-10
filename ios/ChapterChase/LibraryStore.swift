import Foundation
import Combine

struct StoredBook: Codable, Identifiable {
    var id: String
    var title: String
    var author: String
    var format: String
    var fileName: String
    var percent: Double = 0
    var pageIndex: Int = 0
}

struct RemoteBook: Codable, Identifiable {
    var id: String
    var title: String
    var author: String?
    var format: String
    var percent: Double
    var pageIndex: Int
}

enum LibraryError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
}

@MainActor
final class LibraryStore: ObservableObject {
    @Published var books: [StoredBook] = []
    @Published var remoteBooks: [RemoteBook] = []
    @Published var error: String?
    var serverAddress: String { UserDefaults.standard.string(forKey: "serverAddress") ?? "" }
    private var server: URL?
    private let session = URLSession(configuration: .ephemeral)
    let directory: URL
    init() {
        directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Books", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let catalog = directory.appendingPathComponent("catalog.json")
            if FileManager.default.fileExists(atPath: catalog.path) {
                books = try JSONDecoder().decode([StoredBook].self, from: Data(contentsOf: catalog))
            }
        } catch { self.error = error.localizedDescription }
    }
    private func save() throws {
        try JSONEncoder().encode(books).write(to: directory.appendingPathComponent("catalog.json"), options: .atomic)
    }
    func importFile(_ url: URL) throws {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let format = url.pathExtension.lowercased()
        guard ["epub", "pdf"].contains(format) else { throw LibraryError.message("Choose an EPUB or PDF file.") }
        let id = UUID().uuidString
        let name = "\(id).\(format)"
        try FileManager.default.copyItem(at: url, to: directory.appendingPathComponent(name))
        books.append(StoredBook(id: id, title: url.deletingPathExtension().lastPathComponent.replacingOccurrences(of: "_", with: " "), author: "", format: format, fileName: name))
        try save()
    }
    func update(id: String, page: Int, percent: Double) {
        guard let index = books.firstIndex(where: { $0.id == id }) else { return }
        books[index].pageIndex = max(0, page)
        books[index].percent = min(100, max(0, percent))
        do { try save() } catch { self.error = error.localizedDescription }
    }
    func connect(address: String, email: String, password: String) async throws {
        guard let url = URL(string: address.trimmingCharacters(in: .whitespacesAndNewlines)), url.scheme == "https", url.host != nil, url.user == nil, url.password == nil, url.path.isEmpty || url.path == "/" else {
            throw LibraryError.message("Use the HTTPS address of your ChapterChase server, such as its Tailscale Serve URL.")
        }
        var request = URLRequest(url: url.appendingPathComponent("api/auth/login"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "password": password])
        let (data, response) = try await session.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw LibraryError.message(body?["error"] as? String ?? "Unable to sign in.")
        }
        let (catalog, catalogResponse) = try await session.data(from: url.appendingPathComponent("api/mobile/library"))
        guard (catalogResponse as? HTTPURLResponse)?.statusCode == 200 else { throw LibraryError.message("Update the NAS server to the mobile-compatible release.") }
        struct Catalog: Decodable { let books: [RemoteBook] }
        remoteBooks = try JSONDecoder().decode(Catalog.self, from: catalog).books
        server = url
        UserDefaults.standard.set(url.absoluteString, forKey: "serverAddress")
    }
    func download(_ book: RemoteBook) async throws {
        guard let server else { throw LibraryError.message("Sign in first.") }
        let format = book.format.lowercased()
        guard ["pdf", "epub"].contains(format) else { throw LibraryError.message("Unsupported book format.") }
        let url = server.appendingPathComponent("api/books/\(book.id)/file")
        let (temporary, response) = try await session.download(from: url)
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              ["application/pdf", "application/epub+zip"].contains((response as? HTTPURLResponse)?.mimeType ?? "") else {
            throw LibraryError.message("Download failed. Sign in again and check the NAS connection.")
        }
        let id = UUID().uuidString
        let name = "\(id).\(format)"
        try FileManager.default.copyItem(at: temporary, to: directory.appendingPathComponent(name))
        books.append(StoredBook(id: id, title: book.title, author: book.author ?? "", format: format, fileName: name, percent: book.percent, pageIndex: book.pageIndex))
        try save()
    }
}
