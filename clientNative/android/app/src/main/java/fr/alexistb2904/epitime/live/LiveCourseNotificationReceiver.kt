package fr.alexistb2904.epitime.live

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class LiveCourseNotificationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != LiveCourseNotificationModule.ACTION_RESTORE_LIVE_COURSE) return
    LiveCourseNotificationModule.restoreFromSnapshot(context.applicationContext)
  }
}
