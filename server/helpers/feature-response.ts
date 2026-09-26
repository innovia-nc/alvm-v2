import { NextResponse } from 'next/server';
import { TRPCError } from '@trpc/server';
import { prisma } from '@/server/db';
import { assertFeaturesEnabled } from './features';
import type { FeatureKey } from '@/lib/features/catalog';

export async function featureResponse(role: string | undefined, keys: FeatureKey[]) {
  try {
    await assertFeaturesEnabled(prisma, role, keys);
    return null;
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'FORBIDDEN') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
