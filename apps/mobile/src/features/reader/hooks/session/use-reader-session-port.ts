import { createContext, useContext, useEffect, useMemo, useRef } from 'react';

import { createReaderTextSegments, type ReaderLocator, type ReaderSnapshot, type ReaderTocEntry } from '@/reader';
import type { LunarReaderRuntime } from '@/reader/native';
import type { ReaderInteraction } from '../../domain/reader-interaction';
import { createReaderSessionLocation, type ReaderSessionLifecycle } from '../../domain/reader-session-events';
import type {
  ReaderSessionBook,
  ReaderSessionPort,
  ReaderSessionState,
  ReaderVisibleText,
} from '../../domain/reader-session-port';
import type { ReaderSessionEventSource } from '../../services/reader-session-event-bus';

export interface ReaderSessionPortOptions {
  readonly runtime: LunarReaderRuntime;
  readonly snapshot: ReaderSnapshot;
  readonly events: ReaderSessionEventSource;
  readonly lifecycle: ReaderSessionLifecycle;
  readonly book?: ReaderSessionBook;
  readonly toc: readonly ReaderTocEntry[];
  readonly interaction: ReaderInteraction;
  readonly hasSelection: boolean;
  /** Animated page turns owned by the reader's page-turn controller. */
  readonly next: () => Promise<unknown>;
  readonly previous: () => Promise<unknown>;
}

export const ReaderSessionPortContext = createContext<ReaderSessionPort | undefined>(undefined);

/** The reading session of the enclosing reader screen, if any. */
export function useReaderSessionPortContext(): ReaderSessionPort | undefined {
  return useContext(ReaderSessionPortContext);
}

/** A stable port whose methods always act on the latest committed render. */
export function useReaderSessionPort(options: ReaderSessionPortOptions): ReaderSessionPort {
  const latest = useRef(options);
  const listeners = useRef(new Set<() => void>());
  const { book, hasSelection, interaction, lifecycle, snapshot } = options;
  const state = useMemo<ReaderSessionState>(
    () => ({
      lifecycle,
      phase: snapshot.phase,
      book,
      location: lifecycle === 'open' ? createReaderSessionLocation(snapshot) : undefined,
      interaction: interaction.mode,
      hasSelection,
    }),
    [book, hasSelection, interaction.mode, lifecycle, snapshot],
  );
  const stateRef = useRef(state);

  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    stateRef.current = state;
    for (const listener of [...listeners.current]) listener();
  }, [state]);

  return useMemo<ReaderSessionPort>(() => {
    const navigate = async (action: (current: ReaderSessionPortOptions) => Promise<unknown>) => {
      const current = latest.current;
      if (!current.interaction.canNavigate) return false;
      await action(current);
      return true;
    };
    return {
      events: options.events,
      getState: () => stateRef.current,
      subscribe(listener) {
        listeners.current.add(listener);
        return () => {
          listeners.current.delete(listener);
        };
      },
      getToc: () => latest.current.toc,
      getVisibleText: () => readVisibleText(latest.current.runtime, latest.current.snapshot),
      search: (request) => latest.current.runtime.search(request),
      next: () => navigate((current) => current.next()),
      previous: () => navigate((current) => current.previous()),
      goToLocator: (locator: ReaderLocator) => navigate((current) => current.runtime.goToLocator(locator)),
      goToChapter: (href: string) => navigate((current) => current.runtime.goToToc(href)),
      async goToProgression(progression: number) {
        const total = latest.current.snapshot.totalSpreads;
        if (total === undefined || !Number.isFinite(progression)) return false;
        const page = Math.round(Math.min(1, Math.max(0, progression)) * Math.max(total - 1, 0));
        return navigate((current) => current.runtime.goToSpread(page));
      },
    };
    // The port is created once; `events` belongs to the session and never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function readVisibleText(runtime: LunarReaderRuntime, snapshot: ReaderSnapshot): ReaderVisibleText | undefined {
  if (snapshot.phase !== 'ready') return undefined;
  const current = runtime.getSnapshot();
  // React may still hold a snapshot the runtime has moved past; text from a
  // different frame would place marks on the wrong page.
  if (
    current.revisionId !== snapshot.revisionId ||
    current.spreadIndex !== snapshot.spreadIndex ||
    current.renderId !== snapshot.renderId
  ) {
    return undefined;
  }
  const frame = runtime.getCurrentFrame(snapshot.spreadIndex);
  // Overlay resolvers read `frame.hits`; ranges must index into the same entries.
  const entries = frame?.hits ?? runtime.getCurrentHitMap(snapshot.spreadIndex)?.entries ?? [];
  return {
    revisionId: snapshot.revisionId,
    frameKey: frame?.renderKey ?? frame?.sourceKey,
    href: frame?.manifestHref ?? snapshot.position?.locator?.manifestHref,
    segments: createReaderTextSegments(entries),
  };
}
