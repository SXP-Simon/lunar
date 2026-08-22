import type {
  ReaderChapterRange,
  ReaderBookMetadata,
  ReaderLayoutRequest,
  ReaderRenderFrame,
  ReaderTocEntry,
} from '../contracts';
import type { ReaderLayoutParameters } from '../contracts/loading';

export interface ReaderLayoutFingerprintInput {
  readonly bookHash: string;
  readonly ritoVersion: string;
  readonly rendererVersion: string;
  readonly layout: ReaderLayoutRequest;
  readonly fontFingerprint: string;
}

export interface ReaderPaginationOpenRequest {
  readonly type: 'open';
  readonly requestId: string;
  readonly operationId: number;
  readonly revisionId: number;
  readonly bookUri: string;
  readonly bookHash: string;
  readonly layout: ReaderLayoutRequest;
  readonly ritoVersion: string;
  readonly rendererVersion: string;
  readonly layoutFingerprint: string;
}

export interface ReaderPaginationFrameRequest {
  readonly type: 'get-frame';
  readonly requestId: string;
  readonly operationId: number;
  readonly revisionId: number;
  readonly spreadIndex: number;
}

export interface ReaderPaginationCancelRequest {
  readonly type: 'cancel';
  readonly requestId: string;
  readonly operationId: number;
  readonly revisionId: number;
}

export interface ReaderPaginationCloseRequest {
  readonly type: 'close';
  readonly requestId: string;
  readonly operationId: number;
  readonly revisionId: number;
}

export type ReaderWorkerRequest =
  | ReaderPaginationOpenRequest
  | ReaderPaginationFrameRequest
  | ReaderPaginationCancelRequest
  | ReaderPaginationCloseRequest;

export interface ReaderPaginationOpenedResponse {
  readonly type: 'opened';
  readonly requestId: string;
  readonly operationId: number;
  readonly revisionId: number;
  readonly metadata: ReaderBookMetadata;
  readonly toc: readonly ReaderTocEntry[];
  readonly layout: ReaderLayoutParameters;
}

export interface ReaderPaginationProgressResponse {
  readonly type: 'progress';
  readonly requestId: string;
  readonly operationId: number;
  readonly revisionId: number;
  readonly chapterIndex: number;
  readonly chapterCount: number;
}

export interface ReaderPaginationReadyResponse {
  readonly type: 'ready';
  readonly requestId: string;
  readonly operationId: number;
  readonly revisionId: number;
  readonly totalPages: number;
  readonly totalSpreads: number;
  readonly chapters: readonly ReaderChapterRange[];
}

export interface ReaderPaginationFrameResponse {
  readonly type: 'frame';
  readonly requestId: string;
  readonly operationId: number;
  readonly revisionId: number;
  readonly spreadIndex: number;
  readonly frame: ReaderRenderFrame;
}

export interface ReaderPaginationErrorResponse {
  readonly type: 'error';
  readonly requestId: string;
  readonly operationId: number;
  readonly revisionId: number;
  readonly code: string;
  readonly message: string;
}

export type ReaderWorkerResponse =
  | ReaderPaginationOpenedResponse
  | ReaderPaginationProgressResponse
  | ReaderPaginationReadyResponse
  | ReaderPaginationFrameResponse
  | ReaderPaginationErrorResponse;

export function isCurrentReaderResponse(
  response: Pick<ReaderWorkerResponse, 'operationId' | 'revisionId'>,
  operationId: number,
  revisionId: number,
): boolean {
  return response.operationId === operationId && response.revisionId === revisionId;
}

export function createReaderLayoutFingerprint(
  input: ReaderLayoutFingerprintInput,
): string {
  return stableSerialize(input);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`);
  return `{${entries.join(',')}}`;
}
