import { NextRequest, NextResponse } from 'next/server';
import { storeCreditBalance, getCreditBalance, storeDailyCost, storeDailyUsage, setLastSync } from '@/lib/redis';
import { TOTAL_CREDIT_GRANT } from '@/lib/constants';
import { syncAllData } from '@/lib/openai-client';
import { Redis } from '@upstash/redis';

export const maxDuration = 60;

/**
 * POST /api/admin/fix-balance
 *
 * Actions:
 * - { totalUsed: number } — Set credit balance
 * - { resync: true } — Clear old costs and re-sync from OpenAI
 * - Both can be combined
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const results: Record<string, unknown> = {};

    // Set credit balance if provided
    if (typeof body.totalUsed === 'number' && body.totalUsed > 0) {
      await storeCreditBalance({
        totalGranted: TOTAL_CREDIT_GRANT,
        totalUsed: body.totalUsed,
        remaining: TOTAL_CREDIT_GRANT - body.totalUsed,
        lastUpdated: new Date().toISOString(),
      });
      results.balance = {
        totalGranted: TOTAL_CREDIT_GRANT,
        totalUsed: body.totalUsed,
        remaining: TOTAL_CREDIT_GRANT - body.totalUsed,
      };
    }

    // Clear and resync if requested
    if (body.resync) {
      // Clear old cost data
      const url = process.env.UPSTASH_REDIS_REST_URL;
      const token = process.env.UPSTASH_REDIS_REST_TOKEN;
      if (url && token) {
        const redis = new Redis({ url, token });
        await redis.del('costs:daily');
        await redis.del('usage:daily');
      }

      const daysBack = body.daysBack || 90;
      const { costs, usage, credits } = await syncAllData(daysBack);

      await Promise.all([
        ...costs.map((c) => storeDailyCost(c)),
        ...usage.map((u) => storeDailyUsage(u)),
        setLastSync(new Date().toISOString()),
      ]);

      // Only update credit balance from sync if we got real data and didn't manually set it above
      if (credits.totalUsed > 0 && !body.totalUsed) {
        await storeCreditBalance(credits);
        results.balance = credits;
      }

      results.synced = {
        costDays: costs.length,
        usageDays: usage.length,
      };
    }

    if (Object.keys(results).length === 0) {
      return NextResponse.json({ error: 'Provide totalUsed and/or resync:true' }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
