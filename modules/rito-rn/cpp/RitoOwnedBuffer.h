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
    rito_owned_buffer* buffer,
    const char* field);
std::string copyOwnedError(rito_owned_buffer* buffer);
RitoFfiResult collectRitoResult(
    std::uint32_t status,
    rito_owned_buffer* data,
    rito_owned_buffer* error);

}  // namespace ritojs::reactnative
