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
const STATUS_EXACT_PENDING = 9;
const STATUS_ADJACENT_PENDING = 10;

export interface RitoReaderSessionOptions { readonly native?: RitoNativeReaderModule; readonly maxContinuationQuanta?: number }

/** TypeScript session façade matching the ownership semantics of rito_flutter. */
export class RitoReaderSession {
  private readonly native: RitoNativeReaderModule;
  private readonly maxContinuationQuanta: number;
  private visibleArtifactId?: bigint;
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
    await session.adoptForeground({
      sessionId: request.sessionId,
      candidateArtifactId: artifact.artifactId,
    });
    return { session, artifact };
  }

  async readPublication(): Promise<RitoPublication> { return decodeRitoPublication(await this.success('readPublication', () => this.native.readPublication(this.sessionId))); }

  async requestArtifact(request: RitoArtifactRequest): Promise<RitoArtifact> {
    this.assertSession(request.sessionId);
    let current = request;
    for (let index = 0; index < this.maxContinuationQuanta; index += 1) {
      const result = await this.native.requestArtifact(this.sessionId, encodeRitoArtifactRequest(current));
      if (result.status === STATUS_EXACT_PENDING) { current = { ...current, requestId: current.requestId + 1n, work: { ...current.work, maxForegroundQuanta: 1 } }; continue; }
      if (result.status !== STATUS_OK) throw nativeError(result, 'requestArtifact');
      return this.decodeCandidate(result.data, current.requestId, 'requestArtifact');
    }
    throw new RitoNativeError(9, 'Rito exact seek exceeded the continuation limit.', 'requestArtifact');
  }

  async requestAdjacent(request: RitoAdjacentRequest): Promise<RitoArtifact> {
    this.assertSession(request.sessionId);
    let current = request;
    for (let index = 0; index < this.maxContinuationQuanta; index += 1) {
      const result = await this.native.requestAdjacent(this.sessionId, encodeRitoAdjacentRequest(current));
      if (result.status === STATUS_ADJACENT_PENDING) { current = { ...current, requestId: current.requestId + 1n, work: { ...current.work, maxForegroundQuanta: 1 } }; continue; }
      if (result.status !== STATUS_OK) throw nativeError(result, 'requestAdjacent');
      return this.decodeCandidate(result.data, current.requestId, 'requestAdjacent');
    }
    throw new RitoNativeError(10, 'Rito adjacent navigation exceeded the continuation limit.', 'requestAdjacent');
  }

  async adoptForeground(request: RitoForegroundHandoff): Promise<RitoForegroundHandoffAck> {
    this.assertSession(request.sessionId);
    const ack = decodeRitoForegroundHandoffAck(await this.success('adoptForeground', () => this.native.adoptForeground(this.sessionId, encodeRitoForegroundHandoff(request))));
    if (ack.visibleArtifactId !== request.candidateArtifactId) throw new RitoNativeError(4, 'Foreground handoff acknowledgement does not match the candidate.', 'adoptForeground');
    this.visibleArtifactId = ack.visibleArtifactId;
    return ack;
  }

  async advanceBackground(request: RitoBackgroundRequest): Promise<RitoBackgroundAdvance> {
    this.assertSession(request.sessionId);
    const advance = decodeRitoBackgroundAdvance(await this.success('advanceBackground', () => this.native.advanceBackground(this.sessionId, encodeRitoBackgroundRequest(request))));
    if (advance.intentRequestId <= 0n || (advance.artifact && advance.artifact.sessionId !== this.sessionId)) {
      throw new RitoNativeError(4, 'Background artifact identity does not match the session.', 'advanceBackground');
    }
    return advance;
  }

  async adoptBackground(request: RitoBackgroundHandoff): Promise<RitoBackgroundHandoffAck> {
    this.assertSession(request.sessionId);
    const ack = decodeRitoBackgroundHandoffAck(await this.success('adoptBackground', () => this.native.adoptBackground(this.sessionId, encodeRitoBackgroundHandoff(request))));
    if (ack.visibleArtifactId !== request.candidateArtifactId) throw new RitoNativeError(4, 'Background handoff acknowledgement does not match the candidate.', 'adoptBackground');
    this.visibleArtifactId = ack.visibleArtifactId;
    return ack;
  }

  async readResource(artifactId: bigint, kind: number, href: string): Promise<RitoResource> { this.assertArtifact(artifactId); return decodeRitoResource(await this.success('readResource', () => this.native.readResource(this.sessionId, artifactId, kind, href))); }
  async search(request: RitoSearchRequest): Promise<RitoSearchResponse> { this.assertSession(request.sessionId); this.assertArtifact(request.artifactId); const response = decodeRitoSearchResponse(await this.success('search', () => this.native.search(this.sessionId, encodeRitoSearchRequest(request)))); if (response.artifactId !== request.artifactId || response.query !== request.query) throw new RitoNativeError(4, 'Search response does not match the request.', 'search'); return response; }
  async textRangeGeometry(request: RitoTextRangeRequest): Promise<RitoTextRangeGeometry> { this.assertSession(request.sessionId); this.assertArtifact(request.artifactId); const response = decodeRitoTextRangeGeometry(await this.success('textRangeGeometry', () => this.native.textRangeGeometry(this.sessionId, encodeRitoTextRangeRequest(request)))); if (response.artifactId !== request.artifactId || response.pageIndex !== request.pageIndex) throw new RitoNativeError(4, 'Text geometry response does not match the request.', 'textRangeGeometry'); return response; }
  async readFootnote(artifactId: bigint, key: string): Promise<RitoFootnote> { this.assertArtifact(artifactId); const response = decodeRitoFootnote(await this.success('readFootnote', () => this.native.readFootnote(this.sessionId, artifactId, key))); if (response.artifactId !== artifactId || response.key !== key) throw new RitoNativeError(4, 'Footnote response does not match the request.', 'readFootnote'); return response; }
  async releaseArtifact(artifactId: bigint): Promise<void> { this.assertArtifact(artifactId); const result = await this.native.releaseArtifact(this.sessionId, artifactId); if (result.status !== STATUS_OK) throw nativeError(result, 'releaseArtifact'); if (this.visibleArtifactId === artifactId) this.visibleArtifactId = undefined; }
  async dispose(): Promise<void> { if (this.disposed) return; const result = await this.native.dispose(this.sessionId); if (result.status !== STATUS_OK && result.status !== 2) throw nativeError(result, 'dispose'); this.disposed = true; this.visibleArtifactId = undefined; }

  get currentVisibleArtifactId(): bigint | undefined { return this.visibleArtifactId; }

  private async success(operation: string, call: () => Promise<RitoNativeCallResult>): Promise<Uint8Array> { const result = await call(); if (result.status !== STATUS_OK) throw nativeError(result, operation); return result.data; }
  private decodeCandidate(data: Uint8Array, requestId: bigint, operation: string): RitoArtifact { const artifact = decodeRitoArtifact(data); if (artifact.sessionId !== this.sessionId || artifact.requestId !== requestId) throw new RitoNativeError(4, 'Rito artifact identity does not match the request.', operation); return artifact; }
  private assertSession(sessionId: bigint): void { if (this.disposed) throw new Error('Rito reader session has been disposed.'); if (sessionId !== this.sessionId) throw new RitoNativeError(1, 'Rito request session ID does not match the session.', 'session'); }
  private assertArtifact(artifactId: bigint): void { this.assertSession(this.sessionId); if (artifactId <= 0n) throw new RitoNativeError(1, 'Rito artifact ID must be positive.', 'artifact'); }
}

function nativeError(result: RitoNativeCallResult, operation: string): RitoNativeError { return new RitoNativeError(result.status as RitoNativeStatus, result.error || 'Rito native operation failed.', operation); }
