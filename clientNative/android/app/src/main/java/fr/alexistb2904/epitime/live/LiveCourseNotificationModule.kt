package fr.alexistb2904.epitime.live

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import fr.alexistb2904.epitime.MainActivity

class LiveCourseNotificationModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "EpiTimeLiveCourse"

  @ReactMethod
  fun showCourseProgress(title: String, description: String, progress: Double, chipText: String, timeoutMillis: Double, promise: Promise) {
    try {
      val context = reactContext.applicationContext
      val manager = context.getSystemService(NotificationManager::class.java)
      ensureChannel(manager)

      val clampedProgress = progress.toInt().coerceIn(0, 100)
      val timeout = timeoutMillis.toLong().coerceAtLeast(60_000L)
      val notification = buildNotification(context, title, description, clampedProgress, chipText, timeout)
      manager.notify(NOTIFICATION_ID, notification)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("LIVE_COURSE_SHOW_FAILED", error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      val manager = reactContext.applicationContext.getSystemService(NotificationManager::class.java)
      manager.cancel(NOTIFICATION_ID)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("LIVE_COURSE_STOP_FAILED", error)
    }
  }

  private fun ensureChannel(manager: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Cours en direct",
      NotificationManager.IMPORTANCE_DEFAULT
    ).apply {
      description = "Cours actuellement en cours et temps restant"
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(
    context: Context,
    title: String,
    description: String,
    progress: Int,
    chipText: String,
    timeoutMillis: Long
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

    val builder = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
    } else {
      Notification.Builder(context)
    })
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(title)
      .setContentText(description)
      .setContentIntent(pendingIntent)
      .setCategory(Notification.CATEGORY_EVENT)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setLocalOnly(true)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      builder.setTimeoutAfter(timeoutMillis)
    }

    if (Build.VERSION.SDK_INT >= 36) {
      val style = Notification.ProgressStyle()
        .setProgress(progress)
        .setProgressTrackerIcon(Icon.createWithResource(context, android.R.drawable.ic_dialog_info))

      builder
        .setStyle(style)
        .setShortCriticalText(chipText.take(7))
      requestPromotedOngoing(builder)
    } else {
      builder.setProgress(100, progress, false)
    }

    return builder.build()
  }

  private fun requestPromotedOngoing(builder: Notification.Builder) {
    runCatching {
      builder.javaClass
        .getMethod("setRequestPromotedOngoing", java.lang.Boolean.TYPE)
        .invoke(builder, true)
    }
  }

  companion object {
    private const val CHANNEL_ID = "live_course"
    private const val NOTIFICATION_ID = 4201
  }
}
