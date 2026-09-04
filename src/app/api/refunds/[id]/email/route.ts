import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/src/lib/prisma";

type Context = {
  params: Promise<{
    id: string;
  }>;
};

const apiKey = process.env.GEMINI_API_KEY;

const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
    })
  : null;

export async function POST(
  request: Request,
  context: Context
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
        where: { id },
      });

    if (!refund) {
      return NextResponse.json(
        {
          error: "Refund case not found",
        },
        { status: 404 }
      );
    }

    if (!ai) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY is not configured.",
        },
        { status: 500 }
      );
    }

    const prompt = `
You are a refund assistance system.

Generate a professional, polite and factual refund request email.

STRICT RULES:
- Only use facts provided below.
- Never invent information.
- Do not make legal threats.
- Do not falsely claim legal rights.
- Do not exaggerate.
- Clearly request the refund.
- Ask the company to confirm the refund status.
- Ask for the expected processing time.

REFUND INFORMATION:

Merchant:
${refund.merchant}

Merchant Email:
${refund.merchantEmail || "Not provided"}

Order ID:
${refund.orderId || "Not provided"}

Transaction ID:
${refund.transactionId || "Not provided"}

Amount:
${refund.amount} ${refund.currency}

Reason:
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

Return exactly:

SUBJECT:
<email subject>

BODY:
<email body>
`;

    /*
     * Keep the model configurable so we can
     * change providers/models without changing
     * the rest of the application.
     */
    const model =
      process.env.GEMINI_MODEL ||
      "gemini-3.5-flash";

    const response =
      await ai.models.generateContent({
        model,
        contents: prompt,
      });

    const generatedEmail =
      response.text || "";

    if (!generatedEmail.trim()) {
      return NextResponse.json(
        {
          error:
            "AI returned an empty email.",
        },
        { status: 500 }
      );
    }

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
      "Refund Request";

    const body =
      bodyMatch?.[1]?.trim() ||
      generatedEmail.trim();

    const updated =
      await prisma.refundCase.update({
        where: { id },

        data: {
          emailSubject: subject,
          emailBody: body,
          emailGeneratedAt: new Date(),
          status: "EMAIL_DRAFTED",
        },
      });

    return NextResponse.json({
      success: true,
      subject,
      body,
      refund: updated,
    });
  } catch (error) {
    console.error(
      "EMAIL GENERATION ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate email",
      },
      { status: 500 }
    );
  }
}