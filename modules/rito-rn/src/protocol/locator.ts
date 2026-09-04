import type { RitoLocator, RitoSourcePoint, RitoSourceRange } from './artifact-types';
import { RitoBinaryReader } from './binary';

export function readRitoLocator(
  reader: RitoBinaryReader,
  field = 'locator',
): RitoLocator {
  return reader.readRecord(field, (record) => ({
    href: record.readUtf8(),
    anchorId: record.readOption('locator anchor', () => record.readUtf8()),
    sourcePoint: record.readOption('source point', () => readRitoSourcePoint(record)),
    sourceRange: record.readOption('source range', () => readRitoSourceRange(record)),
    progression: record.readOption('locator progression', () => record.readF64()),
  }));
}

export function readRitoSourcePoint(reader: RitoBinaryReader): RitoSourcePoint {
  return reader.readRecord('source point', (record) => ({
    nodePath: Array.from(
      { length: record.readCount('source point path') },
      () => record.readU32(),
    ),
    textOffset: record.readU64(),
  }));
}

function readRitoSourceRange(reader: RitoBinaryReader): RitoSourceRange {
  return reader.readRecord('source range', (record) => ({
    start: readRitoSourcePoint(record),
    end: readRitoSourcePoint(record),
  }));
}
