package expo.modules.lunarreader

import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
import com.facebook.react.bridge.ReactApplicationContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.jni.JavaScriptObject
import expo.modules.kotlin.runtime.WorkletRuntime
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.lang.ref.WeakReference
import java.lang.reflect.InvocationTargetException
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.zip.ZipFile

private const val MAX_ARCHIVE_BYTES = 100L * 1024L * 1024L
private const val MAX_TOTAL_UNCOMPRESSED_BYTES = 250L * 1024L * 1024L
private const val MAX_ENTRY_UNCOMPRESSED_BYTES = 64L * 1024L * 1024L
private const val MAX_ENTRIES = 5_000
private const val MAX_COMPRESSION_RATIO = 100L
private const val READER_FONT_ASSET_PATH = "fonts/LXGWWenKai-Regular.ttf"

/**
 * Resolves a custom `react-native-worklets` Worker Runtime without treating it
 * as Expo's UI Runtime holder. The native implementation extracts the
 * WorkletRuntime HostObject directly and returns its JSI runtime pointer.
 */
private object ReaderWorkletRuntimeBridge {
  init {
    System.loadLibrary("lunarreader")
  }

  @JvmStatic
  external fun resolveWorkerRuntimePointer(runtimeHolder: JavaScriptObject): Long
}

class LunarReaderModule : Module() {
  private val archives = ConcurrentHashMap<String, ArchiveHandle>()
  private val readerWorkletRuntimes = ConcurrentHashMap<Long, WorkletRuntime>()
  private val readerTypeface: Typeface by lazy {
    val context = appContext.reactContext
      ?: throw IllegalStateException("React context is unavailable for the bundled reader font.")
    Typeface.createFromAsset(context.assets, READER_FONT_ASSET_PATH)
  }

  override fun definition() = ModuleDefinition {
    Name("LunarReader")

    Class("ReaderArchive", ReaderArchiveSharedObject::class) {
      Constructor { uri: String -> ReaderArchiveSharedObject(uri) }
      Property("bookHash") { self: ReaderArchiveSharedObject -> self.bookHash }
      Function("readAll") { self: ReaderArchiveSharedObject -> self.readAll() }
      Function("readEntry") { self: ReaderArchiveSharedObject, path: String -> self.readEntry(path) }
      Function("hasEntry") { self: ReaderArchiveSharedObject, path: String -> self.hasEntry(path) }
      Function("close") { self: ReaderArchiveSharedObject -> self.closeArchive() }
    }

    Class("ReaderTextMeasurer", ReaderTextMeasurerSharedObject::class) {
      Constructor { ReaderTextMeasurerSharedObject(readerTypeface) }
      Function("measureText") { self: ReaderTextMeasurerSharedObject, request: Map<String, Any?> -> self.measureText(request) }
      Function("resolveFontMetrics") { self: ReaderTextMeasurerSharedObject, request: Map<String, Any?> -> self.resolveFontMetrics(request) }
    }

    Function("installOnReaderWorkletRuntime") { runtimeHolder: JavaScriptObject ->
      installOnReaderWorkletRuntime(runtimeHolder)
    }

    Function("getBuiltinFontBytes") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context is unavailable for the bundled reader font.")
      context.assets.open(READER_FONT_ASSET_PATH).use { input -> input.readBytes() }
    }

    AsyncFunction("openArchive") { uri: String ->
      val file = resolveFile(uri)
      val handle = ArchiveHandle(file)
      val handleId = UUID.randomUUID().toString()
      archives[handleId] = handle
      mapOf("handleId" to handleId, "bookHash" to handle.bookHash)
    }

    AsyncFunction("readArchiveEntry") { handleId: String, path: String ->
      requireArchive(handleId).read(path)
    }

    Function("hasArchiveEntry") { handleId: String, path: String ->
      requireArchive(handleId).entries.containsKey(normalizePath(path))
    }

    Function("closeArchive") { handleId: String ->
      archives.remove(handleId)?.close()
    }

    Function("measureText") { request: Map<String, Any?> ->
      val paint = createPaint(request)
      val text = request["text"] as? String ?: ""
      val letterSpacing = (request["letterSpacingPx"] as? Number)?.toFloat() ?: 0f
      val wordSpacing = (request["wordSpacingPx"] as? Number)?.toFloat() ?: 0f
      val characterCount = text.codePointCount(0, text.length)
      val spacing = (maxOf(0, characterCount - 1) * letterSpacing) + (text.count { it == ' ' } * wordSpacing)
      mapOf("width" to (paint.measureText(text) + spacing), "height" to requestSize(request))
    }

    Function("resolveFontMetrics") { request: Map<String, Any?> ->
      val metrics = Paint.FontMetrics()
      createPaint(request).getFontMetrics(metrics)
      val ascent = -metrics.ascent.toDouble().coerceAtLeast(0.0)
      val descent = metrics.descent.toDouble().coerceAtLeast(0.0)
      val leading = metrics.leading.toDouble().coerceAtLeast(0.0)
      mapOf(
        "ascentPx" to ascent,
        "descentPx" to descent,
        "lineGapPx" to leading,
        "contentHeightPx" to ascent + descent + leading,
      )
    }
    OnDestroy {
      archives.values.forEach(ArchiveHandle::close)
      archives.clear()
      readerWorkletRuntimes.values.forEach(::deallocateReaderWorkletRuntime)
      readerWorkletRuntimes.clear()
    }
  }

  /**
   * Installs Expo SharedObject classes into the dedicated pagination Worker.
   * The Worker Runtime must be extracted from its HostObject; Expo's
   * resolveUIRuntimePointer only accepts the distinct UI-holder object.
   */
  private fun installOnReaderWorkletRuntime(runtimeHolder: JavaScriptObject): Boolean {
    val runtimePointer = ReaderWorkletRuntimeBridge.resolveWorkerRuntimePointer(runtimeHolder)
    if (runtimePointer == 0L) {
      return false
    }
    if (readerWorkletRuntimes.containsKey(runtimePointer)) {
      return true
    }
    val reactContext = appContext.reactContext as? ReactApplicationContext
      ?: throw IllegalStateException("React context is unavailable for the Reader Worklet Runtime.")
    val runtime = WorkletRuntime(appContext, WeakReference(reactContext))
    try {
      WorkletRuntime::class.java
        .getDeclaredMethod("install", Long::class.javaPrimitiveType)
        .apply { isAccessible = true }
        .invoke(runtime, runtimePointer)
    } catch (error: InvocationTargetException) {
      deallocateReaderWorkletRuntime(runtime)
      throw (error.cause ?: error)
    } catch (error: ReflectiveOperationException) {
      deallocateReaderWorkletRuntime(runtime)
      throw IllegalStateException("The Expo Worklet Runtime installer is unavailable.", error)
    }
    readerWorkletRuntimes[runtimePointer] = runtime
    return true
  }

  private fun deallocateReaderWorkletRuntime(runtime: WorkletRuntime) {
    runCatching {
      WorkletRuntime::class.java
        .getDeclaredMethod("deallocate")
        .apply { isAccessible = true }
        .invoke(runtime)
    }
  }

  private fun requireArchive(handleId: String): ArchiveHandle =
    archives[handleId] ?: throw IllegalStateException("The EPUB archive handle is closed.")

  private fun createPaint(request: Map<String, Any?>): Paint {
    return Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = requestSize(request).toFloat()
      typeface = readerTypeface
    }
  }

  private fun requestSize(request: Map<String, Any?>): Double =
    (request["sizePx"] as? Number)?.toDouble()?.coerceAtLeast(1.0) ?: 16.0

  private fun resolveFile(uri: String): File {
    val parsed = Uri.parse(uri)
    if (parsed.scheme == null || parsed.scheme == "file") {
      return File(parsed.path ?: uri).also(::validateArchiveFile)
    }
    val context = appContext.reactContext ?: throw IllegalStateException("React context is unavailable.")
    val temporary = File.createTempFile("lunar-reader-", ".epub", context.cacheDir)
    context.contentResolver.openInputStream(parsed).use { input ->
      requireNotNull(input) { "Unable to open EPUB URI." }
      temporary.outputStream().use { output -> input.copyTo(output, 64 * 1024) }
    }
    validateArchiveFile(temporary)
    return temporary
  }

  private fun validateArchiveFile(file: File) {
    require(file.isFile && file.length() <= MAX_ARCHIVE_BYTES) { "The EPUB archive exceeds the size limit." }
  }
}

internal class ArchiveHandle(private val file: File) {
  private val zip = ZipFile(file)
  val entries: Map<String, java.util.zip.ZipEntry>
  val bookHash: String

  init {
    val indexed = LinkedHashMap<String, java.util.zip.ZipEntry>()
    var total = 0L
    val iterator = zip.entries()
    while (iterator.hasMoreElements()) {
      val entry = iterator.nextElement()
      require(indexed.size < MAX_ENTRIES) { "The EPUB archive has too many entries." }
      val normalized = normalizePath(entry.name)
      val uncompressed = entry.size.coerceAtLeast(0L)
      val compressed = entry.compressedSize.coerceAtLeast(1L)
      require(uncompressed <= MAX_ENTRY_UNCOMPRESSED_BYTES) { "An EPUB entry exceeds the size limit." }
      require(uncompressed / compressed <= MAX_COMPRESSION_RATIO) { "The EPUB entry compression ratio is too high." }
      total += uncompressed
      require(total <= MAX_TOTAL_UNCOMPRESSED_BYTES) { "The EPUB archive exceeds the expanded size limit." }
      indexed[normalized] = entry
    }
    entries = indexed
    bookHash = sha256(file)
  }

  fun read(path: String): ByteArray {
    val entry = entries[normalizePath(path)] ?: throw IllegalArgumentException("EPUB entry not found.")
    return zip.getInputStream(entry).use { input -> input.readBounded(MAX_ENTRY_UNCOMPRESSED_BYTES) }
  }

  fun readAll(): ByteArray {
    require(file.isFile && file.length() <= MAX_ARCHIVE_BYTES) {
      "The EPUB archive exceeds the size limit."
    }
    return file.readBytes()
  }

  fun close() {
    zip.close()
    if (file.name.startsWith("lunar-reader-")) file.delete()
  }
}

private fun InputStream.readBounded(limit: Long): ByteArray {
  val output = java.io.ByteArrayOutputStream()
  val buffer = ByteArray(64 * 1024)
  var total = 0L
  while (true) {
    val count = read(buffer)
    if (count < 0) break
    total += count
    require(total <= limit) { "The EPUB entry exceeds the size limit." }
    output.write(buffer, 0, count)
  }
  return output.toByteArray()
}

internal fun normalizePath(path: String): String {
  val normalized = path.replace('\\', '/').removePrefix("./")
  require(!normalized.startsWith('/') && normalized.split('/').none { it == ".." }) {
    "The EPUB entry path is unsafe."
  }
  return normalized
}

private fun sha256(file: File): String {
  val digest = MessageDigest.getInstance("SHA-256")
  FileInputStream(file).use { input ->
    val buffer = ByteArray(64 * 1024)
    while (true) {
      val count = input.read(buffer)
      if (count < 0) break
      digest.update(buffer, 0, count)
    }
  }
  return digest.digest().joinToString("") { "%02x".format(it) }
}
