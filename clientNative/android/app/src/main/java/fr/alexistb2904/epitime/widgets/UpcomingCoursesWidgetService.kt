package fr.alexistb2904.epitime.widgets

import android.content.Context
import android.content.Intent
import android.os.Build
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import android.widget.RemoteViewsService.RemoteViewsFactory
import fr.alexistb2904.epitime.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class UpcomingCoursesWidgetService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
    UpcomingCoursesFactory(applicationContext)

  private class UpcomingCoursesFactory(private val context: Context) : RemoteViewsFactory {
    private var courses: List<WidgetCourse> = emptyList()

    override fun onCreate() = Unit

    override fun onDataSetChanged() {
      courses = CourseWidgetStore.upcomingCourses(context, 20)
    }

    override fun onDestroy() {
      courses = emptyList()
    }

    override fun getCount(): Int = courses.size

    override fun getViewAt(position: Int): RemoteViews {
      val course = courses.getOrNull(position)
      val views = RemoteViews(context.packageName, R.layout.widget_upcoming_course_row)
      val active = position == 0

      if (course == null) return views

      val accent = accentFor(position)
      views.setInt(R.id.widget_row_root, "setBackgroundResource", if (active) R.drawable.widget_row_active else R.drawable.widget_row_muted)
      views.setInt(R.id.widget_row_marker, "setBackgroundColor", accent)
      views.setTextViewText(R.id.widget_row_time, formatTime(course.startMillis))
      views.setTextViewText(R.id.widget_row_title, course.title)
      views.setTextViewText(R.id.widget_row_room, "${formatDay(course.startMillis)} · ${course.room}")
      views.setInt(R.id.widget_row_time, "setTextColor", if (active) accent else color(R.color.widget_text_disabled))
      views.setInt(R.id.widget_row_title, "setTextColor", if (active) color(R.color.widget_on_accent_container) else color(R.color.widget_text_muted))
      views.setInt(R.id.widget_row_room, "setTextColor", if (active) color(R.color.widget_text_muted) else color(R.color.widget_text_disabled))
      views.setOnClickFillInIntent(R.id.widget_row_root, CourseWidgetRenderer.courseFillInIntent(course))
      return views
    }

    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount(): Int = 1
    override fun getItemId(position: Int): Long = courses.getOrNull(position)?.startMillis ?: position.toLong()
    override fun hasStableIds(): Boolean = true

    private fun formatTime(millis: Long): String = SimpleDateFormat("HH:mm", Locale.FRANCE).format(Date(millis))
    private fun formatDay(millis: Long): String = SimpleDateFormat("EEE d MMM", Locale.FRANCE).format(Date(millis))

    private fun color(resId: Int): Int =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) context.getColor(resId) else context.resources.getColor(resId)

    private fun accentFor(position: Int): Int =
      color(
        when (position % 3) {
          1 -> R.color.widget_accent_secondary
          2 -> R.color.widget_accent_tertiary
          else -> R.color.widget_accent
        }
      )
  }
}
