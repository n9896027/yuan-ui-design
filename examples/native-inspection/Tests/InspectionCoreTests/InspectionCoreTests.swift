import XCTest

@testable import InspectionCore

final class MemoryStore: DraftStore {
  var value: InspectionDraft?
  func load(_ id: String) throws -> InspectionDraft? { value?.workOrderID == id ? value : nil }
  func save(_ draft: InspectionDraft) throws { value = draft }
  func remove(_ id: String) throws { if value?.workOrderID == id { value = nil } }
}

final class InspectionCoreTests: XCTestCase {
  func testCancelAndUnavailableKeepDraftAndPhoto() {
    var state = InspectionState(workOrderID: "W01")
    state.edit(note: "接头潮湿")
    state.attachPhoto(token: "photo-1")
    let before = state.draft
    state.cameraCancelled()
    XCTAssertEqual(state.draft, before)
    state.cameraUnavailable()
    XCTAssertEqual(state.draft, before)
  }
  func testSaveRestoreAndSubmissionFailurePreserveDraft() throws {
    let store = MemoryStore()
    var original = InspectionState(workOrderID: "W01")
    original.edit(note: "复核供电")
    original.attachPhoto(token: "photo-2")
    try original.save(to: store)
    var restored = InspectionState(workOrderID: "W01")
    try restored.restore(from: store)
    XCTAssertEqual(restored.draft, original.draft)
    restored.beginSubmit()
    restored.submissionFailed("timeout")
    XCTAssertEqual(restored.draft, original.draft)
    XCTAssertEqual(restored.status, .failed("timeout"))
  }
  func testSuccessClearsStoredDraftOnlyAfterConfirmation() throws {
    let store = MemoryStore()
    var state = InspectionState(workOrderID: "W01")
    state.edit(note: "ready")
    try state.save(to: store)
    XCTAssertNotNil(try store.load("W01"))
    try state.submissionSucceeded(store: store)
    XCTAssertNil(try store.load("W01"))
    XCTAssertEqual(state.status, .submitted)
  }
  func testFileStoreRestoresJSONAndJPEGBytes() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = try FileDraftStore(directory: directory)
    let image = Data([0xff, 0xd8, 0xff, 0xd9])
    let name = try store.savePhoto(image)
    let draft = InspectionDraft(workOrderID: "W01", note: "现场", photoToken: name)
    try store.save(draft)
    XCTAssertEqual(try store.load("W01"), draft)
    XCTAssertEqual(try store.loadPhoto(name), image)
  }
}
