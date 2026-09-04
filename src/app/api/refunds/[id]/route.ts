import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// GET
export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    const refund = await prisma.refundCase.findUnique({
      where: { id },
      include: {
        documents: true,
      },
    });

    if (!refund) {
      return NextResponse.json(
        { error: "Refund case not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(refund);
  } catch (error) {
    console.error("GET REFUND ERROR:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch refund",
      },
      { status: 500 }
    );
  }
}

// PATCH
export async function PATCH(
  request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    const body = await request.json();

    const refund = await prisma.refundCase.findUnique({
      where: { id },
    });

    if (!refund) {
      return NextResponse.json(
        { error: "Refund case not found" },
        { status: 404 }
      );
    }

    if (refund.status === "EMAIL_SENT") {
      return NextResponse.json(
        {
          error:
            "This refund case cannot be edited after the email has been sent.",
        },
        { status: 400 }
      );
    }

    const updated = await prisma.refundCase.update({
      where: { id },

      data: {
        ...(body.merchant !== undefined && {
          merchant: body.merchant,
        }),

        ...(body.merchantEmail !== undefined && {
          merchantEmail: body.merchantEmail,
        }),

        ...(body.orderId !== undefined && {
          orderId: body.orderId,
        }),

        ...(body.transactionId !== undefined && {
          transactionId: body.transactionId,
        }),

        ...(body.amount !== undefined && {
          amount: body.amount,
        }),

        ...(body.currency !== undefined && {
          currency: body.currency,
        }),

        ...(body.reason !== undefined && {
          reason: body.reason,
        }),

        ...(body.purchaseDate !== undefined && {
          purchaseDate: body.purchaseDate
            ? new Date(body.purchaseDate)
            : null,
        }),

        ...(body.deadline !== undefined && {
          deadline: body.deadline
            ? new Date(body.deadline)
            : null,
        }),

        ...(body.emailSubject !== undefined && {
          emailSubject: body.emailSubject,
        }),

        ...(body.emailBody !== undefined && {
          emailBody: body.emailBody,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      refund: updated,
    });
  } catch (error) {
    console.error("PATCH REFUND ERROR:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update refund",
      },
      { status: 500 }
    );
  }
}

// DELETE
export async function DELETE(
  request: Request,
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

    const refund = await prisma.refundCase.findUnique({
      where: { id },
      include: {
        documents: true,
      },
    });

    if (!refund) {
      return NextResponse.json(
        {
          error: "Refund case not found",
        },
        { status: 404 }
      );
    }

    await prisma.refundCase.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Refund case deleted successfully",
      deletedRefundId: id,
      deletedDocuments: refund.documents.length,
    });
  } catch (error) {
    console.error("DELETE REFUND ERROR:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete refund case",
      },
      { status: 500 }
    );
  }
}