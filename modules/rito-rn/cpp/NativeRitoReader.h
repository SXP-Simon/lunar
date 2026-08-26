#pragma once

#if __has_include(<react/renderer/components/RitoReactNativeSpec/RitoReactNativeSpecJSI.h>)
#include <react/renderer/components/RitoReactNativeSpec/RitoReactNativeSpecJSI.h>
#elif __has_include(<RitoReactNativeSpecJSI.h>)
#include <RitoReactNativeSpecJSI.h>
#else
#error "Rito React Native Codegen C++ specification header is missing."
#endif
#include <react/bridging/Bridging.h>
#include <react/bridging/Promise.h>

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "RitoExecutor.h"

namespace facebook::react {

struct RitoBinary final {
  std::vector<std::uint8_t> bytes;
};

template <>
struct Bridging<RitoBinary> {
  static RitoBinary fromJs(
      jsi::Runtime& runtime,
      const jsi::Value& value,
      const std::shared_ptr<CallInvoker>&);
  static jsi::Object toJs(
      jsi::Runtime& runtime,
      const RitoBinary& value,
      const std::shared_ptr<CallInvoker>&);
};

using RitoNativeBufferResult =
    NativeRitoReaderNativeBufferResult<double, RitoBinary, std::string>;
using RitoNativePinnedFontFace = NativeRitoReaderNativePinnedFontFace<
    std::string,
    std::string,
    double,
    std::optional<std::string>>;

template <>
struct Bridging<RitoNativeBufferResult>
    : NativeRitoReaderNativeBufferResultBridging<RitoNativeBufferResult> {};

template <>
struct Bridging<RitoNativePinnedFontFace>
    : NativeRitoReaderNativePinnedFontFaceBridging<RitoNativePinnedFontFace> {};

class NativeRitoReader final
    : public NativeRitoReaderCxxSpec<NativeRitoReader> {
 public:
  explicit NativeRitoReader(std::shared_ptr<CallInvoker> jsInvoker);
  ~NativeRitoReader() override;

  AsyncPromise<RitoNativeBufferResult> open(
      jsi::Runtime& runtime,
      std::string publication,
      std::string request,
      std::vector<RitoNativePinnedFontFace> fonts);
  AsyncPromise<RitoNativeBufferResult> readPublication(
      jsi::Runtime& runtime,
      std::string sessionId);
  AsyncPromise<RitoNativeBufferResult> requestArtifact(
      jsi::Runtime& runtime,
      std::string sessionId,
      std::string request);
  AsyncPromise<RitoNativeBufferResult> requestAdjacent(
      jsi::Runtime& runtime,
      std::string sessionId,
      std::string request);
  AsyncPromise<RitoNativeBufferResult> peekAdjacent(
      jsi::Runtime& runtime,
      std::string sessionId,
      std::string request);
  AsyncPromise<RitoNativeBufferResult> adoptForeground(
      jsi::Runtime& runtime,
      std::string sessionId,
      std::string request);
  AsyncPromise<RitoNativeBufferResult> commitPeekedArtifact(
      jsi::Runtime& runtime,
      std::string sessionId,
      std::string request);
  AsyncPromise<RitoNativeBufferResult> advanceBackground(
      jsi::Runtime& runtime,
      std::string sessionId,
      std::string request);
  AsyncPromise<RitoNativeBufferResult> adoptBackground(
      jsi::Runtime& runtime,
      std::string sessionId,
      std::string request);
  AsyncPromise<RitoNativeBufferResult> readResource(
      jsi::Runtime& runtime,
      std::string sessionId,
      std::string artifactId,
      double kind,
      std::string href);
  AsyncPromise<RitoNativeBufferResult> search(
      jsi::Runtime& runtime,
      std::string sessionId,
      std::string request);
  AsyncPromise<RitoNativeBufferResult> textRangeGeometry(
      jsi::Runtime& runtime,
      std::string sessionId,
      std::string request);
  AsyncPromise<RitoNativeBufferResult> readFootnote(
      jsi::Runtime& runtime,
      std::string sessionId,
      std::string artifactId,
      std::string key);
  AsyncPromise<RitoNativeBufferResult> releaseArtifact(
      jsi::Runtime& runtime,
      std::string sessionId,
      std::string artifactId);
  AsyncPromise<RitoNativeBufferResult> dispose(
      jsi::Runtime& runtime,
      std::string sessionId);

 private:
  ritojs::reactnative::RitoExecutor executor_;
};

}  // namespace facebook::react
