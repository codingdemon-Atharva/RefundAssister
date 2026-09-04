import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import fs from "fs/promises";
import path from "path";
import { extractText, getDocumentProxy } from "unpdf";

type RouteContext = {
  params: Promise<{
    id: string;
    documentId: string;
  }>;
};

// ==================================================
// RESOLVE UPLOADED FILE PATH
// ==================================================

function resolveFilePath(fileUrl: string) {
  /*
   * Our local uploads look like:
   *
   * /uploads/refunds/<refundId>/<filename>.pdf
   *
   * They physically exist inside:
   *
   * public/uploads/refunds/...
   */

  if (fileUrl.startsWith("/uploads/")) {
    return path.join(
      process.cwd(),
      "public",
      fileUrl
    );
  }

  /*
   * Handle full URLs safely.
   */

  try {
    const parsedUrl = new URL(fileUrl);

    return path.join(
      process.cwd(),
      "public",
      parsedUrl.pathname
    );
  } catch {
    /*
     * If it isn't a valid URL, treat it as a
     * local path relative to public.
     */

    return path.join(
      process.cwd(),
      "public",
      fileUrl.replace(/^\/+/, "")
    );
  }
}

// ==================================================
// CLEAN EXTRACTED TEXT
// ==================================================

function cleanExtractedText(
  text: string
) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")

    /*
     * Remove excessive horizontal whitespace,
     * but KEEP new lines because bank statement
     * rows depend on them.
     */
    .replace(/[ \t]+/g, " ")

    /*
     * Remove excessive blank lines.
     */
    .replace(/\n{3,}/g, "\n\n")

    .trim();
}

// ==================================================
// POST
// ==================================================

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id, documentId } =
      await context.params;

    console.log(
      "================================="
    );

    console.log(
      "PDF EXTRACTION START"
    );

    console.log(
      "Refund ID:",
      id
    );

    console.log(
      "Document ID:",
      documentId
    );

    // ==================================================
    // VALIDATION
    // ==================================================

    if (!id || !documentId) {
      return NextResponse.json(
        {
          error:
            "Refund ID and document ID are required",
        },
        { status: 400 }
      );
    }

    // ==================================================
    // FIND DOCUMENT
    // ==================================================

    const document =
      await prisma.refundDocument.findFirst({
        where: {
          id: documentId,
          refundId: id,
        },
      });

    if (!document) {
      return NextResponse.json(
        {
          error: "Document not found",
        },
        { status: 404 }
      );
    }

    console.log(
      "Filename:",
      document.filename
    );

    console.log(
      "File URL:",
      document.fileUrl
    );

    // ==================================================
    // MARK DOCUMENT AS PROCESSING
    // ==================================================

    await prisma.refundDocument.update({
      where: {
        id: documentId,
      },

      data: {
        status: "PROCESSING",
      },
    });

    // ==================================================
    // RESOLVE FILE PATH
    // ==================================================

    const filePath =
      resolveFilePath(
        document.fileUrl
      );

    console.log(
      "Resolved file path:",
      filePath
    );

    // ==================================================
    // CHECK FILE EXISTS
    // ==================================================

    try {
      await fs.access(filePath);
    } catch {
      console.error(
        "PDF FILE DOES NOT EXIST:",
        filePath
      );

      await prisma.refundDocument.update({
        where: {
          id: documentId,
        },

        data: {
          status: "FAILED",
        },
      });

      return NextResponse.json(
        {
          error:
            "Uploaded PDF file could not be found.",

          fileUrl:
            document.fileUrl,

          filePath,
        },
        { status: 404 }
      );
    }

    // ==================================================
    // READ PDF
    // ==================================================

    const buffer =
      await fs.readFile(filePath);

    if (!buffer.length) {
      await prisma.refundDocument.update({
        where: {
          id: documentId,
        },

        data: {
          status: "FAILED",
        },
      });

      return NextResponse.json(
        {
          error:
            "The uploaded PDF is empty.",
        },
        { status: 400 }
      );
    }

    console.log(
      "PDF size:",
      buffer.length,
      "bytes"
    );

    // ==================================================
    // CONVERT TO UINT8ARRAY
    // ==================================================

    const data =
      new Uint8Array(buffer);

    // ==================================================
    // LOAD PDF
    // ==================================================

    const pdf =
      await getDocumentProxy(data);

    console.log(
      "PDF loaded successfully"
    );

    console.log(
      "Pages:",
      pdf.numPages
    );

    // ==================================================
    // EXTRACT TEXT
    // ==================================================

    /*
     * IMPORTANT:
     *
     * Do NOT use mergePages: true here.
     *
     * Bank statements are table-like documents.
     * Keeping page boundaries makes the extracted
     * text easier for the verification layer to
     * analyze.
     */

    const result =
      await extractText(pdf, {
        mergePages: false,
      });

    // ==================================================
    // HANDLE unpdf OUTPUT
    // ==================================================

    let extractedText = "";

    if (Array.isArray(result.text)) {
      extractedText =
        result.text.join("\n\n");
    } else {
      extractedText =
        result.text || "";
    }

    extractedText =
      cleanExtractedText(
        extractedText
      );

    console.log(
      "Extracted text length:",
      extractedText.length
    );

    // ==================================================
    // LOG EXTRACTED TEXT
    // ==================================================

    console.log(
      "---------- EXTRACTED PDF TEXT ----------"
    );

    console.log(
      extractedText
    );

    console.log(
      "-----------------------------------------"
    );

    // ==================================================
    // EMPTY TEXT
    // ==================================================

    if (!extractedText.trim()) {
      await prisma.refundDocument.update({
        where: {
          id: documentId,
        },

        data: {
          status: "FAILED",
        },
      });

      return NextResponse.json(
        {
          error:
            "PDF was loaded successfully, but no text could be extracted. This may be a scanned/image-only PDF.",

          pages:
            pdf.numPages,
        },
        { status: 422 }
      );
    }

    // ==================================================
    // STORE EXTRACTED TEXT
    // ==================================================

    const updatedDocument =
      await prisma.refundDocument.update({
        where: {
          id: documentId,
        },

        data: {
          extractedText,

          /*
           * Extraction has completed.
           *
           * Verification is a separate operation.
           */
          status: "EXTRACTED",
        },
      });

    // ==================================================
    // SUCCESS
    // ==================================================

    console.log(
      "PDF EXTRACTION SUCCESS"
    );

    console.log(
      "Document status: EXTRACTED"
    );

    console.log(
      "================================="
    );

    return NextResponse.json({
      success: true,

      extracted: true,

      pages:
        pdf.numPages,

      text:
        extractedText,

      textLength:
        extractedText.length,

      document:
        updatedDocument,
    });
  } catch (error) {
    console.error(
      "================================="
    );

    console.error(
      "PDF EXTRACTION ERROR:",
      error
    );

    console.error(
      "================================="
    );

    /*
     * Try to mark the document as failed.
     *
     * Do not let a database error hide the
     * original extraction error.
     */

    try {
      const { documentId } =
        await context.params;

      if (documentId) {
        await prisma.refundDocument.update({
          where: {
            id: documentId,
          },

          data: {
            status: "FAILED",
          },
        });
      }
    } catch (dbError) {
      console.error(
        "FAILED TO MARK DOCUMENT AS FAILED:",
        dbError
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to extract PDF",
      },
      { status: 500 }
    );
  }
}