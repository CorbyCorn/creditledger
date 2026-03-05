import { NextResponse } from 'next/server';
import { syncAllData } from '@/lib/openai-client';
import { storeDailyCost, storeDailyUsage, storeCreditBalance, getCreditBalance, setLastSync } from '@/lib/redis';

export const maxDuration = 60;

export async function POST() {
  try {
    const { costs, usage, credits } = await syncAllData(90);

    // Only update credit balance if we got real data (totalUsed > 0)
    // to avoid overwriting good data with fallback values
    const existingBalance = await getCreditBalance();
    const shouldUpdateBalance = credits.totalUsed > 0 || !existingBalance;

    await Promise.all([
      ...costs.map((c) => storeDailyCost(c)),
      ...usage.map((u) => storeDailyUsage(u)),
      ...(shouldUpdateBalance ? [storeCreditBalance(credits)] : []),
      setLastSync(new Date().toISOString()),
    ]);

    const finalBalance = shouldUpdateBalance ? credits : existingBalance;

    return NextResponse.json({
      success: true,
      synced: {
        costDays: costs.length,
        usageDays: usage.length,
        creditBalance: finalBalance?.remaining ?? credits.remaining,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
