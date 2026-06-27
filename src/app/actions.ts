"use server";

import { getPrisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { parseHardwareFile, ParsedHardwareData } from '@/lib/parsers/parser';
import { computeVisualDiff, DiffedHardwareData } from '@/lib/diff/diffEngine';
import { 
  fetchRemoteCommits, 
  fetchRemoteFiles, 
  fetchRemoteContent,
  fetchRemoteRepositories
} from '@/lib/github/github-service';

/**
 * Resolves token identity from database records, falling back to secure cookies.
 */
export async function getGitHubToken(): Promise<string> {
  const cookieStore = await cookies();
  const userId = cookieStore.get('cadlab_user_id')?.value;
  const tokenCookie = cookieStore.get('cadlab_github_token')?.value;
  
  if (tokenCookie) return tokenCookie;
  if (!userId) throw new Error("Unauthenticated request footprint");

  const user = await getPrisma().user.findUnique({ where: { id: userId } });
  if (!user || !user.accessToken) throw new Error("Missing active GitHub access token");
  return user.accessToken;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get('cadlab_user_id')?.value;
  if (!userId) return null;
  return getPrisma().user.findUnique({ where: { id: userId } });
}

export async function logoutUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get('cadlab_user_id')?.value;
  
  if (userId) {
    const prisma = getPrisma();
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { accessToken: null }
      });
    } catch (err) {
      console.error("Failed to clear database access token on logout:", err);
    }
  }

  cookieStore.delete('cadlab_user_id');
  cookieStore.delete('cadlab_github_token');
}

/**
 * Enterprise Access Guard check verification.
 */
async function checkRepositoryAccess(repositoryId: string, userId: string) {
  const prisma = getPrisma();
  const repo = await prisma.repository.findUnique({
    where: { id: repositoryId },
    include: { members: true }
  });

  if (!repo) throw new Error("Repository not found");
  
  const isOwner = repo.ownerId === userId;
  const isTeamMember = repo.members.some(m => m.userId === userId);
  
  if (!isOwner && !isTeamMember) {
    throw new Error("Access Denied: You are not authorized to view this design workspace");
  }
  return repo;
}

export async function getRepositories() {
  const user = await getCurrentUser();
  if (!user) return [];

  const token = await getGitHubToken().catch(() => '');
  if (token) {
    try {
      const remoteRepos = await fetchRemoteRepositories(token);
      const prisma = getPrisma();

      // Cache tracking records on-the-fly
      await Promise.all(
        remoteRepos.map(async (repo) => {
          const existing = await prisma.repository.findUnique({ where: { slug: repo.slug } });
          if (!existing) {
            await prisma.repository.create({
              data: {
                name: repo.name,
                slug: repo.slug,
                description: repo.description,
                isPrivate: repo.isPrivate,
                gitPath: '',
                ownerId: user.id
              }
            });
          } else {
            // Update metadata but keep the existing owner
            await prisma.repository.update({
              where: { slug: repo.slug },
              data: {
                name: repo.name,
                description: repo.description,
                isPrivate: repo.isPrivate
              }
            });
          }
        })
      );
    } catch (err) {
      console.error("Failed fetching or sync processing remote repositories", err);
    }
  }

  return getPrisma().repository.findMany({
    where: {
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } }
      ]
    },
    include: {
      owner: true,
      members: { include: { user: true } }
    }
  });
}

export async function addRepositoryCollaborator(
  repositoryId: string,
  targetEmail: string,
  role: "ADMIN" | "DEVELOPER" | "REVIEWER"
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized identity scope");

  const prisma = getPrisma();
  const repo = await prisma.repository.findUnique({
    where: { id: repositoryId },
    include: { members: true }
  });

  if (!repo) throw new Error("Repository not found");
  if (repo.ownerId !== user.id && !repo.members.some(m => m.userId === user.id && m.role === "ADMIN")) {
    throw new Error("Forbidden: Only owners or administrators can modify team matrices.");
  }

  // Create a stub account on the fly if the teammate has not logged into the system yet
  const targetUser = await prisma.user.upsert({
    where: { email: targetEmail },
    update: {},
    create: {
      email: targetEmail,
      name: targetEmail.split('@')[0],
      accessToken: null
    }
  });

  return prisma.repositoryMember.upsert({
    where: { userId_repositoryId: { userId: targetUser.id, repositoryId } },
    update: { role },
    create: { userId: targetUser.id, repositoryId, role }
  });
}

export async function getCommits(repositoryId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  
  const repo = await checkRepositoryAccess(repositoryId, user.id);
  const token = await getGitHubToken();
  return fetchRemoteCommits(token, repo.slug);
}

export async function getFiles(repositoryId: string, commitHash: string) {
  const user = await getCurrentUser();
  if (!user) return [];
  
  try {
    const repo = await checkRepositoryAccess(repositoryId, user.id);
    const token = await getGitHubToken();
    return fetchRemoteFiles(token, repo.slug, commitHash);
  } catch {
    return [];
  }
}

export async function getParsedFile(repositoryId: string, commitHash: string, filePath: string): Promise<ParsedHardwareData> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const repo = await checkRepositoryAccess(repositoryId, user.id);
  const token = await getGitHubToken();
  const rawContent = await fetchRemoteContent(token, repo.slug, commitHash, filePath);
  
  return parseHardwareFile(filePath, rawContent);
}

export async function getVisualDiff(
  repositoryId: string,
  oldCommitHash: string,
  newCommitHash: string,
  filePath: string
): Promise<DiffedHardwareData> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const repo = await checkRepositoryAccess(repositoryId, user.id);
  const token = await getGitHubToken();

  const [oldContent, newContent] = await Promise.all([
    fetchRemoteContent(token, repo.slug, oldCommitHash, filePath),
    fetchRemoteContent(token, repo.slug, newCommitHash, filePath)
  ]);

  return computeVisualDiff(parseHardwareFile(filePath, oldContent), parseHardwareFile(filePath, newContent));
}

export async function getAnnotations(commitHash: string, filePath: string) {
  return getPrisma().annotation.findMany({
    where: { commitHash, filePath },
    include: { author: true },
    orderBy: { createdAt: 'asc' }
  });
}

export async function addAnnotation(commitHash: string, filePath: string, layerId: string, x: number, y: number, content: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized user session scope");

  return getPrisma().annotation.create({
    data: { commitHash, filePath, layerId, x, y, content, authorId: user.id },
    include: { author: true }
  });
}

export async function resolveAnnotation(annotationId: string) {
  return getPrisma().annotation.update({
    where: { id: annotationId },
    data: { resolved: true }
  });
}
