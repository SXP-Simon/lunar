#pragma once

#include <rito_ffi.h>

/*
 * Rito 2.0.0 exports pinned-font opening from Rust, while the public header
 * omits the declaration. This mirrors the Rust C ABI until the header adds it.
 */
#ifndef RITO_PINNED_FONT_ROLE_SERIF
#ifdef __cplusplus
extern "C" {
#endif
#define RITO_PINNED_FONT_ROLE_SERIF UINT32_C(0)
#define RITO_PINNED_FONT_ROLE_SANS_SERIF UINT32_C(1)
#define RITO_PINNED_FONT_ROLE_MONOSPACE UINT32_C(2)

typedef struct rito_pinned_font_face {
  const uint8_t *bytes_data;
  uint64_t bytes_len;
  uint8_t sha256_hex[64];
  uint32_t generic_role;
  const uint8_t *language_data;
  uint64_t language_len;
} rito_pinned_font_face;

uint32_t rito_open_with_pinned_fonts(
    const uint8_t *publication_data,
    uint64_t publication_len,
    const uint8_t *request_data,
    uint64_t request_len,
    const rito_pinned_font_face *faces,
    uint32_t face_count,
    rito_owned_buffer *artifact_out,
    rito_owned_buffer *error_out);
#ifdef __cplusplus
}
#endif
#endif
