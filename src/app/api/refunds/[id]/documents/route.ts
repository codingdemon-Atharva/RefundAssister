import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import fs from "fs/promises";
import path from "path";

export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await context.params;

    console.log("PDF UPLOAD REFUND ID:", id);

    if (!id) {
      return NextResponse.json(
        { error: "Refund ID is required" },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 1. Check refund exists
    // --------------------------------------------------

    const refund = await prisma.refundCase.findUnique({
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

    // --------------------------------------------------
    // 2. Read uploaded file
    // --------------------------------------------------

    const formData = await request.formData();

    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: "No PDF file received",
        },
        { status: 400 }
      );
    }

    console.log("PDF NAME:", file.name);
    console.log("PDF SIZE:", file.size);
    console.log("PDF TYPE:", file.type);

    // --------------------------------------------------
    // 3. Validate PDF
    // --------------------------------------------------

    const isPDF =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!isPDF) {
      return NextResponse.json(
        {
          error: "Only PDF files are allowed",
        },
        { status: 400 }
      );
    }

    const MAX_SIZE = 10 * 1024 * 1024;

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        {
          error: "PDF must be smaller than 10 MB",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 4. Create public upload directory
    // --------------------------------------------------

    const uploadDirectory = path.join(
      process.cwd(),
      "public",
      "uploads",
      "refunds",
      id
    );

    await fs.mkdir(uploadDirectory, {
      recursive: true,
    });

    console.log(
      "UPLOAD DIRECTORY:",
      uploadDirectory
    );

    // --------------------------------------------------
    // 5. Generate safe filename
    // --------------------------------------------------

    const safeFilename = file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    const uniqueFilename =
      `${Date.now()}-${safeFilename}`;

    const filePath = path.join(
      uploadDirectory,
      uniqueFilename
    );

    // --------------------------------------------------
    // 6. Save actual PDF
    // --------------------------------------------------

    const arrayBuffer = await file.arrayBuffer();

    const buffer = Buffer.from(arrayBuffer);

    await fs.writeFile(
      filePath,
      buffer
    );

    // --------------------------------------------------
    // 7. Verify file was actually written
    // --------------------------------------------------

    const savedFile = await fs.stat(
      filePath
    );

    console.log(
      "PDF SAVED:",
      filePath
    );

    console.log(
      "SAVED FILE SIZE:",
      savedFile.size
    );

    // --------------------------------------------------
    // 8. Browser-accessible URL
    // --------------------------------------------------

    const fileUrl =
      `/uploads/refunds/${id}/${uniqueFilename}`;

    // --------------------------------------------------
    // 9. Save document in PostgreSQL
    // --------------------------------------------------

    const document =
      await prisma.refundDocument.create({
        data: {
          refundId: id,
          filename: file.name,
          fileUrl,
          status: "UPLOADED",
        },
      });

    console.log(
      "DOCUMENT CREATED:",
      document.id
    );

    // --------------------------------------------------
    // 10. Return response
    // --------------------------------------------------

    return NextResponse.json(
      {
        success: true,
        message: "PDF uploaded successfully",
        document,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "PDF UPLOAD ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to upload PDF",
      },
      {
        status: 500,
      }
    );
  }
}