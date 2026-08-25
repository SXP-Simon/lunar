cmake_minimum_required(VERSION 3.22.1)
project(rito_react_native)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT DEFINED REACT_NATIVE_DIR)
  message(FATAL_ERROR "REACT_NATIVE_DIR must point to react-native.")
endif()
if(NOT DEFINED RITO_FFI_SOURCE_DIR OR RITO_FFI_SOURCE_DIR STREQUAL "")
  message(FATAL_ERROR "RITO_FFI_SOURCE_DIR must point to the pinned Rito source checkout.")
endif()
if(NOT DEFINED RITO_FFI_LIBRARY_ROOT)
  message(FATAL_ERROR "RITO_FFI_LIBRARY_ROOT must point to Cargo's Android output directory.")
endif()

find_package(fbjni REQUIRED CONFIG)
find_package(ReactAndroid REQUIRED CONFIG)
find_library(LOG_LIB log)

include("${REACT_NATIVE_DIR}/ReactAndroid/cmake-utils/folly-flags.cmake")
include("${REACT_NATIVE_DIR}/ReactCommon/cmake-utils/react-native-flags.cmake")

set(RITO_FFI_LIBRARY "${RITO_FFI_LIBRARY_ROOT}/${ANDROID_ABI}/release/librito_ffi.a")
if(NOT EXISTS "${RITO_FFI_LIBRARY}")
  message(FATAL_ERROR "Rito FFI library was not generated for ${ANDROID_ABI}.")
endif()

add_library(rito_ffi STATIC IMPORTED GLOBAL)
set_target_properties(rito_ffi PROPERTIES IMPORTED_LOCATION "${RITO_FFI_LIBRARY}")

add_library(rito_react_native SHARED
  ../cpp/RitoExecutor.cpp
  ../cpp/RitoOwnedBuffer.cpp
  ../cpp/NativeRitoReader.cpp
)

target_compile_reactnative_options(rito_react_native PRIVATE)
target_compile_options(rito_react_native PRIVATE -frtti -fexceptions ${folly_FLAGS})
target_include_directories(rito_react_native PRIVATE
  ../cpp
  "${RITO_FFI_SOURCE_DIR}/crates/rito-ffi/include"
)
target_link_libraries(rito_react_native PRIVATE
  ${LOG_LIB}
  fbjni::fbjni
  ReactAndroid::jsi
  ReactAndroid::reactnative
  rito_ffi
)
