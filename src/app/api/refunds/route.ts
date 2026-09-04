import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export async function GET() {
  try {
    const refunds = await prisma.refundCase.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(refunds);
  } catch (error) {
    console.error("GET /api/refunds ERROR:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load refunds",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      merchant,
      merchantEmail,
      orderId,
      transactionId,
      amount,
      currency,
      reason,
      purchaseDate,
      deadline,
    } = body;

    if (!merchant || !amount || !reason) {
      return NextResponse.json(
        {
          error:
            "Merchant, amount and reason are required.",
        },
        { status: 400 }
      );
    }

    // Temporary development user.
    // Authentication will replace this later.
    let user = await prisma.user.findFirst();

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: "demo@refundassister.local",
          name: "Demo User",
        },
      });
    }

    const refund = await prisma.refundCase.create({
      data: {
        userId: user.id,

        merchant,

        merchantEmail:
          merchantEmail || null,

        orderId:
          orderId || null,

        transactionId:
          transactionId || null,

        amount: String(amount),

        currency:
          currency || "INR",

        reason,

        purchaseDate:
          purchaseDate
            ? new Date(purchaseDate)
            : null,

        deadline:
          deadline
            ? new Date(deadline)
            : null,

        status: "PENDING",
      },
    });

    return NextResponse.json(
      refund,
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "POST /api/refunds ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create refund",
      },
      { status: 500 }
    );
  }
}