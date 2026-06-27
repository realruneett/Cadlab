import axios from 'axios';

export interface GitHubFileEntry {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size?: number;
}

/**
 * Fetches the content of a file from a GitHub repository.
 * Supports public access via raw.githubusercontent.com and authenticated API requests.
 */
export async function fetchRepoFile(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token?: string
): Promise<{ content: string; size: number }> {
  // If no token is provided, attempt to fetch from the public raw API to avoid CORS and rate limits
  if (!token) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
    try {
      const res = await axios.get(rawUrl, { responseType: 'text' });
      return {
        content: typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
        size: Buffer.byteLength(typeof res.data === 'string' ? res.data : JSON.stringify(res.data), 'utf8'),
      };
    } catch (err) {
      console.warn("Public raw fetch failed, falling back to API", err);
    }
  }

  // API URL
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3.raw', // Returns raw file content directly
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await axios.get(url, {
    headers,
    responseType: 'text',
  });

  return {
    content: typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
    size: Buffer.byteLength(typeof res.data === 'string' ? res.data : JSON.stringify(res.data), 'utf8'),
  };
}

/**
 * Lists all files in a repository recursively using the Git Trees API.
 */
export async function listRepoFiles(
  owner: string,
  repo: string,
  ref: string,
  token?: string
): Promise<GitHubFileEntry[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await axios.get(url, { headers });
  
  if (!res.data || !res.data.tree) {
    return [];
  }

  return res.data.tree
    .filter((entry: any) => entry.type === 'blob') // Only files (blobs)
    .map((entry: any) => ({
      path: entry.path,
      name: entry.path.split('/').pop() || entry.path,
      type: 'file',
      size: entry.size,
    }));
}
