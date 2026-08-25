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

export class RitoNativeModuleUnavailableError extends Error {
  constructor() {
    super('The NativeRitoReader Turbo Module is unavailable in this build.');
    this.name = 'RitoNativeModuleUnavailableError';
  }
}

export class RitoWireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RitoWireError';
  }
}
