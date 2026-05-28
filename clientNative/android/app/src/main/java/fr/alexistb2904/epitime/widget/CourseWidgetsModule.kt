package fr.alexistb2904.epitime.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.reactnativeandroidwidget.RNWidgetJsCommunication
import com.reactnativeandroidwidget.RNWidgetUtil
import org.json.JSONObject
import kotlin.math.min

class CourseWidgetsModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun scheduleRefreshes(rawPayloadJson: String, promise: Promise) {
    try {
      scheduleRefreshesFromPayload(reactContext.applicationContext, rawPayloadJson)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("COURSE_WIDGET_REFRESH_SCHEDULE_FAILED", error)
    }
  }

  @ReactMethod
  fun cancelRefreshes(promise: Promise) {
    try {
      cancelRefreshesInternal(reactContext.applicationContext, clearPayload = true)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("COURSE_WIDGET_REFRESH_CANCEL_FAILED", error)
    }
  }

  @ReactMethod
  fun consumePendingTimelineRefresh(widgetName: String, promise: Promise) {
    try {
      promise.resolve(consumePendingTimelineRefreshInternal(reactContext.applicationContext, widgetName))
    } catch (error: Exception) {
      promise.resolve(false)
    }
  }

  companion object {
    private const val TAG = "EpiTimeCourseWidgets"
    private const val MODULE_NAME = "EpiTimeCourseWidgets"
    private const val NEXT_COURSE_WIDGET_NAME = "NextCourse"
    private const val PREFS_NAME = "course_widget_refresh"
    private const val KEY_PAYLOAD = "payload"
    private const val KEY_PENDING_TIMELINE_REFRESHES = "pending_timeline_refreshes"
    private const val KEY_PENDING_TIMELINE_MARKED_AT = "pending_timeline_marked_at"
    private const val REQUEST_CODE_REFRESH_NEXT_COURSE = 7201
    private const val MINUTE_MILLIS = 60_000L
    private const val FIVE_MINUTES_MILLIS = 5 * MINUTE_MILLIS
    private const val FIFTEEN_MINUTES_MILLIS = 15 * MINUTE_MILLIS
    private const val HOUR_MILLIS = 60 * MINUTE_MILLIS
    private const val PENDING_MARKER_TTL_MILLIS = 5 * MINUTE_MILLIS

    internal const val ACTION_REFRESH_NEXT_COURSE = "fr.alexistb2904.epitime.widget.REFRESH_NEXT_COURSE"
    internal const val ACTION_RESTORE_REFRESHES = "fr.alexistb2904.epitime.widget.RESTORE_REFRESHES"

    internal fun scheduleRefreshesFromPayload(context: Context, rawPayloadJson: String): Boolean {
      val applicationContext = context.applicationContext
      val courses = parseCourses(rawPayloadJson, System.currentTimeMillis())

      if (courses.isEmpty()) {
        cancelRefreshesInternal(applicationContext, clearPayload = true)
        return false
      }

      applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_PAYLOAD, rawPayloadJson)
        .apply()

      return scheduleNextRefresh(applicationContext, rawPayloadJson)
    }

    internal fun restoreScheduledRefresh(context: Context): Boolean {
      val rawPayloadJson = context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getString(KEY_PAYLOAD, null)
        ?: return false

      return runCatching { scheduleNextRefresh(context.applicationContext, rawPayloadJson) }.getOrDefault(false)
    }

    internal fun handleTimelineRefresh(context: Context) {
      val applicationContext = context.applicationContext
      markPendingTimelineRefresh(applicationContext)
      RNWidgetJsCommunication.requestWidgetUpdate(applicationContext, NEXT_COURSE_WIDGET_NAME)
      restoreScheduledRefresh(applicationContext)
    }

    private fun scheduleNextRefresh(context: Context, rawPayloadJson: String): Boolean {
      val now = System.currentTimeMillis()
      val nextCourse = parseCourses(rawPayloadJson, now).firstOrNull()
        ?: run {
          cancelRefreshesInternal(context, clearPayload = false)
          return false
        }

      val triggerAt = nextTriggerMillis(nextCourse, now)
      val pendingIntent = createRefreshPendingIntent(
        context = context,
        flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      ) ?: return false

      val alarmManager = context.getSystemService(AlarmManager::class.java)
      try {
        val canScheduleExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()
        if (canScheduleExact) {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
          } else {
            alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
          }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
        } else {
          alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
        }
      } catch (error: SecurityException) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
        } else {
          alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
        }
      }

      Log.d(TAG, "Scheduled next course widget refresh at $triggerAt")
      return true
    }

    private fun nextTriggerMillis(course: WidgetCourseTiming, now: Long): Long {
      val triggerAt = if (course.startMillis <= now && course.endMillis > now) {
        course.endMillis + 1_000L
      } else {
        val startsIn = course.startMillis - now
        when {
          startsIn <= FIFTEEN_MINUTES_MILLIS -> min(nextBoundary(now, MINUTE_MILLIS), course.startMillis + 1_000L)
          startsIn <= HOUR_MILLIS -> min(nextBoundary(now, FIVE_MINUTES_MILLIS), course.startMillis - FIFTEEN_MINUTES_MILLIS)
          else -> course.startMillis - HOUR_MILLIS
        }
      }

      return triggerAt.coerceAtLeast(now + 1_000L)
    }

    private fun nextBoundary(now: Long, intervalMillis: Long): Long {
      return ((now / intervalMillis) + 1L) * intervalMillis
    }

    private fun parseCourses(rawPayloadJson: String, now: Long): List<WidgetCourseTiming> {
      val courses = JSONObject(rawPayloadJson).optJSONArray("courses") ?: return emptyList()
      val result = mutableListOf<WidgetCourseTiming>()

      for (index in 0 until courses.length()) {
        val course = courses.optJSONObject(index) ?: continue
        val startMillis = course.optFiniteLong("startMillis") ?: continue
        val endMillis = course.optFiniteLong("endMillis") ?: continue
        if (endMillis <= now || endMillis <= startMillis) continue
        result.add(WidgetCourseTiming(startMillis = startMillis, endMillis = endMillis))
      }

      return result.sortedBy { it.startMillis }
    }

    private fun JSONObject.optFiniteLong(name: String): Long? {
      if (!has(name)) return null
      val value = optDouble(name, Double.NaN)
      if (value.isNaN() || value.isInfinite()) return null
      return value.toLong()
    }

    private fun markPendingTimelineRefresh(context: Context) {
      val widgetCount = RNWidgetUtil.getWidgetIds(context, NEXT_COURSE_WIDGET_NAME).size.coerceAtLeast(1)
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val current = prefs.getInt(KEY_PENDING_TIMELINE_REFRESHES, 0)
      prefs.edit()
        .putInt(KEY_PENDING_TIMELINE_REFRESHES, current + widgetCount)
        .putLong(KEY_PENDING_TIMELINE_MARKED_AT, System.currentTimeMillis())
        .apply()
    }

    private fun consumePendingTimelineRefreshInternal(context: Context, widgetName: String): Boolean {
      if (widgetName != NEXT_COURSE_WIDGET_NAME) return false

      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val pendingCount = prefs.getInt(KEY_PENDING_TIMELINE_REFRESHES, 0)
      val markedAt = prefs.getLong(KEY_PENDING_TIMELINE_MARKED_AT, 0L)
      val markerExpired = markedAt <= 0L || System.currentTimeMillis() - markedAt > PENDING_MARKER_TTL_MILLIS

      if (pendingCount <= 0 || markerExpired) {
        prefs.edit()
          .remove(KEY_PENDING_TIMELINE_REFRESHES)
          .remove(KEY_PENDING_TIMELINE_MARKED_AT)
          .apply()
        return false
      }

      val editor = prefs.edit()
      if (pendingCount <= 1) {
        editor.remove(KEY_PENDING_TIMELINE_REFRESHES)
        editor.remove(KEY_PENDING_TIMELINE_MARKED_AT)
      } else {
        editor.putInt(KEY_PENDING_TIMELINE_REFRESHES, pendingCount - 1)
      }
      editor.apply()
      return true
    }

    private fun cancelRefreshesInternal(context: Context, clearPayload: Boolean) {
      val pendingIntent = createRefreshPendingIntent(
        context = context,
        flags = PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
      )

      if (pendingIntent != null) {
        val alarmManager = context.getSystemService(AlarmManager::class.java)
        alarmManager.cancel(pendingIntent)
        pendingIntent.cancel()
      }

      if (clearPayload) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
          .edit()
          .remove(KEY_PAYLOAD)
          .remove(KEY_PENDING_TIMELINE_REFRESHES)
          .remove(KEY_PENDING_TIMELINE_MARKED_AT)
          .apply()
      }
    }

    private fun createRefreshPendingIntent(context: Context, flags: Int): PendingIntent? {
      val intent = Intent(context, CourseWidgetRefreshReceiver::class.java).apply {
        action = ACTION_REFRESH_NEXT_COURSE
      }

      return PendingIntent.getBroadcast(context, REQUEST_CODE_REFRESH_NEXT_COURSE, intent, flags)
    }

    private data class WidgetCourseTiming(
      val startMillis: Long,
      val endMillis: Long
    )
  }
}
