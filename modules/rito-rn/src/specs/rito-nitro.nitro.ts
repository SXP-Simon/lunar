import type { HybridObject } from 'react-native-nitro-modules'

export interface RitoNitroResult {
  status: number
  data: ArrayBuffer
  error: string
}

export interface RitoNitroPinnedFontFace {
  bytes: ArrayBuffer
  expectedSha256: string
  genericRole: number
  language?: string
}

export interface RitoNitro extends HybridObject<{ android: 'c++', ios: 'c++' }> {
  open(
    publication: ArrayBuffer,
    request: ArrayBuffer,
    fonts: RitoNitroPinnedFontFace[],
  ): Promise<RitoNitroResult>
  readPublication(sessionId: string): Promise<RitoNitroResult>
  requestArtifact(sessionId: string, request: ArrayBuffer): Promise<RitoNitroResult>
  requestAdjacent(sessionId: string, request: ArrayBuffer): Promise<RitoNitroResult>
  peekAdjacent(sessionId: string, request: ArrayBuffer): Promise<RitoNitroResult>
  adoptForeground(sessionId: string, request: ArrayBuffer): Promise<RitoNitroResult>
  commitPeekedArtifact(sessionId: string, request: ArrayBuffer): Promise<RitoNitroResult>
  advanceBackground(sessionId: string, request: ArrayBuffer): Promise<RitoNitroResult>
  adoptBackground(sessionId: string, request: ArrayBuffer): Promise<RitoNitroResult>
  readResource(sessionId: string, artifactId: string, kind: number, href: string): Promise<RitoNitroResult>
  search(sessionId: string, request: ArrayBuffer): Promise<RitoNitroResult>
  textRangeGeometry(sessionId: string, request: ArrayBuffer): Promise<RitoNitroResult>
  readFootnote(sessionId: string, artifactId: string, key: string): Promise<RitoNitroResult>
  releaseArtifact(sessionId: string, artifactId: string): Promise<RitoNitroResult>
  disposeSession(sessionId: string): Promise<RitoNitroResult>
}
