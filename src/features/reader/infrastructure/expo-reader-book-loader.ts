import { File } from 'expo-file-system';

export async function readReaderBook(fileUri: string): Promise<ArrayBuffer> {
  const file = new File(fileUri);
  if (!file.exists) {
    throw new Error('书籍文件已经移动或删除。');
  }
  return file.arrayBuffer();
}
