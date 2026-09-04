import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
    documentId: string;
  }>;
};

type Direction = "CREDIT" | "DEBIT" | "UNKNOWN";

type Candidate = {
  rawLine: string;
  date: Date | null;
  merchant: string | null;
  transactionId: string | null;
  amount: number | null;
  direction: Direction;

  amountMatch: boolean;
  merchantMatch: boolean;
  transactionMatch: boolean;
  dateMatch: boolean;

  score: number;
};

type VerificationResult =
  | "VERIFIED"
  | "PARTIAL_MATCH"
  | "MISMATCH"
  | "UNABLE_TO_VERIFY";

// ============================================================
// NORMALIZE
// ============================================================

function normalize(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// TRANSACTION ID
// ============================================================

function normalizeTransactionId(
  value: string | null | undefined
) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// ============================================================
// AMOUNT
// ============================================================

function parseAmount(
  value: string
): number | null {
  if (!value) return null;

  const cleaned = value
    .replace(/₹/g, "")
    .replace(/rs\.?/gi, "")
    .replace(/inr/gi, "")
    .replace(/,/g, "")
    .trim();

  if (
    cleaned === "-" ||
    cleaned === "—" ||
    cleaned === "–" ||
    cleaned === ""
  ) {
    return null;
  }

  const amount = Number(cleaned);

  return Number.isFinite(amount)
    ? amount
    : null;
}

// ============================================================
// DATE
// ============================================================

function parseDate(
  value: string
): Date | null {
  const cleaned =
    value.trim();

  // DD-MMM-YYYY
  let match =
    cleaned.match(
      /^(\d{1,2})-([A-Za-z]{3,9})-(\d{4})$/
    );

  if (match) {
    const months: Record<
      string,
      number
    > = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    };

    const month =
      months[
        match[2].toLowerCase()
      ];

    if (month !== undefined) {
      return new Date(
        Number(match[3]),
        month,
        Number(match[1])
      );
    }
  }

  // DD/MM/YYYY
  match =
    cleaned.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    );

  if (match) {
    return new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1])
    );
  }

  // YYYY-MM-DD
  match =
    cleaned.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/
    );

  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );
  }

  return null;
}

// ============================================================
// SAME DATE
// ============================================================

function sameDate(
  a: Date | null,
  b: Date | null
) {
  if (!a || !b) return false;

  return (
    a.getFullYear() ===
      b.getFullYear() &&
    a.getMonth() ===
      b.getMonth() &&
    a.getDate() ===
      b.getDate()
  );
}

// ============================================================
// MERCHANT MATCH
// ============================================================

function merchantMatches(
  text: string,
  merchant: string
) {
  const a =
    normalize(text);

  const b =
    normalize(merchant);

  return (
    a.includes(b) ||
    b.includes(a)
  );
}

// ============================================================
// TRANSACTION ID
// ============================================================

function transactionIdMatches(
  text: string,
  expected: string | null
) {
  if (!expected) {
    return false;
  }

  return normalizeTransactionId(
    text
  ).includes(
    normalizeTransactionId(
      expected
    )
  );
}

// ============================================================
// REFUND KEYWORDS
// ============================================================

function containsRefundKeyword(
  text: string
) {
  const normalized =
    normalize(text);

  return (
    normalized.includes(
      "refund"
    ) ||
    normalized.includes(
      "refunded"
    ) ||
    normalized.includes(
      "refund received"
    ) ||
    normalized.includes(
      "refund credit"
    ) ||
    normalized.includes(
      "refund cr"
    ) ||
    normalized.includes(
      "reversal"
    )
  );
}

// ============================================================
// PARSE STATEMENT ROW
//
// Expected format:
//
// DATE DESCRIPTION TRANSACTION_ID DEBIT CREDIT BALANCE
//
// Example:
//
// 26-Aug-2026 REFUND - TechKart
// TXN-REF-20260818 — 8,999.00 87,600.00
//
// ------------------------------------------------------------
// FIX #1 (transaction ID regex):
// The old pattern `(?:TXN|UPI|SAL|REF|TRX)[-_A-Z0-9]+` with the
// `i` flag matched ANY word merely starting with those letters,
// case-insensitively. That meant plain description words like
// "REFUND" (REF + UND) and "Salary" (SAL + ary) were mistaken
// for transaction IDs, hiding the real one. We now require a
// literal "-" right after the prefix, which every real ID in
// this format has and no ordinary English word does.
//
// FIX #2 (column parsing):
// The old pattern required a leftover description token PLUS
// three numeric columns (debit/credit/balance) — i.e. 4 tokens
// minimum after the transaction ID. Normal rows only have 3
// tokens there (debit, credit, balance), so it never matched
// and every well-formed row silently failed to parse. We now
// take the LAST 3 whitespace-separated tokens as debit/credit/
// balance directly, and treat anything before them as extra
// description text.
// ============================================================

const TRANSACTION_ID_REGEX =
  /\b((?:TXN|UPI|SAL|REF|TRX)-[A-Za-z0-9-]+)\b/i;

const NUMERIC_TOKEN_REGEX =
  /^(-|—|–|[\d,]+(?:\.\d{1,2})?)$/;

function parseStatementLine(
  line: string
): {
  date: Date | null;
  transactionId: string | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  description: string;
} | null {
  const trimmed =
    line.trim();

  if (!trimmed) {
    return null;
  }

  // ==========================================================
  // DATE
  // ==========================================================

  const dateMatch =
    trimmed.match(
      /^(\d{1,2}-[A-Za-z]{3,9}-\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{1,2}-\d{1,2})\s+(.+)$/
    );

  if (!dateMatch) {
    return null;
  }

  const date =
    parseDate(
      dateMatch[1]
    );

  const rest =
    dateMatch[2];

  // ==========================================================
  // TRANSACTION ID  (FIX #1: requires "-" right after the prefix)
  // ==========================================================

  const txMatch =
    rest.match(
      TRANSACTION_ID_REGEX
    );

  if (!txMatch) {
    return null;
  }

  const transactionId =
    txMatch[1];

  const beforeTx =
    rest
      .slice(
        0,
        txMatch.index
      )
      .trim();

  const afterTx =
    rest
      .slice(
        (txMatch.index || 0) +
          txMatch[0].length
      )
      .trim();

  // ==========================================================
  // NUMERIC COLUMNS AFTER TRANSACTION ID
  // (FIX #2: take the last 3 tokens as debit/credit/balance,
  // whatever remains before them is extra description text)
  // ==========================================================

  const tokens = afterTx
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length < 3) {
    return null;
  }

  const last3 = tokens.slice(-3);
  const extraDescription = tokens
    .slice(0, -3)
    .join(" ");

  if (
    !last3.every((token) =>
      NUMERIC_TOKEN_REGEX.test(token)
    )
  ) {
    return null;
  }

  const description = extraDescription
    ? `${beforeTx} ${extraDescription}`.trim()
    : beforeTx;

  const debit =
    parseAmount(last3[0]);

  const credit =
    parseAmount(last3[1]);

  const balance =
    parseAmount(last3[2]);

  return {
    date,
    transactionId,
    debit,
    credit,
    balance,
    description,
  };
}

// ============================================================
// FIND TRANSACTION CANDIDATES
// ============================================================

function findCandidates(
  extractedText: string,
  expectedAmount: number,
  expectedMerchant: string,
  expectedTransactionId: string | null,
  expectedPurchaseDate: Date | null
): Candidate[] {
  const lines =
    extractedText
      .replace(/\r/g, "")
      .split("\n")
      .map((line) =>
        line.trim()
      )
      .filter(Boolean);

  const candidates: Candidate[] =
    [];

  for (const line of lines) {
    const parsed =
      parseStatementLine(
        line
      );

    if (!parsed) {
      continue;
    }

    // ========================================================
    // SELECT DEBIT/CREDIT
    // ========================================================

    let amount: number | null =
      null;

    let direction:
      Direction =
      "UNKNOWN";

    if (
      parsed.credit !== null
    ) {
      amount =
        parsed.credit;

      direction =
        "CREDIT";
    } else if (
      parsed.debit !== null
    ) {
      amount =
        parsed.debit;

      direction =
        "DEBIT";
    }

    // ========================================================
    // MATCHES
    // ========================================================

    const amountMatch =
      amount !== null &&
      Math.abs(
        amount -
          expectedAmount
      ) < 0.01;

    const merchantMatch =
      merchantMatches(
        parsed.description,
        expectedMerchant
      );

    const transactionMatch =
      expectedTransactionId
        ? normalizeTransactionId(
            parsed.transactionId
          ) ===
          normalizeTransactionId(
            expectedTransactionId
          )
        : false;

    const dateMatch =
      sameDate(
        parsed.date,
        expectedPurchaseDate
      );

    // ========================================================
    // SCORE
    // ========================================================

    let score = 0;

    if (amountMatch) {
      score += 50;
    }

    if (merchantMatch) {
      score += 20;
    }

    if (transactionMatch) {
      score += 15;
    }

    if (dateMatch) {
      score += 5;
    }

    if (
      direction === "CREDIT"
    ) {
      score += 10;
    }

    /*
     * Debit can NEVER be 100%.
     */

    if (
      direction === "DEBIT"
    ) {
      score = Math.min(
        score,
        70
      );
    }

    candidates.push({
      rawLine: line,

      date:
        parsed.date,

      merchant:
        merchantMatch
          ? expectedMerchant
          : null,

      transactionId:
        parsed.transactionId,

      amount,

      direction,

      amountMatch,

      merchantMatch,

      transactionMatch,

      dateMatch,

      score,
    });
  }

  return candidates;
}

// ============================================================
// MAIN
// ============================================================

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const {
      id,
      documentId,
    } = await context.params;

    if (
      !id ||
      !documentId
    ) {
      return NextResponse.json(
        {
          error:
            "Refund ID and document ID are required",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // REFUND
    // ========================================================

    const refund =
      await prisma.refundCase.findUnique(
        {
          where: {
            id,
          },
        }
      );

    if (!refund) {
      return NextResponse.json(
        {
          error:
            "Refund case not found",
        },
        {
          status: 404,
        }
      );
    }

    // ========================================================
    // DOCUMENT
    // ========================================================

    const document =
      await prisma.refundDocument.findFirst(
        {
          where: {
            id: documentId,
            refundId: id,
          },
        }
      );

    if (!document) {
      return NextResponse.json(
        {
          error:
            "Document not found",
        },
        {
          status: 404,
        }
      );
    }

    // ========================================================
    // TEXT
    // ========================================================

    const extractedText =
      document.extractedText?.trim();

    if (!extractedText) {
      await prisma.refundDocument.update(
        {
          where: {
            id: documentId,
          },

          data: {
            verificationScore: 0,

            verificationResult:
              "UNABLE_TO_VERIFY",

            status:
              "FAILED",
          },
        }
      );

      return NextResponse.json(
        {
          error:
            "No extracted text found. Extract the PDF first.",
        },
        {
          status: 422,
        }
      );
    }

    // ========================================================
    // EXPECTED DATA
    // ========================================================

    const expectedAmount =
      Number(refund.amount);

    const expectedMerchant =
      refund.merchant;

    const expectedTransactionId =
      refund.transactionId;

    const expectedPurchaseDate =
      refund.purchaseDate;

    console.log(
      "======================================"
    );

    console.log(
      "REFUND VERIFICATION"
    );

    console.log(
      "Expected amount:",
      expectedAmount
    );

    console.log(
      "Expected merchant:",
      expectedMerchant
    );

    console.log(
      "Expected transaction:",
      expectedTransactionId
    );

    // ========================================================
    // CANDIDATES
    // ========================================================

    const candidates =
      findCandidates(
        extractedText,
        expectedAmount,
        expectedMerchant,
        expectedTransactionId,
        expectedPurchaseDate
      );

    console.log(
      "Candidates:",
      candidates
    );

    // ========================================================
    // FIX #3 (candidate selection):
    //
    // The old logic ALWAYS preferred any CREDIT row over an
    // exact-matching DEBIT row, even a totally unrelated credit
    // (e.g. a salary credit), because it filtered to
    // "all CREDIT rows" before ever looking at score. That made
    // the reported "evidence" misleading on cases with no refund
    // yet — it would show an unrelated credit line instead of
    // the real (matching) purchase debit.
    //
    // The scoring system already gives CREDIT a +10 bonus and
    // caps DEBIT at 70, so a genuine matching credit will always
    // outscore a genuine matching debit. We can just sort all
    // candidates by score and take the top one — simpler, and it
    // no longer picks an unrelated credit over a fully-matching
    // debit.
    // ========================================================

    const sortedCandidates =
      candidates
        .slice()
        .sort(
          (a, b) =>
            b.score - a.score
        );

    const bestCandidate:
      Candidate | null =
      sortedCandidates[0] ?? null;

    // ========================================================
    // NO CANDIDATE
    // ========================================================

    if (!bestCandidate) {
      await prisma.refundDocument.update(
        {
          where: {
            id: documentId,
          },

          data: {
            verificationScore: 0,

            verificationResult:
              "UNABLE_TO_VERIFY",

            status:
              "EXTRACTED",
          },
        }
      );

      return NextResponse.json({
        success: true,

        result:
          "UNABLE_TO_VERIFY",

        score: 0,

        refundReceived:
          false,

        message:
          "No transaction could be identified.",
      });
    }

    // ========================================================
    // FINAL CHECKS
    // ========================================================

    const amountMatch =
      bestCandidate.amountMatch;

    const merchantMatch =
      bestCandidate.merchantMatch;

    const transactionMatch =
      bestCandidate.transactionMatch;

    const dateMatch =
      bestCandidate.dateMatch;

    const isCredit =
      bestCandidate.direction ===
      "CREDIT";

    const isDebit =
      bestCandidate.direction ===
      "DEBIT";

    const hasRefundKeyword =
      containsRefundKeyword(
        bestCandidate.rawLine
      );

    // ========================================================
    // VERIFICATION
    // ========================================================

    let result:
      VerificationResult;

    let score =
      bestCandidate.score;

    /*
     * ======================================================
     * VERIFIED
     *
     * Required:
     *
     * amount
     * merchant
     * CREDIT
     *
     * Transaction ID is also checked when available.
     * ======================================================
     */

    if (
      amountMatch &&
      merchantMatch &&
      isCredit &&
      (
        !expectedTransactionId ||
        transactionMatch
      )
    ) {
      result =
        "VERIFIED";

      score = 100;
    }

    /*
     * ======================================================
     * DEBIT
     * ======================================================
     */

    else if (
      amountMatch &&
      merchantMatch &&
      isDebit
    ) {
      result =
        "PARTIAL_MATCH";

      score = Math.min(
        score,
        70
      );
    }

    /*
     * ======================================================
     * PARTIAL CREDIT
     * ======================================================
     */

    else if (
      isCredit &&
      (
        amountMatch ||
        merchantMatch ||
        transactionMatch
      )
    ) {
      result =
        "PARTIAL_MATCH";

      score = Math.min(
        Math.max(
          score,
          30
        ),
        95
      );
    }

    else {
      result =
        "MISMATCH";

      score = 0;
    }

    // ========================================================
    // REFUND CONFIRMED
    // ========================================================

    const refundConfirmed =
      result ===
        "VERIFIED" &&
      amountMatch &&
      merchantMatch &&
      isCredit &&
      !isDebit;

    // ========================================================
    // SAVE DOCUMENT
    // ========================================================

    const updatedDocument =
      await prisma.refundDocument.update(
        {
          where: {
            id: documentId,
          },

          data: {
            extractedAmount:
              bestCandidate.amount ??
              undefined,

            extractedTransactionId:
              bestCandidate.transactionId ??
              undefined,

            extractedMerchant:
              bestCandidate.merchant ??
              undefined,

            extractedDate:
              bestCandidate.date ??
              undefined,

            verificationScore:
              score,

            verificationResult:
              result,

            status:
              result ===
              "VERIFIED"
                ? "VERIFIED"
                : "EXTRACTED",
          },
        }
      );

    // ========================================================
    // UPDATE REFUND STATUS
    // ========================================================

    let updatedRefund =
      refund;

    if (
      refundConfirmed
    ) {
      updatedRefund =
        await prisma.refundCase.update(
          {
            where: {
              id,
            },

            data: {
              status:
                "REFUND_RECEIVED",
            },
          }
        );

      console.log(
        "======================================"
      );

      console.log(
        "REFUND RECEIVED"
      );

      console.log(
        "Status:",
        updatedRefund.status
      );

      console.log(
        "======================================"
      );
    } else {
      console.log(
        "Refund not confirmed."
      );

      console.log(
        "Current status:",
        refund.status
      );
    }

    // ========================================================
    // RESPONSE
    // ========================================================

    return NextResponse.json({
      success: true,

      result,

      score,

      refundReceived:
        refundConfirmed,

      message:
        refundConfirmed
          ? "Refund verified successfully."
          : isDebit
            ? "Matching transaction is a DEBIT. It is not a refund."
            : "Refund could not be fully verified.",

      checks: {
        amount: {
          expected:
            expectedAmount,

          extracted:
            bestCandidate.amount,

          matches:
            amountMatch,
        },

        merchant: {
          expected:
            expectedMerchant,

          extracted:
            bestCandidate.merchant,

          matches:
            merchantMatch,
        },

        transactionId: {
          expected:
            expectedTransactionId,

          extracted:
            bestCandidate.transactionId,

          matches:
            transactionMatch,
        },

        date: {
          expected:
            expectedPurchaseDate,

          extracted:
            bestCandidate.date,

          matches:
            dateMatch,
        },

        direction: {
          detected:
            bestCandidate.direction,

          isCredit,

          isDebit,
        },

        refundKeyword:
          hasRefundKeyword,
      },

      evidence: {
        selectedTransaction:
          bestCandidate.rawLine,

        amount:
          bestCandidate.amount,

        merchant:
          bestCandidate.merchant,

        transactionId:
          bestCandidate.transactionId,

        date:
          bestCandidate.date,

        direction:
          bestCandidate.direction,
      },

      candidates,

      document:
        updatedDocument,

      refund:
        updatedRefund,
    });
  } catch (error) {
    console.error(
      "REFUND VERIFICATION ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to verify refund document",
      },
      {
        status: 500,
      }
    );
  }
}