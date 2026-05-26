package fr.alexistb2904.epitime.widgets

import android.content.Context
import java.util.concurrent.atomic.AtomicBoolean

object CourseWidgetAutoRefresh {
  private val running = AtomicBoolean(false)

  fun refreshInBackground(context: Context) {
    val appContext = context.applicationContext
    if (!running.compareAndSet(false, true)) return

    Thread {
      try {
        if (CourseWidgetFetcher.refreshFromNetwork(appContext)) {
          CourseWidgetRenderer.refreshAll(appContext)
        }
      } catch (_: Exception) {
      } finally {
        running.set(false)
      }
    }.start()
  }
}
