package fr.alexistb2904.epitime.downloads

import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream
import java.io.InputStream

/**
 * Saves an already generated document to Android's public Downloads collection.
 *
 * This is intentionally not a Storage Access Framework picker: on Android 10+
 * MediaStore lets an app publish the file it owns in Downloads without a broad
 * storage permission, exactly where browser downloads appear.
 */
class PdfDownloadsModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "EpiTimePdfDownloads"

  @ReactMethod
  fun savePdfToDownloads(sourceUriValue: String, requestedName: String, promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      promise.reject("DOWNLOADS_UNSUPPORTED", "Le téléchargement direct nécessite Android 10 ou une version plus récente.")
      return
    }

    val resolver = reactContext.contentResolver
    val displayName = sanitizePdfFileName(requestedName)
    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
      put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
      put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
      put(MediaStore.MediaColumns.IS_PENDING, 1)
    }
    val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val destination = resolver.insert(collection, values)
    if (destination == null) {
      promise.reject("DOWNLOADS_CREATE_FAILED", "Impossible de créer le PDF dans Téléchargements.")
      return
    }

    try {
      openSource(sourceUriValue).use { input ->
        resolver.openOutputStream(destination, "w")?.use { output -> input.copyTo(output) }
          ?: throw IllegalStateException("Impossible d'ouvrir le fichier de destination.")
      }
      val completed = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
      resolver.update(destination, completed, null, null)
      promise.resolve(destination.toString())
    } catch (error: Exception) {
      resolver.delete(destination, null, null)
      promise.reject("DOWNLOADS_WRITE_FAILED", "Impossible d’enregistrer le PDF dans Téléchargements.", error)
    }
  }

  private fun openSource(sourceUriValue: String): InputStream {
    val source = Uri.parse(sourceUriValue)
    if (source.scheme == "file") {
      return FileInputStream(File(requireNotNull(source.path)))
    }
    return reactContext.contentResolver.openInputStream(source)
      ?: throw IllegalArgumentException("Le PDF temporaire est introuvable.")
  }

  private fun sanitizePdfFileName(value: String): String {
    val safe = value.replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_").trim().ifBlank { "Syllabus.pdf" }
    return if (safe.endsWith(".pdf", ignoreCase = true)) safe else "$safe.pdf"
  }
}
