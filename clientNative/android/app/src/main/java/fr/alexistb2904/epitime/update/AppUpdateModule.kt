package fr.alexistb2904.epitime.update

import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

class AppUpdateModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "EpiTimeAppUpdate"

  @ReactMethod
  fun canRequestPackageInstalls(promise: Promise) {
    try {
      val allowed =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
          reactContext.packageManager.canRequestPackageInstalls()
      promise.resolve(allowed)
    } catch (error: Exception) {
      promise.reject("UPDATE_PERMISSION_CHECK_FAILED", "Impossible de vérifier l'autorisation d'installation.", error)
    }
  }

  @ReactMethod
  fun openUnknownAppSourcesSettings(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val intent =
          Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:" + reactContext.packageName)
          ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(intent)
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("UPDATE_PERMISSION_SETTINGS_FAILED", "Impossible d'ouvrir l'autorisation Android.", error)
    }
  }

  @ReactMethod
  fun installApk(
    fileUri: String,
    expectedSha256: String?,
    expectedVersion: String?,
    promise: Promise
  ) {
    Thread {
      try {
        if (
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !reactContext.packageManager.canRequestPackageInstalls()
        ) {
          promise.reject(
            "UPDATE_PERMISSION_REQUIRED",
            "EpiTime n'est pas encore autorisé à installer des applications."
          )
          return@Thread
        }

        val file = resolveUpdateFile(fileUri)
        validateApk(file, expectedSha256, expectedVersion)

        val contentUri =
          FileProvider.getUriForFile(
            reactContext,
            reactContext.packageName + ".app-update-provider",
            file
          )

        val intent =
          Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(contentUri, APK_MIME_TYPE)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          }

        if (intent.resolveActivity(reactContext.packageManager) == null) {
          promise.reject("UPDATE_INSTALLER_UNAVAILABLE", "Aucun installateur APK Android n'est disponible.")
          return@Thread
        }

        reactContext.runOnUiQueueThread {
          try {
            reactContext.startActivity(intent)
            promise.resolve(null)
          } catch (error: Exception) {
            promise.reject("UPDATE_INSTALL_LAUNCH_FAILED", "Impossible d'ouvrir l'installateur Android.", error)
          }
        }
      } catch (error: UpdateValidationException) {
        promise.reject(error.code, error.message, error)
      } catch (error: Exception) {
        promise.reject("UPDATE_INSTALL_FAILED", error.message ?: "Impossible de préparer la mise à jour.", error)
      }
    }.start()
  }

  private fun resolveUpdateFile(fileUri: String): File {
    val uri = Uri.parse(fileUri)
    if (uri.scheme != "file") {
      throw UpdateValidationException("UPDATE_INVALID_URI", "Le fichier de mise à jour n'est pas un fichier local EpiTime.")
    }

    val rawPath =
      uri.path
        ?: throw UpdateValidationException("UPDATE_INVALID_URI", "Le chemin de l'APK est introuvable.")
    val file = File(rawPath).canonicalFile
    val updateDirectory = File(reactContext.cacheDir, "updates").canonicalFile
    val allowedPrefix = updateDirectory.path + File.separator

    if (!file.path.startsWith(allowedPrefix)) {
      throw UpdateValidationException("UPDATE_INVALID_LOCATION", "L'APK doit provenir du cache de mise à jour EpiTime.")
    }
    if (!file.isFile || file.length() <= 0L || !file.name.endsWith(".apk", ignoreCase = true)) {
      throw UpdateValidationException("UPDATE_INVALID_APK", "L'APK téléchargé est absent ou invalide.")
    }

    return file
  }

  private fun validateApk(file: File, expectedSha256: String?, expectedVersion: String?) {
    val expectedDigest = expectedSha256?.trim()?.lowercase()?.removePrefix("sha256:")
    if (!expectedDigest.isNullOrBlank()) {
      if (!expectedDigest.matches(Regex("^[a-f0-9]{64}$"))) {
        throw UpdateValidationException("UPDATE_INVALID_DIGEST", "Le SHA-256 annoncé par la release GitHub est invalide.")
      }
      val actualDigest = sha256(file)
      if (actualDigest != expectedDigest) {
        throw UpdateValidationException(
          "UPDATE_SHA256_MISMATCH",
          "Le contrôle SHA-256 de l'APK a échoué. Le fichier a été refusé."
        )
      }
    }

    val packageManager = reactContext.packageManager
    val archiveInfo =
      getArchivePackageInfo(packageManager, file.absolutePath)
        ?: throw UpdateValidationException("UPDATE_INVALID_APK", "Android ne reconnaît pas l'APK téléchargé.")

    if (archiveInfo.packageName != reactContext.packageName) {
      throw UpdateValidationException(
        "UPDATE_WRONG_PACKAGE",
        "L'APK téléchargé n'appartient pas à EpiTime."
      )
    }

    val wantedVersion = normalizeVersion(expectedVersion)
    val archiveVersion = normalizeVersion(archiveInfo.versionName)
    if (wantedVersion.isNotBlank() && archiveVersion != wantedVersion) {
      throw UpdateValidationException(
        "UPDATE_WRONG_VERSION",
        "La version contenue dans l'APK ne correspond pas à la release GitHub."
      )
    }

    val installedInfo =
      getInstalledPackageInfo(packageManager, reactContext.packageName)
        ?: throw UpdateValidationException("UPDATE_INSTALLED_PACKAGE_MISSING", "Impossible de vérifier la signature EpiTime installée.")

    val installedCertificates = signingCertificateDigests(installedInfo)
    val archiveCertificates = signingCertificateDigests(archiveInfo)

    if (
      installedCertificates.isEmpty() ||
        archiveCertificates.isEmpty() ||
        installedCertificates.intersect(archiveCertificates).isEmpty()
    ) {
      throw UpdateValidationException(
        "UPDATE_SIGNATURE_MISMATCH",
        "La signature de l'APK ne correspond pas à l'application EpiTime installée."
      )
    }
  }

  @Suppress("DEPRECATION")
  private fun getArchivePackageInfo(packageManager: PackageManager, path: String): PackageInfo? {
    val flags =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        PackageManager.GET_SIGNING_CERTIFICATES
      } else {
        PackageManager.GET_SIGNATURES
      }

    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      packageManager.getPackageArchiveInfo(path, PackageManager.PackageInfoFlags.of(flags.toLong()))
    } else {
      packageManager.getPackageArchiveInfo(path, flags)
    }
  }

  @Suppress("DEPRECATION")
  private fun getInstalledPackageInfo(packageManager: PackageManager, packageName: String): PackageInfo? {
    val flags =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        PackageManager.GET_SIGNING_CERTIFICATES
      } else {
        PackageManager.GET_SIGNATURES
      }

    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(flags.toLong()))
      } else {
        packageManager.getPackageInfo(packageName, flags)
      }
    } catch (_: PackageManager.NameNotFoundException) {
      null
    }
  }

  @Suppress("DEPRECATION")
  private fun signingCertificateDigests(packageInfo: PackageInfo): Set<String> {
    val signatures =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        val signingInfo = packageInfo.signingInfo ?: return emptySet()
        if (signingInfo.hasMultipleSigners()) {
          signingInfo.apkContentsSigners
        } else {
          signingInfo.signingCertificateHistory
        }
      } else {
        packageInfo.signatures ?: emptyArray()
      }

    return signatures.map { signature -> sha256(signature.toByteArray()) }.toSet()
  }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buffer = ByteArray(128 * 1024)
      while (true) {
        val read = input.read(buffer)
        if (read <= 0) break
        digest.update(buffer, 0, read)
      }
    }
    return digest.digest().toHex()
  }

  private fun sha256(bytes: ByteArray): String {
    return MessageDigest.getInstance("SHA-256").digest(bytes).toHex()
  }

  private fun ByteArray.toHex(): String = joinToString("") { byte -> "%02x".format(byte) }

  private fun normalizeVersion(value: String?): String {
    return value
      ?.trim()
      ?.removePrefix("v")
      ?.removePrefix("V")
      ?.substringBefore("+")
      ?.substringBefore("-")
      .orEmpty()
  }

  private class UpdateValidationException(
    val code: String,
    override val message: String
  ) : Exception(message)

  companion object {
    private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
  }
}
