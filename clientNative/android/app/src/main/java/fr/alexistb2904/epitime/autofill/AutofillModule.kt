package fr.alexistb2904.epitime.autofill

import android.os.Build
import android.view.autofill.AutofillManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AutofillModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "EpiTimeAutofill"

  @ReactMethod
  fun commit(promise: Promise) {
    try {
      val activity = reactApplicationContext.getCurrentActivity()
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity == null) {
        promise.resolve(false)
        return
      }
      activity.getSystemService(AutofillManager::class.java)?.commit()
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("AUTOFILL_COMMIT_FAILED", error)
    }
  }

  @ReactMethod
  fun cancel(promise: Promise) {
    try {
      val activity = reactApplicationContext.getCurrentActivity()
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity == null) {
        promise.resolve(false)
        return
      }
      activity.getSystemService(AutofillManager::class.java)?.cancel()
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("AUTOFILL_CANCEL_FAILED", error)
    }
  }
}
