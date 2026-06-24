import git from 'isomorphic-git';
import fs from 'fs';
import path from 'path';
import {
  mockKiCadPcbRevA,
  mockKiCadPcbRevB,
  mockKiCadSchRevA,
  mockKiCadSchRevB,
  mockEagleBrdRevA,
  mockEagleBrdRevB
} from './mock-data';

export interface GitCommitInfo {
  hash: string;
  message: string;
  authorName: string;
  authorEmail: string;
  createdAt: Date;
}

export interface GitFileInfo {
  name: string;
  path: string;
  isDir: boolean;
}

const MOCK_COMMITS: GitCommitInfo[] = [
  {
    hash: 'commit-2-new',
    message: 'Update routing, move R1, add R3 component and filter capacitor',
    authorName: 'Hardware Lead',
    authorEmail: 'lead@cadlab.io',
    createdAt: new Date('2026-06-24T12:00:00Z')
  },
  {
    hash: 'commit-1-old',
    message: 'Initial schematic placement and basic board layout routing',
    authorName: 'Junior Layout Designer',
    authorEmail: 'junior@cadlab.io',
    createdAt: new Date('2026-06-24T10:00:00Z')
  }
];

export async function getRepositoryCommits(repoPath: string): Promise<GitCommitInfo[]> {
  try {
    const gitDir = path.resolve(repoPath);
    // Check if .git directory exists
    if (!fs.existsSync(path.join(gitDir, '.git'))) {
      return MOCK_COMMITS;
    }
    const commits = await git.log({
      fs,
      dir: gitDir,
      depth: 20
    });
    return commits.map(c => ({
      hash: c.oid,
      message: c.commit.message.trim(),
      authorName: c.commit.author.name,
      authorEmail: c.commit.author.email,
      createdAt: new Date(c.commit.author.timestamp * 1000)
    }));
  } catch (error) {
    return MOCK_COMMITS;
  }
}

export async function getRepositoryFiles(repoPath: string, commitHash: string): Promise<GitFileInfo[]> {
  if (commitHash === 'commit-1-old' || commitHash === 'commit-2-new') {
    return [
      { name: 'board.kicad_pcb', path: 'board.kicad_pcb', isDir: false },
      { name: 'schematic.kicad_sch', path: 'schematic.kicad_sch', isDir: false },
      { name: 'sensor_board.brd', path: 'sensor_board.brd', isDir: false }
    ];
  }

  try {
    const gitDir = path.resolve(repoPath);
    if (!fs.existsSync(path.join(gitDir, '.git'))) {
      return [
        { name: 'board.kicad_pcb', path: 'board.kicad_pcb', isDir: false },
        { name: 'schematic.kicad_sch', path: 'schematic.kicad_sch', isDir: false },
        { name: 'sensor_board.brd', path: 'sensor_board.brd', isDir: false }
      ];
    }
    const commit = await git.readCommit({ fs, dir: gitDir, oid: commitHash });
    const { tree } = commit.commit;
    
    const obj = await git.readTree({ fs, dir: gitDir, oid: tree });
    return obj.tree.map(entry => ({
      name: entry.path,
      path: entry.path,
      isDir: entry.type === 'tree'
    })).filter(f => f.name.endsWith('.kicad_pcb') || f.name.endsWith('.kicad_sch') || f.name.endsWith('.brd') || f.name.endsWith('.sch'));
  } catch (error) {
    return [
      { name: 'board.kicad_pcb', path: 'board.kicad_pcb', isDir: false },
      { name: 'schematic.kicad_sch', path: 'schematic.kicad_sch', isDir: false },
      { name: 'sensor_board.brd', path: 'sensor_board.brd', isDir: false }
    ];
  }
}

export async function getFileContent(repoPath: string, commitHash: string, filePath: string): Promise<string> {
  if (commitHash === 'commit-1-old') {
    if (filePath.endsWith('kicad_pcb')) return mockKiCadPcbRevA;
    if (filePath.endsWith('kicad_sch')) return mockKiCadSchRevA;
    if (filePath.endsWith('brd') || filePath.endsWith('sch')) return mockEagleBrdRevA;
  }
  if (commitHash === 'commit-2-new') {
    if (filePath.endsWith('kicad_pcb')) return mockKiCadPcbRevB;
    if (filePath.endsWith('kicad_sch')) return mockKiCadSchRevB;
    if (filePath.endsWith('brd') || filePath.endsWith('sch')) return mockEagleBrdRevB;
  }

  try {
    const gitDir = path.resolve(repoPath);
    const { blob } = await git.readBlob({
      fs,
      dir: gitDir,
      oid: commitHash,
      filepath: filePath
    });
    return new TextDecoder().decode(blob);
  } catch (error) {
    if (filePath.endsWith('kicad_pcb')) return mockKiCadPcbRevB;
    if (filePath.endsWith('kicad_sch')) return mockKiCadSchRevB;
    return mockEagleBrdRevB;
  }
}
