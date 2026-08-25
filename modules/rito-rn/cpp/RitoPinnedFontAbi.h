#pragma once

#include <rito_ffi.h>

/*
 * rito-ffi V1 exposes pinned-font opening from Rust. The 1.0.0 public header
 * predates that exported symbol, so this declaration mirrors the repr(C)
 * Rust contract until the upstream header carries it. The upstream PR adds
 * the same declaration to crates/rito-ffi/include/rito_ffi.h.
 */
#ifndef RITO_PINNED_FONT_ROLE_SERIF_V1
#ifdef __cplusplus
extern "C" {
#endif
#define RITO_PINNED_FONT_ROLE_SERIF_V1 UINT32_C(0)
#define RITO_PINNED_FONT_ROLE_SANS_SERIF_V1 UINT32_C(1)
#define RITO_PINNED_FONT_ROLE_MONOSPACE_V1 UINT32_C(2)

typedef struct rito_pinned_font_face_v1 {
  const uint8_t *bytes_data;
  uint64_t bytes_len;
  uint8_t sha256_hex[64];
  uint32_t generic_role;
  const uint8_t *language_data;
  uint64_t language_len;
} rito_pinned_font_face_v1;

uint32_t rito_open_with_pinned_fonts_v1(
    const uint8_t *publication_data,
    uint64_t publication_len,
    const uint8_t *request_data,
    uint64_t request_len,
    const rito_pinned_font_face_v1 *faces,
    uint32_t face_count,
    rito_owned_buffer_v1 *artifact_out,
    rito_owned_buffer_v1 *error_out);
#ifdef __cplusplus
}
#endif
#endif
