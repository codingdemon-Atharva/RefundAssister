import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export async function GET() {
  try {
    const now = new Date();

    const refunds =
      await prisma.refundCase.findMany({
        where: {
          status: "WAITING_FOR_REFUND",

          deadline: {
            not: null,
            lt: now,
          },
        },
      });

    let updatedCount = 0;

    for (const refund of refunds) {
      await prisma.refundCase.update({
        where: {
          id: refund.id,
        },

        data: {
          status: "FOLLOW_UP_REQUIRED",
        },
      });

      updatedCount++;
    }

    return NextResponse.json({
      success: true,

      checkedAt: now,

      found: refunds.length,

      updated: updatedCount,

      refunds: refunds.map((refund) => ({
        id: refund.id,
        merchant: refund.merchant,
        deadline: refund.deadline,
        previousStatus:
          "WAITING_FOR_REFUND",
        status:
          "FOLLOW_UP_REQUIRED",
      })),
    });
  } catch (error) {
    console.error(
      "CHECK DEADLINES ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to check refund deadlines",
      },
      { status: 500 }
    );
  }
}