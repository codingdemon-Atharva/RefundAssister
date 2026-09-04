import { NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/src/lib/prisma";

const resend = new Resend(
  process.env.RESEND_API_KEY
);

export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
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

    const refund =
      await prisma.refundCase.findUnique({
        where: {
          id,
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

    if (!refund.merchantEmail) {
      return NextResponse.json(
        {
          error:
            "Merchant email address is missing. Please add a merchant email before sending.",
        },
        { status: 400 }
      );
    }

    if (!refund.emailSubject) {
      return NextResponse.json(
        {
          error:
            "Please generate the refund email first.",
        },
        { status: 400 }
      );
    }

    if (!refund.emailBody) {
      return NextResponse.json(
        {
          error:
            "Refund email body is missing. Please generate the email first.",
        },
        { status: 400 }
      );
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        {
          error:
            "RESEND_API_KEY is not configured.",
        },
        { status: 500 }
      );
    }

    /*
     * For development/testing, Resend's verified
     * sender should be used here.
     *
     * Add this to .env:
     *
     * RESEND_FROM_EMAIL="onboarding@resend.dev"
     */

    const fromEmail =
      process.env.RESEND_FROM_EMAIL ||
      "onboarding@resend.dev";

    const result = await resend.emails.send({
      from: fromEmail,
      to: [refund.merchantEmail],
      subject: refund.emailSubject,
      text: refund.emailBody,
    });

    if (result.error) {
      console.error(
        "RESEND ERROR:",
        result.error
      );

      return NextResponse.json(
        {
          error:
            result.error.message ||
            "Failed to send email",
        },
        { status: 500 }
      );
    }

    const updatedRefund =
      await prisma.refundCase.update({
        where: {
          id,
        },
        data: {
          emailSentAt: new Date(),
          status: "WAITING_FOR_REFUND",
        },
      });

    return NextResponse.json({
      success: true,
      message: "Refund email sent successfully",
      emailId: result.data?.id || null,
      refund: updatedRefund,
    });
  } catch (error) {
    console.error(
      "SEND REFUND EMAIL ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send refund email",
      },
      { status: 500 }
    );
  }
}