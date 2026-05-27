import Foundation
import WidgetKit

@objc(EpiTimeWidgetData)
class EpiTimeWidgetData: NSObject {
  private let appGroup = "group.fr.alexistb2904.epitime"
  private let coursesKey = "courses_json"
  private let updatedAtKey = "updated_at"

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(updateCourses:resolver:rejecter:)
  func updateCourses(_ rawJson: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    guard let defaults = UserDefaults(suiteName: appGroup) else {
      reject("WIDGET_APP_GROUP_UNAVAILABLE", "Unable to open EpiTime app group.", nil)
      return
    }

    defaults.set(rawJson, forKey: coursesKey)
    defaults.set(Date().timeIntervalSince1970 * 1000, forKey: updatedAtKey)
    defaults.synchronize()
    WidgetCenter.shared.reloadAllTimelines()
    resolve(true)
  }
}
