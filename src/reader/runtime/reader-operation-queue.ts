/** Serializes mutations of the reader publication and preserves queue progress after failures. */
export class ReaderOperationQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  async drain(): Promise<void> {
    await this.tail.catch(() => undefined);
  }
}
