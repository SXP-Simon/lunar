cmake_minimum_required(VERSION 3.22.1)
project(RitoNitro)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(PACKAGE_NAME RitoNitro)

if(NOT DEFINED RITO_FFI_SOURCE_DIR OR RITO_FFI_SOURCE_DIR STREQUAL "")
  set(RITO_FFI_SOURCE_DIR "${CMAKE_CURRENT_LIST_DIR}/../native/rito")
endif()
if(NOT DEFINED RITO_FFI_LIBRARY_ROOT OR RITO_FFI_LIBRARY_ROOT STREQUAL "")
  set(RITO_FFI_LIBRARY_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../../android/app/build/rito-ffi")
endif()

set(RITO_FFI_LIBRARY "${RITO_FFI_LIBRARY_ROOT}/${ANDROID_ABI}/release/librito_ffi.a")
if(NOT EXISTS "${RITO_FFI_LIBRARY}")
  message(FATAL_ERROR "Rito FFI library was not generated for ${ANDROID_ABI}: ${RITO_FFI_LIBRARY}")
endif()

add_library(rito_ffi STATIC IMPORTED GLOBAL)
set_target_properties(rito_ffi PROPERTIES IMPORTED_LOCATION "${RITO_FFI_LIBRARY}")

add_library(${PACKAGE_NAME} SHARED
  src/main/cpp/cpp-adapter.cpp
  ../cpp/HybridRitoNitro.cpp
  ../cpp/RitoExecutor.cpp
  ../cpp/RitoOwnedBuffer.cpp
)

include(${CMAKE_CURRENT_LIST_DIR}/../nitrogen/generated/android/RitoNitro+autolinking.cmake)

find_package(fbjni REQUIRED CONFIG)
find_package(ReactAndroid REQUIRED CONFIG)
find_library(LOG_LIB log)

target_compile_options(${PACKAGE_NAME} PRIVATE -frtti -fexceptions)
target_include_directories(${PACKAGE_NAME} PUBLIC
  ../cpp
  ../nitrogen/generated/shared/c++
  "${RITO_FFI_SOURCE_DIR}/crates/rito-ffi/include"
)

target_link_libraries(${PACKAGE_NAME}
  ${LOG_LIB}
  fbjni::fbjni
  ReactAndroid::jsi
  ReactAndroid::reactnative
  react-native-nitro-modules::NitroModules
  rito_ffi
  android
)
