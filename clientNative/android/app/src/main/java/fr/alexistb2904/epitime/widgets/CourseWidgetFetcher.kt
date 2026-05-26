package fr.alexistb2904.epitime.widgets

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs

object CourseWidgetFetcher {
  private val palette = arrayOf("#0EA5E9", "#14B8A6", "#F97316", "#EF4444", "#8B5CF6", "#22C55E", "#EC4899", "#EAB308", "#06B6D4")

  fun refreshFromNetwork(context: Context): Boolean {
    val config = CourseWidgetStore.networkConfig(context) ?: return false
    return try {
      val events = fetchEvents(config)
      val courses = normalizeEvents(events)
      CourseWidgetStore.saveCourses(context, courses)
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun fetchEvents(config: WidgetNetworkConfig): JSONArray {
    val start = Calendar.getInstance().apply {
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    val end = start.clone() as Calendar
    end.add(Calendar.DAY_OF_MONTH, 30)

    val query = StringBuilder()
      .append("start=").append(encode(iso(start.timeInMillis)))
      .append("&end=").append(encode(iso(end.timeInMillis)))
    config.groups.forEach { group -> query.append("&groups=").append(encode(group)) }

    val connection = URL("${config.apiBase}/api/events?$query").openConnection() as HttpURLConnection
    connection.requestMethod = "GET"
    connection.connectTimeout = 12_000
    connection.readTimeout = 12_000
    connection.setRequestProperty("Accept", "application/json")
    connection.setRequestProperty("Authorization", "Bearer ${config.zeusToken}")

    val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
    val body = BufferedReader(InputStreamReader(stream)).use { it.readText() }
    if (connection.responseCode !in 200..299) throw IllegalStateException("Widget fetch failed: ${connection.responseCode}")
    return JSONArray(body)
  }

  private fun normalizeEvents(events: JSONArray): JSONArray {
    val now = System.currentTimeMillis()
    val courses = (0 until events.length())
      .mapNotNull { index -> events.optJSONObject(index)?.toWidgetCourse() }
      .filter { it.optLong("endMillis") > now }
      .sortedBy { it.optLong("startMillis") }
      .take(8)

    return JSONArray().apply {
      courses.forEach { put(it) }
    }
  }

  private fun JSONObject.toWidgetCourse(): JSONObject? {
    val startMillis = parseDate(optString("startDate"))
    val endMillis = parseDate(optString("endDate"))
    if (startMillis <= 0L || endMillis <= 0L) return null

    val title = optString("name").ifBlank { optString("typeName").ifBlank { "Cours" } }
    val type = optString("courseTypeName").ifBlank { optString("typeName").ifBlank { "Cours" } }
    val seed = type.ifBlank { optString("code").ifBlank { title } }

    return JSONObject()
      .put("id", opt("idReservation") ?: opt("id") ?: "$title-$startMillis")
      .put("title", title)
      .put("type", formatType(type))
      .put("code", optString("code"))
      .put("room", roomLabel())
      .put("teacher", teacherLabel())
      .put("startMillis", startMillis)
      .put("endMillis", endMillis)
      .put("color", palette[abs(seed.hashCode()) % palette.size])
  }

  private fun JSONObject.roomLabel(): String {
    val rooms = optJSONArray("rooms") ?: return "Lieu a confirmer"
    val labels = (0 until rooms.length()).mapNotNull { index ->
      val item = rooms.optJSONObject(index) ?: return@mapNotNull null
      item.optString("name")
        .ifBlank { item.optJSONObject("room")?.optString("name").orEmpty() }
        .takeIf { it.isNotBlank() }
    }
    return labels.joinToString(", ").ifBlank { "Lieu a confirmer" }
  }

  private fun JSONObject.teacherLabel(): String {
    val teachers = optJSONArray("teachers") ?: return ""
    return (0 until teachers.length()).mapNotNull { index ->
      val item = teachers.optJSONObject(index) ?: return@mapNotNull null
      listOf(item.optString("firstname"), item.optString("name"))
        .filter { it.isNotBlank() }
        .joinToString(" ")
        .ifBlank { item.optString("displayname") }
        .takeIf { it.isNotBlank() }
    }.joinToString(", ")
  }

  private fun parseDate(value: String): Long {
    if (value.isBlank()) return 0L
    val formats = listOf(
      "yyyy-MM-dd'T'HH:mm:ss.SSSX",
      "yyyy-MM-dd'T'HH:mm:ssX",
      "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
      "yyyy-MM-dd'T'HH:mm:ss'Z'"
    )
    for (pattern in formats) {
      try {
        val formatter = SimpleDateFormat(pattern, Locale.US)
        formatter.timeZone = TimeZone.getTimeZone("UTC")
        return formatter.parse(value)?.time ?: 0L
      } catch (_: Exception) {
      }
    }
    return 0L
  }

  private fun formatType(value: String): String {
    if (value.isBlank()) return "Cours"
    return when (value) {
      "CourseType.IntegratedLecture" -> "Cours Integre"
      "CourseType.FollowUp" -> "Suivi de Cours"
      "CourseType.Practice" -> "Travaux Pratiques"
      "CourseType.Lecture" -> "Cours Magistral"
      "CourseType.Meeting" -> "Reunion"
      "CourseType.Exam" -> "Examen"
      else -> value.removePrefix("CourseType.")
    }
  }

  private fun iso(millis: Long): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    formatter.timeZone = TimeZone.getTimeZone("UTC")
    return formatter.format(millis)
  }

  private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")
}
