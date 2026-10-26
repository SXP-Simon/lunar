(async () => {
  const modules = [...__r.getModules()]
    .filter(([, m]) => m.isInitialized)
    .map(([, m]) => m.publicModule.exports);
  const settings = modules.find(
    (m) => m?.useApplicationSettingsStore,
  )?.useApplicationSettingsStore;
  const previous = settings.getState().resumeReadingOnLaunch;
  settings.getState().setResumeReadingOnLaunch(false);
  modules.find((m) => m?.router?.replace).router.replace("/library");
  for (let i = 0; i < 50; i++) {
    if (
      !globalThis.__lunarPerf?.runtime ||
      globalThis.__lunarPerf.runtime.getSnapshot().phase === "idle"
    )
      break;
    await new Promise((ok) => setTimeout(ok, 100));
  }
  if (
    globalThis.__lunarPerf?.runtime &&
    globalThis.__lunarPerf.runtime.getSnapshot().phase !== "idle"
  )
    throw Error("Reader did not close");
  if (globalThis.__lunarPerf) {
    __lunarPerf.finish();
    delete globalThis.__lunarPerf;
  }
  return {
    previousResumeReadingOnLaunch: previous,
    resumeReadingOnLaunch: settings.getState().resumeReadingOnLaunch,
    readerClosed: true,
  };
})();
