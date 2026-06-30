package fr.alexistb2904.epitime.live

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class LiveCourseNotificationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val applicationContext = context.applicationContext

    when (intent.action) {
	      LiveCourseNotificationModule.ACTION_RESTORE_LIVE_COURSE -> {
	        LiveCourseNotificationModule.restoreFromSnapshot(applicationContext)
	      }

	      LiveCourseNotificationModule.ACTION_TICK_LIVE_COURSE -> {
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

        val endTime = SimpleDateFormat("HH:mm", Locale.FRANCE).format(Date(endMillis))
        val description = "$room · fin à $endTime"

        Log.d(TAG, "Alarm received for live course: $title")
        LiveCourseNotificationModule.showFromReceiver(
          context = applicationContext,
          title = title,
          description = description,
          startMillis = startMillis,
          endMillis = endMillis
        )
      }

      LiveCourseNotificationModule.ACTION_SHOW_COURSE_START -> {
        val title = intent.getStringExtra(LiveCourseNotificationModule.EXTRA_TITLE).orEmpty()
        val room = intent.getStringExtra(LiveCourseNotificationModule.EXTRA_ROOM).orEmpty()
        val eventId = intent.getStringExtra(LiveCourseNotificationModule.EXTRA_EVENT_ID).orEmpty()
        val requestCode = intent.getIntExtra(LiveCourseNotificationModule.EXTRA_REQUEST_CODE, 0)
        val playSound = intent.getBooleanExtra(LiveCourseNotificationModule.EXTRA_PLAY_SOUND, true)

        Log.d(TAG, "Alarm received for course start notification: $title")
        LiveCourseNotificationModule.showCourseStartFromReceiver(
          context = applicationContext,
          title = title,
          room = room,
          eventId = eventId,
          requestCode = requestCode,
          playSound = playSound
        )
      }
    }
  }

  companion object {
    private const val TAG = "EpiTimeLiveCourse"
  }
}
