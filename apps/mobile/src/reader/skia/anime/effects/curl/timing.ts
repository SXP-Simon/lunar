// Kept apart from the strategy so geometry worklets can read these without an
// import cycle: worklets capture module bindings when they are defined, and a
// cycle would hand them a binding that is not initialized yet.
export const AUTOMATIC_PAGE_TURN_DURATION_MS = 947;
