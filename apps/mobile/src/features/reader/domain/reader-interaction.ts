/**
 * The reader's dominant interaction, from the most to the least exclusive.
 * Consumers ask for a capability instead of combining screen flags themselves.
 */
export type ReaderInteractionMode = 'loading' | 'modal' | 'panel' | 'selecting' | 'turning' | 'idle';

export interface ReaderInteractionInput {
  readonly isReady: boolean;
  /** An interactive turn is settling or being handed off to its target page. */
  readonly isSettling: boolean;
  readonly automaticNavigationActive: boolean;
  readonly hasSelection: boolean;
  readonly hasPanel: boolean;
  /** Footnotes, notes, excerpts, image viewers and other surfaces that cover the page. */
  readonly hasModal: boolean;
}

export interface ReaderInteraction {
  readonly mode: ReaderInteractionMode;
  /** Gestures and accessibility actions that act on the visible page itself. */
  readonly canInteractWithPage: boolean;
  /** Opening links, footnotes and images under a tap. */
  readonly canOpenContent: boolean;
  /** Page navigation not started by a page gesture, such as volume keys or extensions. */
  readonly canNavigate: boolean;
}

/**
 * The first gate, needed before selection and modal state exist: page gestures
 * wait until the page is ready and no turn is in flight.
 */
export function isReaderPageInteractive(
  input: Pick<ReaderInteractionInput, 'isReady' | 'isSettling' | 'automaticNavigationActive'>,
): boolean {
  return input.isReady && !input.isSettling && !input.automaticNavigationActive;
}

export function resolveReaderInteraction(input: ReaderInteractionInput): ReaderInteraction {
  const turning = input.isSettling || input.automaticNavigationActive;
  const canInteractWithPage = isReaderPageInteractive(input);
  const canOpenContent = canInteractWithPage && !input.hasSelection;
  const canNavigate = canOpenContent && !input.hasPanel && !input.hasModal;
  return {
    mode: !input.isReady
      ? 'loading'
      : input.hasModal
        ? 'modal'
        : input.hasPanel
          ? 'panel'
          : input.hasSelection
            ? 'selecting'
            : turning
              ? 'turning'
              : 'idle',
    canInteractWithPage,
    canOpenContent,
    canNavigate,
  };
}
