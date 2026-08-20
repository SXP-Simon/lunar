import type {
  ReaderLayoutRequest,
  ReaderOpenRequest,
  ReaderOpenResult,
  ReaderSnapshot,
} from '../contracts';

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
  close(): Promise<void>;
}
