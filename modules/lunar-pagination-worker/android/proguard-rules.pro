# The Reader Worker bridge reaches Kotlin-internal lifecycle methods through
# reflection because Expo SDK 57 does not expose a public installer.
-keepclassmembers class expo.modules.kotlin.runtime.WorkletRuntime {
  public void install*(long);
  public void deallocate*();
}

# fbjni resolves this class from the descriptor embedded in the C++ bridge.
-keep class expo.modules.lunarpaginationworker.PaginationWorkerRuntimeBridge {
  *;
}
