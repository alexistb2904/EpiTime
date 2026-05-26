package fr.alexistb2904.epitime.widgets

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs

data class WidgetCourse(
  val id: String,
  val title: String,
  val type: String,
  val room: String,
  val teacher: String,
  val startDate: String,
  val startMillis: Long,
  val endMillis: Long,
  val color: Int
)

data class WidgetNetworkConfig(
  val apiBase: String,
  val zeusToken: String,
  val groups: List<String>
)

object CourseWidgetStore {
  private const val PREFS = "epitime_widget"
  private const val COURSES_JSON = "courses_json"
  private const val UPDATED_AT = "updated_at"
  private val palette = intArrayOf(
    0xFF0EA5E9.toInt(),
    0xFF14B8A6.toInt(),
    0xFFF97316.toInt(),
    0xFFEF4444.toInt(),
    0xFF8B5CF6.toInt(),
    0xFF22C55E.toInt(),
    0xFFEC4899.toInt(),
    0xFFEAB308.toInt(),
    0xFF06B6D4.toInt()
  )

  fun save(context: Context, rawJson: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(COURSES_JSON, rawJson)
      .putLong(UPDATED_AT, System.currentTimeMillis())
      .apply()
  }

  fun saveCourses(context: Context, courses: JSONArray) {
    val root = payload(context) ?: JSONObject()
    root.put("courses", courses)
    root.put("generatedAt", System.currentTimeMillis())
    save(context, root.toString())
  }

  fun networkConfig(context: Context): WidgetNetworkConfig? {
    val root = payload(context) ?: return null
    val apiBase = root.optString("apiBase").trim().trimEnd('/')
    val zeusToken = root.optString("zeusToken").trim()
    val groups = root.optJSONArray("groups") ?: JSONArray()
    val groupIds = (0 until groups.length())
      .mapNotNull { index -> groups.optString(index).takeIf { it.isNotBlank() } }

    if (apiBase.isBlank() || zeusToken.isBlank() || groupIds.isEmpty()) return null
    return WidgetNetworkConfig(apiBase, zeusToken, groupIds)
  }

  fun updatedAt(context: Context): Long =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(UPDATED_AT, 0L)

  fun upcomingCourses(context: Context, limit: Int = 8, now: Long = System.currentTimeMillis()): List<WidgetCourse> {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(COURSES_JSON, null) ?: return emptyList()
    val array = try {
      val root = JSONObject(raw)
      root.optJSONArray("courses") ?: JSONArray()
    } catch (_: Exception) {
      try {
        JSONArray(raw)
      } catch (_: Exception) {
        JSONArray()
      }
    }

    return (0 until array.length())
      .mapNotNull { index -> array.optJSONObject(index)?.toCourse() }
      .filter { it.endMillis > now }
      .sortedBy { it.startMillis }
      .take(limit)
  }

  private fun JSONObject.toCourse(): WidgetCourse? {
    val start = optLong("startMillis", 0L)
    val end = optLong("endMillis", 0L)
    if (start <= 0L || end <= 0L) return null

    val title = optString("title").ifBlank { "Cours" }
    val seed = optString("type").ifBlank { optString("code").ifBlank { title } }
    val fallbackColor = palette[abs(seed.hashCode()) % palette.size]
    val id = optString("id").ifBlank { "$title-$start" }
    return WidgetCourse(
      id = id,
      title = title,
      type = optString("type").ifBlank { "Cours" },
      room = optString("room").ifBlank { "Lieu a confirmer" },
      teacher = optString("teacher"),
      startDate = optString("startDate").ifBlank { iso(start) },
      startMillis = start,
      endMillis = end,
      color = parseColor(optString("color"), fallbackColor)
    )
  }

  private fun payload(context: Context): JSONObject? {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(COURSES_JSON, null) ?: return null
    return try {
      JSONObject(raw)
    } catch (_: Exception) {
      null
    }
  }

  private fun parseColor(value: String, fallback: Int): Int {
    if (!value.startsWith("#")) return fallback
    return try {
      val hex = value.removePrefix("#")
      val rgb = hex.toLong(16).toInt()
      if (hex.length <= 6) 0xFF000000.toInt() or rgb else rgb
    } catch (_: Exception) {
      fallback
    }
  }

  private fun iso(millis: Long): String =
    java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
      timeZone = java.util.TimeZone.getTimeZone("UTC")
    }.format(java.util.Date(millis))
}
