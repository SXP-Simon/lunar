#import "NativeRitoReaderProvider.h"

#import <ReactCommon/CallInvoker.h>
#import <ReactCommon/TurboModule.h>

#include "NativeRitoReader.h"

@implementation NativeRitoReaderProvider

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeRitoReader>(params.jsInvoker);
}

@end
