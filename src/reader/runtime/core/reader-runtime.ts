import type {
  ReaderLayoutRequest,
  ReaderFootnote,
  ReaderOpenRequest,
  ReaderOpenResult,
  ReaderSearchRequest,
  ReaderSearchResponse,
  ReaderTextRangeGeometryRequest,
  ReaderTextRangeRect,
  ReaderSnapshot,
} from '../../contracts';
import type { ReaderHitMap } from '../../interaction/hit-testing';

export type ReaderSnapshotListener = (snapshot: ReaderSnapshot) => void;

export interface ReaderRuntime {
  getSnapshot(): ReaderSnapshot;
  subscribe(listener: ReaderSnapshotListener): () => void;
  open(request: ReaderOpenRequest): Promise<ReaderOpenResult>;
  updateLayout(request: ReaderLayoutRequest): Promise<ReaderSnapshot>;
  goToSpread(spreadIndex: number): Promise<ReaderSnapshot>;
  goToToc(href: string): Promise<ReaderSnapshot>;
  next(): Promise<ReaderSnapshot>;
  previous(): Promise<ReaderSnapshot>;
  getCurrentHitMap(spreadIndex?: number): ReaderHitMap | undefined;
  readFootnote(key: string, spreadIndex?: number): Promise<ReaderFootnote | undefined>;
  search(request: ReaderSearchRequest): Promise<ReaderSearchResponse>;
  resolveTextRangeGeometry(request: ReaderTextRangeGeometryRequest): Promise<readonly ReaderTextRangeRect[]>;
  close(): Promise<void>;
}
