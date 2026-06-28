// src/app/api/files/[id]/snapshot/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const width = parseInt(searchParams.get('width') || '800');
    const height = parseInt(searchParams.get('height') || '600');
    const layers = searchParams.get('layers')?.split(',') || [];

    const file = await prisma.file.findUnique({
      where: { id },
      include: { snapshots: { orderBy: { createdAt: 'desc' } } },
    });

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const matchingSnapshot = file.snapshots.find(
      s => s.width === width && s.height === height
    );

    if (matchingSnapshot) {
      return NextResponse.json({
        fileId: id,
        url: matchingSnapshot.url,
        width,
        height,
        generatedAt: matchingSnapshot.createdAt,
        cached: true,
      });
    }

    return NextResponse.json({
      fileId: id,
      url: null,
      width,
      height,
      cached: false,
      message: 'Snapshot generation queued',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch snapshot', message: error.message },
      { status: 500 }
    );
  }
}
