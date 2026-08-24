#include <fbjni/fbjni.h>

#include "JavaScriptObject.h"
#include <worklets/WorkletRuntime/WorkletRuntime.h>

namespace jni = facebook::jni;
namespace jsi = facebook::jsi;

namespace expo::lunarreader {

/**
 * `getUIRuntimeHolder()` is a plain object with WorkletRuntimeHolder native
 * state. A value returned by `createWorkletRuntime()` is instead a
 * WorkletRuntime HostObject. The Expo SDK 57 resolver assumes the former and
 * dereferences null when given the latter. Extract the HostObject directly.
 */
class ReaderWorkletRuntimeBridge
    : public jni::JavaClass<ReaderWorkletRuntimeBridge> {
 public:
  static auto constexpr kJavaDescriptor =
      "Lexpo/modules/lunarreader/ReaderWorkletRuntimeBridge;";

  static void registerNatives() {
    javaClassStatic()->registerNatives({
        makeNativeMethod(
            "resolveWorkerRuntimePointer",
            ReaderWorkletRuntimeBridge::resolveWorkerRuntimePointer),
    });
  }

 private:
  static jlong resolveWorkerRuntimePointer(
      jni::alias_ref<jni::JClass>,
      jni::alias_ref<expo::JavaScriptObject::javaobject> runtimeHolder) {
    try {
      auto *javaScriptObject = runtimeHolder->cthis();
      jsi::Runtime &callerRuntime = javaScriptObject->getRuntime();
      auto runtimeObject = javaScriptObject->get();
      auto workerRuntime = worklets::extractWorkletRuntime(
          callerRuntime,
          jsi::Value(callerRuntime, *runtimeObject));

      if (!workerRuntime) {
        return 0;
      }
      return reinterpret_cast<jlong>(&workerRuntime->getJSIRuntime());
    } catch (...) {
      // The caller treats zero as an unavailable bridge and takes its normal
      // error path. Never turn an invalid holder into a native crash.
      return 0;
    }
  }
};

} // namespace expo::lunarreader

JNIEXPORT jint JNI_OnLoad(JavaVM *vm, void *) {
  return facebook::jni::initialize(vm, [] {
    expo::lunarreader::ReaderWorkletRuntimeBridge::registerNatives();
  });
}
