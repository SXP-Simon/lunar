import type { ReaderSnapshot } from '../../../contracts';
import type { LunarReaderRuntime } from '../../../runtime/core/native-reader-runtime';
import {
  readerPerformanceAsync,
  readerPerformanceEnd,
  readerPerformanceId,
  readerPerformanceMark,
  readerPerformanceStart,
} from '../../../runtime/core/performance';
import { readerPageContentForSnapshot, sameSnapshotIdentity } from '../core/page-content';
import {
  AUTOMATIC_PAGE_TURN_MAX_LANES,
  AUTOMATIC_PAGE_TURN_START_INTERVAL_MS,
  appendAutomaticPageTurn,
} from '../core/page-turn-concurrency';
import type { ReaderPageTurnEffect } from '../core/page-turn-effect';
import type { ReaderAutomaticTurn, ReaderPageContent } from '../core/page-turn-types';

export interface AutomaticPageTurnQueueHost {
  readonly runtime: LunarReaderRuntime;
  pageTurnEffect(): ReaderPageTurnEffect;
  turns(): readonly ReaderAutomaticTurn[];
  publishTurns(turns: readonly ReaderAutomaticTurn[]): void;
  /** The number of queued requests changed. */
  pendingChanged(): void;
  /** Ends whatever input turn is still on screen before this navigation runs. */
  beforeNavigate(): Promise<void>;
  /** Moves one page, preferring a candidate that is already prepared. */
  navigate(direction: 1 | -1, performanceId: string | undefined): Promise<ReaderSnapshot>;
  /** A request finished; `moved` tells whether it reached another page. */
  settled(direction: 1 | -1, moved: boolean): void;
}

interface AutomaticNavigation {
  readonly generation: number;
  readonly direction: 1 | -1;
  readonly from: ReaderPageContent;
  readonly performanceId?: string;
  published: boolean;
}

/**
 * Taps and programmatic page steps. Requests run one at a time through the
 * runtime, while their turns overlap on screen in up to
 * `AUTOMATIC_PAGE_TURN_MAX_LANES` lanes at a fixed launch cadence.
 */
export class AutomaticPageTurnQueue {
  private generation = 0;
  private queue: Promise<void> = Promise.resolve();
  private nextStartAt = 0;
  private direction?: 1 | -1;
  private pendingCount = 0;
  private readonly laneWaiters: (() => void)[] = [];
  private sequence = 0;
  private navigation?: AutomaticNavigation;

  constructor(private readonly host: AutomaticPageTurnQueueHost) {}

  get pending(): number {
    return this.pendingCount;
  }

  enqueue(direction: 1 | -1): Promise<ReaderSnapshot> {
    const { runtime } = this.host;
    const performanceId = readerPerformanceId('automatic');
    const queuedAt = readerPerformanceStart();
    const serializesTurns = this.host.pageTurnEffect().orchestration.serializesAutomaticTurns;
    if (serializesTurns) {
      if (this.direction !== undefined && this.direction !== direction) {
        return Promise.resolve(runtime.getSnapshot());
      }
      this.direction = direction;
    }
    this.pendingCount += 1;
    this.host.pendingChanged();
    const generation = this.generation;
    return new Promise<ReaderSnapshot>((resolve, reject) => {
      const run = async () => {
        let moved = false;
        try {
          if (!(await this.waitForLaunch(generation, serializesTurns))) {
            resolve(runtime.getSnapshot());
            return;
          }
          readerPerformanceEnd('reader.controller.queue', queuedAt, { workId: performanceId });
          await readerPerformanceAsync('reader.controller.prepare', () => this.host.beforeNavigate(), {
            workId: performanceId,
          });
          const before = runtime.getSnapshot();
          const from = readerPageContentForSnapshot(runtime, before);
          this.navigation = from ? { generation, direction, from, performanceId, published: false } : undefined;
          const result = await this.host.navigate(direction, performanceId);
          const navigation = this.navigation;
          this.navigation = undefined;
          if (navigation) this.publish(navigation, result);
          moved = navigation?.published === true || !sameSnapshotIdentity(before, result);
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.pendingCount = Math.max(0, this.pendingCount - 1);
          if (this.pendingCount === 0 && this.host.turns().length === 0) this.direction = undefined;
          this.host.pendingChanged();
          this.host.settled(direction, moved);
        }
      };
      this.queue = this.queue.then(run, run);
    });
  }

  /** Removes a turn whose animation finished; returns false for an unknown id. */
  complete(turnId: number): boolean {
    const turns = this.host.turns();
    const nextTurns = turns.filter((turn) => turn.id !== turnId);
    if (nextTurns.length === turns.length) return false;
    const completed = turns.find((turn) => turn.id === turnId);
    readerPerformanceMark('reader.turn.complete', { workId: completed?.performanceId, turnId, mode: 'automatic' });
    this.host.publishTurns(nextTurns);
    this.laneWaiters.shift()?.();
    if (nextTurns.length === 0 && this.pendingCount === 0) this.direction = undefined;
    return true;
  }

  /**
   * Adds the running request's turn in the same tick the runtime publishes its
   * target. The subscriber renders both together, so the target never shows
   * as a still page before the turn that reveals it.
   */
  handleRuntimeSnapshot(snapshot: ReaderSnapshot): void {
    if (this.navigation) this.publish(this.navigation, snapshot);
  }

  dispose(): void {
    this.generation += 1;
    this.navigation = undefined;
    for (const wake of this.laneWaiters.splice(0)) wake();
  }

  private async waitForLaunch(generation: number, serializesTurns: boolean): Promise<boolean> {
    if (this.generation !== generation) return false;
    while (this.host.turns().length >= AUTOMATIC_PAGE_TURN_MAX_LANES) {
      await new Promise<void>((laneAvailable) => this.laneWaiters.push(laneAvailable));
      if (this.generation !== generation) return false;
    }
    if (serializesTurns) {
      const startDelay = Math.max(0, this.nextStartAt - Date.now());
      if (startDelay > 0) await new Promise((resolve) => setTimeout(resolve, startDelay));
    }
    return this.generation === generation;
  }

  private publish(navigation: AutomaticNavigation, snapshot: ReaderSnapshot): void {
    const effect = this.host.pageTurnEffect();
    if (navigation.published || this.generation !== navigation.generation) return;
    if (snapshot.phase !== 'ready' || sameSnapshotIdentity(navigation.from.snapshot, snapshot)) return;
    if (!effect.orchestration.usesAutomaticTransition) return;
    const to = readerPageContentForSnapshot(this.host.runtime, snapshot);
    if (!to) return;
    navigation.published = true;
    const inFlight = this.host.turns();
    const turn: ReaderAutomaticTurn = {
      performanceId: navigation.performanceId,
      id: ++this.sequence,
      from: navigation.from,
      to,
      direction: navigation.direction,
      burst: inFlight.length > 0,
    };
    readerPerformanceMark('reader.turn.ready', {
      workId: navigation.performanceId,
      turnId: turn.id,
      direction: navigation.direction,
      page: to.key,
      effect: effect.visual.kind,
    });
    this.host.publishTurns(appendAutomaticPageTurn(inFlight, turn));
    if (effect.orchestration.serializesAutomaticTurns) {
      this.nextStartAt = Date.now() + AUTOMATIC_PAGE_TURN_START_INTERVAL_MS;
    }
  }
}
