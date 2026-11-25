import Foundation

public struct InspectionDraft: Codable, Equatable {
  public var workOrderID: String
  public var note: String
  public var photoToken: String?
  public init(workOrderID: String, note: String = "", photoToken: String? = nil) {
    self.workOrderID = workOrderID
    self.note = note
    self.photoToken = photoToken
  }
}

public protocol DraftStore {
  func load(_ id: String) throws -> InspectionDraft?
  func save(_ draft: InspectionDraft) throws
  func remove(_ id: String) throws
}
public final class FileDraftStore: DraftStore {
  public let directory: URL
  public init(directory: URL? = nil) throws {
    let base =
      directory
      ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("NativeInspection")
    self.directory = base
    try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
  }
  private func draftURL(_ id: String) -> URL { directory.appendingPathComponent("\(id).json") }
  public func load(_ id: String) throws -> InspectionDraft? {
    let url = draftURL(id)
    guard FileManager.default.fileExists(atPath: url.path) else { return nil }
    return try JSONDecoder().decode(InspectionDraft.self, from: Data(contentsOf: url))
  }
  public func save(_ draft: InspectionDraft) throws {
    try JSONEncoder().encode(draft).write(to: draftURL(draft.workOrderID), options: .atomic)
  }
  public func remove(_ id: String) throws {
    let url = draftURL(id)
    if FileManager.default.fileExists(atPath: url.path) {
      try FileManager.default.removeItem(at: url)
    }
  }
  public func savePhoto(_ data: Data) throws -> String {
    let name = UUID().uuidString + ".jpg"
    try data.write(to: directory.appendingPathComponent(name), options: .atomic)
    return name
  }
  private func photoURL(_ name: String) throws -> URL {
    guard name.hasSuffix(".jpg"), UUID(uuidString: String(name.dropLast(4))) != nil else {
      throw CocoaError(.fileReadCorruptFile)
    }
    return directory.appendingPathComponent(name)
  }
  public func loadPhoto(_ name: String) throws -> Data { try Data(contentsOf: photoURL(name)) }
  public func discardPhoto(_ name: String) throws {
    try FileManager.default.removeItem(at: photoURL(name))
  }
}

public enum SubmissionStatus: Equatable {
  case idle, draftSaved, submitting, submitted
  case failed(String)
}

public struct InspectionState: Equatable {
  public private(set) var draft: InspectionDraft
  public private(set) var status: SubmissionStatus = .idle
  public private(set) var cameraNotice: String?
  public init(workOrderID: String) { draft = InspectionDraft(workOrderID: workOrderID) }
  public mutating func edit(note: String) {
    draft.note = note
    status = .idle
  }
  public mutating func attachPhoto(token: String) {
    draft.photoToken = token
    cameraNotice = nil
    status = .idle
  }
  public mutating func cameraCancelled() { cameraNotice = "已取消拍照；原有草稿与照片未改。" }
  public mutating func cameraUnavailable() { cameraNotice = "此设备当前无法使用相机；原有草稿与照片未改。" }
  public mutating func restore(from store: DraftStore) throws {
    if let saved = try store.load(draft.workOrderID) {
      guard saved.workOrderID == draft.workOrderID else { throw CocoaError(.fileReadCorruptFile) }
      draft = saved
      status = .draftSaved
    }
  }
  public mutating func save(to store: DraftStore) throws {
    try store.save(draft)
    status = .draftSaved
  }
  public mutating func beginSubmit() { status = .submitting }
  public mutating func submissionSucceeded(store: DraftStore) throws {
    try store.remove(draft.workOrderID)
    status = .submitted
  }
  public mutating func submissionFailed(_ message: String) { status = .failed(message) }
  public mutating func storageFailed(_ message: String) { status = .failed(message) }
}
