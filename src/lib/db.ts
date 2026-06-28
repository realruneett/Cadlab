import { PrismaClient } from '@prisma/client';

let prismaInstance: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    console.log("[DB] getPrisma() singleton initialization triggered...");
    const { PrismaLibSql } = require('@prisma/adapter-libsql');

    const dbPath = process.env.DATABASE_URL || 'file:./dev.db';
    console.log("[DB] Initializing PrismaLibSql adapter with path:", dbPath);

    const adapter = new PrismaLibSql({
      url: dbPath,
    });

    console.log("[DB] PrismaLibSql adapter created. Instantiating PrismaClient...");
    prismaInstance = new PrismaClient({
      adapter,
      log: ['query', 'info', 'warn', 'error'],
    });
    console.log("[DB] PrismaClient successfully instantiated!");
  }
  return prismaInstance;
}

export const prisma = getPrisma();
