import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sections } from '@/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    const rows = await db.select().from(sections).orderBy(desc(sections.updatedAt));
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, description, projectData, revision } = body;
    await db.insert(sections).values({
      id,
      name,
      description: description ?? '',
      projectData,
      revision: revision ?? 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: sections.id,
      set: {
        name,
        description: description ?? '',
        projectData,
        revision: revision ?? 1,
        updatedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
