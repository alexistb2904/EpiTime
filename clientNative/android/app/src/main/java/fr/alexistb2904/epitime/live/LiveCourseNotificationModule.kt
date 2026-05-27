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
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import fr.alexistb2904.epitime.MainActivity
import fr.alexistb2904.epitime.R

class LiveCourseNotificationModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "EpiTimeLiveCourse"

  @ReactMethod
  fun showCourseProgress(
    title: String,
    description: String,
    progress: Double,
    chipText: String,
    timeoutMillis: Double,
    promise: Promise
  ) {
    try {
      val context = reactContext.applicationContext
      val manager = context.getSystemService(NotificationManager::class.java)

      ensureChannel(context, manager)

      val clampedProgress = progress.toInt().coerceIn(0, 100)
      val timeout = timeoutMillis.toLong().coerceAtLeast(60_000L)
      val expiresAtMillis = System.currentTimeMillis() + timeout

      val notification = buildNotification(
        context = context,
        title = title,
        description = description,
        progress = clampedProgress,
        chipText = chipText,
        timeoutMillis = timeout,
        expiresAtMillis = expiresAtMillis
      )

      saveSnapshot(context, title, description, clampedProgress, chipText, expiresAtMillis)
      manager.notify(NOTIFICATION_ID, notification)

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

      val alarmManager = context.getSystemService(AlarmManager::class.java)
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

      val canScheduleExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()

      if (canScheduleExact) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, startAt, pendingIntent)
        } else {
          alarmManager.setExact(AlarmManager.RTC_WAKEUP, startAt, pendingIntent)
        }
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, startAt, pendingIntent)
      } else {
        alarmManager.set(AlarmManager.RTC_WAKEUP, startAt, pendingIntent)
      }

      Log.d(TAG, "Scheduled live course at $startAt")
      promise.resolve(true)
    } catch (error: SecurityException) {
      try {
        val context = reactContext.applicationContext
        val alarmManager = context.getSystemService(AlarmManager::class.java)
        val startAt = startMillis.toLong()
        val pendingIntent = createStartPendingIntent(
          context = context,
          title = title,
          room = room,
          startMillis = startAt,
          endMillis = endMillis.toLong(),
          flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        ) ?: run {
          promise.resolve(false)
          return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, startAt, pendingIntent)
        } else {
          alarmManager.set(AlarmManager.RTC_WAKEUP, startAt, pendingIntent)
        }

        Log.d(TAG, "Scheduled inexact live course at $startAt")
        promise.resolve(true)
      } catch (fallbackError: Exception) {
        promise.reject("LIVE_COURSE_SCHEDULE_FAILED", fallbackError)
      }
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
    private const val PREFS_NAME = "live_course_notification"
    private const val KEY_ACTIVE = "active"
    private const val KEY_TITLE = "title"
    private const val KEY_DESCRIPTION = "description"
    private const val KEY_PROGRESS = "progress"
    private const val KEY_CHIP_TEXT = "chip_text"
    private const val KEY_EXPIRES_AT = "expires_at"

    private const val MAX_CRITICAL_TEXT_LENGTH = 7

    internal const val ACTION_RESTORE_LIVE_COURSE = "fr.alexistb2904.epitime.live.RESTORE_LIVE_COURSE"
    internal const val ACTION_START_LIVE_COURSE = "fr.alexistb2904.epitime.live.START_LIVE_COURSE"
    internal const val EXTRA_TITLE = "title"
    internal const val EXTRA_ROOM = "room"
    internal const val EXTRA_START_MILLIS = "start_millis"
    internal const val EXTRA_END_MILLIS = "end_millis"
    internal const val NOTIFICATION_ID = 4201

    private const val REQUEST_CODE_START = 4202

    internal fun restoreFromSnapshot(context: Context): Boolean {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      if (!prefs.getBoolean(KEY_ACTIVE, false)) return false

      val now = System.currentTimeMillis()
      val expiresAtMillis = prefs.getLong(KEY_EXPIRES_AT, 0L)
      val timeoutMillis = expiresAtMillis - now
      if (timeoutMillis <= 0L) {
        clearSnapshot(context)
        return false
      }

      val manager = context.getSystemService(NotificationManager::class.java)
      ensureChannel(context, manager)
      val notification = buildNotification(
        context = context,
        title = prefs.getString(KEY_TITLE, null).orEmpty(),
        description = prefs.getString(KEY_DESCRIPTION, null).orEmpty(),
        progress = prefs.getInt(KEY_PROGRESS, 0),
        chipText = prefs.getString(KEY_CHIP_TEXT, null).orEmpty(),
        timeoutMillis = timeoutMillis,
        expiresAtMillis = expiresAtMillis
      )
      manager.notify(NOTIFICATION_ID, notification)
      return true
    }

    internal fun showFromReceiver(
      context: Context,
      title: String,
      description: String,
      progress: Int,
      chipText: String,
      timeoutMillis: Long
    ): Boolean {
      val manager = context.getSystemService(NotificationManager::class.java)
      ensureChannel(context, manager)

      val clampedProgress = progress.coerceIn(0, 100)
      val timeout = timeoutMillis.coerceAtLeast(1_000L)
      val expiresAtMillis = System.currentTimeMillis() + timeout
      val notification = buildNotification(
        context = context,
        title = title,
        description = description,
        progress = clampedProgress,
        chipText = chipText,
        timeoutMillis = timeout,
        expiresAtMillis = expiresAtMillis
      )

      saveSnapshot(context, title, description, clampedProgress, chipText, expiresAtMillis)
      manager.notify(NOTIFICATION_ID, notification)
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
      ) ?: return

      val alarmManager = context.getSystemService(AlarmManager::class.java)
      alarmManager.cancel(pendingIntent)
      pendingIntent.cancel()
      Log.d(TAG, "Canceled scheduled live course")
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

    private fun buildNotification(
      context: Context,
      title: String,
      description: String,
      progress: Int,
      chipText: String,
      timeoutMillis: Long,
      expiresAtMillis: Long
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
      val remainingText = chipText.trim().ifBlank { "En cours" }

      val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(context, CHANNEL_ID)
      } else {
        Notification.Builder(context)
      }

      builder
        .setSmallIcon(R.drawable.ic_notification_course_book)
        .setContentTitle(displayTitle)
        .setContentText(displayDescription)
        .setSubText(remainingText)
        .setTicker("$displayTitle • $remainingText")
        .setContentIntent(pendingIntent)
        .setDeleteIntent(restorePendingIntent)
        .setCategory(Notification.CATEGORY_PROGRESS)

        .setOngoing(true)
        .setAutoCancel(false)
        .setOnlyAlertOnce(true)
        .setLocalOnly(true)
        .setWhen(expiresAtMillis)
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
          .setShortCriticalText(remainingText.take(MAX_CRITICAL_TEXT_LENGTH))

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
      progress: Int,
      chipText: String,
      expiresAtMillis: Long
    ) {
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putBoolean(KEY_ACTIVE, true)
        .putString(KEY_TITLE, title)
        .putString(KEY_DESCRIPTION, description)
        .putInt(KEY_PROGRESS, progress)
        .putString(KEY_CHIP_TEXT, chipText)
        .putLong(KEY_EXPIRES_AT, expiresAtMillis)
        .apply()
    }

    private fun clearSnapshot(context: Context) {
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .clear()
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
