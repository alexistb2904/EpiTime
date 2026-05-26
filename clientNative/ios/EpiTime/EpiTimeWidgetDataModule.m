#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(EpiTimeWidgetData, NSObject)

RCT_EXTERN_METHOD(updateCourses:(NSString *)rawJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(refreshWidgets:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
