import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const allowedTransitions: Record<string, string[]> = {
  PENDING: [
    "EMAIL_DRAFTED",
  ],

  EMAIL_DRAFTED: [
    "EMAIL_SENT",
  ],

  EMAIL_SENT: [
    "WAITING_FOR_REFUND",
  ],

  WAITING_FOR_REFUND: [
    "ACKNOWLEDGED",
    "FOLLOW_UP_REQUIRED",
  ],

  ACKNOWLEDGED: [
    "REFUND_APPROVED",
    "FOLLOW_UP_REQUIRED",
  ],

  REFUND_APPROVED: [
    "REFUND_RECEIVED",
    "FOLLOW_UP_REQUIRED",
  ],

  REFUND_RECEIVED: [
    "CLOSED",
  ],

  FOLLOW_UP_REQUIRED: [
    "EMAIL_SENT",
    "CLOSED",
  ],

  CLOSED: [],
};

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error: "Refund ID is required",
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    const nextStatus = body.status;

    if (!nextStatus) {
      return NextResponse.json(
        {
          error: "Status is required",
        },
        { status: 400 }
      );
    }

    const refund =
      await prisma.refundCase.findUnique({
        where: {
          id,
        },
      });

    if (!refund) {
      return NextResponse.json(
        {
          error: "Refund not found",
        },
        { status: 404 }
      );
    }

    const currentStatus =
      refund.status;

    const allowed =
      allowedTransitions[currentStatus] || [];

    if (!allowed.includes(nextStatus)) {
      return NextResponse.json(
        {
          error: "Invalid status transition",

          currentStatus,

          requestedStatus:
            nextStatus,

          allowedTransitions:
            allowed,
        },
        { status: 400 }
      );
    }

    const updatedRefund =
      await prisma.refundCase.update({
        where: {
          id,
        },

        data: {
          status: nextStatus,
        },
      });

    return NextResponse.json({
      success: true,

      previousStatus:
        currentStatus,

      status:
        updatedRefund.status,

      refund:
        updatedRefund,
    });
  } catch (error) {
    console.error(
      "STATUS UPDATE ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update refund status",
      },
      { status: 500 }
    );
  }
}