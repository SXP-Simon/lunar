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

# react-native-worklets is built as an autolinked Android library rather than
# a Prefab package. This matches Expo Modules Core's own fallback linkage.
if(CMAKE_BUILD_TYPE MATCHES "Debug")
  set(WORKLETS_BUILD_TYPE "debug")
else()
  set(WORKLETS_BUILD_TYPE "release")
endif()
add_library(worklets SHARED IMPORTED)
set_target_properties(worklets PROPERTIES
  IMPORTED_LOCATION
  "${REACT_NATIVE_WORKLETS_DIR}/android/build/intermediates/cmake/${WORKLETS_BUILD_TYPE}/obj/${ANDROID_ABI}/libworklets.so"
)

add_library(lunarreader SHARED
  src/main/cpp/ReaderWorkletRuntimeBridge.cpp
)

target_include_directories(lunarreader PRIVATE
  "${EXPO_MODULES_CORE_DIR}/android/src/main/cpp"
  "${REACT_NATIVE_WORKLETS_DIR}/Common/cpp"
  "${REACT_NATIVE_DIR}/ReactAndroid/src/main/jni"
)

target_link_libraries(lunarreader PRIVATE
  ${LOG_LIB}
  fbjni::fbjni
  ReactAndroid::jsi
  ReactAndroid::reactnative
  worklets
)
