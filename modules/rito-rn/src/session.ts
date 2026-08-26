import { RitoNativeError, type RitoNativeStatus } from './errors';
import { getRitoNativeReaderModule, type RitoNativeCallResult, type RitoNativePinnedFontFace, type RitoNativeReaderModule } from './native';
import { decodeRitoArtifact, decodeRitoResource } from './protocol/artifact';
import { decodeRitoPublication } from './protocol/publication';
import { decodeRitoBackgroundAdvance, decodeRitoBackgroundHandoffAck, decodeRitoForegroundHandoffAck } from './protocol/handoff';
import {
  encodeRitoAdjacentRequest, encodeRitoArtifactRequest, encodeRitoBackgroundHandoff, encodeRitoBackgroundRequest,
  encodeRitoForegroundHandoff, type RitoAdjacentRequest, type RitoArtifactRequest, type RitoBackgroundHandoff,
  type RitoBackgroundRequest, type RitoForegroundHandoff,
} from './protocol/requests';
import type { RitoArtifact, RitoBackgroundAdvance, RitoBackgroundHandoffAck, RitoForegroundHandoffAck, RitoPublication, RitoResource } from './protocol/artifact-types';
import { decodeRitoFootnote, decodeRitoSearchResponse, decodeRitoTextRangeGeometry, encodeRitoSearchRequest, encodeRitoTextRangeRequest, type RitoFootnote, type RitoSearchRequest, type RitoSearchResponse, type RitoTextRangeGeometry, type RitoTextRangeRequest } from './protocol/interaction';

const STATUS_OK = 0;
const STATUS_TARGET_NOT_PUBLISHED = 6;
const STATUS_EXACT_PENDING = 9;
const STATUS_ADJACENT_PENDING = 10;

export interface RitoReaderSessionOptions { readonly native?: RitoNativeReaderModule; readonly maxContinuationQuanta?: number }

/** TypeScript session façade matching the ownership semantics of rito_flutter. */
export class RitoReaderSession {
  private readonly native: RitoNativeReaderModule;
  private readonly maxContinuationQuanta: number;
  private visibleArtifactId?: bigint;
  private readonly peekedArtifacts = new Map<string, RitoArtifact>();
  private readonly artifacts = new Map<bigint, RitoArtifact>();
  private readonly resourceCache = new Map<string, Promise<RitoResource>>();
  private latestForegroundRequestId = 0n;
  private foregroundGeneration = 0;
  private disposed = false;

  constructor(readonly sessionId: bigint, options: RitoReaderSessionOptions = {}) {
    if (sessionId <= 0n) throw new RangeError('Rito sessionId must be positive.');
    this.native = options.native ?? getRitoNativeReaderModule();
    this.maxContinuationQuanta = options.maxContinuationQuanta ?? 4096;
  }

  static async open(publication: Uint8Array, request: RitoArtifactRequest, fonts: readonly RitoNativePinnedFontFace[], options: RitoReaderSessionOptions = {}): Promise<{ readonly session: RitoReaderSession; readonly artifact: RitoArtifact }> {
    const native = options.native ?? getRitoNativeReaderModule();
    const session = new RitoReaderSession(request.sessionId, { ...options, native });
    const response = await native.open(publication, encodeRitoArtifactRequest(request), fonts);
    let artifact: RitoArtifact;
    if (response.status === STATUS_EXACT_PENDING) {
      artifact = await session.requestArtifact({ ...request, requestId: request.requestId + 1n, work: { ...request.work, maxForegroundQuanta: 1 } });
    } else {
      if (response.status !== STATUS_OK) throw nativeError(response, 'open');
      artifact = decodeRitoArtifact(response.data);
      if (artifact.sessionId !== request.sessionId) throw new RitoNativeError(4, 'Rito open artifact session ID does not match the request.', 'open');
    }
    session.rememberArtifact(artifact);
    await session.adoptForeground({
      sessionId: request.sessionId,
      candidateArtifactId: artifact.artifactId,
    });
    return { session, artifact };
  }

  async readPublication(): Promise<RitoPublication> { return decodeRitoPublication(await this.success('readPublication', () => this.native.readPublication(this.sessionId))); }

  async requestArtifact(request: RitoArtifactRequest): Promise<RitoArtifact> {
    this.assertSession(request.sessionId);
    this.noteForegroundRequest(request.requestId);
    let current = request;
    for (let index = 0; index < this.maxContinuationQuanta; index += 1) {
      const result = await this.native.requestArtifact(this.sessionId, encodeRitoArtifactRequest(current));
      if (result.status === STATUS_EXACT_PENDING) { current = { ...current, requestId: current.requestId + 1n, work: { ...current.work, maxForegroundQuanta: 1 } }; continue; }
      if (result.status !== STATUS_OK) throw nativeError(result, 'requestArtifact');
      const artifact = this.decodeCandidate(result.data, current.requestId, 'requestArtifact');
      if (request.requestId < this.latestForegroundRequestId) {
        await this.native.releaseArtifact(this.sessionId, artifact.artifactId).catch(() => undefined);
        throw new RitoNativeError(5, 'Foreground request was superseded by a newer request.', 'requestArtifact');
      }
      return artifact;
    }
    throw new RitoNativeError(9, 'Rito exact seek exceeded the continuation limit.', 'requestArtifact');
  }

  async requestAdjacent(request: RitoAdjacentRequest): Promise<RitoArtifact> {
    this.assertSession(request.sessionId);
    this.noteForegroundRequest(request.requestId);
    let current = request;
    for (let index = 0; index < this.maxContinuationQuanta; index += 1) {
      const result = await this.native.requestAdjacent(this.sessionId, encodeRitoAdjacentRequest(current));
      if (result.status === STATUS_ADJACENT_PENDING) { current = { ...current, requestId: current.requestId + 1n, work: { ...current.work, maxForegroundQuanta: 1 } }; continue; }
      if (result.status !== STATUS_OK) throw nativeError(result, 'requestAdjacent');
      const artifact = this.decodeCandidate(result.data, current.requestId, 'requestAdjacent');
      if (request.requestId < this.latestForegroundRequestId) {
        await this.native.releaseArtifact(this.sessionId, artifact.artifactId).catch(() => undefined);
        throw new RitoNativeError(5, 'Adjacent request was superseded by a newer request.', 'requestAdjacent');
      }
      return artifact;
    }
    throw new RitoNativeError(10, 'Rito adjacent navigation exceeded the continuation limit.', 'requestAdjacent');
  }

  /**
   * Resolves a neighboring artifact without changing the visible artifact.
   * The returned artifact remains owned by this session and can be committed
   * with commitPeekedArtifact or released with releaseArtifact.
   */
  async peekAdjacent(request: RitoAdjacentRequest): Promise<RitoArtifact | undefined> {
    this.assertSession(request.sessionId);
    this.assertArtifact(request.fromArtifactId);
    const generation = this.foregroundGeneration;
    const result = await this.native.peekAdjacent(
      this.sessionId,
      encodeRitoAdjacentRequest(request),
    );
    if (result.status === STATUS_TARGET_NOT_PUBLISHED) return undefined;
    if (result.status !== STATUS_OK) throw nativeError(result, 'peekAdjacent');
    const artifact = this.decodeCandidate(result.data, request.requestId, 'peekAdjacent');
    if (generation !== this.foregroundGeneration) {
      await this.native.releaseArtifact(this.sessionId, artifact.artifactId).catch(() => undefined);
      throw new RitoNativeError(5, 'Peek request was superseded by foreground navigation.', 'peekAdjacent');
    }
    this.rememberArtifact(artifact);
    const key = peekKey(request.fromArtifactId, request.direction);
    const previous = this.peekedArtifacts.get(key);
    this.peekedArtifacts.set(key, artifact);
    if (previous && previous.artifactId !== artifact.artifactId) {
      await this.releaseArtifact(previous.artifactId).catch(() => undefined);
    }
    return artifact;
  }

  async adoptForeground(request: RitoForegroundHandoff): Promise<RitoForegroundHandoffAck> {
    this.assertSession(request.sessionId);
    this.foregroundGeneration += 1;
    const ack = decodeRitoForegroundHandoffAck(await this.success('adoptForeground', () => this.native.adoptForeground(this.sessionId, encodeRitoForegroundHandoff(request))));
    if (ack.visibleArtifactId !== request.candidateArtifactId) throw new RitoNativeError(4, 'Foreground handoff acknowledgement does not match the candidate.', 'adoptForeground');
    this.visibleArtifactId = ack.visibleArtifactId;
    await this.clearPeekedArtifacts(request.candidateArtifactId);
    return ack;
  }

  /** Commits a previously peeked artifact with the native compare-and-swap. */
  async commitPeekedArtifact(request: RitoForegroundHandoff): Promise<RitoForegroundHandoffAck> {
    this.assertSession(request.sessionId);
    this.foregroundGeneration += 1;
    const ack = decodeRitoForegroundHandoffAck(
      await this.success(
        'commitPeekedArtifact',
        () => this.native.commitPeekedArtifact(this.sessionId, encodeRitoForegroundHandoff(request)),
      ),
    );
    if (
      ack.visibleArtifactId !== request.candidateArtifactId ||
      ack.replacedArtifactId !== request.expectedVisibleArtifactId
    ) {
      throw new RitoNativeError(4, 'Peeked foreground acknowledgement does not match the handoff.', 'commitPeekedArtifact');
    }
    this.visibleArtifactId = ack.visibleArtifactId;
    await this.clearPeekedArtifacts(request.candidateArtifactId);
    return ack;
  }

  /** Uses a cached peek when available, otherwise requests and adopts a neighbor. */
  async turn(request: RitoAdjacentRequest): Promise<RitoArtifact> {
    this.assertSession(request.sessionId);
    this.assertArtifact(request.fromArtifactId);
    const key = peekKey(request.fromArtifactId, request.direction);
    const cached = this.peekedArtifacts.get(key);
    if (cached && this.visibleArtifactId === request.fromArtifactId) {
      await this.commitPeekedArtifact({
        sessionId: request.sessionId,
        expectedVisibleArtifactId: request.fromArtifactId,
        candidateArtifactId: cached.artifactId,
      });
      return cached;
    }
    if (cached) {
      this.peekedArtifacts.delete(key);
      await this.releaseArtifact(cached.artifactId).catch(() => undefined);
    }
    const artifact = await this.requestAdjacent(request);
    await this.adoptForeground({
      sessionId: request.sessionId,
      expectedVisibleArtifactId: request.fromArtifactId,
      candidateArtifactId: artifact.artifactId,
    });
    return artifact;
  }

  async advanceBackground(request: RitoBackgroundRequest): Promise<RitoBackgroundAdvance> {
    this.assertSession(request.sessionId);
    const advance = decodeRitoBackgroundAdvance(await this.success('advanceBackground', () => this.native.advanceBackground(this.sessionId, encodeRitoBackgroundRequest(request))));
    if (advance.intentRequestId <= 0n || (advance.artifact && advance.artifact.sessionId !== this.sessionId)) {
      throw new RitoNativeError(4, 'Background artifact identity does not match the session.', 'advanceBackground');
    }
    if (advance.artifact) this.rememberArtifact(advance.artifact);
    return advance;
  }

  async adoptBackground(request: RitoBackgroundHandoff): Promise<RitoBackgroundHandoffAck> {
    this.assertSession(request.sessionId);
    this.foregroundGeneration += 1;
    const ack = decodeRitoBackgroundHandoffAck(await this.success('adoptBackground', () => this.native.adoptBackground(this.sessionId, encodeRitoBackgroundHandoff(request))));
    if (ack.visibleArtifactId !== request.candidateArtifactId) throw new RitoNativeError(4, 'Background handoff acknowledgement does not match the candidate.', 'adoptBackground');
    this.visibleArtifactId = ack.visibleArtifactId;
    await this.clearPeekedArtifacts(request.candidateArtifactId);
    return ack;
  }

  async readResource(artifactId: bigint, kind: number, href: string): Promise<RitoResource> {
    this.assertArtifact(artifactId);
    if (!href) throw new RangeError('Rito resource href must not be empty.');
    const expectedKind = resourceKind(kind);
    const key = `${artifactId.toString()}:${kind}:${href}`;
    const cached = this.resourceCache.get(key);
    if (cached) return cached;
    const pending = this.success(
      'readResource',
      () => this.native.readResource(this.sessionId, artifactId, kind, href),
    ).then((data) => {
      const resource = decodeRitoResource(data);
      if (resource.artifactId !== artifactId || resource.href !== href || resource.kind !== expectedKind) {
        throw new RitoNativeError(4, 'Rito resource identity does not match the request.', 'readResource');
      }
      const artifact = this.artifacts.get(artifactId);
      const declaration = artifact?.fonts.find((font) => expectedKind === 'font' && font.href === href);
      if (declaration && declaration.byteLength !== BigInt(resource.bytes.byteLength)) {
        throw new RitoNativeError(4, 'Rito font resource length does not match its artifact declaration.', 'readResource');
      }
      return resource;
    });
    this.resourceCache.set(key, pending);
    try {
      return await pending;
    } catch (error) {
      this.resourceCache.delete(key);
      throw error;
    }
  }
  async search(request: RitoSearchRequest): Promise<RitoSearchResponse> { this.assertSession(request.sessionId); this.assertArtifact(request.artifactId); const response = decodeRitoSearchResponse(await this.success('search', () => this.native.search(this.sessionId, encodeRitoSearchRequest(request)))); if (response.artifactId !== request.artifactId || response.query !== request.query) throw new RitoNativeError(4, 'Search response does not match the request.', 'search'); return response; }
  async textRangeGeometry(request: RitoTextRangeRequest): Promise<RitoTextRangeGeometry> { this.assertSession(request.sessionId); this.assertArtifact(request.artifactId); const response = decodeRitoTextRangeGeometry(await this.success('textRangeGeometry', () => this.native.textRangeGeometry(this.sessionId, encodeRitoTextRangeRequest(request)))); if (response.artifactId !== request.artifactId || response.pageIndex !== request.pageIndex) throw new RitoNativeError(4, 'Text geometry response does not match the request.', 'textRangeGeometry'); return response; }
  async readFootnote(artifactId: bigint, key: string): Promise<RitoFootnote> { this.assertArtifact(artifactId); const response = decodeRitoFootnote(await this.success('readFootnote', () => this.native.readFootnote(this.sessionId, artifactId, key))); if (response.artifactId !== artifactId || response.key !== key) throw new RitoNativeError(4, 'Footnote response does not match the request.', 'readFootnote'); return response; }
  async releaseArtifact(artifactId: bigint): Promise<void> { this.assertArtifact(artifactId); const result = await this.native.releaseArtifact(this.sessionId, artifactId); if (result.status !== STATUS_OK) throw nativeError(result, 'releaseArtifact'); for (const [key, artifact] of this.peekedArtifacts) if (artifact.artifactId === artifactId) this.peekedArtifacts.delete(key); for (const key of this.resourceCache.keys()) if (key.startsWith(`${artifactId.toString()}:`)) this.resourceCache.delete(key); this.artifacts.delete(artifactId); if (this.visibleArtifactId === artifactId) this.visibleArtifactId = undefined; }
  async dispose(): Promise<void> { if (this.disposed) return; const result = await this.native.dispose(this.sessionId); if (result.status !== STATUS_OK && result.status !== 2) throw nativeError(result, 'dispose'); this.disposed = true; this.visibleArtifactId = undefined; this.peekedArtifacts.clear(); this.resourceCache.clear(); this.artifacts.clear(); }

  get currentVisibleArtifactId(): bigint | undefined { return this.visibleArtifactId; }

  private async success(operation: string, call: () => Promise<RitoNativeCallResult>): Promise<Uint8Array> { const result = await call(); if (result.status !== STATUS_OK) throw nativeError(result, operation); return result.data; }
  private decodeCandidate(data: Uint8Array, requestId: bigint, operation: string): RitoArtifact { const artifact = decodeRitoArtifact(data); if (artifact.sessionId !== this.sessionId || artifact.requestId !== requestId) throw new RitoNativeError(4, 'Rito artifact identity does not match the request.', operation); this.rememberArtifact(artifact); return artifact; }
  private rememberArtifact(artifact: RitoArtifact): void { this.artifacts.set(artifact.artifactId, artifact); }
  private noteForegroundRequest(requestId: bigint): void {
    if (requestId <= 0n) throw new RangeError('Rito foreground request ID must be positive.');
    this.foregroundGeneration += 1;
    if (requestId > this.latestForegroundRequestId) this.latestForegroundRequestId = requestId;
    if (this.peekedArtifacts.size > 0) {
      void this.clearPeekedArtifacts();
    }
  }
  private async clearPeekedArtifacts(keepArtifactId?: bigint): Promise<void> {
    const pending = [...this.peekedArtifacts.values()];
    this.peekedArtifacts.clear();
    for (const artifact of pending) {
      if (artifact.artifactId === keepArtifactId) continue;
      this.artifacts.delete(artifact.artifactId);
      for (const key of this.resourceCache.keys()) if (key.startsWith(`${artifact.artifactId.toString()}:`)) this.resourceCache.delete(key);
    }
    await Promise.all(
      pending
        .filter((artifact) => artifact.artifactId !== keepArtifactId)
        .map((artifact) => this.native.releaseArtifact(this.sessionId, artifact.artifactId).catch(() => undefined)),
    );
  }
  private assertSession(sessionId: bigint): void { if (this.disposed) throw new Error('Rito reader session has been disposed.'); if (sessionId !== this.sessionId) throw new RitoNativeError(1, 'Rito request session ID does not match the session.', 'session'); }
  private assertArtifact(artifactId: bigint): void { this.assertSession(this.sessionId); if (artifactId <= 0n) throw new RitoNativeError(1, 'Rito artifact ID must be positive.', 'artifact'); }
}

function peekKey(artifactId: bigint, direction: RitoAdjacentRequest['direction']): string {
  return `${artifactId.toString()}:${direction}`;
}

function resourceKind(kind: number): RitoResource['kind'] {
  if (kind === 0) return 'image';
  if (kind === 1) return 'font';
  if (kind === 2) return 'stylesheet';
  throw new RangeError('Rito resource kind must be 0, 1, or 2.');
}

function nativeError(result: RitoNativeCallResult, operation: string): RitoNativeError { return new RitoNativeError(result.status as RitoNativeStatus, result.error || 'Rito native operation failed.', operation); }
