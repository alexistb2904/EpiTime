package fr.alexistb2904.epitime.live

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

class LiveCourseNotificationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val applicationContext = context.applicationContext

    when (intent.action) {
      LiveCourseNotificationModule.ACTION_RESTORE_LIVE_COURSE -> {
        LiveCourseNotificationModule.restoreFromSnapshot(applicationContext)
      }

      LiveCourseNotificationModule.ACTION_START_LIVE_COURSE -> {
        val title = intent.getStringExtra(LiveCourseNotificationModule.EXTRA_TITLE).orEmpty()
        val room = intent.getStringExtra(LiveCourseNotificationModule.EXTRA_ROOM)
          ?.trim()
          ?.ifBlank { null }
          ?: "Lieu à confirmer"
        val startMillis = intent.getLongExtra(LiveCourseNotificationModule.EXTRA_START_MILLIS, 0L)
        val endMillis = intent.getLongExtra(LiveCourseNotificationModule.EXTRA_END_MILLIS, 0L)
        val now = System.currentTimeMillis()

        if (endMillis <= now) return

        val durationMillis = max(MINUTE_MILLIS, endMillis - startMillis)
        val elapsedMillis = max(0L, now - startMillis)
        val progress = ((elapsedMillis.toDouble() / durationMillis.toDouble()) * 100.0)
          .roundToInt()
          .coerceIn(0, 100)
        val remainingMillis = endMillis - now
        val chipText = formatRemaining(remainingMillis)
        val endTime = SimpleDateFormat("HH:mm", Locale.FRANCE).format(Date(endMillis))
        val description = "$room · fin à $endTime"

        Log.d(TAG, "Alarm received for live course: $title")
        LiveCourseNotificationModule.showFromReceiver(
          context = applicationContext,
          title = title,
          description = description,
          progress = progress,
          chipText = chipText,
          timeoutMillis = remainingMillis
        )
      }
    }
  }

  private fun formatRemaining(ms: Long): String {
    val totalMinutes = max(1, ceil(ms.toDouble() / MINUTE_MILLIS.toDouble()).toInt())
    if (totalMinutes < 60) return "$totalMinutes min"

    val hours = totalMinutes / 60
    val minutes = totalMinutes % 60
    return if (minutes > 0) "$hours h $minutes" else "$hours h"
  }

  companion object {
    private const val TAG = "EpiTimeLiveCourse"
    private const val MINUTE_MILLIS = 60_000L
  }
}
