# The Reader Worker bridge reaches Kotlin-internal lifecycle methods through
# reflection because Expo SDK 57 does not expose a custom-runtime installer.
-keepclassmembers class expo.modules.kotlin.runtime.WorkletRuntime {
  public void install(long);
  public void deallocate();
}
