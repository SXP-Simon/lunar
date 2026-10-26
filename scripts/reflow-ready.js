(() => {
  if (typeof __r!=='function'||!__r.getModules) return {ready:false};
  const modules=[...__r.getModules()];
  const store=modules.find(([,m])=>m.isInitialized&&m.publicModule.exports?.useApplicationSettingsStore)?.[1].publicModule.exports.useApplicationSettingsStore;
  const backend=modules.find(([,m])=>m.verboseName?.endsWith('rito-native-pagination-backend.ts'));
  return {ready:!!store&&!!backend&&store.getState().resumeReadingOnLaunch===false,
    supportsReflow:backend?typeof __r(backend[0]).RitoNativePaginationBackend.prototype.reflow==='function':null};
})();
