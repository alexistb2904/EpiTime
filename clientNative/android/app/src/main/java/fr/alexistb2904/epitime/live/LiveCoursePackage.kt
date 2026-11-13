package fr.alexistb2904.epitime.live

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import fr.alexistb2904.epitime.autofill.AutofillModule
import fr.alexistb2904.epitime.downloads.PdfDownloadsModule
import fr.alexistb2904.epitime.network.NetworkStatusModule
import fr.alexistb2904.epitime.theme.DynamicColorsModule
import fr.alexistb2904.epitime.update.AppUpdateModule
import fr.alexistb2904.epitime.widget.CourseWidgetsModule

class LiveCoursePackage : BaseReactPackage() {
  private val modules: Map<String, Pair<String, (ReactApplicationContext) -> NativeModule>> =
    mapOf(
      "EpiTimeLiveCourse" to (LiveCourseNotificationModule::class.java.name to ::LiveCourseNotificationModule),
      "EpiTimePdfDownloads" to (PdfDownloadsModule::class.java.name to ::PdfDownloadsModule),
      "EpiTimeAutofill" to (AutofillModule::class.java.name to ::AutofillModule),
      "EpiTimeNetworkStatus" to (NetworkStatusModule::class.java.name to ::NetworkStatusModule),
      "EpiTimeCourseWidgets" to (CourseWidgetsModule::class.java.name to ::CourseWidgetsModule),
      "EpiTimeAppUpdate" to (AppUpdateModule::class.java.name to ::AppUpdateModule),
      "EpiTimeDynamicColors" to (DynamicColorsModule::class.java.name to ::DynamicColorsModule),
    )

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    modules[name]?.second?.invoke(reactContext)

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    modules.mapValues { (name, entry) ->
      ReactModuleInfo(
        name,
        entry.first,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = false,
      )
    }
  }
}
