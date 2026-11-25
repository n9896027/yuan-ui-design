import SwiftUI

#if os(iOS)
  import UIKit
  import AVFoundation
#endif
#if SWIFT_PACKAGE
  import InspectionCore
#endif

@main struct NativeInspectionApp: App { var body: some Scene { WindowGroup { InspectionView() } } }

@MainActor final class InspectionViewModel: ObservableObject {
  @Published var state = InspectionState(workOrderID: "shoreline-W01")
  @Published var showCamera = false
  @Published var photo: Data?
  private var store: FileDraftStore?

  init() {
    do {
      let local = try FileDraftStore()
      try state.restore(from: local)
      if let name = state.draft.photoToken { photo = try local.loadPhoto(name) }
      store = local
    } catch {
      state.storageFailed("本机草稿无法读取。已保留原文件。")
    }
  }

  func save() {
    guard let store else {
      state.storageFailed("存储无法读取，当前输入仍在。")
      return
    }
    do { try state.save(to: store) } catch { state.storageFailed("保存失败，当前输入仍在，可重试。") }
  }

  #if os(iOS)
    func openCamera() {
      guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
        state.cameraUnavailable()
        return
      }
      switch AVCaptureDevice.authorizationStatus(for: .video) {
      case .authorized: showCamera = true
      case .notDetermined:
        Task {
          if await AVCaptureDevice.requestAccess(for: .video) {
            showCamera = true
          } else {
            state.cameraUnavailable()
          }
        }
      default: state.cameraUnavailable()
      }
    }

    func captured(_ image: UIImage) {
      guard let store, let jpeg = image.jpegData(compressionQuality: 0.88) else {
        state.storageFailed("现场照片无法保存。")
        return
      }
      do {
        let name = try store.savePhoto(jpeg)
        var updated = state
        updated.attachPhoto(token: name)
        do { try updated.save(to: store) } catch {
          try? store.discardPhoto(name)
          throw error
        }
        let previous = state.draft.photoToken
        state = updated
        photo = jpeg
        if let previous { try? store.discardPhoto(previous) }
      } catch { state.storageFailed("照片未保存，原有草稿仍在。") }
    }
  #endif

  func submitFailure() {
    state.beginSubmit()
    state.submissionFailed("模拟上传超时，当前草稿仍在。")
  }
}

struct InspectionView: View {
  @StateObject private var model = InspectionViewModel()
  var body: some View {
    NavigationStack {
      Form {
        Section("岸线巡检工单 W01") {
          Text("北岸潮位传感器 · 检查接头与间歇缺失读数").font(.headline)
          Text("记录接头状况，可拍照并把草稿保存在本机。").foregroundStyle(.secondary)
        }
        Section("观察记录") {
          TextEditor(
            text: Binding(get: { model.state.draft.note }, set: { model.state.edit(note: $0) })
          ).frame(minHeight: 130).accessibilityLabel("观察记录")
        }
        Section("现场照片") {
          #if os(iOS)
            if let photo = model.photo, let image = UIImage(data: photo) {
              Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 180)
            } else {
              Text("尚未附照片").foregroundStyle(.secondary)
            }
          #else
            Text(model.state.draft.photoToken == nil ? "尚未附照片" : "已附现场照片").foregroundStyle(
              .secondary)
          #endif
          #if os(iOS)
            Button("调用系统相机") { model.openCamera() }
          #else
            Button("相机不可用") { model.state.cameraUnavailable() }
          #endif
          if let notice = model.state.cameraNotice { Text(notice).foregroundStyle(.orange) }
        }
        Section {
          Button("保存本机草稿") { model.save() }
          Button("模拟上传超时") { model.submitFailure() }.tint(.red)
        }
        switch model.state.status {
        case .failed(let message): Section { Text(message).foregroundStyle(.red) }
        case .draftSaved: Section { Text("草稿已保存在本机") }
        default: EmptyView()
        }
      }.navigationTitle("巡检记录")
        #if os(iOS)
          .sheet(isPresented: $model.showCamera) {
            CameraCapture { image in
              model.captured(image)
              model.showCamera = false
            } cancelled: {
              model.state.cameraCancelled()
              model.showCamera = false
            } unavailable: {
              model.state.cameraUnavailable()
              model.showCamera = false
            }
          }
        #endif
    }
  }
}

#if os(iOS)
  struct CameraCapture: UIViewControllerRepresentable {
    let captured: (UIImage) -> Void
    let cancelled: () -> Void
    let unavailable: () -> Void
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIViewController(context: Context) -> UIImagePickerController {
      guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
        DispatchQueue.main.async { unavailable() }
        return UIImagePickerController()
      }
      let picker = UIImagePickerController()
      picker.sourceType = .camera
      picker.delegate = context.coordinator
      return picker
    }
    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
    final class Coordinator: NSObject, UINavigationControllerDelegate,
      UIImagePickerControllerDelegate
    {
      let parent: CameraCapture
      init(_ parent: CameraCapture) { self.parent = parent }
      func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true) { self.parent.cancelled() }
      }
      func imagePickerController(
        _ picker: UIImagePickerController,
        didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
      ) {
        guard let image = info[.originalImage] as? UIImage else {
          parent.cancelled()
          return
        }
        picker.dismiss(animated: true) { self.parent.captured(image) }
      }
    }
  }
#endif
