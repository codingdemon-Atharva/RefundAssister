import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/src/lib/prisma";

export const runtime = "nodejs";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
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

    /*
     * Calculate how many days the refund is overdue.
     */

    let daysOverdue = 0;

    if (refund.deadline) {
      const now = new Date();

      const difference =
        now.getTime() -
        refund.deadline.getTime();

      daysOverdue = Math.max(
        0,
        Math.ceil(
          difference /
            (1000 * 60 * 60 * 24)
        )
      );
    }

    const prompt = `
You are a professional refund assistance system.

Generate a polite and factual follow-up email regarding a pending refund.

STRICT RULES:
- Use ONLY the information provided below.
- Never invent information.
- Do not make legal threats.
- Do not claim legal rights.
- Do not exaggerate.
- Do not accuse the merchant.
- Clearly refer to the existing refund request.
- Ask for the current refund status.
- Ask for the expected processing time.
- Keep the email concise and professional.
- Do not mention that AI generated the email.

REFUND INFORMATION:

Merchant:
${refund.merchant}

Order ID:
${refund.orderId || "Not provided"}

Transaction ID:
${refund.transactionId || "Not provided"}

Amount:
${refund.amount} ${refund.currency}

Original Reason:
${refund.reason}

Purchase Date:
${
  refund.purchaseDate
    ? refund.purchaseDate
        .toISOString()
        .split("T")[0]
    : "Not provided"
}

Expected Refund Deadline:
${
  refund.deadline
    ? refund.deadline
        .toISOString()
        .split("T")[0]
    : "Not provided"
}

Days Overdue:
${daysOverdue}

Return exactly:

SUBJECT:
<email subject>

BODY:
<email body>
`;

    const response =
      await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: prompt,
      });

    const generatedEmail =
      response.text || "";

    const subjectMatch =
      generatedEmail.match(
        /SUBJECT:\s*([\s\S]*?)\s*BODY:/i
      );

    const bodyMatch =
      generatedEmail.match(
        /BODY:\s*([\s\S]*)/i
      );

    const subject =
      subjectMatch?.[1]?.trim() ||
      `Follow-up regarding refund request`;

    const body =
      bodyMatch?.[1]?.trim() ||
      generatedEmail.trim();

    /*
     * Save the generated follow-up email.
     */

    await prisma.refundCase.update({
      where: {
        id,
      },
      data: {
        emailSubject: subject,
        emailBody: body,
        emailGeneratedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      subject,
      body,
      daysOverdue,
    });
  } catch (error) {
    console.error(
      "FOLLOW-UP EMAIL GENERATION ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate follow-up email",
      },
      { status: 500 }
    );
  }
}