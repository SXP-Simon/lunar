import * as DocumentPicker from 'expo-document-picker';

export interface PickedEpub {
  readonly uri: string;
  readonly fileName: string;
  readonly fileSize?: number;
}

export async function pickEpub(): Promise<PickedEpub | undefined> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/epub+zip', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
    base64: false,
  });

  if (result.canceled) {
    return undefined;
  }

  const asset = result.assets[0];
  if (!asset) {
    return undefined;
  }

  return {
    uri: asset.uri,
    fileName: asset.name,
    fileSize: asset.size,
  };
}
