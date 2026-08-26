#include "NativeRitoReader.h"

#include <array>
#include <charconv>
#include <cmath>
#include <cstring>
#include <functional>
#include <limits>
#include <stdexcept>
#include <utility>

#include "RitoOwnedBuffer.h"
#include "RitoAbiExtensions.h"
#include "RitoPinnedFontAbi.h"

namespace facebook::react {

namespace {
using ritojs::reactnative::RitoFfiResult;

constexpr std::uint64_t kMaximumExternalId = 0x7fff'ffff'ffff'ffffULL;
constexpr std::uint64_t kMaximumPublicationBytes = 512ULL * 1024ULL * 1024ULL;
constexpr std::uint64_t kMaximumRequestBytes = 16ULL * 1024ULL * 1024ULL;
constexpr std::uint64_t kMaximumPinnedFontBytes = 64ULL * 1024ULL * 1024ULL;

RitoNativeBufferResult toNativeResult(RitoFfiResult result) {
  return {
      static_cast<double>(result.status),
      RitoBinary{.bytes = std::move(result.data)},
      std::move(result.error),
  };
}

RitoNativeBufferResult executorBusyResult() {
  return {
      static_cast<double>(RITO_STATUS_BUSY_V1),
      RitoBinary{},
      "The Rito React Native native executor queue is full.",
  };
}

RitoNativeBufferResult invalidArgumentResult(std::string message) {
  return {
      static_cast<double>(RITO_STATUS_INVALID_ARGUMENT_V1),
      RitoBinary{},
      std::move(message),
  };
}

std::uint64_t parseExternalId(const std::string& value, const char* field) {
  if (value.empty()) {
    throw std::invalid_argument(std::string(field) + " must be a positive decimal integer.");
  }
  std::uint64_t result{};
  const auto [pointer, error] = std::from_chars(
      value.data(), value.data() + value.size(), result, 10);
  if (error != std::errc{} || pointer != value.data() + value.size() || result == 0 ||
      result > kMaximumExternalId) {
    throw std::invalid_argument(std::string(field) + " must be within 1..=INT64_MAX.");
  }
  return result;
}

std::vector<std::uint8_t> copyBinaryObject(
    jsi::Runtime& runtime,
    const jsi::Object& value,
    std::uint64_t maximumBytes = 64ULL * 1024ULL * 1024ULL) {
  const std::uint8_t* data{};
  std::size_t length{};
  if (value.isUint8Array(runtime)) {
    auto typed = value.getUint8Array(runtime);
    auto buffer = typed.buffer(runtime);
    const auto offset = typed.byteOffset(runtime);
    length = typed.byteLength(runtime);
    data = buffer.data(runtime) + offset;
  } else if (value.isArrayBuffer(runtime)) {
    auto buffer = value.getArrayBuffer(runtime);
    length = buffer.size(runtime);
    data = buffer.data(runtime);
  } else {
    throw std::invalid_argument(
        "NativeRitoReader expects a Uint8Array or ArrayBuffer binary argument.");
  }
  if (length > maximumBytes) {
    throw std::invalid_argument("NativeRitoReader binary argument exceeds its ABI limit.");
  }
  if (length == 0) {
    return {};
  }
  return {data, data + length};
}

std::array<std::uint8_t, 64> parseDigest(const std::string& digest) {
  if (digest.size() != 64) {
    throw std::invalid_argument("Pinned font SHA-256 must contain 64 hexadecimal digits.");
  }
  std::array<std::uint8_t, 64> bytes{};
  for (std::size_t index = 0; index < digest.size(); ++index) {
    const char value = digest[index];
    if ((value < '0' || value > '9') && (value < 'a' || value > 'f')) {
      throw std::invalid_argument("Pinned font SHA-256 must use lowercase hexadecimal digits.");
    }
    bytes[index] = static_cast<std::uint8_t>(value);
  }
  return bytes;
}

struct OwnedPinnedFontFace final {
  std::vector<std::uint8_t> bytes;
  std::array<std::uint8_t, 64> digest;
  std::optional<std::string> language;
  std::uint32_t role{};

  rito_pinned_font_face_v1 toFfi() const {
    rito_pinned_font_face_v1 result{};
    result.bytes_data = bytes.data();
    result.bytes_len = bytes.size();
    std::memcpy(result.sha256_hex, digest.data(), digest.size());
    result.generic_role = role;
    result.language_data = language
        ? reinterpret_cast<const std::uint8_t*>(language->data())
        : nullptr;
    result.language_len = language ? language->size() : 0;
    return result;
  }
};

std::vector<OwnedPinnedFontFace> copyPinnedFonts(
    jsi::Runtime& runtime,
    const std::vector<RitoNativePinnedFontFace>& faces) {
  if (faces.empty()) {
    throw std::invalid_argument("Rito requires at least one pinned font face.");
  }
  std::vector<OwnedPinnedFontFace> copied;
  copied.reserve(faces.size());
  for (const auto& face : faces) {
    const auto role = static_cast<std::uint32_t>(face.genericRole);
    if (role > RITO_PINNED_FONT_ROLE_MONOSPACE_V1) {
      throw std::invalid_argument("Pinned font has an unsupported generic role.");
    }
    copied.push_back({
        .bytes = copyBinaryObject(runtime, face.bytes, kMaximumPinnedFontBytes),
        .digest = parseDigest(face.expectedSha256),
        .language = face.language,
        .role = role,
    });
  }
  return copied;
}

template <typename Operation>
AsyncPromise<RitoNativeBufferResult> submitOperation(
    ritojs::reactnative::RitoExecutor& executor,
    jsi::Runtime& runtime,
    const std::shared_ptr<CallInvoker>& jsInvoker,
    Operation operation) {
  AsyncPromise<RitoNativeBufferResult> promise(runtime, jsInvoker);
  if (!executor.submit([promise, operation = std::move(operation)]() mutable {
        try {
          promise.resolve(toNativeResult(operation()));
        } catch (const std::exception& exception) {
          promise.resolve(invalidArgumentResult(exception.what()));
        } catch (...) {
          promise.resolve(invalidArgumentResult("Rito native operation failed with an unknown exception."));
        }
      })) {
    promise.resolve(executorBusyResult());
  }
  return promise;
}

RitoFfiResult invokeOpen(
    std::vector<std::uint8_t> publication,
    std::vector<std::uint8_t> request,
    std::vector<OwnedPinnedFontFace> faces) {
  std::vector<rito_pinned_font_face_v1> ffiFaces;
  ffiFaces.reserve(faces.size());
  for (const auto& face : faces) {
    ffiFaces.push_back(face.toFfi());
  }
  rito_owned_buffer_v1 artifact{};
  rito_owned_buffer_v1 error{};
  const auto status = rito_open_with_pinned_fonts_v1(
      publication.data(), publication.size(), request.data(), request.size(),
      ffiFaces.data(), static_cast<std::uint32_t>(ffiFaces.size()), &artifact, &error);
  return ritojs::reactnative::collectRitoResult(status, &artifact, &error);
}

RitoFfiResult invokeWireRequest(
    std::uint64_t sessionId,
    std::vector<std::uint8_t> request,
    std::uint32_t (*operation)(
        std::uint64_t,
        const std::uint8_t*,
        std::uint64_t,
        rito_owned_buffer_v1*,
        rito_owned_buffer_v1*)) {
  rito_owned_buffer_v1 output{};
  rito_owned_buffer_v1 error{};
  const auto status = operation(sessionId, request.data(), request.size(), &output, &error);
  return ritojs::reactnative::collectRitoResult(status, &output, &error);
}
}  // namespace

RitoBinary Bridging<RitoBinary>::fromJs(
    jsi::Runtime& runtime,
    const jsi::Value& value,
    const std::shared_ptr<CallInvoker>&) {
  if (!value.isObject()) {
    throw jsi::JSError(runtime, "Rito binary values must be Uint8Array instances.");
  }
  return {.bytes = copyBinaryObject(runtime, value.asObject(runtime))};
}

jsi::Object Bridging<RitoBinary>::toJs(
    jsi::Runtime& runtime,
    const RitoBinary& value,
    const std::shared_ptr<CallInvoker>&) {
  jsi::Uint8Array output(runtime, value.bytes.size());
  const auto buffer = output.buffer(runtime);
  if (!value.bytes.empty()) {
    std::memcpy(runtime.data(buffer), value.bytes.data(), value.bytes.size());
  }
  return output;
}

NativeRitoReader::NativeRitoReader(std::shared_ptr<CallInvoker> jsInvoker)
    : NativeRitoReaderCxxSpec(std::move(jsInvoker)) {}

NativeRitoReader::~NativeRitoReader() {
  executor_.close();
}

AsyncPromise<RitoNativeBufferResult> NativeRitoReader::open(
    jsi::Runtime& runtime,
    jsi::Object publication,
    jsi::Object request,
    std::vector<RitoNativePinnedFontFace> fonts) {
  try {
    return submitOperation(
        executor_, runtime, jsInvoker_,
        [publication = copyBinaryObject(runtime, publication, kMaximumPublicationBytes),
         request = copyBinaryObject(runtime, request, kMaximumRequestBytes),
         fonts = copyPinnedFonts(runtime, fonts)]() mutable {
          return invokeOpen(std::move(publication), std::move(request), std::move(fonts));
        });
  } catch (const std::exception& exception) {
    AsyncPromise<RitoNativeBufferResult> promise(runtime, jsInvoker_);
    promise.resolve(invalidArgumentResult(exception.what()));
    return promise;
  }
}

AsyncPromise<RitoNativeBufferResult> NativeRitoReader::readPublication(
    jsi::Runtime& runtime,
    std::string sessionId) {
  try {
    const auto id = parseExternalId(sessionId, "sessionId");
    return submitOperation(executor_, runtime, jsInvoker_, [id] {
      rito_owned_buffer_v1 output{};
      rito_owned_buffer_v1 error{};
      const auto status = rito_read_publication_v1(id, &output, &error);
      return ritojs::reactnative::collectRitoResult(status, &output, &error);
    });
  } catch (const std::exception& exception) {
    AsyncPromise<RitoNativeBufferResult> promise(runtime, jsInvoker_);
    promise.resolve(invalidArgumentResult(exception.what()));
    return promise;
  }
}

AsyncPromise<RitoNativeBufferResult> NativeRitoReader::requestArtifact(
    jsi::Runtime& runtime,
    std::string sessionId,
    jsi::Object request) {
  try {
    const auto id = parseExternalId(sessionId, "sessionId");
    return submitOperation(executor_, runtime, jsInvoker_, [id, request = copyBinaryObject(runtime, request, kMaximumRequestBytes)] {
      return invokeWireRequest(id, request, rito_request_artifact_v1);
    });
  } catch (const std::exception& exception) {
    AsyncPromise<RitoNativeBufferResult> promise(runtime, jsInvoker_);
    promise.resolve(invalidArgumentResult(exception.what()));
    return promise;
  }
}

AsyncPromise<RitoNativeBufferResult> NativeRitoReader::requestAdjacent(
    jsi::Runtime& runtime,
    std::string sessionId,
    jsi::Object request) {
  try {
    const auto id = parseExternalId(sessionId, "sessionId");
    return submitOperation(executor_, runtime, jsInvoker_, [id, request = copyBinaryObject(runtime, request, kMaximumRequestBytes)] {
      return invokeWireRequest(id, request, rito_request_adjacent_v1);
    });
  } catch (const std::exception& exception) {
    AsyncPromise<RitoNativeBufferResult> promise(runtime, jsInvoker_);
    promise.resolve(invalidArgumentResult(exception.what()));
    return promise;
  }
}

AsyncPromise<RitoNativeBufferResult> NativeRitoReader::peekAdjacent(
    jsi::Runtime& runtime,
    std::string sessionId,
    jsi::Object request) {
  try {
    const auto id = parseExternalId(sessionId, "sessionId");
    return submitOperation(executor_, runtime, jsInvoker_, [id, request = copyBinaryObject(runtime, request, kMaximumRequestBytes)] {
      return invokeWireRequest(id, request, rito_peek_adjacent_v1);
    });
  } catch (const std::exception& exception) {
    AsyncPromise<RitoNativeBufferResult> promise(runtime, jsInvoker_);
    promise.resolve(invalidArgumentResult(exception.what()));
    return promise;
  }
}

AsyncPromise<RitoNativeBufferResult> NativeRitoReader::adoptForeground(
    jsi::Runtime& runtime,
    std::string sessionId,
    jsi::Object request) {
  try {
    const auto id = parseExternalId(sessionId, "sessionId");
    return submitOperation(executor_, runtime, jsInvoker_, [id, request = copyBinaryObject(runtime, request, kMaximumRequestBytes)] {
      return invokeWireRequest(id, request, rito_adopt_foreground_candidate_v1);
    });
  } catch (const std::exception& exception) {
    AsyncPromise<RitoNativeBufferResult> promise(runtime, jsInvoker_);
    promise.resolve(invalidArgumentResult(exception.what()));
    return promise;
  }
}

AsyncPromise<RitoNativeBufferResult> NativeRitoReader::commitPeekedArtifact(
    jsi::Runtime& runtime,
    std::string sessionId,
    jsi::Object request) {
  try {
    const auto id = parseExternalId(sessionId, "sessionId");
    return submitOperation(executor_, runtime, jsInvoker_, [id, request = copyBinaryObject(runtime, request, kMaximumRequestBytes)] {
      return invokeWireRequest(id, request, rito_commit_peeked_artifact_v1);
    });
  } catch (const std::exception& exception) {
    AsyncPromise<RitoNativeBufferResult> promise(runtime, jsInvoker_);
    promise.resolve(invalidArgumentResult(exception.what()));
    return promise;
  }
}

AsyncPromise<RitoNativeBufferResult> NativeRitoReader::advanceBackground(
    jsi::Runtime& runtime,
    std::string sessionId,
    jsi::Object request) {
  try {
    const auto id = parseExternalId(sessionId, "sessionId");
    return submitOperation(executor_, runtime, jsInvoker_, [id, request = copyBinaryObject(runtime, request, kMaximumRequestBytes)] {
      return invokeWireRequest(id, request, rito_advance_background_v1);
    });
  } catch (const std::exception& exception) {
    AsyncPromise<RitoNativeBufferResult> promise(runtime, jsInvoker_);
    promise.resolve(invalidArgumentResult(exception.what()));
    return promise;
  }
}

AsyncPromise<RitoNativeBufferResult> NativeRitoReader::adoptBackground(
    jsi::Runtime& runtime,
    std::string sessionId,
    jsi::Object request) {
  try {
    const auto id = parseExternalId(sessionId, "sessionId");
    return submitOperation(executor_, runtime, jsInvoker_, [id, request = copyBinaryObject(runtime, request, kMaximumRequestBytes)] {
      return invokeWireRequest(id, request, rito_adopt_background_candidate_v1);
    });
  } catch (const std::exception& exception) {
    AsyncPromise<RitoNativeBufferResult> promise(runtime, jsInvoker_);
    promise.resolve(invalidArgumentResult(exception.what()));
    return promise;
  }
}

AsyncPromise<RitoNativeBufferResult> NativeRitoReader::readResource(
    jsi::Runtime& runtime,
    std::string sessionId,
    std::string artifactId,
    double kind,
    std::string href) {
  try {
    const auto session = parseExternalId(sessionId, "sessionId");
    const auto artifact = parseExternalId(artifactId, "artifactId");
    if (!std::isfinite(kind) || kind < RITO_RESOURCE_KIND_IMAGE_V1 ||
        kind > RITO_RESOURCE_KIND_STYLESHEET_V1 || std::floor(kind) != kind) {
      throw std::invalid_argument("resource kind must be an integer declared by rito-ffi.");
    }
    if (href.empty()) {
      throw std::invalid_argument("resource href must not be empty.");
    }
    return submitOperation(executor_, runtime, jsInvoker_, [session, artifact, kind = static_cast<std::uint32_t>(kind), href = std::move(href)] {
      rito_owned_buffer_v1 output{};
      rito_owned_buffer_v1 error{};
      const auto status = rito_read_resource_v1(
          session, artifact, kind,
          reinterpret_cast<const std::uint8_t*>(href.data()), href.size(), &output, &error);
      return ritojs::reactnative::collectRitoResult(status, &output, &error);
    });
  } catch (const std::exception& exception) {
    AsyncPromise<RitoNativeBufferResult> promise(runtime, jsInvoker_);
    promise.resolve(invalidArgumentResult(exception.what()));
    return promise;
  }
}

AsyncPromise<RitoNativeBufferResult> NativeRitoReader::search(
    jsi::Runtime& runtime,
    std::string sessionId,
    jsi::Object request) {
  try {
    const auto id = parseExternalId(sessionId, "sessionId");
    return submitOperation(executor_, runtime, jsInvoker_, [id, request = copyBinaryObject(runtime, request, kMaximumRequestBytes)] {
      return invokeWireRequest(id, request, rito_search_v1);
    });
  } catch (const std::exception& exception) {
    AsyncPromise<RitoNativeBufferResult> promise(runtime, jsInvoker_);
    promise.resolve(invalidArgumentResult(exception.what()));
    return promise;
  }
}

AsyncPromise<RitoNativeBufferResult> NativeRitoReader::textRangeGeometry(
    jsi::Runtime& runtime,
    std::string sessionId,
    jsi::Object request) {
  try {
    const auto id = parseExternalId(sessionId, "sessionId");
    return submitOperation(executor_, runtime, jsInvoker_, [id, request = copyBinaryObject(runtime, request, kMaximumRequestBytes)] {
      return invokeWireRequest(id, request, rito_get_text_range_geometry_v1);
    });
  } catch (const std::exception& exception) {
    AsyncPromise<RitoNativeBufferResult> promise(runtime, jsInvoker_);
    promise.resolve(invalidArgumentResult(exception.what()));
    return promise;
  }
}

AsyncPromise<RitoNativeBufferResult> NativeRitoReader::readFootnote(
    jsi::Runtime& runtime,
    std::string sessionId,
    std::string artifactId,
    std::string key) {
  try {
    const auto session = parseExternalId(sessionId, "sessionId");
    const auto artifact = parseExternalId(artifactId, "artifactId");
    if (key.empty()) throw std::invalid_argument("footnote key must not be empty.");
    return submitOperation(executor_, runtime, jsInvoker_, [session, artifact, key = std::move(key)] {
      rito_owned_buffer_v1 output{};
      rito_owned_buffer_v1 error{};
      const auto status = rito_read_footnote_v1(
          session, artifact, reinterpret_cast<const std::uint8_t*>(key.data()), key.size(), &output, &error);
      return ritojs::reactnative::collectRitoResult(status, &output, &error);
    });
  } catch (const std::exception& exception) {
    AsyncPromise<RitoNativeBufferResult> promise(runtime, jsInvoker_);
    promise.resolve(invalidArgumentResult(exception.what()));
    return promise;
  }
}

AsyncPromise<RitoNativeBufferResult> NativeRitoReader::releaseArtifact(
    jsi::Runtime& runtime,
    std::string sessionId,
    std::string artifactId) {
  try {
    const auto session = parseExternalId(sessionId, "sessionId");
    const auto artifact = parseExternalId(artifactId, "artifactId");
    return submitOperation(executor_, runtime, jsInvoker_, [session, artifact] {
      rito_owned_buffer_v1 error{};
      const auto status = rito_release_artifact_v1(session, artifact, &error);
      rito_owned_buffer_v1 output{};
      return ritojs::reactnative::collectRitoResult(status, &output, &error);
    });
  } catch (const std::exception& exception) {
    AsyncPromise<RitoNativeBufferResult> promise(runtime, jsInvoker_);
    promise.resolve(invalidArgumentResult(exception.what()));
    return promise;
  }
}

AsyncPromise<RitoNativeBufferResult> NativeRitoReader::dispose(
    jsi::Runtime& runtime,
    std::string sessionId) {
  try {
    const auto session = parseExternalId(sessionId, "sessionId");
    return submitOperation(executor_, runtime, jsInvoker_, [session] {
      rito_owned_buffer_v1 error{};
      const auto status = rito_dispose_v1(session, &error);
      rito_owned_buffer_v1 output{};
      return ritojs::reactnative::collectRitoResult(status, &output, &error);
    });
  } catch (const std::exception& exception) {
    AsyncPromise<RitoNativeBufferResult> promise(runtime, jsInvoker_);
    promise.resolve(invalidArgumentResult(exception.what()));
    return promise;
  }
}

}  // namespace facebook::react
