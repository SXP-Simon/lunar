import CoreText
import CryptoKit
import ExpoModulesCore
import Foundation
import zlib

private let maxArchiveBytes: UInt64 = 100 * 1024 * 1024
private let maxTotalUncompressedBytes: UInt64 = 250 * 1024 * 1024
private let maxEntryUncompressedBytes: UInt64 = 64 * 1024 * 1024
private let maxEntries = 5_000
private let maxCompressionRatio: UInt64 = 100

private enum ReaderBuiltinFont {
  static let fileURL: URL = {
    guard let url = Bundle.main.url(forResource: "LXGWWenKai-Regular", withExtension: "ttf") else {
      fatalError("The bundled Lunar reader font is missing from the application bundle.")
    }
    return url
  }()

  static let graphicsFont: CGFont = {
    guard let provider = CGDataProvider(url: fileURL as CFURL), let font = CGFont(provider) else {
      fatalError("The bundled Lunar reader font could not be decoded.")
    }
    return font
  }()

  static func make(size: Double) -> CTFont {
    CTFontCreateWithGraphicsFont(graphicsFont, CGFloat(size), nil, nil)
  }

  static func bytes() throws -> Data {
    try Data(contentsOf: fileURL)
  }
}

public final class LunarReaderModule: Module {
  private var archives: [String: ArchiveHandle] = [:]
  private var readerWorkletRuntimes: [JavaScriptRuntime] = []

  public func definition() -> ModuleDefinition {
    Name("LunarReader")

    Class("ReaderArchive", ReaderArchiveSharedObject.self) {
      Constructor { (uri: String) throws in
        try ReaderArchiveSharedObject(uri: uri)
      }
      Property("bookHash") { (self: ReaderArchiveSharedObject) in
        self.bookHash
      }
      Function("readAll") { (self: ReaderArchiveSharedObject) in
        self.readAll()
      }
      Function("readEntry") { (self: ReaderArchiveSharedObject, path: String) throws in
        try self.readEntry(path)
      }
      Function("hasEntry") { (self: ReaderArchiveSharedObject, path: String) in
        self.hasEntry(path)
      }
      Function("close") { (self: ReaderArchiveSharedObject) in
        self.closeArchive()
      }
    }

    Class("ReaderTextMeasurer", ReaderTextMeasurerSharedObject.self) {
      Constructor { ReaderTextMeasurerSharedObject() }
      Function("measureText") { (self: ReaderTextMeasurerSharedObject, request: [String: Any]) in
        self.measureText(request)
      }
      Function("resolveFontMetrics") { (self: ReaderTextMeasurerSharedObject, request: [String: Any]) in
        self.resolveFontMetrics(request)
      }
    }

    Function("installOnReaderWorkletRuntime") { (runtimeHolder: JavaScriptValue) throws in
      try self.installOnReaderWorkletRuntime(runtimeHolder)
    }

    Function("getBuiltinFontBytes") { () throws -> Data in
      try ReaderBuiltinFont.bytes()
    }

    AsyncFunction("openArchive") { (uri: String) -> [String: String] in
      let resolved = try Self.resolveFile(uri)
      let archive = try ArchiveHandle(fileURL: resolved.url, deleteOnClose: resolved.temporary)
      let handleId = UUID().uuidString
      archives[handleId] = archive
      return ["handleId": handleId, "bookHash": archive.bookHash]
    }

    AsyncFunction("readArchiveEntry") { (handleId: String, path: String) -> Data in
      guard let archive = archives[handleId] else { throw ArchiveError.closed }
      return try archive.read(path: path)
    }

    Function("hasArchiveEntry") { (handleId: String, path: String) -> Bool in
      archives[handleId]?.hasEntry(path: path) ?? false
    }

    Function("closeArchive") { (handleId: String) in
      archives.removeValue(forKey: handleId)?.close()
    }

    Function("measureText") { (request: [String: Any]) -> [String: Double] in
      let text = request["text"] as? String ?? ""
      let size = (request["sizePx"] as? NSNumber)?.doubleValue ?? 16
      let font = ReaderBuiltinFont.make(size: size)
      let attributes: [NSAttributedString.Key: Any] = [.font: font]
      let width = NSAttributedString(string: text, attributes: attributes).size().width
      return ["width": Double(width), "height": size]
    }

    Function("resolveFontMetrics") { (request: [String: Any]) -> [String: Double] in
      let size = (request["sizePx"] as? NSNumber)?.doubleValue ?? 16
      let font = ReaderBuiltinFont.make(size: size)
      let ascent = Double(CTFontGetAscent(font))
      let descent = Double(CTFontGetDescent(font))
      let leading = Double(max(0, CTFontGetLeading(font)))
      return [
        "ascentPx": ascent,
        "descentPx": descent,
        "lineGapPx": leading,
        "contentHeightPx": ascent + descent + leading
      ]
    }
  }

  public override func onDestroy() {
    archives.values.forEach { $0.close() }
    archives.removeAll()
    readerWorkletRuntimes.removeAll()
  }

  /**
   * Expo SDK 57 exposes the worklet factory through the UI-runtime installer.
   * Temporarily attaching the custom runtime to the AppContext runs the same
   * SharedObject prototype installation, then restores the real UI runtime.
   * The wrapper is retained for the lifetime of this module so its JSI state
   * remains valid while the Worker executes.
   */
  private func installOnReaderWorkletRuntime(_ runtimeHolder: JavaScriptValue) throws -> Bool {
    guard runtimeHolder.isObject() else {
      throw ReaderWorkletRuntimeError("The Reader Worklet Runtime holder is invalid.")
    }
    guard let factory = AppContext.uiRuntimeFactory else {
      throw ReaderWorkletRuntimeError("Expo Worklets adapter is unavailable.")
    }
    let runtime = try appContext.runtime
    final class ErrorHolder: @unchecked Sendable {
      var error: (any Error)?
    }
    let errorHolder = ErrorHolder()
    let block = {
      do {
        let readerRuntime = try factory(appContext, runtimeHolder, runtime)
        let previousRuntime = appContext._uiRuntime
        appContext._uiRuntime = readerRuntime
        appContext._uiRuntime = previousRuntime
        readerWorkletRuntimes.append(readerRuntime)
      } catch {
        errorHolder.error = error
      }
    }
    if Thread.isMainThread {
      block()
    } else {
      DispatchQueue.main.sync(execute: block)
    }
    if let error = errorHolder.error {
      throw error
    }
    return true
  }

  private static func resolveFile(_ uri: String) throws -> (url: URL, temporary: Bool) {
    guard let url = URL(string: uri) else { throw ArchiveError.invalidURI }
    if url.isFileURL {
      try validate(url)
      return (url, false)
    }
    let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("lunar-reader-\(UUID().uuidString).epub")
    try Data(contentsOf: url).write(to: temporary, options: .atomic)
    try validate(temporary)
    return (temporary, true)
  }

  private static func validate(_ url: URL) throws {
    let values = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
    guard values.isRegularFile == true, UInt64(values.fileSize ?? 0) <= maxArchiveBytes else {
      throw ArchiveError.sizeLimit
    }
  }
}

private enum ArchiveError: Error {
  case closed
  case invalidURI
  case invalidPath
  case sizeLimit
  case unsupportedCompression
}

private struct ReaderWorkletRuntimeError: LocalizedError {
  let message: String

  init(_ message: String) {
    self.message = message
  }

  var errorDescription: String? { message }
}

private final class ArchiveHandle {
  private let data: Data
  private let entries: [String: ZipEntry]
  private let fileURL: URL
  private let deleteOnClose: Bool
  let bookHash: String

  init(fileURL: URL, deleteOnClose: Bool) throws {
    self.fileURL = fileURL
    self.deleteOnClose = deleteOnClose
    data = try Data(contentsOf: fileURL, options: .mappedIfSafe)
    bookHash = CryptoKit.SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    entries = try ZipEntry.index(data: data)
  }

  func hasEntry(path: String) -> Bool {
    (try? normalizePath(path)).flatMap { entries[$0] } != nil
  }

  func read(path: String) throws -> Data {
    guard let entry = entries[try normalizePath(path)] else { throw ArchiveError.invalidPath }
    return try entry.inflate(from: data)
  }

  func readAll() -> Data {
    data
  }

  func close() {
    if deleteOnClose {
      try? FileManager.default.removeItem(at: fileURL)
    }
  }
}

final class ReaderArchiveSharedObject: SharedObject {
  private let archive: ArchiveHandle

  init(uri: String) throws {
    let resolved = try Self.resolveFile(uri)
    archive = try ArchiveHandle(fileURL: resolved.url, deleteOnClose: resolved.temporary)
    super.init()
  }

  var bookHash: String { archive.bookHash }

  func readAll() -> Data { archive.readAll() }
  func readEntry(_ path: String) throws -> Data { try archive.read(path: path) }
  func hasEntry(_ path: String) -> Bool { archive.hasEntry(path: path) }
  func closeArchive() { archive.close() }

  override func sharedObjectDidRelease() {
    archive.close()
  }

  private static func resolveFile(_ uri: String) throws -> (url: URL, temporary: Bool) {
    guard let url = URL(string: uri) else { throw ArchiveError.invalidURI }
    if url.isFileURL {
      try validate(url)
      return (url, false)
    }
    let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("lunar-reader-\(UUID().uuidString).epub")
    try Data(contentsOf: url).write(to: temporary, options: .atomic)
    try validate(temporary)
    return (temporary, true)
  }

  private static func validate(_ url: URL) throws {
    let values = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
    guard values.isRegularFile == true, UInt64(values.fileSize ?? 0) <= maxArchiveBytes else {
      throw ArchiveError.sizeLimit
    }
  }
}

final class ReaderTextMeasurerSharedObject: SharedObject {
  func measureText(_ request: [String: Any]) -> [String: Double] {
    let text = request["text"] as? String ?? ""
    let size = (request["sizePx"] as? NSNumber)?.doubleValue ?? 16
    let font = ReaderBuiltinFont.make(size: size)
    let width = NSAttributedString(string: text, attributes: [.font: font]).size().width
    let letterSpacing = (request["letterSpacingPx"] as? NSNumber)?.doubleValue ?? 0
    let wordSpacing = (request["wordSpacingPx"] as? NSNumber)?.doubleValue ?? 0
    return [
      "width": Double(width) + Double(max(0, text.count - 1)) * letterSpacing + Double(text.filter { $0 == " " }.count) * wordSpacing,
      "height": size,
    ]
  }

  func resolveFontMetrics(_ request: [String: Any]) -> [String: Double] {
    let size = (request["sizePx"] as? NSNumber)?.doubleValue ?? 16
    let font = ReaderBuiltinFont.make(size: size)
    let ascent = Double(CTFontGetAscent(font))
    let descent = Double(CTFontGetDescent(font))
    let leading = Double(max(0, CTFontGetLeading(font)))
    return [
      "ascentPx": ascent,
      "descentPx": descent,
      "lineGapPx": leading,
      "contentHeightPx": ascent + descent + leading,
    ]
  }
}

private struct ZipEntry {
  let compression: UInt16
  let compressedSize: Int
  let uncompressedSize: Int
  let offset: Int

  static func index(data: Data) throws -> [String: ZipEntry] {
    let bytes = [UInt8](data)
    guard let end = findEndOfCentralDirectory(bytes) else { throw ArchiveError.invalidPath }
    let count = Int(try readUInt16(bytes, end + 10))
    let centralSize = Int(try readUInt32(bytes, end + 12))
    let centralOffset = Int(try readUInt32(bytes, end + 16))
    guard count <= maxEntries,
          centralSize <= 64 * 1024 * 1024,
          centralOffset >= 0,
          centralSize <= bytes.count - centralOffset else { throw ArchiveError.sizeLimit }
    var cursor = Int(centralOffset)
    var result: [String: ZipEntry] = [:]
    var total: UInt64 = 0
    for _ in 0..<count {
      guard cursor >= centralOffset,
            cursor <= centralOffset + centralSize - 46,
            try readUInt32(bytes, cursor) == 0x02014b50 else { throw ArchiveError.invalidPath }
      let compression = try readUInt16(bytes, cursor + 10)
      let compressedSize = Int(try readUInt32(bytes, cursor + 20))
      let uncompressedSize = Int(try readUInt32(bytes, cursor + 24))
      let nameLength = Int(try readUInt16(bytes, cursor + 28))
      let extraLength = Int(try readUInt16(bytes, cursor + 30))
      let commentLength = Int(try readUInt16(bytes, cursor + 32))
      let localOffset = Int(try readUInt32(bytes, cursor + 42))
      let recordSize = 46 + nameLength + extraLength + commentLength
      guard recordSize <= centralOffset + centralSize - cursor,
            cursor + 46 + nameLength <= bytes.count else { throw ArchiveError.invalidPath }
      let name = String(bytes: bytes[(cursor + 46)..<(cursor + 46 + nameLength)], encoding: .utf8) ?? ""
      let normalized = try normalizePath(name)
      guard UInt64(uncompressedSize) <= maxEntryUncompressedBytes else { throw ArchiveError.sizeLimit }
      total += UInt64(uncompressedSize)
      guard total <= maxTotalUncompressedBytes else { throw ArchiveError.sizeLimit }
      guard compressedSize > 0 || uncompressedSize == 0,
            compressedSize == 0 || UInt64(uncompressedSize) <= UInt64(compressedSize) * maxCompressionRatio else {
        throw ArchiveError.sizeLimit
      }
      result[normalized] = ZipEntry(compression: compression, compressedSize: compressedSize, uncompressedSize: uncompressedSize, offset: localOffset)
      cursor += recordSize
    }
    return result
  }

  func inflate(from data: Data) throws -> Data {
    let bytes = [UInt8](data)
    guard offset >= 0, offset <= bytes.count - 30 else { throw ArchiveError.invalidPath }
    let nameLength = Int(try readUInt16(bytes, offset + 26))
    let extraLength = Int(try readUInt16(bytes, offset + 28))
    let start = offset + 30 + nameLength + extraLength
    guard start >= 0, start <= bytes.count, compressedSize <= bytes.count - start else {
      throw ArchiveError.invalidPath
    }
    let payload = Data(bytes[start..<(start + compressedSize)])
    if compression == 0 { return payload }
    if compression != 8 { throw ArchiveError.unsupportedCompression }
    return try RawDeflate.inflate(payload, expectedSize: uncompressedSize)
  }
}

private enum RawDeflate {
  static func inflate(_ data: Data, expectedSize: Int) throws -> Data {
    var stream = z_stream()
    var output = [UInt8](repeating: 0, count: max(expectedSize, 1))
    var input = [UInt8](data)
    let result = input.withUnsafeMutableBytes { inputBuffer in
      output.withUnsafeMutableBytes { outputBuffer in
        stream.next_in = inputBuffer.bindMemory(to: Bytef.self).baseAddress
        stream.avail_in = uInt(input.count)
        stream.next_out = outputBuffer.bindMemory(to: Bytef.self).baseAddress
        stream.avail_out = uInt(output.count)
        guard inflateInit2_(&stream, -15) == Z_OK else { return Z_DATA_ERROR }
        defer { inflateEnd(&stream) }
        return inflate(&stream, Z_FINISH)
      }
    }
    guard result == Z_STREAM_END else { throw ArchiveError.invalidPath }
    return Data(output.prefix(Int(stream.total_out)))
  }
}

private func normalizePath(_ path: String) throws -> String {
  let value = path.replacingOccurrences(of: "\\", with: "/").replacingOccurrences(of: "^\\./", with: "", options: .regularExpression)
  guard !value.hasPrefix("/"), !value.split(separator: "/").contains("..") else { throw ArchiveError.invalidPath }
  return value
}

private func findEndOfCentralDirectory(_ bytes: [UInt8]) -> Int? {
  guard bytes.count >= 22 else { return nil }
  for index in stride(from: bytes.count - 22, through: max(0, bytes.count - 22 - 65_536), by: -1) {
    if readUInt32Unchecked(bytes, index) == 0x06054b50 { return index }
  }
  return nil
}

private func readUInt16(_ bytes: [UInt8], _ offset: Int) throws -> UInt16 {
  guard offset >= 0, offset <= bytes.count - 2 else { throw ArchiveError.invalidPath }
  return UInt16(bytes[offset]) | UInt16(bytes[offset + 1]) << 8
}

private func readUInt32(_ bytes: [UInt8], _ offset: Int) throws -> UInt32 {
  guard offset >= 0, offset <= bytes.count - 4 else { throw ArchiveError.invalidPath }
  return UInt32(bytes[offset]) | UInt32(bytes[offset + 1]) << 8 | UInt32(bytes[offset + 2]) << 16 | UInt32(bytes[offset + 3]) << 24
}

private func readUInt32Unchecked(_ bytes: [UInt8], _ offset: Int) -> UInt32 {
  UInt32(bytes[offset]) | UInt32(bytes[offset + 1]) << 8 | UInt32(bytes[offset + 2]) << 16 | UInt32(bytes[offset + 3]) << 24
}
