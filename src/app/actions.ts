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

export async function logoutUser() {
  const cookieStore = await cookies();
  cookieStore.delete('cadlab_user_id');
}

export async function getRepositories() {
  const user = await getCurrentUser();
  if (!user || !user.accessToken) {
    return []; // Return empty or map local fallback definitions
  }

  try {
    const remoteRepos = await fetchRemoteRepositories(user.accessToken);
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
  const user = await getCurrentUser();
  if (!user || !user.accessToken) throw new Error("Unauthorized user access context");

  const prisma = getPrisma();
  const repo = await prisma.repository.findUnique({ where: { id: repositoryId } });
  if (!repo) throw new Error("Repository targets not found");

  return fetchRemoteCommits(user.accessToken, repo.slug);
}

export async function getFiles(repositoryId: string, commitHash: string) {
  const user = await getCurrentUser();
  if (!user || !user.accessToken) return [];

  const prisma = getPrisma();
  const repo = await prisma.repository.findUnique({ where: { id: repositoryId } });
  if (!repo) return [];

  return fetchRemoteFiles(user.accessToken, repo.slug, commitHash);
}

export async function getParsedFile(repositoryId: string, commitHash: string, filePath: string): Promise<ParsedHardwareData> {
  const user = await getCurrentUser();
  if (!user || !user.accessToken) throw new Error("Unauthorized identity validation context");

  const prisma = getPrisma();
  const repo = await prisma.repository.findUnique({ where: { id: repositoryId } });
  if (!repo) throw new Error("Repository target not verified");

  const rawContent = await fetchRemoteContent(user.accessToken, repo.slug, commitHash, filePath);
  return parseHardwareFile(filePath, rawContent);
}

export async function getVisualDiff(
  repositoryId: string,
  oldCommitHash: string,
  newCommitHash: string,
  filePath: string
): Promise<DiffedHardwareData> {
  const user = await getCurrentUser();
  if (!user || !user.accessToken) throw new Error("Unauthorized access configuration block");

  const prisma = getPrisma();
  const repo = await prisma.repository.findUnique({ where: { id: repositoryId } });
  if (!repo) throw new Error("Repository matching target unavailable");

  // Fetching files concurrently across arbitrary commit references
  const [oldContent, newContent] = await Promise.all([
    fetchRemoteContent(user.accessToken, repo.slug, oldCommitHash, filePath),
    fetchRemoteContent(user.accessToken, repo.slug, newCommitHash, filePath)
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
