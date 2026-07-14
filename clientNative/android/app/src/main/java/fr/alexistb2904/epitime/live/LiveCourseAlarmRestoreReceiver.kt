package fr.alexistb2904.epitime.live

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Reinstalls the app-owned alarms that Android clears after a reboot, a package
 * replacement, or a change to the exact-alarm special access. The receiver is
 * deliberately not exported: every action in its manifest filter is emitted by
 * the system and no third-party app needs to trigger it.
 */
class LiveCourseAlarmRestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val restored = LiveCourseNotificationModule.restoreScheduledAlarms(context.applicationContext)
    Log.d(TAG, "Reconciled live-course alarms after ${intent.action}; restored=$restored")
  }

  companion object {
    private const val TAG = "EpiTimeLiveCourse"
  }
}
