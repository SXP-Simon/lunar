cmake_minimum_required(VERSION 3.22.1)
project(lunarreader)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT DEFINED EXPO_MODULES_CORE_DIR OR NOT EXISTS "${EXPO_MODULES_CORE_DIR}")
  message(FATAL_ERROR "EXPO_MODULES_CORE_DIR must point to expo-modules-core.")
endif()
if(NOT DEFINED REACT_NATIVE_DIR OR NOT EXISTS "${REACT_NATIVE_DIR}")
  message(FATAL_ERROR "REACT_NATIVE_DIR must point to react-native.")
endif()
if(NOT DEFINED REACT_NATIVE_WORKLETS_DIR OR NOT EXISTS "${REACT_NATIVE_WORKLETS_DIR}")
  message(FATAL_ERROR "REACT_NATIVE_WORKLETS_DIR must point to react-native-worklets.")
endif()

find_package(fbjni REQUIRED CONFIG)
find_package(ReactAndroid REQUIRED CONFIG)
find_library(LOG_LIB log)

# Keep the ABI and Folly feature configuration identical to the Worklets and
# Expo Modules Core libraries whose C++ types this bridge consumes.
include("${REACT_NATIVE_DIR}/ReactAndroid/cmake-utils/folly-flags.cmake")
include("${REACT_NATIVE_DIR}/ReactCommon/cmake-utils/react-native-flags.cmake")

# react-native-worklets is built as an autolinked Android library rather than
# a Prefab package. This matches Expo Modules Core's own fallback linkage.
if(CMAKE_BUILD_TYPE MATCHES "Debug")
  set(NATIVE_DEPENDENCY_BUILD_TYPE "debug")
else()
  set(NATIVE_DEPENDENCY_BUILD_TYPE "release")
endif()

# Expo Modules Core enables Prefab for consuming React Native dependencies,
# but it does not publish its own CMake package. Link the shared library built
# by its Android project, whose Gradle task is ordered before this target.
add_library(expo-modules-core SHARED IMPORTED)
set_target_properties(expo-modules-core PROPERTIES
  IMPORTED_LOCATION
  "${EXPO_MODULES_CORE_DIR}/android/build/intermediates/cmake/${NATIVE_DEPENDENCY_BUILD_TYPE}/obj/${ANDROID_ABI}/libexpo-modules-core.so"
)

add_library(worklets SHARED IMPORTED)
set_target_properties(worklets PROPERTIES
  IMPORTED_LOCATION
  "${REACT_NATIVE_WORKLETS_DIR}/android/build/intermediates/cmake/${NATIVE_DEPENDENCY_BUILD_TYPE}/obj/${ANDROID_ABI}/libworklets.so"
)

add_library(lunarreader SHARED
  src/main/cpp/ReaderWorkletRuntimeBridge.cpp
)

target_compile_reactnative_options(lunarreader PRIVATE)
target_compile_options(lunarreader PRIVATE
  -frtti
  -fexceptions
  ${folly_FLAGS}
)

target_include_directories(lunarreader PRIVATE
  "${EXPO_MODULES_CORE_DIR}/android/src/main/cpp"
  "${EXPO_MODULES_CORE_DIR}/android/src/jsi"
  "${EXPO_MODULES_CORE_DIR}/common/cpp/JSI"
  "${REACT_NATIVE_WORKLETS_DIR}/Common/cpp"
  "${REACT_NATIVE_DIR}/ReactAndroid/src/main/jni"
)

target_link_libraries(lunarreader PRIVATE
  ${LOG_LIB}
  fbjni::fbjni
  expo-modules-core
  ReactAndroid::jsi
  ReactAndroid::reactnative
  worklets
)
