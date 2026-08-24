# fbjni resolves this class from the descriptor embedded in the C++ bridge.
-keep class expo.modules.lunarpaginationworker.PaginationWorkerRuntimeBridge {
  *;
}

# The JSI HostObject invokes these methods directly through JNI method IDs.
-keep class expo.modules.lunarpaginationworker.ReaderWorkerTextMeasurer {
  *;
}
