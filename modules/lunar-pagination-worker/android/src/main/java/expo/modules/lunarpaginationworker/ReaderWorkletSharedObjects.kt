package expo.modules.lunarpaginationworker

import android.graphics.Paint
import android.graphics.Typeface
import expo.modules.kotlin.sharedobjects.SharedObject
import java.io.File

/**
 * SharedObject instances are paired with the Expo Modules Worklets runtime.
 * They avoid resolving the ordinary Expo module proxy from a Worker Runtime.
 */
class ReaderArchiveSharedObject(uri: String) : SharedObject() {
  private val archive = ArchiveHandle(resolveFileUri(uri))

  val bookHash: String
    get() = archive.bookHash

  fun readAll(): ByteArray = archive.readAll()

  fun readEntry(path: String): ByteArray = archive.read(path)

  fun hasEntry(path: String): Boolean = archive.entries.containsKey(normalizePath(path))

  fun closeArchive() = archive.close()

  override fun sharedObjectDidRelease() {
    archive.close()
  }

  companion object {
    private fun resolveFileUri(uri: String): File =
      android.net.Uri.parse(uri).let { parsed ->
        require(parsed.scheme == null || parsed.scheme == "file") {
          "ReaderArchiveSharedObject requires a file URI."
        }
        File(parsed.path ?: uri).also { file ->
          require(file.isFile && file.length() <= 100L * 1024L * 1024L) {
            "The EPUB archive exceeds the size limit."
          }
        }
      }
  }
}

class ReaderTextMeasurerSharedObject(
  private val readerTypeface: Typeface,
) : SharedObject() {
  fun measureText(request: Map<String, Any?>): Map<String, Double> {
    val paint = createPaint(request)
    val text = request["text"] as? String ?: ""
    val letterSpacing = (request["letterSpacingPx"] as? Number)?.toFloat() ?: 0f
    val wordSpacing = (request["wordSpacingPx"] as? Number)?.toFloat() ?: 0f
    val characterCount = text.codePointCount(0, text.length)
    val spacing = (maxOf(0, characterCount - 1) * letterSpacing) + (text.count { it == ' ' } * wordSpacing)
    return mapOf(
      "width" to (paint.measureText(text) + spacing).toDouble(),
      "height" to requestSize(request),
    )
  }

  fun resolveFontMetrics(request: Map<String, Any?>): Map<String, Double> {
    val metrics = Paint.FontMetrics()
    createPaint(request).getFontMetrics(metrics)
    val ascent = -metrics.ascent.toDouble().coerceAtLeast(0.0)
    val descent = metrics.descent.toDouble().coerceAtLeast(0.0)
    val leading = metrics.leading.toDouble().coerceAtLeast(0.0)
    return mapOf(
      "ascentPx" to ascent,
      "descentPx" to descent,
      "lineGapPx" to leading,
      "contentHeightPx" to ascent + descent + leading,
    )
  }

  private fun createPaint(request: Map<String, Any?>): Paint {
    return Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = requestSize(request).toFloat()
      typeface = readerTypeface
    }
  }

  private fun requestSize(request: Map<String, Any?>): Double =
    (request["sizePx"] as? Number)?.toDouble()?.coerceAtLeast(1.0) ?: 16.0
}
