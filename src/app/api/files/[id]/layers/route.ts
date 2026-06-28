import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const file = await prisma.file.findUnique({
      where: { id },
    });

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const { parseHardwareFile } = await import('@/lib/parsers/parser');
    const data = parseHardwareFile(file.name, file.content);

    if (data.type !== 'pcb') {
      return NextResponse.json({ layers: [] });
    }

    const { resolveLayerStyle, getOrderedLayers } = await import('@/lib/layers/layer-colors');
    const ordered = getOrderedLayers(data.layers);

    const layers = ordered.map(l => {
      const style = resolveLayerStyle(l);
      return {
        id: l,
        name: l,
        color: style.color,
        rgba: style.rgba,
        opacity: style.opacity ?? 1,
        zIndex: style.zIndex,
        fillStyle: style.fillStyle || 'solid',
        strokeDash: style.strokeDash || null,
      };
    });

    return NextResponse.json({ layers });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch layers', message: error.message },
      { status: 500 }
    );
  }
}
