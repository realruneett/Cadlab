export interface GitHubRepoInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isPrivate: boolean;
}

export interface GitHubCommitInfo {
  hash: string;
  message: string;
  authorName: string;
  authorEmail: string;
  createdAt: Date;
}

export interface GitHubFileInfo {
  name: string;
  path: string;
  isDir: boolean;
}

export async function fetchRemoteRepositories(token: string): Promise<GitHubRepoInfo[]> {
  const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) throw new Error("Failed to pull dynamic GitHub repositories");
  const data = await res.json();
  return data.map((r: any) => ({
    id: String(r.id),
    name: r.name,
    slug: r.full_name,
    description: r.description,
    isPrivate: r.private,
  }));
}

export async function fetchRemoteCommits(token: string, slug: string): Promise<GitHubCommitInfo[]> {
  const res = await fetch(`https://api.github.com/repos/${slug}/commits?per_page=50`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((c: any) => ({
    hash: c.sha,
    message: c.commit.message,
    authorName: c.commit.author?.name || c.commit.committer?.name || "Unknown Author",
    authorEmail: c.commit.author?.email || c.commit.committer?.email || "",
    createdAt: new Date(c.commit.author?.date || c.commit.committer?.date),
  }));
}

export async function fetchRemoteFiles(token: string, slug: string, sha: string): Promise<GitHubFileInfo[]> {
  // Pulling Git trees recursively to gather layout objects anywhere in structural folders
  const res = await fetch(`https://api.github.com/repos/${slug}/git/trees/${sha}?recursive=1`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  
  if (!data.tree) return [];
  
  return data.tree
    .filter((entry: any) => entry.type === 'blob')
    .map((entry: any) => ({
      name: entry.path.split('/').pop() || entry.path,
      path: entry.path,
      isDir: false
    }))
    .filter((f: any) => 
      f.name.endsWith('.kicad_pcb') || 
      f.name.endsWith('.kicad_sch') || 
      f.name.endsWith('.brd') || 
      f.name.endsWith('.sch')
    );
}

export async function fetchRemoteContent(token: string, slug: string, sha: string, filePath: string): Promise<string> {
  const url = `https://api.github.com/repos/${slug}/contents/${filePath}?ref=${sha}`;
  const res = await fetch(url, {
    headers: { 
      Authorization: `Bearer ${token}`, 
      Accept: 'application/vnd.github.v3.raw' // Returns raw text/binary structure directly
    },
  });
  if (!res.ok) throw new Error(`Could not fetch file content from ${filePath} at commit ${sha}`);
  return res.text();
}
