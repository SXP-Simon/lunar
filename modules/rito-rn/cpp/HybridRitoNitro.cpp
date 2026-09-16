#include "HybridRitoNitro.hpp"

#include <array>
#include <charconv>
#include <cmath>
#include <cstring>
#include <functional>
#include <stdexcept>
#include <utility>

#include "RitoAbiExtensions.h"
#include "RitoOwnedBuffer.h"
#include "RitoPinnedFontAbi.h"

namespace margelo::nitro::ritonitro {
namespace {
using ritojs::reactnative::RitoFfiResult;

constexpr std::uint64_t kMaximumExternalId = 0x7fff'ffff'ffff'ffffULL;
constexpr std::uint64_t kMaximumPublicationBytes = 512ULL * 1024ULL * 1024ULL;
constexpr std::uint64_t kMaximumRequestBytes = 16ULL * 1024ULL * 1024ULL;
constexpr std::uint64_t kMaximumPinnedFontBytes = 64ULL * 1024ULL * 1024ULL;

std::shared_ptr<ArrayBuffer> emptyBuffer() {
  return ArrayBuffer::move(std::vector<std::uint8_t>{});
}

RitoNitroResult toNativeResult(RitoFfiResult result) {
  return RitoNitroResult(static_cast<double>(result.status), ArrayBuffer::move(std::move(result.data)), std::move(result.error));
}

RitoNitroResult invalidResult(std::string message) {
  return RitoNitroResult(static_cast<double>(RITO_STATUS_INVALID_ARGUMENT), emptyBuffer(), std::move(message));
}

RitoNitroResult busyResult() {
  return RitoNitroResult(static_cast<double>(RITO_STATUS_BUSY), emptyBuffer(), "The Rito Nitro executor queue is full.");
}

std::uint64_t parseExternalId(const std::string& value, const char* field) {
  if (value.empty()) throw std::invalid_argument(std::string(field) + " must be a positive decimal integer.");
  std::uint64_t result{};
  const auto [pointer, error] = std::from_chars(value.data(), value.data() + value.size(), result, 10);
  if (error != std::errc{} || pointer != value.data() + value.size() || result == 0 || result > kMaximumExternalId) {
    throw std::invalid_argument(std::string(field) + " must be within 1..=INT64_MAX.");
  }
  return result;
}

std::vector<std::uint8_t> copyBinary(const std::shared_ptr<ArrayBuffer>& input, std::uint64_t maximum, const char* field) {
  if (!input) throw std::invalid_argument(std::string(field) + " must not be null.");
  const auto length = input->size();
  if (length > maximum) throw std::invalid_argument(std::string(field) + " exceeds its ABI limit.");
  const auto* data = input->data();
  if (length != 0 && data == nullptr) throw std::invalid_argument(std::string(field) + " has no accessible data.");
  if (length == 0) return {};
  return {data, data + length};
}

std::array<std::uint8_t, 64> parseDigest(const std::string& digest) {
  if (digest.size() != 64) throw std::invalid_argument("Pinned font SHA-256 must contain 64 hexadecimal digits.");
  std::array<std::uint8_t, 64> result{};
  for (std::size_t index = 0; index < digest.size(); ++index) {
    const char value = digest[index];
    if (!((value >= '0' && value <= '9') || (value >= 'a' && value <= 'f'))) {
      throw std::invalid_argument("Pinned font SHA-256 must use lowercase hexadecimal digits.");
    }
    result[index] = static_cast<std::uint8_t>(value);
  }
  return result;
}

struct OwnedPinnedFont final {
  std::vector<std::uint8_t> bytes;
  std::array<std::uint8_t, 64> digest{};
  std::optional<std::string> language;
  std::uint32_t role{};

  rito_pinned_font_face toFfi() const {
    rito_pinned_font_face result{};
    result.bytes_data = bytes.data();
    result.bytes_len = bytes.size();
    std::memcpy(result.sha256_hex, digest.data(), digest.size());
    result.generic_role = role;
    result.language_data = language ? reinterpret_cast<const std::uint8_t*>(language->data()) : nullptr;
    result.language_len = language ? language->size() : 0;
    return result;
  }
};

std::vector<OwnedPinnedFont> copyFonts(const std::vector<RitoNitroPinnedFontFace>& faces) {
  if (faces.empty()) throw std::invalid_argument("Rito requires at least one pinned font face.");
  std::vector<OwnedPinnedFont> result;
  result.reserve(faces.size());
  for (const auto& face : faces) {
    const auto role = static_cast<std::uint32_t>(face.genericRole);
    if (role > RITO_PINNED_FONT_ROLE_MONOSPACE) throw std::invalid_argument("Pinned font has an unsupported generic role.");
    result.push_back({copyBinary(face.bytes, kMaximumPinnedFontBytes, "Pinned font bytes"), parseDigest(face.expectedSha256), face.language, role});
  }
  return result;
}

template <typename Operation>
std::shared_ptr<Promise<RitoNitroResult>> submit(ritojs::reactnative::RitoExecutor& executor, Operation operation) {
  auto promise = Promise<RitoNitroResult>::create();
  if (!executor.submit([promise, operation = std::move(operation)]() mutable {
        try {
          promise->resolve(toNativeResult(operation()));
        } catch (const std::exception& exception) {
          promise->resolve(invalidResult(exception.what()));
        } catch (...) {
          promise->resolve(invalidResult("Rito native operation failed with an unknown exception."));
        }
      })) {
    promise->resolve(busyResult());
  }
  return promise;
}

template <typename Operation>
std::shared_ptr<Promise<RitoNitroResult>> submitChecked(ritojs::reactnative::RitoExecutor& executor, Operation operation) {
  try {
    return submit(executor, std::move(operation));
  } catch (const std::exception& exception) {
    return Promise<RitoNitroResult>::resolved(invalidResult(exception.what()));
  }
}

RitoFfiResult invokeOpen(std::vector<std::uint8_t> publication, std::vector<std::uint8_t> request, std::vector<OwnedPinnedFont> fonts) {
  std::vector<rito_pinned_font_face> ffiFonts;
  ffiFonts.reserve(fonts.size());
  for (const auto& font : fonts) ffiFonts.push_back(font.toFfi());
  rito_owned_buffer artifact{};
  rito_owned_buffer error{};
  const auto status = rito_open_with_pinned_fonts(publication.data(), publication.size(), request.data(), request.size(), ffiFonts.data(), static_cast<std::uint32_t>(ffiFonts.size()), &artifact, &error);
  return ritojs::reactnative::collectRitoResult(status, &artifact, &error);
}

using WireOperation = std::uint32_t (*)(std::uint64_t, const std::uint8_t*, std::uint64_t, rito_owned_buffer*, rito_owned_buffer*);

RitoFfiResult invokeWire(std::uint64_t session, std::vector<std::uint8_t> request, WireOperation operation) {
  rito_owned_buffer output{};
  rito_owned_buffer error{};
  const auto status = operation(session, request.data(), request.size(), &output, &error);
  return ritojs::reactnative::collectRitoResult(status, &output, &error);
}
}  // namespace

HybridRitoNitro::HybridRitoNitro() : HybridObject(TAG), HybridRitoNitroSpec() {}
HybridRitoNitro::~HybridRitoNitro() { executor_.close(); }

std::shared_ptr<Promise<RitoNitroResult>> HybridRitoNitro::open(const std::shared_ptr<ArrayBuffer>& publication, const std::shared_ptr<ArrayBuffer>& request, const std::vector<RitoNitroPinnedFontFace>& fonts) {
  return submitChecked(executor_, [publication = copyBinary(publication, kMaximumPublicationBytes, "publication"), request = copyBinary(request, kMaximumRequestBytes, "request"), fonts = copyFonts(fonts)]() mutable {
    return invokeOpen(std::move(publication), std::move(request), std::move(fonts));
  });
}

std::shared_ptr<Promise<RitoNitroResult>> HybridRitoNitro::readPublication(const std::string& sessionId) {
  return submitChecked(executor_, [session = parseExternalId(sessionId, "sessionId")] {
    rito_owned_buffer output{}; rito_owned_buffer error{};
    return ritojs::reactnative::collectRitoResult(rito_read_publication(session, &output, &error), &output, &error);
  });
}

#define RITO_WIRE_METHOD(name, ffi) \
std::shared_ptr<Promise<RitoNitroResult>> HybridRitoNitro::name(const std::string& sessionId, const std::shared_ptr<ArrayBuffer>& request) { \
  return submitChecked(executor_, [session = parseExternalId(sessionId, "sessionId"), request = copyBinary(request, kMaximumRequestBytes, "request")]() mutable { return invokeWire(session, std::move(request), ffi); }); \
}

RITO_WIRE_METHOD(requestArtifact, rito_request_artifact)
RITO_WIRE_METHOD(requestAdjacent, rito_request_adjacent)
RITO_WIRE_METHOD(peekAdjacent, rito_peek_adjacent)
RITO_WIRE_METHOD(adoptForeground, rito_adopt_foreground_candidate)
RITO_WIRE_METHOD(commitPeekedArtifact, rito_commit_peeked_artifact)
RITO_WIRE_METHOD(advanceBackground, rito_advance_background)
RITO_WIRE_METHOD(adoptBackground, rito_adopt_background_candidate)
RITO_WIRE_METHOD(search, rito_search)
RITO_WIRE_METHOD(textRangeGeometry, rito_get_text_range_geometry)

#undef RITO_WIRE_METHOD

std::shared_ptr<Promise<RitoNitroResult>> HybridRitoNitro::readResource(const std::string& sessionId, const std::string& artifactId, double kind, const std::string& href) {
  return submitChecked(executor_, [session = parseExternalId(sessionId, "sessionId"), artifact = parseExternalId(artifactId, "artifactId"), kind, href] {
    if (!std::isfinite(kind) || kind < RITO_RESOURCE_KIND_IMAGE || kind > RITO_RESOURCE_KIND_STYLESHEET || std::floor(kind) != kind) throw std::invalid_argument("resource kind must be an integer declared by rito-ffi.");
    if (href.empty()) throw std::invalid_argument("resource href must not be empty.");
    rito_owned_buffer output{}; rito_owned_buffer error{};
    const auto status = rito_read_resource(session, artifact, static_cast<std::uint32_t>(kind), reinterpret_cast<const std::uint8_t*>(href.data()), href.size(), &output, &error);
    return ritojs::reactnative::collectRitoResult(status, &output, &error);
  });
}

std::shared_ptr<Promise<RitoNitroResult>> HybridRitoNitro::readFootnote(const std::string& sessionId, const std::string& artifactId, const std::string& key) {
  return submitChecked(executor_, [session = parseExternalId(sessionId, "sessionId"), artifact = parseExternalId(artifactId, "artifactId"), key] {
    if (key.empty()) throw std::invalid_argument("footnote key must not be empty.");
    rito_owned_buffer output{}; rito_owned_buffer error{};
    const auto status = rito_read_footnote(session, artifact, reinterpret_cast<const std::uint8_t*>(key.data()), key.size(), &output, &error);
    return ritojs::reactnative::collectRitoResult(status, &output, &error);
  });
}

std::shared_ptr<Promise<RitoNitroResult>> HybridRitoNitro::releaseArtifact(const std::string& sessionId, const std::string& artifactId) {
  return submitChecked(executor_, [session = parseExternalId(sessionId, "sessionId"), artifact = parseExternalId(artifactId, "artifactId")] {
    rito_owned_buffer output{}; rito_owned_buffer error{};
    const auto status = rito_release_artifact(session, artifact, &error);
    return ritojs::reactnative::collectRitoResult(status, &output, &error);
  });
}

std::shared_ptr<Promise<RitoNitroResult>> HybridRitoNitro::disposeSession(const std::string& sessionId) {
  return submitChecked(executor_, [session = parseExternalId(sessionId, "sessionId")] {
    rito_owned_buffer output{}; rito_owned_buffer error{};
    const auto status = rito_dispose(session, &error);
    return ritojs::reactnative::collectRitoResult(status, &output, &error);
  });
}

}  // namespace margelo::nitro::ritonitro
