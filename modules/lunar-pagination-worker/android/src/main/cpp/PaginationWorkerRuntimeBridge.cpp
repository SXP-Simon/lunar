#include <fbjni/fbjni.h>

#include "JavaScriptObject.h"
#include <worklets/WorkletRuntime/WorkletRuntime.h>

#include <array>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace jni = facebook::jni;
namespace jsi = facebook::jsi;

namespace expo::lunarpaginationworker {

constexpr auto kWorkerBindingsName = "__lunarPaginationWorker";

class ReaderWorkerTextMeasurer
    : public jni::JavaClass<ReaderWorkerTextMeasurer> {
 public:
  static auto constexpr kJavaDescriptor =
      "Lexpo/modules/lunarpaginationworker/ReaderWorkerTextMeasurer;";
};

/**
 * Module-owned JSI bridge for the pagination Worker.
 *
 * This deliberately bypasses Expo SharedObject and its UI-runtime registry.
 * JNI calls are caught at each HostFunction boundary so a Java exception can
 * never unwind through Worklets' AsyncQueue and terminate the process.
 */
class PaginationWorkerHostObject final
    : public jsi::HostObject,
      public std::enable_shared_from_this<PaginationWorkerHostObject> {
 public:
  explicit PaginationWorkerHostObject(
      jni::alias_ref<ReaderWorkerTextMeasurer::javaobject> textMeasurer)
      : textMeasurer_(jni::make_global(textMeasurer)) {
    auto *env = jni::Environment::current();
    auto clazz = env->GetObjectClass(textMeasurer_.get());
    FACEBOOK_JNI_THROW_PENDING_EXCEPTION();
    measureTextMethod_ = env->GetMethodID(
        clazz,
        "measureText",
        "(Ljava/lang/String;DDD)[D");
    FACEBOOK_JNI_THROW_PENDING_EXCEPTION();
    resolveFontMetricsMethod_ = env->GetMethodID(
        clazz,
        "resolveFontMetrics",
        "(D)[D");
    FACEBOOK_JNI_THROW_PENDING_EXCEPTION();
    env->DeleteLocalRef(clazz);
  }

  jsi::Value get(
      jsi::Runtime &runtime,
      const jsi::PropNameID &propertyName) override {
    const auto name = propertyName.utf8(runtime);
    if (name == "measureText") {
      return jsi::Function::createFromHostFunction(
          runtime,
          propertyName,
          4,
          [self = shared_from_this()](
              jsi::Runtime &rt,
              const jsi::Value &,
              const jsi::Value *args,
              size_t count) -> jsi::Value {
            return self->guardJni(rt, [&]() {
              if (count < 4 || !args[0].isString()) {
                throw jsi::JSError(
                    rt,
                    "Lunar pagination measureText expects text, size, letter spacing and word spacing.");
              }
              const auto text = args[0].asString(rt).utf8(rt);
              const auto values = self->measureText(
                  text,
                  args[1].asNumber(),
                  args[2].asNumber(),
                  args[3].asNumber());
              jsi::Object result(rt);
              result.setProperty(rt, "width", values[0]);
              result.setProperty(rt, "height", values[1]);
              return jsi::Value(rt, std::move(result));
            });
          });
    }
    if (name == "resolveFontMetrics") {
      return jsi::Function::createFromHostFunction(
          runtime,
          propertyName,
          1,
          [self = shared_from_this()](
              jsi::Runtime &rt,
              const jsi::Value &,
              const jsi::Value *args,
              size_t count) -> jsi::Value {
            return self->guardJni(rt, [&]() {
              if (count < 1 || !args[0].isNumber()) {
                throw jsi::JSError(
                    rt,
                    "Lunar pagination resolveFontMetrics expects a font size.");
              }
              const auto values = self->resolveFontMetrics(args[0].asNumber());
              jsi::Object result(rt);
              result.setProperty(rt, "ascentPx", values[0]);
              result.setProperty(rt, "descentPx", values[1]);
              result.setProperty(rt, "lineGapPx", values[2]);
              result.setProperty(rt, "contentHeightPx", values[3]);
              return jsi::Value(rt, std::move(result));
            });
          });
    }
    return jsi::Value::undefined();
  }

  std::vector<jsi::PropNameID> getPropertyNames(jsi::Runtime &runtime) override {
    std::vector<jsi::PropNameID> names;
    names.emplace_back(jsi::PropNameID::forAscii(runtime, "measureText"));
    names.emplace_back(jsi::PropNameID::forAscii(runtime, "resolveFontMetrics"));
    return names;
  }

 private:
  template <typename Callback>
  jsi::Value guardJni(jsi::Runtime &runtime, Callback &&callback) const {
    try {
      return callback();
    } catch (const jsi::JSError &) {
      throw;
    } catch (const jni::JniException &error) {
      throw jsi::JSError(
          runtime,
          std::string("Lunar pagination JNI call failed: ") + error.what());
    } catch (const std::exception &error) {
      throw jsi::JSError(
          runtime,
          std::string("Lunar pagination native call failed: ") + error.what());
    } catch (...) {
      throw jsi::JSError(runtime, "Lunar pagination native call failed.");
    }
  }

  std::array<double, 2> measureText(
      const std::string &text,
      double sizePx,
      double letterSpacingPx,
      double wordSpacingPx) const {
    auto *env = jni::Environment::current();
    auto javaText = jni::make_jstring(text);
    auto result = static_cast<jdoubleArray>(env->CallObjectMethod(
        textMeasurer_.get(),
        measureTextMethod_,
        javaText.get(),
        sizePx,
        letterSpacingPx,
        wordSpacingPx));
    FACEBOOK_JNI_THROW_PENDING_EXCEPTION();
    if (result == nullptr || env->GetArrayLength(result) < 2) {
      if (result != nullptr) {
        env->DeleteLocalRef(result);
      }
      throw std::runtime_error("ReaderWorkerTextMeasurer returned invalid text metrics.");
    }
    std::array<double, 2> values{};
    env->GetDoubleArrayRegion(
        result,
        0,
        static_cast<jsize>(values.size()),
        values.data());
    env->DeleteLocalRef(result);
    FACEBOOK_JNI_THROW_PENDING_EXCEPTION();
    return values;
  }

  std::array<double, 4> resolveFontMetrics(double sizePx) const {
    auto *env = jni::Environment::current();
    auto result = static_cast<jdoubleArray>(env->CallObjectMethod(
        textMeasurer_.get(),
        resolveFontMetricsMethod_,
        sizePx));
    FACEBOOK_JNI_THROW_PENDING_EXCEPTION();
    if (result == nullptr || env->GetArrayLength(result) < 4) {
      if (result != nullptr) {
        env->DeleteLocalRef(result);
      }
      throw std::runtime_error("ReaderWorkerTextMeasurer returned invalid font metrics.");
    }
    std::array<double, 4> values{};
    env->GetDoubleArrayRegion(
        result,
        0,
        static_cast<jsize>(values.size()),
        values.data());
    env->DeleteLocalRef(result);
    FACEBOOK_JNI_THROW_PENDING_EXCEPTION();
    return values;
  }

  jni::global_ref<ReaderWorkerTextMeasurer::javaobject> textMeasurer_;
  jmethodID measureTextMethod_{};
  jmethodID resolveFontMetricsMethod_{};
};

class PaginationWorkerRuntimeBridge
    : public jni::JavaClass<PaginationWorkerRuntimeBridge> {
 public:
  static auto constexpr kJavaDescriptor =
      "Lexpo/modules/lunarpaginationworker/PaginationWorkerRuntimeBridge;";

  static void registerNatives() {
    javaClassStatic()->registerNatives({
        makeNativeMethod(
            "installWorkerRuntimeBindings",
            PaginationWorkerRuntimeBridge::installWorkerRuntimeBindings),
    });
  }

 private:
  static jlong installWorkerRuntimeBindings(
      jni::alias_ref<jni::JClass>,
      jni::alias_ref<expo::JavaScriptObject::javaobject> runtimeHolder,
      jni::alias_ref<ReaderWorkerTextMeasurer::javaobject> textMeasurer) {
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

      auto retainedTextMeasurer = jni::make_global(textMeasurer);
      workerRuntime->runSync(
          [retainedTextMeasurer = std::move(retainedTextMeasurer)](
              jsi::Runtime &runtime) mutable {
            auto hostObject = std::make_shared<PaginationWorkerHostObject>(
                retainedTextMeasurer);
            auto bindings = jsi::Object::createFromHostObject(
                runtime,
                std::move(hostObject));
            runtime.global().setProperty(
                runtime,
                kWorkerBindingsName,
                std::move(bindings));
          });

      return reinterpret_cast<jlong>(&workerRuntime->getJSIRuntime());
    } catch (...) {
      // Zero activates the existing local-pagination fallback.
      return 0;
    }
  }
};

} // namespace expo::lunarpaginationworker

JNIEXPORT jint JNI_OnLoad(JavaVM *vm, void *) {
  return facebook::jni::initialize(vm, [] {
    expo::lunarpaginationworker::PaginationWorkerRuntimeBridge::registerNatives();
  });
}
