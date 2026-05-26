package fr.alexistb2904.epitime.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.widget.RemoteViews
import fr.alexistb2904.epitime.MainActivity
import fr.alexistb2904.epitime.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max

object CourseWidgetRenderer {
  fun renderNext(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int) {
    val views = RemoteViews(context.packageName, R.layout.widget_next_course)
    val course = CourseWidgetStore.upcomingCourses(context, 1).firstOrNull()
    val accent = color(context, R.color.widget_accent)
    val muted = color(context, R.color.widget_text_muted)
    val outline = color(context, R.color.widget_outline)
    val onAccentContainer = color(context, R.color.widget_on_accent_container)
    views.setOnClickPendingIntent(R.id.widget_next_root, launchIntent(context, REQUEST_NEXT_COURSE, course?.let { courseUri(it) } ?: agendaUri()))

    if (course == null) {
      views.setTextViewText(R.id.widget_next_kicker, "Planning")
      views.setTextViewText(R.id.widget_next_title, "Aucun cours a venir")
      views.setTextViewText(R.id.widget_next_time, "Ouvre EpiTime pour synchroniser")
      views.setTextViewText(R.id.widget_next_room, "EpiTime")
      views.setInt(R.id.widget_next_accent, "setBackgroundColor", outline)
      views.setInt(R.id.widget_next_kicker, "setTextColor", muted)
    } else {
      val now = System.currentTimeMillis()
      views.setTextViewText(R.id.widget_next_kicker, if (course.startMillis <= now) "En cours" else relativeStart(course.startMillis, now))
      views.setTextViewText(R.id.widget_next_title, course.title)
      views.setTextViewText(R.id.widget_next_time, "${formatDay(course.startMillis)} · ${formatTime(course.startMillis)}-${formatTime(course.endMillis)}")
      views.setTextViewText(R.id.widget_next_room, course.room)
      views.setInt(R.id.widget_next_accent, "setBackgroundColor", accent)
      views.setInt(R.id.widget_next_kicker, "setTextColor", accent)
      views.setInt(R.id.widget_next_title, "setTextColor", onAccentContainer)
    }

    appWidgetManager.updateAppWidget(widgetId, views)
  }

  fun renderUpcoming(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int) {
    val views = RemoteViews(context.packageName, R.layout.widget_upcoming_courses)
    val adapterIntent = Intent(context, UpcomingCoursesWidgetService::class.java).apply {
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
      data = Uri.parse("epitime://widgets/upcoming/$widgetId")
    }
    views.setOnClickPendingIntent(R.id.widget_upcoming_root, launchIntent(context))
    views.setTextViewText(R.id.widget_upcoming_updated, updatedLabel(context))
    views.setRemoteAdapter(R.id.widget_upcoming_list, adapterIntent)
    views.setPendingIntentTemplate(R.id.widget_upcoming_list, launchIntent(context, REQUEST_UPCOMING_ROW, mutable = true))
    views.setEmptyView(R.id.widget_upcoming_list, R.id.widget_upcoming_empty)

    appWidgetManager.updateAppWidget(widgetId, views)
    appWidgetManager.notifyAppWidgetViewDataChanged(widgetId, R.id.widget_upcoming_list)
  }

  fun refreshAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    manager.getAppWidgetIds(ComponentName(context, NextCourseWidgetProvider::class.java)).forEach {
      runCatching { renderNext(context, manager, it) }
    }
    manager.getAppWidgetIds(ComponentName(context, UpcomingCoursesWidgetProvider::class.java)).forEach {
      runCatching { renderUpcoming(context, manager, it) }
    }
  }

  internal fun courseFillInIntent(course: WidgetCourse): Intent =
    Intent().apply {
      action = Intent.ACTION_VIEW
      data = courseUri(course)
    }

  private fun launchIntent(context: Context, requestCode: Int = REQUEST_OPEN_APP, uri: Uri? = agendaUri(), mutable: Boolean = false): PendingIntent {
    val intent = Intent(context, MainActivity::class.java).apply {
      action = Intent.ACTION_VIEW
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      if (uri != null) data = uri
    }
    val mutabilityFlag = when {
      Build.VERSION.SDK_INT < Build.VERSION_CODES.M -> 0
      mutable && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> PendingIntent.FLAG_MUTABLE
      mutable -> 0
      else -> PendingIntent.FLAG_IMMUTABLE
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or mutabilityFlag
    return PendingIntent.getActivity(context, requestCode, intent, flags)
  }

  private fun agendaUri(): Uri = Uri.Builder()
    .scheme("epitime")
    .authority("agenda")
    .build()

  private fun courseUri(course: WidgetCourse): Uri = Uri.Builder()
    .scheme("epitime")
    .authority("agenda")
    .appendQueryParameter("targetDate", course.startDate)
    .appendQueryParameter("eventId", course.id)
    .appendQueryParameter("eventReservationId", course.id)
    .appendQueryParameter("eventStartDate", course.startDate)
    .build()

  private fun updatedLabel(context: Context): String {
    val updated = CourseWidgetStore.updatedAt(context)
    if (updated <= 0L) return "Non synchronise"
    return "Dernière Actualisation ${formatTime(updated)}"
  }

  private fun relativeStart(start: Long, now: Long): String {
    val diffMinutes = max(0, ((start - now) / 60000L).toInt())
    if (diffMinutes < 1) return "Maintenant"
    if (diffMinutes < 60) return "Dans ${diffMinutes} min"
    val hours = diffMinutes / 60
    val minutes = diffMinutes % 60
    return if (minutes == 0) "Dans ${hours} h" else "Dans ${hours} h ${minutes}"
  }

  private fun formatTime(millis: Long): String = SimpleDateFormat("HH:mm", Locale.FRANCE).format(Date(millis))
  private fun formatDay(millis: Long): String = SimpleDateFormat("EEE d MMM", Locale.FRANCE).format(Date(millis))

  private fun color(context: Context, resId: Int): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) context.getColor(resId) else context.resources.getColor(resId)

  private const val REQUEST_OPEN_APP = 1001
  private const val REQUEST_NEXT_COURSE = 1002
  private const val REQUEST_UPCOMING_ROW = 1003
}
