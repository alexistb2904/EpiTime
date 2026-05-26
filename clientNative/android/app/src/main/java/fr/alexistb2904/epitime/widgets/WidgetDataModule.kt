package fr.alexistb2904.epitime.widgets

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WidgetDataModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "EpiTimeWidgetData"

  @ReactMethod
  fun updateCourses(rawJson: String, promise: Promise) {
    try {
      CourseWidgetStore.save(reactContext, rawJson)
      CourseWidgetRenderer.refreshAll(reactContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("WIDGET_UPDATE_FAILED", error)
    }
  }

  @ReactMethod
  fun refreshWidgets(promise: Promise) {
    try {
      CourseWidgetRenderer.refreshAll(reactContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("WIDGET_REFRESH_FAILED", error)
    }
  }
}
