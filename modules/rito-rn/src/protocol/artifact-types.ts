import type { RitoReaderPrimitiveList } from './rito2/reader-session-primitive';

export type RitoLocatorMatch = 'source-range' | 'source-point' | 'anchor' | 'progression' | 'href';
export type RitoTextProfile = 'platform-string-runs' | 'positioned-glyph-runs';
export type RitoResourceKind = 'image' | 'font' | 'stylesheet';
export type RitoAdjacentAvailability = 'available' | 'chapter-boundary' | 'terminal';
export type RitoSemanticRole = 'heading' | 'paragraph' | 'list' | 'list-item' | 'image' | 'link' | 'blockquote' | 'table' | 'generic';

export interface RitoSourcePoint { readonly nodePath: readonly number[]; readonly textOffset: bigint }
export interface RitoSourceRange { readonly start: RitoSourcePoint; readonly end: RitoSourcePoint }
export interface RitoLocator {
  readonly href: string;
  readonly anchorId?: string;
  readonly sourcePoint?: RitoSourcePoint;
  readonly sourceRange?: RitoSourceRange;
  readonly progression?: number;
}
export interface RitoRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface RitoNavigation { readonly previous: RitoAdjacentAvailability; readonly next: RitoAdjacentAvailability }
export interface RitoResourceRef { readonly kind: RitoResourceKind; readonly href: string }
export interface RitoFontRef {
  readonly family: string; readonly href: string; readonly style: string; readonly weight: number;
  readonly shapeFingerprint: string; readonly byteLength: bigint;
}
export interface RitoResource {
  readonly artifactId: bigint; readonly kind: RitoResourceKind; readonly href: string; readonly mediaType: string;
  readonly bytes: Uint8Array; readonly width?: number; readonly height?: number;
}
export interface RitoHitEntry {
  readonly pageIndex: number; readonly bounds: RitoRect; readonly text: string; readonly href?: string;
  readonly sourcePoint?: RitoSourcePoint; readonly imageSrc?: string; readonly imageAlt?: string;
  readonly footnoteKey?: string; readonly footnotePending: boolean;
}
export interface RitoSemanticNode {
  readonly role: RitoSemanticRole; readonly level?: number; readonly text?: string; readonly alt?: string;
  readonly href?: string; readonly bounds: RitoRect; readonly children: readonly RitoSemanticNode[];
}
export interface RitoTextRunOffset { readonly start: bigint; readonly end: bigint; readonly blockIndex: number; readonly lineIndex: number; readonly runIndex: number }
export interface RitoPage {
  readonly pageIndex: number; readonly width: number; readonly height: number; readonly hits: readonly RitoHitEntry[];
  readonly semantics: readonly RitoSemanticNode[]; readonly text: string; readonly textLength: bigint;
  readonly textRuns: readonly RitoTextRunOffset[];
}
export interface RitoDisplayListPayload {
  readonly formatVersion: 2; readonly commandCount: number; readonly semanticDigest: Uint8Array;
  readonly wireBytes: Uint8Array; readonly displayList: RitoReaderPrimitiveList;
}
export interface RitoArtifact {
  readonly protocolVersion: number; readonly capabilityProfileId: number; readonly sessionId: bigint;
  readonly requestId: bigint; readonly revisionId: bigint; readonly revisionVersion: number; readonly artifactId: bigint;
  readonly locator: RitoLocator; readonly matchedBy: RitoLocatorMatch; readonly localPageIndex: number;
  readonly localSpreadIndex: number; readonly localPageIndexes: readonly number[]; readonly width: number; readonly height: number;
  readonly bookPageIndex?: number; readonly bookPageCount?: number;
  readonly navigation: RitoNavigation; readonly textProfile: RitoTextProfile; readonly displayList: RitoDisplayListPayload;
  readonly resources: readonly RitoResourceRef[]; readonly fonts: readonly RitoFontRef[]; readonly pages: readonly RitoPage[];
}

export interface RitoPublicationMetadata { readonly title: string; readonly language: string; readonly identifier: string; readonly creator?: string }
export interface RitoPublicationSpineItem { readonly spineIndex: number; readonly linearIndex?: number; readonly idref: string; readonly href: string }
export interface RitoTocEntry { readonly id: number; readonly label: string; readonly target: RitoTocTarget; readonly children: readonly RitoTocEntry[] }
export type RitoTocTarget = { readonly kind: 'locator'; readonly locator: RitoLocator } | { readonly kind: 'external'; readonly href: string } | { readonly kind: 'missing'; readonly href: string };
export interface RitoPublication { readonly protocolVersion: number; readonly sessionId: bigint; readonly metadata: RitoPublicationMetadata; readonly spine: readonly RitoPublicationSpineItem[]; readonly toc: readonly RitoTocEntry[] }

export type RitoBackgroundState = 'started' | 'advanced' | 'reused' | 'candidate-pending' | 'complete' | 'indexing';
export interface RitoBackgroundAdvance { readonly state: RitoBackgroundState; readonly intentRequestId: bigint; readonly replacesArtifactId: bigint; readonly movesVisibleContent: boolean; readonly artifact?: RitoArtifact }
export interface RitoForegroundHandoffAck { readonly intentRequestId: bigint; readonly replacedArtifactId?: bigint; readonly visibleArtifactId: bigint }
export interface RitoBackgroundHandoffAck { readonly intentRequestId: bigint; readonly replacedArtifactId: bigint; readonly visibleArtifactId: bigint }
