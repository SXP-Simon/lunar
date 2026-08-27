export type RitoNativeStatus =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 255;

export class RitoNativeError extends Error {
  constructor(
    readonly status: RitoNativeStatus,
    message: string,
    readonly operation: string,
  ) {
    super(message);
    this.name = 'RitoNativeError';
  }
}

export class RitoNativeSessionInvalidatedError extends RitoNativeError {
  constructor(
    readonly requestId: bigint,
    readonly cleanupError: unknown,
    readonly disposeError?: unknown,
  ) {
    const suffix = disposeError === undefined ? '' : ` Session disposal also failed: ${String(disposeError)}`;
    super(11, `Rito session was invalidated while releasing request ${requestId.toString()}: ${String(cleanupError)}.${suffix}`, 'cleanup');
    this.name = 'RitoNativeSessionInvalidatedError';
  }
}

export class RitoNativeModuleUnavailableError extends Error {
  constructor() {
    super('The Rito Nitro Module is unavailable in this build.');
    this.name = 'RitoNativeModuleUnavailableError';
  }
}

export class RitoWireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RitoWireError';
  }
}
