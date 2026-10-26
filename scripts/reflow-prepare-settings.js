(() => {
  const modules=[...__r.getModules()].filter(([,m])=>m.isInitialized).map(([,m])=>m.publicModule.exports);
  const settings=modules.find(m=>m?.useApplicationSettingsStore)?.useApplicationSettingsStore;
  if (!settings) throw Error('Settings store is not initialized');
  const previous=settings.getState().resumeReadingOnLaunch;
  settings.getState().setResumeReadingOnLaunch(false);
  return {previousResumeReadingOnLaunch:previous,resumeReadingOnLaunch:settings.getState().resumeReadingOnLaunch};
})();
