cmake_minimum_required(VERSION 3.22.1)
project(rito_react_native)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT DEFINED REACT_ANDROID_DIR OR REACT_ANDROID_DIR STREQUAL "")
  message(FATAL_ERROR "REACT_ANDROID_DIR must point to React Native's ReactAndroid directory.")
endif()
if(NOT DEFINED PROJECT_BUILD_DIR OR PROJECT_BUILD_DIR STREQUAL "")
  message(FATAL_ERROR "PROJECT_BUILD_DIR must point to the Android app build directory.")
endif()
if(NOT DEFINED RITO_FFI_SOURCE_DIR OR RITO_FFI_SOURCE_DIR STREQUAL "")
  message(FATAL_ERROR "RITO_FFI_SOURCE_DIR must point to the pinned Rito source checkout.")
endif()
if(NOT DEFINED RITO_FFI_LIBRARY_ROOT OR RITO_FFI_LIBRARY_ROOT STREQUAL "")
  message(FATAL_ERROR "RITO_FFI_LIBRARY_ROOT must point to Cargo's Android output directory.")
endif()

if(NOT DEFINED RITO_CODEGEN_DIR OR RITO_CODEGEN_DIR STREQUAL "")
  set(RITO_CODEGEN_DIR "${PROJECT_BUILD_DIR}/generated/source/codegen/jni")
endif()
set(RITO_FFI_LIBRARY "${RITO_FFI_LIBRARY_ROOT}/${ANDROID_ABI}/release/librito_ffi.a")
if(NOT EXISTS "${RITO_FFI_LIBRARY}")
  message(FATAL_ERROR
    "Rito FFI library was not generated for ${ANDROID_ABI}. "
    "The app Gradle task must run before CMake configuration.")
endif()
if(NOT EXISTS "${RITO_CODEGEN_DIR}/CMakeLists.txt")
  message(FATAL_ERROR "Rito Codegen CMakeLists.txt was not generated.")
endif()

find_package(fbjni REQUIRED CONFIG)
find_package(ReactAndroid REQUIRED CONFIG)
find_library(LOG_LIB log)

# ReactNative-application.cmake defines these aliases before autolinking. Keep
# the aliases local as well so the package CMake file can be configured on its
# own during module and CI checks.
if(NOT TARGET fbjni)
  add_library(fbjni ALIAS fbjni::fbjni)
endif()
if(NOT TARGET jsi)
  add_library(jsi ALIAS ReactAndroid::jsi)
endif()
if(NOT TARGET reactnative)
  add_library(reactnative ALIAS ReactAndroid::reactnative)
endif()

include("${REACT_ANDROID_DIR}/cmake-utils/folly-flags.cmake")
include("${REACT_ANDROID_DIR}/../ReactCommon/cmake-utils/react-native-flags.cmake")

# The Codegen object target supplies the generated Java Turbo Module provider
# and keeps the generated JNI sources in the same app native build.
add_subdirectory("${RITO_CODEGEN_DIR}" rito_react_native_codegen)

add_library(rito_ffi STATIC IMPORTED GLOBAL)
set_target_properties(rito_ffi PROPERTIES IMPORTED_LOCATION "${RITO_FFI_LIBRARY}")

# This target is added to the app by React Native's generated Android-autolinking.cmake.
# The generated provider includes NativeRitoReader.h and constructs this class.
add_library(rito_react_native SHARED
  "${CMAKE_CURRENT_LIST_DIR}/../cpp/RitoExecutor.cpp"
  "${CMAKE_CURRENT_LIST_DIR}/../cpp/RitoOwnedBuffer.cpp"
  "${CMAKE_CURRENT_LIST_DIR}/../cpp/NativeRitoReader.cpp"
)

target_compile_reactnative_options(rito_react_native PRIVATE)
target_compile_options(rito_react_native PRIVATE -frtti -fexceptions ${folly_FLAGS})
target_include_directories(rito_react_native PUBLIC
  "${CMAKE_CURRENT_LIST_DIR}/../cpp"
  "${RITO_CODEGEN_DIR}"
  "${RITO_FFI_SOURCE_DIR}/crates/rito-ffi/include"
)
target_link_libraries(rito_react_native PRIVATE
  ${LOG_LIB}
  fbjni::fbjni
  ReactAndroid::jsi
  ReactAndroid::reactnative
  rito_ffi
)
