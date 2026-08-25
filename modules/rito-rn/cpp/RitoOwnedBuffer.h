#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include <rito_ffi.h>

namespace ritojs::reactnative {

struct RitoFfiResult final {
  std::uint32_t status{0};
  std::vector<std::uint8_t> data;
  std::string error;
};

std::vector<std::uint8_t> copyOwnedBuffer(
    rito_owned_buffer_v1* buffer,
    const char* field);
std::string copyOwnedError(rito_owned_buffer_v1* buffer);
RitoFfiResult collectRitoResult(
    std::uint32_t status,
    rito_owned_buffer_v1* data,
    rito_owned_buffer_v1* error);

}  // namespace ritojs::reactnative
