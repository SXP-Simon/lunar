#pragma once

#include <rito_ffi.h>

/*
 * Rito 2.0.0 exports these reader operations without public header
 * declarations. Keep the declarations here until the header adds them.
 */
#ifndef RITO_RN_PEEK_ABI_EXTENSIONS
#define RITO_RN_PEEK_ABI_EXTENSIONS
#ifdef __cplusplus
extern "C" {
#endif

uint32_t rito_peek_adjacent(
    uint64_t session_id,
    const uint8_t* request_data,
    uint64_t request_len,
    rito_owned_buffer* artifact_out,
    rito_owned_buffer* error_out);

uint32_t rito_commit_peeked_artifact(
    uint64_t session_id,
    const uint8_t* request_data,
    uint64_t request_len,
    rito_owned_buffer* ack_out,
    rito_owned_buffer* error_out);

#ifdef __cplusplus
}
#endif
#endif
