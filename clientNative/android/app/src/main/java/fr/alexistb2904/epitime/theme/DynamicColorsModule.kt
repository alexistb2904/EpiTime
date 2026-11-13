package fr.alexistb2904.epitime.theme

import android.R.color as C
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

/** Expose les couleurs Material You du système (Android 12+) en hex */
class DynamicColorsModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "EpiTimeDynamicColors"

  override fun getConstants(): Map<String, Any> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return emptyMap()
    val res = reactApplicationContext.resources
    fun hex(id: Int) = String.format("#%06X", 0xFFFFFF and res.getColor(id, null))

    val light = mapOf(
      "primary" to hex(C.system_accent1_600),
      "primaryContainer" to hex(C.system_accent1_100),
      "tertiaryContainer" to hex(C.system_accent3_100),
      "background" to hex(C.system_neutral1_10),
      "onBackground" to hex(C.system_neutral1_900),
      "surface" to hex(C.system_neutral1_10),
      "surfaceContainerLow" to hex(C.system_neutral1_50),
      "surfaceContainer" to hex(C.system_neutral1_50),
      "onSurfaceVariant" to hex(C.system_neutral2_700),
      "outlineVariant" to hex(C.system_neutral2_200),
    )
    val dark = mapOf(
      "primary" to hex(C.system_accent1_200),
      "primaryContainer" to hex(C.system_accent1_700),
      "tertiaryContainer" to hex(C.system_accent3_700),
      "background" to hex(C.system_neutral1_900),
      "onBackground" to hex(C.system_neutral1_100),
      "surface" to hex(C.system_neutral1_900),
      "surfaceContainerLow" to hex(C.system_neutral1_900),
      "surfaceContainer" to hex(C.system_neutral1_900),
      "onSurfaceVariant" to hex(C.system_neutral2_200),
      "outlineVariant" to hex(C.system_neutral2_700),
    )
    return mapOf("light" to light, "dark" to dark)
  }
}
