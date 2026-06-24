"use server";

import { getPrisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { parseHardwareFile, ParsedHardwareData } from '@/lib/parsers/parser';
import { computeVisualDiff, DiffedHardwareData } from '@/lib/diff/diffEngine';
import { 
  fetchRemoteRepositories, 
  fetchRemoteCommits, 
  fetchRemoteFiles, 
  fetchRemoteContent 
} from '@/lib/github/github-service';

/**
 * Retrieves the current logged-in user based on session context cookies.
 */
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get('cadlab_user_id')?.value;
  if (!userId) return null;

  const prisma = getPrisma();
  return prisma.user.findUnique({
    where: { id: userId }
  });
}

/**
 * Retrieves the active GitHub token, prioritizing the session cookie before falling back to the database.
 */
export async function getGitHubToken() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('cadlab_github_token')?.value;
  if (sessionToken) return sessionToken;

  // Fallback to database token if persisted
  const user = await getCurrentUser();
  return user?.accessToken || null;
}

/**
 * Persists the current session token into the database at the user's request.
 */
export async function persistTokenToDatabase() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized: User session not found");

  const token = await getGitHubToken();
  if (!token) throw new Error("No active GitHub session token to persist");

  const prisma = getPrisma();
  return prisma.user.update({
    where: { id: user.id },
    data: { accessToken: token }
  });
}

export async function logoutUser() {
  const cookieStore = await cookies();
  cookieStore.delete('cadlab_user_id');
  cookieStore.delete('cadlab_github_token');
}

export async function getRepositories() {
  const user = await getCurrentUser();
  if (!user) return [];

  const token = await getGitHubToken();
  if (!token) return [];

  try {
    const remoteRepos = await fetchRemoteRepositories(token);
    const prisma = getPrisma();

    // Cache tracking records on-the-fly to allow annotation lookups
    const records = await Promise.all(
      remoteRepos.map(async (repo) => {
        return prisma.repository.upsert({
          where: { slug: repo.slug },
          update: { name: repo.name, description: repo.description, isPrivate: repo.isPrivate },
          create: {
            name: repo.name,
            slug: repo.slug,
            description: repo.description,
            isPrivate: repo.isPrivate,
            gitPath: '',
            ownerId: user.id
          }
        });
      })
    );

    return records;
  } catch (err) {
    console.error("Failed fetching or sync processing remote repositories", err);
    return [];
  }
}

export async function getCommits(repositoryId: string) {
  const token = await getGitHubToken();
  if (!token) throw new Error("Unauthorized user access context - missing token");

  const prisma = getPrisma();
  const repo = await prisma.repository.findUnique({ where: { id: repositoryId } });
  if (!repo) throw new Error("Repository targets not found");

  return fetchRemoteCommits(token, repo.slug);
}

export async function getFiles(repositoryId: string, commitHash: string) {
  const token = await getGitHubToken();
  if (!token) return [];

  const prisma = getPrisma();
  const repo = await prisma.repository.findUnique({ where: { id: repositoryId } });
  if (!repo) return [];

  return fetchRemoteFiles(token, repo.slug, commitHash);
}

export async function getParsedFile(repositoryId: string, commitHash: string, filePath: string): Promise<ParsedHardwareData> {
  const token = await getGitHubToken();
  if (!token) throw new Error("Unauthorized identity validation context - missing token");

  const prisma = getPrisma();
  const repo = await prisma.repository.findUnique({ where: { id: repositoryId } });
  if (!repo) throw new Error("Repository target not verified");

  const rawContent = await fetchRemoteContent(token, repo.slug, commitHash, filePath);
  return parseHardwareFile(filePath, rawContent);
}

export async function getVisualDiff(
  repositoryId: string,
  oldCommitHash: string,
  newCommitHash: string,
  filePath: string
): Promise<DiffedHardwareData> {
  const token = await getGitHubToken();
  if (!token) throw new Error("Unauthorized access configuration block - missing token");

  const prisma = getPrisma();
  const repo = await prisma.repository.findUnique({ where: { id: repositoryId } });
  if (!repo) throw new Error("Repository matching target unavailable");

  // Fetching files concurrently across arbitrary commit references
  const [oldContent, newContent] = await Promise.all([
    fetchRemoteContent(token, repo.slug, oldCommitHash, filePath),
    fetchRemoteContent(token, repo.slug, newCommitHash, filePath)
  ]);

  const oldParsed = parseHardwareFile(filePath, oldContent);
  const newParsed = parseHardwareFile(filePath, newContent);

  return computeVisualDiff(oldParsed, newParsed);
}

export async function getAnnotations(commitHash: string, filePath: string) {
  const prisma = getPrisma();
  return prisma.annotation.findMany({
    where: { commitHash, filePath },
    include: { author: true },
    orderBy: { createdAt: 'asc' }
  });
}

export async function addAnnotation(
  commitHash: string,
  filePath: string,
  layerId: string,
  x: number,
  y: number,
  content: string
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Authentication session validation dropped");

  const prisma = getPrisma();
  return prisma.annotation.create({
    data: {
      commitHash,
      filePath,
      layerId,
      x,
      y,
      content,
      authorId: user.id
    },
    include: { author: true }
  });
}

export async function resolveAnnotation(annotationId: string) {
  const prisma = getPrisma();
  return prisma.annotation.update({
    where: { id: annotationId },
    data: { resolved: true }
  });
}
