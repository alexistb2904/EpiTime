package fr.alexistb2904.epitime.live

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import fr.alexistb2904.epitime.MainActivity
import fr.alexistb2904.epitime.R
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

class LiveCourseNotificationModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

  init {
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName(): String = "EpiTimeLiveCourse"

  /**
   * Android does not restore exact alarms after a permission round-trip by
   * itself. Reconcile persisted requests whenever the host returns from the
   * special-access screen, including when the permission was revoked.
   */
  override fun onHostResume() {
    restoreScheduledAlarms(reactContext.applicationContext)
  }

  override fun onHostPause() = Unit

  override fun onHostDestroy() = Unit

  override fun invalidate() {
    reactContext.removeLifecycleEventListener(this)
    super.invalidate()
  }

  @ReactMethod
  fun canScheduleExactCourseProgress(promise: Promise) {
    try {
      val context = reactContext.applicationContext
      val alarmManager = context.getSystemService(AlarmManager::class.java)
      val canScheduleExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()
      promise.resolve(canScheduleExact)
    } catch (error: Exception) {
      promise.reject("LIVE_COURSE_EXACT_PERMISSION_CHECK_FAILED", error)
    }
  }

  @ReactMethod
  fun requestExactCourseProgressPermission(promise: Promise) {
    try {
      val context = reactContext.applicationContext
      val alarmManager = context.getSystemService(AlarmManager::class.java)
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()) {
        promise.resolve(true)
        return
      }

      val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
        data = Uri.parse("package:${context.packageName}")
      }

      val activity = reactContext.getCurrentActivity()
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
      promise.resolve(false)
    } catch (error: Exception) {
      promise.reject("LIVE_COURSE_EXACT_PERMISSION_REQUEST_FAILED", error)
    }
  }

  @ReactMethod
  fun scheduleCourseStartNotification(
    title: String,
    room: String,
    eventId: String,
    startMillis: Double,
    playSound: Boolean,
    promise: Promise
  ) {
    try {
      val context = reactContext.applicationContext
      val startAt = startMillis.toLong()

      if (startAt <= System.currentTimeMillis()) {
        promise.resolve(false)
        return
      }

      val requestCode = courseStartRequestCode(eventId, startAt)
      val pendingIntent = createCourseStartPendingIntent(
        context = context,
        title = title,
        room = room,
        eventId = eventId,
        startMillis = startAt,
        playSound = playSound,
        requestCode = requestCode,
        flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      ) ?: run {
        promise.resolve(false)
        return
      }

      if (!scheduleAlarm(context, startAt, pendingIntent, "course start notification")) {
        promise.resolve(false)
        return
      }

      saveCourseStartSchedule(
        context = context,
        schedule = CourseStartSchedule(
          title = title,
          room = room,
          eventId = eventId,
          startMillis = startAt,
          playSound = playSound,
          requestCode = requestCode
        )
      )
      Log.d(TAG, "Scheduled course start notification at $startAt")
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("COURSE_START_SCHEDULE_FAILED", error)
    }
  }

  @ReactMethod
  fun cancelScheduledCourseStartNotifications(promise: Promise) {
    try {
      cancelScheduledCourseStartNotificationsInternal(reactContext.applicationContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("COURSE_START_CANCEL_SCHEDULE_FAILED", error)
    }
  }

  @ReactMethod
  fun showCourseProgress(
    title: String,
    description: String,
    progress: Double,
    startMillis: Double,
    endMillis: Double,
    promise: Promise
  ) {
    try {
      val context = reactContext.applicationContext
      val manager = context.getSystemService(NotificationManager::class.java)

      ensureChannel(context, manager)

      val startAt = startMillis.toLong()
      val endsAt = endMillis.toLong()
      if (startAt <= 0L || endsAt <= startAt) {
        promise.resolve(false)
        return
      }

      val timing = calculateTiming(startAt, endsAt)
      if (timing.remainingMillis <= 0L) {
        clearSnapshot(context)
        cancelProgressTickInternal(context)
        manager.cancel(NOTIFICATION_ID)
        promise.resolve(false)
        return
      }

      val notification = buildNotification(
        context = context,
        title = title,
        description = description,
        progress = timing.progress,
        timeoutMillis = timing.remainingMillis,
        startMillis = startAt,
        endMillis = endsAt
      )

      clearScheduledCourseProgressIfMatches(context, startAt, endsAt)
      saveSnapshot(context, title, description, startAt, endsAt)
      manager.notify(NOTIFICATION_ID, notification)
      scheduleNextProgressTick(context, startAt, endsAt)

      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("LIVE_COURSE_SHOW_FAILED", error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      val context = reactContext.applicationContext
      val manager = context.getSystemService(NotificationManager::class.java)
      clearSnapshot(context)
      cancelScheduledCourseProgressInternal(context)
      cancelProgressTickInternal(context)
      manager.cancel(NOTIFICATION_ID)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("LIVE_COURSE_STOP_FAILED", error)
    }
  }

  @ReactMethod
  fun scheduleCourseProgress(
    title: String,
    room: String,
    startMillis: Double,
    endMillis: Double,
    promise: Promise
  ) {
    try {
      val context = reactContext.applicationContext
      val startAt = startMillis.toLong()
      val endsAt = endMillis.toLong()

      if (startAt <= 0L || endsAt <= startAt) {
        promise.resolve(false)
        return
      }

      val pendingIntent = createStartPendingIntent(
        context = context,
        title = title,
        room = room,
        startMillis = startAt,
        endMillis = endsAt,
        flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      ) ?: run {
        promise.resolve(false)
        return
      }

      if (!scheduleAlarm(context, startAt, pendingIntent, "live course progress")) {
        promise.resolve(false)
        return
      }

      saveScheduledCourseProgress(context, title, room, startAt, endsAt)
      Log.d(TAG, "Scheduled live course at $startAt")
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("LIVE_COURSE_SCHEDULE_FAILED", error)
    }
  }

  @ReactMethod
  fun cancelScheduledCourseProgress(promise: Promise) {
    try {
      cancelScheduledCourseProgressInternal(reactContext.applicationContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("LIVE_COURSE_CANCEL_SCHEDULE_FAILED", error)
    }
  }

  private fun getLargeIconBitmap(context: Context): Bitmap? {
    val drawable = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      context.getDrawable(R.drawable.ic_notification_epitime)
    } else {
      @Suppress("DEPRECATION")
      context.resources.getDrawable(R.drawable.ic_notification_epitime)
    } ?: return BitmapFactory.decodeResource(context.resources, R.mipmap.ic_launcher)

    val size = context.resources.getDimensionPixelSize(android.R.dimen.app_icon_size)
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)

    drawable.setBounds(0, 0, canvas.width, canvas.height)
    drawable.draw(canvas)

    return bitmap
  }

  companion object {
    private const val TAG = "EpiTimeLiveCourse"
    private const val CHANNEL_ID = "live_course_alerts"
    private const val COURSE_START_ALERT_CHANNEL_ID = "course_start_alerts"
    private const val COURSE_START_SILENT_CHANNEL_ID = "course_start_silent"
    private const val PREFS_NAME = "live_course_notification"
    private const val KEY_ACTIVE = "active"
    private const val KEY_TITLE = "title"
    private const val KEY_DESCRIPTION = "description"
    private const val KEY_START_MILLIS = "start_millis"
    private const val KEY_END_MILLIS = "end_millis"
    private const val KEY_EXPIRES_AT = "expires_at"
    private const val KEY_COURSE_START_REQUEST_CODES = "course_start_request_codes"
    private const val KEY_COURSE_START_SCHEDULES = "course_start_schedules"
    private const val KEY_SCHEDULED_COURSE_TITLE = "scheduled_course_title"
    private const val KEY_SCHEDULED_COURSE_ROOM = "scheduled_course_room"
    private const val KEY_SCHEDULED_COURSE_START_MILLIS = "scheduled_course_start_millis"
    private const val KEY_SCHEDULED_COURSE_END_MILLIS = "scheduled_course_end_millis"
    private const val MINUTE_MILLIS = 60_000L

    internal const val ACTION_RESTORE_LIVE_COURSE = "fr.alexistb2904.epitime.live.RESTORE_LIVE_COURSE"
    internal const val ACTION_START_LIVE_COURSE = "fr.alexistb2904.epitime.live.START_LIVE_COURSE"
    internal const val ACTION_TICK_LIVE_COURSE = "fr.alexistb2904.epitime.live.TICK_LIVE_COURSE"
    internal const val ACTION_SHOW_COURSE_START = "fr.alexistb2904.epitime.live.SHOW_COURSE_START"
    internal const val EXTRA_TITLE = "title"
    internal const val EXTRA_ROOM = "room"
    internal const val EXTRA_EVENT_ID = "event_id"
    internal const val EXTRA_START_MILLIS = "start_millis"
    internal const val EXTRA_END_MILLIS = "end_millis"
    internal const val EXTRA_PLAY_SOUND = "play_sound"
    internal const val EXTRA_REQUEST_CODE = "request_code"
    internal const val NOTIFICATION_ID = 4201

    private const val REQUEST_CODE_START = 4202
    private const val REQUEST_CODE_TICK = 4203
    private const val COURSE_START_NOTIFICATION_ID_BASE = 5000
    private const val COURSE_START_NOTIFICATION_ID_RANGE = 100_000

    /** Reconcile alarms cleared by reboot or an exact-alarm access change. */
    internal fun restoreScheduledAlarms(context: Context): Boolean {
      val applicationContext = context.applicationContext
      val restoredProgress = restoreScheduledCourseProgress(applicationContext)
      val restoredCourseStarts = restoreScheduledCourseStartNotifications(applicationContext)
      val restoredSnapshot = restoreFromSnapshot(applicationContext)
      return restoredProgress || restoredCourseStarts || restoredSnapshot
    }

    private fun restoreScheduledCourseProgress(context: Context): Boolean {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val title = prefs.getString(KEY_SCHEDULED_COURSE_TITLE, null).orEmpty()
      val room = prefs.getString(KEY_SCHEDULED_COURSE_ROOM, null).orEmpty()
      val startMillis = prefs.getLong(KEY_SCHEDULED_COURSE_START_MILLIS, 0L)
      val endMillis = prefs.getLong(KEY_SCHEDULED_COURSE_END_MILLIS, 0L)
      val now = System.currentTimeMillis()

      if (startMillis <= 0L || endMillis <= startMillis || endMillis <= now) {
        if (startMillis != 0L || endMillis != 0L) clearScheduledCourseProgress(context)
        return false
      }

      if (startMillis <= now) {
        clearScheduledCourseProgress(context)
        return showFromReceiver(
          context = context,
          title = title,
          description = courseProgressDescription(room, endMillis),
          startMillis = startMillis,
          endMillis = endMillis
        )
      }

      return scheduleCourseProgressAlarm(context, title, room, startMillis, endMillis)
    }

    private fun restoreScheduledCourseStartNotifications(context: Context): Boolean {
      val now = System.currentTimeMillis()
      val schedules = readCourseStartSchedules(context)
        .filter { it.startMillis > now }

      writeCourseStartSchedules(context, schedules)
      return schedules.fold(false) { restoredAny, schedule ->
        scheduleCourseStartAlarm(context, schedule) || restoredAny
      }
    }

    internal fun restoreFromSnapshot(context: Context): Boolean {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      if (!prefs.getBoolean(KEY_ACTIVE, false)) return false

      val endMillis = prefs.getLong(KEY_END_MILLIS, prefs.getLong(KEY_EXPIRES_AT, 0L))
      val startMillis = prefs.getLong(KEY_START_MILLIS, 0L)
      if (startMillis <= 0L || endMillis <= startMillis) {
        clearSnapshot(context)
        return false
      }

      val manager = context.getSystemService(NotificationManager::class.java)
      ensureChannel(context, manager)
      val timing = calculateTiming(startMillis, endMillis)
      if (timing.remainingMillis <= 0L) {
        clearSnapshot(context)
        cancelProgressTickInternal(context)
        manager.cancel(NOTIFICATION_ID)
        return false
      }

      val notification = buildNotification(
        context = context,
        title = prefs.getString(KEY_TITLE, null).orEmpty(),
        description = prefs.getString(KEY_DESCRIPTION, null).orEmpty(),
        progress = timing.progress,
        timeoutMillis = timing.remainingMillis,
        startMillis = startMillis,
        endMillis = endMillis
      )
      manager.notify(NOTIFICATION_ID, notification)
      scheduleNextProgressTick(context, startMillis, endMillis)
      return true
    }

    internal fun showFromReceiver(
      context: Context,
      title: String,
      description: String,
      startMillis: Long,
      endMillis: Long
    ): Boolean {
      val manager = context.getSystemService(NotificationManager::class.java)
      ensureChannel(context, manager)

      val timing = calculateTiming(startMillis, endMillis)
      if (timing.remainingMillis <= 0L) {
        clearSnapshot(context)
        cancelProgressTickInternal(context)
        manager.cancel(NOTIFICATION_ID)
        return false
      }

      val notification = buildNotification(
        context = context,
        title = title,
        description = description,
        progress = timing.progress,
        timeoutMillis = timing.remainingMillis,
        startMillis = startMillis,
        endMillis = endMillis
      )

      clearScheduledCourseProgressIfMatches(context, startMillis, endMillis)
      saveSnapshot(context, title, description, startMillis, endMillis)
      manager.notify(NOTIFICATION_ID, notification)
      scheduleNextProgressTick(context, startMillis, endMillis)
      return true
    }

    internal fun showCourseStartFromReceiver(
      context: Context,
      title: String,
      room: String,
      eventId: String,
      requestCode: Int,
      playSound: Boolean
    ): Boolean {
      val manager = context.getSystemService(NotificationManager::class.java)
      ensureCourseStartChannel(context, manager, playSound)

      val notification = buildCourseStartNotification(
        context = context,
        title = title,
        room = room,
        eventId = eventId,
        playSound = playSound
      )
      val notificationId = COURSE_START_NOTIFICATION_ID_BASE + Math.floorMod(requestCode, COURSE_START_NOTIFICATION_ID_RANGE)
      manager.notify(notificationId, notification)
      removeCourseStartSchedule(context, requestCode)
      return true
    }

    internal fun cancelScheduledCourseProgressInternal(context: Context) {
      val pendingIntent = createStartPendingIntent(
        context = context,
        title = "",
        room = "",
        startMillis = 0L,
        endMillis = 0L,
        flags = PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
      )

      if (pendingIntent != null) {
        val alarmManager = context.getSystemService(AlarmManager::class.java)
        alarmManager.cancel(pendingIntent)
        pendingIntent.cancel()
      }
      clearScheduledCourseProgress(context)
      Log.d(TAG, "Canceled scheduled live course")
    }

    internal fun cancelProgressTickInternal(context: Context) {
      val pendingIntent = createTickPendingIntent(
        context = context,
        flags = PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
      ) ?: return

      val alarmManager = context.getSystemService(AlarmManager::class.java)
      alarmManager.cancel(pendingIntent)
      pendingIntent.cancel()
    }

    internal fun cancelScheduledCourseStartNotificationsInternal(context: Context) {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val requestCodes = (
        prefs.getStringSet(KEY_COURSE_START_REQUEST_CODES, emptySet()).orEmpty() +
          readCourseStartSchedules(context).map { it.requestCode.toString() }
        ).toSet()
      val alarmManager = context.getSystemService(AlarmManager::class.java)

      requestCodes
        .mapNotNull { it.toIntOrNull() }
        .forEach { requestCode ->
          val pendingIntent = createCourseStartPendingIntent(
            context = context,
            title = "",
            room = "",
            eventId = "",
            startMillis = 0L,
            playSound = true,
            requestCode = requestCode,
            flags = PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
          ) ?: return@forEach

          alarmManager.cancel(pendingIntent)
          pendingIntent.cancel()
        }

      prefs.edit()
        .remove(KEY_COURSE_START_REQUEST_CODES)
        .remove(KEY_COURSE_START_SCHEDULES)
        .apply()
      Log.d(TAG, "Canceled scheduled course start notifications")
    }

    private fun scheduleCourseProgressAlarm(
      context: Context,
      title: String,
      room: String,
      startMillis: Long,
      endMillis: Long
    ): Boolean {
      if (startMillis <= System.currentTimeMillis() || endMillis <= startMillis) return false
      val pendingIntent = createStartPendingIntent(
        context = context,
        title = title,
        room = room,
        startMillis = startMillis,
        endMillis = endMillis,
        flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      ) ?: return false

      return scheduleAlarm(context, startMillis, pendingIntent, "live course progress")
    }

    private fun scheduleCourseStartAlarm(context: Context, schedule: CourseStartSchedule): Boolean {
      if (schedule.startMillis <= System.currentTimeMillis()) return false
      val pendingIntent = createCourseStartPendingIntent(
        context = context,
        title = schedule.title,
        room = schedule.room,
        eventId = schedule.eventId,
        startMillis = schedule.startMillis,
        playSound = schedule.playSound,
        requestCode = schedule.requestCode,
        flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      ) ?: return false

      return scheduleAlarm(context, schedule.startMillis, pendingIntent, "course start notification")
    }

    /**
     * Prefer exact delivery when special access is granted, but always retain a
     * battery-friendly inexact fallback. This keeps reminders functional on
     * Android 14+ where exact alarms are denied by default for new installs.
     */
    private fun scheduleAlarm(context: Context, triggerAt: Long, pendingIntent: PendingIntent, label: String): Boolean {
      if (triggerAt <= System.currentTimeMillis()) return false
      val alarmManager = context.getSystemService(AlarmManager::class.java)
      val canScheduleExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()

      return try {
        if (canScheduleExact) {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
          } else {
            alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
          }
        } else {
          Log.i(TAG, "Exact alarm access missing; using an inexact fallback for $label")
          scheduleInexactAlarm(alarmManager, triggerAt, pendingIntent)
        }
        true
      } catch (error: SecurityException) {
        Log.w(TAG, "Exact alarm rejected for $label; using an inexact fallback", error)
        runCatching {
          scheduleInexactAlarm(alarmManager, triggerAt, pendingIntent)
          true
        }.getOrElse { fallbackError ->
          Log.e(TAG, "Unable to schedule fallback alarm for $label", fallbackError)
          false
        }
      } catch (error: Exception) {
        Log.e(TAG, "Unable to schedule alarm for $label", error)
        false
      }
    }

    private fun scheduleInexactAlarm(alarmManager: AlarmManager, triggerAt: Long, pendingIntent: PendingIntent) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
      } else {
        alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
      }
    }

    private fun saveScheduledCourseProgress(
      context: Context,
      title: String,
      room: String,
      startMillis: Long,
      endMillis: Long
    ) {
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_SCHEDULED_COURSE_TITLE, title)
        .putString(KEY_SCHEDULED_COURSE_ROOM, room)
        .putLong(KEY_SCHEDULED_COURSE_START_MILLIS, startMillis)
        .putLong(KEY_SCHEDULED_COURSE_END_MILLIS, endMillis)
        .apply()
    }

    private fun clearScheduledCourseProgress(context: Context) {
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .remove(KEY_SCHEDULED_COURSE_TITLE)
        .remove(KEY_SCHEDULED_COURSE_ROOM)
        .remove(KEY_SCHEDULED_COURSE_START_MILLIS)
        .remove(KEY_SCHEDULED_COURSE_END_MILLIS)
        .apply()
    }

    private fun clearScheduledCourseProgressIfMatches(context: Context, startMillis: Long, endMillis: Long) {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      if (
        prefs.getLong(KEY_SCHEDULED_COURSE_START_MILLIS, 0L) == startMillis &&
          prefs.getLong(KEY_SCHEDULED_COURSE_END_MILLIS, 0L) == endMillis
      ) {
        clearScheduledCourseProgress(context)
      }
    }

    private fun courseProgressDescription(room: String, endMillis: Long): String {
      val resolvedRoom = room.trim().ifBlank { "Lieu à confirmer" }
      val endTime = SimpleDateFormat("HH:mm", Locale.FRANCE).format(Date(endMillis))
      return "$resolvedRoom · fin à $endTime"
    }

    private fun saveCourseStartSchedule(context: Context, schedule: CourseStartSchedule) {
      val schedules = readCourseStartSchedules(context)
        .filter { it.requestCode != schedule.requestCode && it.startMillis > System.currentTimeMillis() }
        .plus(schedule)
      writeCourseStartSchedules(context, schedules)
    }

    private fun removeCourseStartSchedule(context: Context, requestCode: Int) {
      val schedules = readCourseStartSchedules(context).filter { it.requestCode != requestCode }
      writeCourseStartSchedules(context, schedules)
    }

    private fun readCourseStartSchedules(context: Context): List<CourseStartSchedule> {
      val rawSchedules = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getString(KEY_COURSE_START_SCHEDULES, null)
        ?: return emptyList()

      return runCatching {
        val array = JSONArray(rawSchedules)
        buildList {
          for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            val eventId = item.optString("eventId").trim()
            val startMillis = item.optLong("startMillis", 0L)
            val requestCode = item.optInt("requestCode", 0)
            if (eventId.isBlank() || startMillis <= 0L) continue
            add(
              CourseStartSchedule(
                title = item.optString("title"),
                room = item.optString("room"),
                eventId = eventId,
                startMillis = startMillis,
                playSound = item.optBoolean("playSound", true),
                requestCode = requestCode
              )
            )
          }
        }
      }.getOrElse { error ->
        Log.w(TAG, "Ignoring unreadable persisted course-start schedules", error)
        emptyList()
      }
    }

    private fun writeCourseStartSchedules(context: Context, schedules: List<CourseStartSchedule>) {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      if (schedules.isEmpty()) {
        prefs.edit()
          .remove(KEY_COURSE_START_SCHEDULES)
          .remove(KEY_COURSE_START_REQUEST_CODES)
          .apply()
        return
      }

      val payload = JSONArray()
      schedules.forEach { schedule ->
        payload.put(
          JSONObject()
            .put("title", schedule.title)
            .put("room", schedule.room)
            .put("eventId", schedule.eventId)
            .put("startMillis", schedule.startMillis)
            .put("playSound", schedule.playSound)
            .put("requestCode", schedule.requestCode)
        )
      }

      prefs.edit()
        .putString(KEY_COURSE_START_SCHEDULES, payload.toString())
        .putStringSet(KEY_COURSE_START_REQUEST_CODES, schedules.map { it.requestCode.toString() }.toSet())
        .apply()
    }

    private data class CourseStartSchedule(
      val title: String,
      val room: String,
      val eventId: String,
      val startMillis: Long,
      val playSound: Boolean,
      val requestCode: Int
    )

    private fun scheduleNextProgressTick(context: Context, startMillis: Long, endMillis: Long): Boolean {
      val now = System.currentTimeMillis()
      if (startMillis <= 0L || endMillis <= startMillis || endMillis <= now) {
        cancelProgressTickInternal(context)
        return false
      }

      val nextMinuteBoundary = ((now / MINUTE_MILLIS) + 1L) * MINUTE_MILLIS
      val triggerAt = nextMinuteBoundary.coerceAtMost(endMillis).coerceAtLeast(now + 1_000L)
      val pendingIntent = createTickPendingIntent(
        context = context,
        flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      ) ?: return false
      return scheduleAlarm(context, triggerAt, pendingIntent, "live course progress tick")
    }

    private fun createStartPendingIntent(
      context: Context,
      title: String,
      room: String,
      startMillis: Long,
      endMillis: Long,
      flags: Int
    ): PendingIntent? {
      val intent = Intent(context, LiveCourseNotificationReceiver::class.java).apply {
        action = ACTION_START_LIVE_COURSE
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_ROOM, room)
        putExtra(EXTRA_START_MILLIS, startMillis)
        putExtra(EXTRA_END_MILLIS, endMillis)
      }

      return PendingIntent.getBroadcast(context, REQUEST_CODE_START, intent, flags)
    }

    private fun createTickPendingIntent(
      context: Context,
      flags: Int
    ): PendingIntent? {
      val intent = Intent(context, LiveCourseNotificationReceiver::class.java).apply {
        action = ACTION_TICK_LIVE_COURSE
      }

      return PendingIntent.getBroadcast(context, REQUEST_CODE_TICK, intent, flags)
    }

    private fun createCourseStartPendingIntent(
      context: Context,
      title: String,
      room: String,
      eventId: String,
      startMillis: Long,
      playSound: Boolean,
      requestCode: Int,
      flags: Int
    ): PendingIntent? {
      val intent = Intent(context, LiveCourseNotificationReceiver::class.java).apply {
        action = ACTION_SHOW_COURSE_START
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_ROOM, room)
        putExtra(EXTRA_EVENT_ID, eventId)
        putExtra(EXTRA_START_MILLIS, startMillis)
        putExtra(EXTRA_PLAY_SOUND, playSound)
        putExtra(EXTRA_REQUEST_CODE, requestCode)
      }

      return PendingIntent.getBroadcast(context, requestCode, intent, flags)
    }

    private fun ensureChannel(context: Context, manager: NotificationManager) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

      val channel = NotificationChannel(
        CHANNEL_ID,
        "Cours en direct",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Cours actuellement en cours et temps restant"
        enableVibration(false)

        setShowBadge(false)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }

      manager.createNotificationChannel(channel)
    }

    private fun ensureCourseStartChannel(context: Context, manager: NotificationManager, playSound: Boolean) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

      val channelId = if (playSound) COURSE_START_ALERT_CHANNEL_ID else COURSE_START_SILENT_CHANNEL_ID
      val channel = NotificationChannel(
        channelId,
        if (playSound) "Début des cours" else "Début des cours silencieux",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Notification au début exact d'un cours"
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        if (!playSound) {
          enableVibration(false)
          setSound(null, null)
        }
      }

      manager.createNotificationChannel(channel)
    }

    private fun buildCourseStartNotification(
      context: Context,
      title: String,
      room: String,
      eventId: String,
      playSound: Boolean
    ): Notification {
      val launchIntent = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra(EXTRA_EVENT_ID, eventId)
      }

      val pendingIntent = PendingIntent.getActivity(
        context,
        0,
        launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )

      val displayTitle = title.trim().ifBlank { "Cours" }
      val displayRoom = room.trim()
      val body = "$displayTitle commence maintenant${if (displayRoom.isNotBlank()) " en $displayRoom" else ""}"
      val channelId = if (playSound) COURSE_START_ALERT_CHANNEL_ID else COURSE_START_SILENT_CHANNEL_ID
      val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(context, channelId)
      } else {
        Notification.Builder(context)
      }

      builder
        .setSmallIcon(R.drawable.ic_notification_course_book)
        .setContentTitle("Cours maintenant")
        .setContentText(body)
        .setTicker(body)
        .setContentIntent(pendingIntent)
        .setCategory(Notification.CATEGORY_EVENT)
        .setAutoCancel(true)
        .setLocalOnly(true)
        .setWhen(System.currentTimeMillis())
        .setShowWhen(true)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setColor(getAccentColor(context))
        .setPriority(Notification.PRIORITY_HIGH)

      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O && playSound) {
        builder.setDefaults(Notification.DEFAULT_SOUND)
      }

      return builder.build()
    }

    private fun buildNotification(
      context: Context,
      title: String,
      description: String,
      progress: Int,
      timeoutMillis: Long,
      startMillis: Long,
      endMillis: Long
    ): Notification {
      val launchIntent = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }

      val pendingIntent = PendingIntent.getActivity(
        context,
        0,
        launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )

      val restoreIntent = Intent(context, LiveCourseNotificationReceiver::class.java).apply {
        action = ACTION_RESTORE_LIVE_COURSE
      }

      val restorePendingIntent = PendingIntent.getBroadcast(
        context,
        0,
        restoreIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )

      val displayTitle = title.trim().ifBlank { "Cours en direct" }
      val displayDescription = description.trim().ifBlank { "Cours en cours" }
      val statusText = "En cours"

      val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(context, CHANNEL_ID)
      } else {
        Notification.Builder(context)
      }

      builder
        .setSmallIcon(R.drawable.ic_notification_course_book)
        .setContentTitle(displayTitle)
        .setContentText(displayDescription)
        .setSubText(statusText)
        .setTicker("$displayTitle • $statusText")
        .setContentIntent(pendingIntent)
        .setDeleteIntent(restorePendingIntent)
        .setCategory(Notification.CATEGORY_PROGRESS)

        .setOngoing(true)
        .setAutoCancel(false)
        .setOnlyAlertOnce(true)
        .setLocalOnly(true)
        .setWhen(endMillis)
        .setShowWhen(true)

        .setVisibility(Notification.VISIBILITY_PUBLIC)

        .setColor(getAccentColor(context))
        .setPriority(Notification.PRIORITY_HIGH)

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        builder
          .setUsesChronometer(true)
          .setChronometerCountDown(true)
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        builder.setTimeoutAfter(timeoutMillis)
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
      }

      if (Build.VERSION.SDK_INT >= 36) {
        val style = Notification.ProgressStyle()
          .setProgress(progress)
          .setProgressTrackerIcon(
            Icon.createWithResource(context, R.drawable.ic_notification_course_book)
          )

        builder
          .setStyle(style)
          .setShortCriticalText(null)

        requestPromotedOngoing(builder)
      } else {
        builder.setProgress(100, progress, false)
      }

      return builder.build().apply {
        flags = flags or Notification.FLAG_ONGOING_EVENT or Notification.FLAG_NO_CLEAR
      }
    }

    private fun saveSnapshot(
      context: Context,
      title: String,
      description: String,
      startMillis: Long,
      endMillis: Long
    ) {
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putBoolean(KEY_ACTIVE, true)
        .putString(KEY_TITLE, title)
        .putString(KEY_DESCRIPTION, description)
        .putLong(KEY_START_MILLIS, startMillis)
        .putLong(KEY_END_MILLIS, endMillis)
        .putLong(KEY_EXPIRES_AT, endMillis)
        .apply()
    }

    private fun calculateTiming(startMillis: Long, endMillis: Long): CourseTiming {
      val now = System.currentTimeMillis()
      val durationMillis = max(MINUTE_MILLIS, endMillis - startMillis)
      val elapsedMillis = max(0L, now - startMillis)
      val progress = ((elapsedMillis.toDouble() / durationMillis.toDouble()) * 100.0)
        .roundToInt()
        .coerceIn(0, 100)

      return CourseTiming(
        progress = progress,
        remainingMillis = endMillis - now
      )
    }

    private data class CourseTiming(
      val progress: Int,
      val remainingMillis: Long
    )

    private fun courseStartRequestCode(eventId: String, startMillis: Long): Int {
      return "course-start-$eventId-$startMillis".hashCode()
    }

    private fun clearSnapshot(context: Context) {
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .remove(KEY_ACTIVE)
        .remove(KEY_TITLE)
        .remove(KEY_DESCRIPTION)
        .remove(KEY_START_MILLIS)
        .remove(KEY_END_MILLIS)
        .remove(KEY_EXPIRES_AT)
        .apply()
    }

    private fun getAccentColor(context: Context): Int {
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        context.getColor(R.color.colorPrimary)
      } else {
        @Suppress("DEPRECATION")
        context.resources.getColor(R.color.colorPrimary)
      }
    }

    private fun requestPromotedOngoing(builder: Notification.Builder) {
      runCatching {
        builder.javaClass
          .getMethod("setRequestPromotedOngoing", java.lang.Boolean.TYPE)
          .invoke(builder, true)
      }
    }
  }
}
