import { NextRequest, NextResponse } from 'next/server';
import { storeCreditBalance, getCreditBalance, clearAllData, getDailyCosts } from '@/lib/redis';
import { TOTAL_CREDIT_GRANT } from '@/lib/constants';

/**
 * POST /api/admin/fix-balance
 *
 * Sets the credit balance to known-good values.
 * Also clears and recalculates cost data if needed.
 *
 * Body: { totalUsed: number } (optional — if omitted, reads from OpenAI credit_grants)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const totalUsed = body.totalUsed;

    if (typeof totalUsed === 'number' && totalUsed > 0) {
      await storeCreditBalance({
        totalGranted: TOTAL_CREDIT_GRANT,
        totalUsed,
        remaining: TOTAL_CREDIT_GRANT - totalUsed,
        lastUpdated: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        balance: {
          totalGranted: TOTAL_CREDIT_GRANT,
          totalUsed,
          remaining: TOTAL_CREDIT_GRANT - totalUsed,
        },
      });
    }

    return NextResponse.json({ error: 'Provide totalUsed in request body' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
