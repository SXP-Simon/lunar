#include "RitoOwnedBuffer.h"

#include <algorithm>
#include <limits>
#include <stdexcept>

namespace ritojs::reactnative {

namespace {
// Keep the bridge limit aligned with Rito core's MAX_WIRE_BYTES (256 MiB).
constexpr std::uint64_t kMaximumWireBytes = 256ULL * 1024ULL * 1024ULL;

std::vector<std::uint8_t> copyBuffer(rito_owned_buffer* buffer, const char* field) {
  if (buffer == nullptr) {
    throw std::invalid_argument(std::string(field) + " descriptor is null.");
  }
  if (buffer->len == 0) {
    return {};
  }
  if (buffer->data == nullptr || buffer->len > buffer->capacity || buffer->len > kMaximumWireBytes) {
    throw std::runtime_error(std::string(field) + " is outside the supported Rito ABI bounds.");
  }
  const auto length = static_cast<std::size_t>(buffer->len);
  return {buffer->data, buffer->data + length};
}
}  // namespace

std::vector<std::uint8_t> copyOwnedBuffer(rito_owned_buffer* buffer, const char* field) {
  try {
    const auto result = copyBuffer(buffer, field);
    rito_buffer_free(buffer);
    return result;
  } catch (...) {
    rito_buffer_free(buffer);
    throw;
  }
}

std::string copyOwnedError(rito_owned_buffer* buffer) {
  const auto bytes = copyOwnedBuffer(buffer, "Rito error buffer");
  return {bytes.begin(), bytes.end()};
}

RitoFfiResult collectRitoResult(
    std::uint32_t status,
    rito_owned_buffer* data,
    rito_owned_buffer* error) {
  RitoFfiResult result{.status = status};
  try {
    if (status == RITO_STATUS_OK) {
      result.data = copyOwnedBuffer(data, "Rito output buffer");
      rito_buffer_free(error);
      return result;
    }
    rito_buffer_free(data);
    result.error = copyOwnedError(error);
    if (result.error.empty()) {
      result.error = "Rito native call failed without a diagnostic.";
    }
    return result;
  } catch (const std::exception& exception) {
    rito_buffer_free(data);
    rito_buffer_free(error);
    return {
        .status = RITO_STATUS_ENGINE_ERROR,
        .error = std::string("Rito ABI output validation failed: ") + exception.what(),
    };
  }
}

}  // namespace ritojs::reactnative
