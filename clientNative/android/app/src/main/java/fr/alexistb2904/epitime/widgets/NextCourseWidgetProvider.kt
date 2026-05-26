package fr.alexistb2904.epitime.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

class NextCourseWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    appWidgetIds.forEach {
      runCatching { CourseWidgetRenderer.renderNext(context, appWidgetManager, it) }
    }
    runCatching { CourseWidgetAutoRefresh.refreshInBackground(context) }
  }
}
