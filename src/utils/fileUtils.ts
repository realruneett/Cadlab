export interface FileEntry {
  name: string;
  relativePath: string;
  size: number;
  lastModified: number;
  content?: string;
  isBinary: boolean;
  file?: File;
}

/**
 * Normalizes a file path by replacing backslashes with forward slashes
 * and removing duplicate/trailing slashes.
 */
export function normalizePath(path: string): string {
  let normalized = path.replace(/\\/g, '/');
  normalized = normalized.replace(/\/+/g, '/');
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  if (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  }
  return normalized;
}

/**
 * Checks if a buffer contains null bytes, which indicates it is a binary file.
 */
export function isBinary(buffer: Uint8Array): boolean {
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a File object is binary by reading its first 8KB.
 */
export async function isBinaryFile(file: File): Promise<boolean> {
  const slice = file.slice(0, 8192);
  const buffer = await slice.arrayBuffer();
  const arr = new Uint8Array(buffer);
  return isBinary(arr);
}

/**
 * Reads a File object as text.
 */
export async function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read file: content is not a string"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Recursively reads all files in a directory handle using the File System Access API.
 */
export async function readDirectoryRecursive(
  dirHandle: FileSystemDirectoryHandle,
  currentPath: string = ''
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  
  // Cast to `any` because older TypeScript DOM typings omit `FileSystemDirectoryHandle.values()`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const entry of (dirHandle as any).values()) {
    const relativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    
    if (entry.kind === 'file') {
      const fileHandle = entry as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const isBin = await isBinaryFile(file);
      
      entries.push({
        name: entry.name,
        relativePath,
        size: file.size,
        lastModified: file.lastModified,
        isBinary: isBin,
        file
      });
    } else if (entry.kind === 'directory') {
      const subDirHandle = entry as FileSystemDirectoryHandle;
      const subEntries = await readDirectoryRecursive(subDirHandle, relativePath);
      entries.push(...subEntries);
    }
  }
  
  return entries;
}
