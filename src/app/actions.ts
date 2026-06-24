"use server";

import { getPrisma } from '@/lib/db';
import { getRepositoryCommits, getRepositoryFiles, getFileContent } from '@/lib/git/git-service';
import { parseHardwareFile, ParsedHardwareData } from '@/lib/parsers/parser';
import { computeVisualDiff, DiffedHardwareData } from '@/lib/diff/diffEngine';

/**
 * Ensures the database contains a default user and repository for instant local operation.
 */
async function ensureDefaultData() {
  const prisma = getPrisma();
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'engineer@cadlab.io',
        name: 'Hardware Architect',
      }
    });
  }

  let repo = await prisma.repository.findFirst();
  if (!repo) {
    repo = await prisma.repository.create({
      data: {
        name: 'Avionics Power Converter Board',
        slug: 'avionics-power',
        description: 'KiCad and Eagle revision logs for the flight avionics sub-circuits.',
        gitPath: '.', // Point to current workspace folder
        ownerId: user.id
      }
    });
  }

  return { user, repo };
}

export async function getRepositories() {
  const prisma = getPrisma();
  await ensureDefaultData();
  return prisma.repository.findMany({
    include: {
      owner: true
    }
  });
}

export async function getCommits(repositoryId: string) {
  const prisma = getPrisma();
  const repo = await prisma.repository.findUnique({
    where: { id: repositoryId }
  });

  if (!repo) {
    throw new Error("Repository not found");
  }

  return getRepositoryCommits(repo.gitPath);
}

export async function getFiles(repositoryId: string, commitHash: string) {
  const prisma = getPrisma();
  const repo = await prisma.repository.findUnique({
    where: { id: repositoryId }
  });

  if (!repo) {
    throw new Error("Repository not found");
  }

  return getRepositoryFiles(repo.gitPath, commitHash);
}

export async function getParsedFile(repositoryId: string, commitHash: string, filePath: string): Promise<ParsedHardwareData> {
  const prisma = getPrisma();
  const repo = await prisma.repository.findUnique({
    where: { id: repositoryId }
  });

  if (!repo) {
    throw new Error("Repository not found");
  }

  const rawContent = await getFileContent(repo.gitPath, commitHash, filePath);
  return parseHardwareFile(filePath, rawContent);
}

export async function getVisualDiff(
  repositoryId: string,
  oldCommitHash: string,
  newCommitHash: string,
  filePath: string
): Promise<DiffedHardwareData> {
  const prisma = getPrisma();
  const repo = await prisma.repository.findUnique({
    where: { id: repositoryId }
  });

  if (!repo) {
    throw new Error("Repository not found");
  }

  const oldContent = await getFileContent(repo.gitPath, oldCommitHash, filePath);
  const newContent = await getFileContent(repo.gitPath, newCommitHash, filePath);

  const oldParsed = parseHardwareFile(filePath, oldContent);
  const newParsed = parseHardwareFile(filePath, newContent);

  return computeVisualDiff(oldParsed, newParsed);
}

export async function getAnnotations(commitHash: string, filePath: string) {
  const prisma = getPrisma();
  return prisma.annotation.findMany({
    where: {
      commitHash,
      filePath
    },
    orderBy: {
      createdAt: 'asc'
    }
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
  const prisma = getPrisma();
  const { user } = await ensureDefaultData();
  
  return prisma.annotation.create({
    data: {
      commitHash,
      filePath,
      layerId,
      x,
      y,
      content,
      authorId: user.id
    }
  });
}

export async function resolveAnnotation(annotationId: string) {
  const prisma = getPrisma();
  return prisma.annotation.update({
    where: { id: annotationId },
    data: { resolved: true }
  });
}
