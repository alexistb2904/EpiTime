package fr.alexistb2904.epitime.live

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
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import fr.alexistb2904.epitime.MainActivity
import fr.alexistb2904.epitime.R

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
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Cours actuellement en cours et temps restant"
      enableVibration(true)
      vibrationPattern = longArrayOf(0L, 220L, 120L, 220L)
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
    val displayTitle = title.trim().ifBlank { "Cours en direct" }
    val displayDescription = description.trim().ifBlank { "Cours en cours" }
    val remainingText = chipText.trim().ifBlank { "En cours" }

    val builder = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
    } else {
      Notification.Builder(context)
    })
      .setSmallIcon(R.drawable.ic_notification_course_book)
      .setContentTitle(displayTitle)
      .setContentText(displayDescription)
      .setSubText(remainingText)
      .setContentIntent(pendingIntent)
      .setCategory(Notification.CATEGORY_EVENT)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setLocalOnly(true)
      .setColor(getAccentColor(context))
      .setPriority(Notification.PRIORITY_HIGH)
      .setDefaults(Notification.DEFAULT_SOUND or Notification.DEFAULT_VIBRATE)
      .setVibrate(longArrayOf(0L, 220L, 120L, 220L))


    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      builder.setTimeoutAfter(timeoutMillis)
    }

    if (Build.VERSION.SDK_INT >= 36) {
      val style = Notification.ProgressStyle()
        .setProgress(progress)
        .setProgressTrackerIcon(Icon.createWithResource(context, R.drawable.ic_notification_course_book))

      builder
        .setStyle(style)
        .setShortCriticalText(remainingText.take(MAX_CRITICAL_TEXT_LENGTH))
      requestPromotedOngoing(builder)
    } else {
      builder.setProgress(100, progress, false)
    }

    return builder.build()
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

  companion object {
    private const val CHANNEL_ID = "live_course_alerts"
    private const val NOTIFICATION_ID = 4201
    private const val MAX_CRITICAL_TEXT_LENGTH = 7
  }
}
