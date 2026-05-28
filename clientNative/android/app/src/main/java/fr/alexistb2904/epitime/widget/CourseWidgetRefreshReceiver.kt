package fr.alexistb2904.epitime.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class CourseWidgetRefreshReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      CourseWidgetsModule.ACTION_REFRESH_NEXT_COURSE -> {
        CourseWidgetsModule.handleTimelineRefresh(context.applicationContext)
      }

      CourseWidgetsModule.ACTION_RESTORE_REFRESHES,
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED -> {
        CourseWidgetsModule.restoreScheduledRefresh(context.applicationContext)
      }
    }
  }
}
