#pragma once

#include <rito_ffi.h>

/*
 * Rito 1.0.0 exports these two reader operations, while the checked-in
 * public header predates their declarations. Keep the declarations local to
 * the bridge until the upstream header contains the same ABI definitions.
 */
#ifndef RITO_RN_PEEK_ABI_EXTENSIONS
#define RITO_RN_PEEK_ABI_EXTENSIONS
#ifdef __cplusplus
extern "C" {
#endif

uint32_t rito_peek_adjacent_v1(
    uint64_t session_id,
    const uint8_t* request_data,
    uint64_t request_len,
    rito_owned_buffer_v1* artifact_out,
    rito_owned_buffer_v1* error_out);

uint32_t rito_commit_peeked_artifact_v1(
    uint64_t session_id,
    const uint8_t* request_data,
    uint64_t request_len,
    rito_owned_buffer_v1* ack_out,
    rito_owned_buffer_v1* error_out);

#ifdef __cplusplus
}
#endif
#endif
