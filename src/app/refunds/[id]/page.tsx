"use client";

import {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";

/* ======================================================
   TYPES
====================================================== */

type DocumentItem = {
  id: string;
  filename: string;
  fileUrl: string;
  status: string;

  extractedText?: string | null;

  extractedAmount?: string | number | null;
  extractedTransactionId?: string | null;
  extractedMerchant?: string | null;
  extractedDate?: string | null;

  verificationScore?: number | null;
  verificationResult?: string | null;

  uploadedAt: string;
};

type Refund = {
  id: string;

  merchant: string;
  merchantEmail: string | null;

  orderId: string | null;
  transactionId: string | null;

  amount: string;
  currency: string;
  reason: string;

  purchaseDate: string | null;
  deadline: string | null;

  status: string;

  emailSubject: string | null;
  emailBody: string | null;

  emailGeneratedAt: string | null;
  emailSentAt: string | null;

  createdAt: string;
  updatedAt: string;

  documents?: DocumentItem[];
};

type Verification = {
  result: string;
  score: number;

  checks: {
    amount: boolean;
    transactionId: boolean;
    merchant: boolean;
    date: boolean;
  };

  extracted: {
    amount: number | null;
    transactionId: string | null;
    merchant: string | null;
    date: string | null;
  };
};

type RefundStatus =
  | "PENDING"
  | "EMAIL_DRAFTED"
  | "EMAIL_SENT"
  | "WAITING_FOR_REFUND"
  | "ACKNOWLEDGED"
  | "REFUND_APPROVED"
  | "REFUND_RECEIVED"
  | "FOLLOW_UP_REQUIRED"
  | "CLOSED";

/* ======================================================
   STATUS HELPERS
====================================================== */

const statusOrder: RefundStatus[] = [
  "PENDING",
  "EMAIL_DRAFTED",
  "EMAIL_SENT",
  "WAITING_FOR_REFUND",
  "ACKNOWLEDGED",
  "REFUND_APPROVED",
  "REFUND_RECEIVED",
  "CLOSED",
];

function displayStatus(status: string) {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function statusStyle(status: string) {
  switch (status) {
    case "PENDING":
      return "bg-amber-100 text-amber-900 border-amber-300";

    case "EMAIL_DRAFTED":
      return "bg-blue-100 text-blue-900 border-blue-300";

    case "EMAIL_SENT":
      return "bg-purple-100 text-purple-900 border-purple-300";

    case "WAITING_FOR_REFUND":
      return "bg-orange-100 text-orange-900 border-orange-300";

    case "ACKNOWLEDGED":
      return "bg-cyan-100 text-cyan-900 border-cyan-300";

    case "REFUND_APPROVED":
      return "bg-indigo-100 text-indigo-900 border-indigo-300";

    case "REFUND_RECEIVED":
      return "bg-emerald-100 text-emerald-900 border-emerald-300";

    case "FOLLOW_UP_REQUIRED":
      return "bg-red-100 text-red-900 border-red-300";

    case "CLOSED":
      return "bg-gray-200 text-gray-900 border-gray-300";

    default:
      return "bg-gray-100 text-gray-900 border-gray-300";
  }
}

function documentStatusStyle(status: string) {
  switch (status) {
    case "VERIFIED":
      return "bg-emerald-100 text-emerald-900 border-emerald-300";

    case "PROCESSING":
      return "bg-blue-100 text-blue-900 border-blue-300";

    case "EXTRACTED":
      return "bg-indigo-100 text-indigo-900 border-indigo-300";

    case "FAILED":
      return "bg-red-100 text-red-900 border-red-300";

    default:
      return "bg-gray-100 text-gray-900 border-gray-300";
  }
}

function verificationStyle(result?: string | null) {
  switch (result) {
    case "VERIFIED":
      return "border-emerald-300 bg-emerald-50 text-emerald-950";

    case "PARTIAL_MATCH":
      return "border-amber-300 bg-amber-50 text-amber-950";

    case "MISMATCH":
      return "border-red-300 bg-red-50 text-red-950";

    default:
      return "border-gray-300 bg-gray-50 text-gray-900";
  }
}

function getDaysOverdue(
  deadline: string | null
) {
  if (!deadline) return 0;

  const deadlineDate = new Date(deadline);

  if (Number.isNaN(deadlineDate.getTime())) {
    return 0;
  }

  const difference =
    Date.now() - deadlineDate.getTime();

  if (difference <= 0) {
    return 0;
  }

  return Math.ceil(
    difference /
      (1000 * 60 * 60 * 24)
  );
}

function isDeadlinePassed(
  deadline: string | null
) {
  if (!deadline) return false;

  const date = new Date(deadline);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.getTime() < Date.now();
}

/* ======================================================
   SAFE JSON
====================================================== */

async function readJSON(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Server returned invalid response (${response.status})`
    );
  }
}

/* ======================================================
   COMPONENT
====================================================== */

export default function RefundDetailsPage() {
  const params = useParams();
  const router = useRouter();

  const refundId = params.id as string;

  /* --------------------------------------------------
     REFUND
  -------------------------------------------------- */

  const [refund, setRefund] =
    useState<Refund | null>(null);

  /* --------------------------------------------------
     ORIGINAL EMAIL
  -------------------------------------------------- */

  const [subject, setSubject] =
    useState("");

  const [email, setEmail] =
    useState("");

  /* --------------------------------------------------
     FOLLOW-UP EMAIL
  -------------------------------------------------- */

  const [followUpMode, setFollowUpMode] =
    useState(false);

  const [followUpSubject, setFollowUpSubject] =
    useState("");

  const [followUpBody, setFollowUpBody] =
    useState("");

  /* --------------------------------------------------
     LOADING
  -------------------------------------------------- */

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [generatingEmail, setGeneratingEmail] =
    useState(false);

  const [savingEmail, setSavingEmail] =
    useState(false);

  const [sendingEmail, setSendingEmail] =
    useState(false);

  const [generatingFollowUp, setGeneratingFollowUp] =
    useState(false);

  const [savingFollowUp, setSavingFollowUp] =
    useState(false);

  const [sendingFollowUp, setSendingFollowUp] =
    useState(false);

  const [updatingStatus, setUpdatingStatus] =
    useState(false);

  /* --------------------------------------------------
     DOCUMENTS
  -------------------------------------------------- */

  const [selectedDocument, setSelectedDocument] =
    useState<DocumentItem | null>(null);

  const [uploadedFile, setUploadedFile] =
    useState<{
      name: string;
      size: number;
    } | null>(null);

  const [uploading, setUploading] =
    useState(false);

  const [extracting, setExtracting] =
    useState(false);

  const [verifying, setVerifying] =
    useState(false);

  const [verification, setVerification] =
    useState<Verification | null>(null);

  /* --------------------------------------------------
     UI
  -------------------------------------------------- */

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  /* ======================================================
     LOAD REFUND
  ====================================================== */

  async function loadRefund(
    showLoader = true
  ) {
    try {
      if (showLoader) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");

      /*
       * Ask the deadline checker to update overdue
       * cases before loading the actual refund.
       *
       * Failure here should not prevent the refund
       * page itself from loading.
       */

      try {
        await fetch(
          "/api/refunds/check-deadlines",
          {
            cache: "no-store",
          }
        );
      } catch (deadlineError) {
        console.warn(
          "Deadline check skipped:",
          deadlineError
        );
      }

      const response = await fetch(
        `/api/refunds/${refundId}`,
        {
          cache: "no-store",
        }
      );

      const data = await readJSON(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to load refund"
        );
      }

      setRefund(data);

      /*
       * Original email values.
       */

      setSubject(
        data.emailSubject || ""
      );

      setEmail(
        data.emailBody || ""
      );

      /*
       * Automatically determine whether this is
       * currently a follow-up case.
       *
       * We also check the actual deadline so that
       * the UI reacts immediately even if the
       * deadline checker has not yet run.
       */

      const overdue =
        isDeadlinePassed(
          data.deadline
        );

      const followUp =
        data.status ===
          "FOLLOW_UP_REQUIRED" ||
        overdue;

      setFollowUpMode(followUp);

      /*
       * Existing follow-up API stores the generated
       * follow-up in the same email fields.
       *
       * When the case is already follow-up/overdue,
       * use those values as the follow-up editor.
       */

      if (followUp) {
        setFollowUpSubject(
          data.emailSubject || ""
        );

        setFollowUpBody(
          data.emailBody || ""
        );
      }

      /*
       * Load latest document.
       */

      if (
        data.documents &&
        data.documents.length > 0
      ) {
        const latest =
          data.documents[
            data.documents.length - 1
          ];

        setSelectedDocument(latest);

        setUploadedFile({
          name: latest.filename,
          size: 0,
        });

        /*
         * Restore stored verification result.
         *
         * Individual check booleans are not persisted
         * in the current schema, so they are only
         * reconstructed when useful.
         */

        if (
          latest.verificationResult
        ) {
          setVerification({
            result:
              latest.verificationResult,

            score:
              latest.verificationScore || 0,

            checks: {
              amount:
                latest.verificationResult ===
                "VERIFIED",

              transactionId:
                latest.verificationResult ===
                "VERIFIED",

              merchant:
                latest.verificationResult ===
                "VERIFIED",

              date:
                latest.verificationResult ===
                "VERIFIED",
            },

            extracted: {
              amount:
                latest.extractedAmount !==
                  null &&
                latest.extractedAmount !==
                  undefined
                  ? Number(
                      latest.extractedAmount
                    )
                  : null,

              transactionId:
                latest.extractedTransactionId ||
                null,

              merchant:
                latest.extractedMerchant ||
                null,

              date:
                latest.extractedDate ||
                null,
            },
          });
        } else {
          setVerification(null);
        }
      } else {
        setSelectedDocument(null);
        setUploadedFile(null);
        setVerification(null);
      }
    } catch (error) {
      console.error(
        "LOAD REFUND ERROR:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to load refund"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (refundId) {
      loadRefund();
    }
  }, [refundId]);

  /* ======================================================
     DERIVED STATE
  ====================================================== */

  const daysOverdue = useMemo(
    () =>
      getDaysOverdue(
        refund?.deadline || null
      ),
    [refund?.deadline]
  );

  const deadlinePassed = useMemo(
    () =>
      isDeadlinePassed(
        refund?.deadline || null
      ),
    [refund?.deadline]
  );

  const isClosed =
    refund?.status === "CLOSED";

  const isFollowUpRequired =
    refund?.status ===
      "FOLLOW_UP_REQUIRED" ||
    (deadlinePassed &&
      refund?.status ===
        "WAITING_FOR_REFUND");

  const hasOriginalEmail =
    subject.trim().length > 0 &&
    email.trim().length > 0;

  const hasFollowUpEmail =
    followUpSubject.trim().length > 0 &&
    followUpBody.trim().length > 0;

  /* ======================================================
     GENERATE ORIGINAL EMAIL
  ====================================================== */

  async function generateEmail() {
    if (!refund) return;

    if (
      refund.status !== "PENDING" &&
      refund.status !== "EMAIL_DRAFTED"
    ) {
      setError(
        "The original refund email can only be generated before the request is sent."
      );
      return;
    }

    try {
      setGeneratingEmail(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/refunds/${refund.id}/email`,
        {
          method: "POST",
        }
      );

      const data = await readJSON(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to generate email"
        );
      }

      const generatedSubject =
        data.subject ||
        data.emailSubject ||
        "";

      const generatedBody =
        data.body ||
        data.emailBody ||
        data.email ||
        "";

      setSubject(generatedSubject);
      setEmail(generatedBody);

      setRefund((previous) =>
        previous
          ? {
              ...previous,
              emailSubject:
                generatedSubject,
              emailBody:
                generatedBody,
              emailGeneratedAt:
                new Date().toISOString(),
              status:
                "EMAIL_DRAFTED",
            }
          : previous
      );

      setSuccess(
        "Refund email generated successfully."
      );
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Unable to generate email"
      );
    } finally {
      setGeneratingEmail(false);
    }
  }

  /* ======================================================
     SAVE ORIGINAL EMAIL
  ====================================================== */

  async function saveEmail() {
    if (!refund) return;

    if (!subject.trim()) {
      setError(
        "Please enter an email subject."
      );
      return;
    }

    if (!email.trim()) {
      setError(
        "Please enter an email body."
      );
      return;
    }

    if (
      refund.status !== "PENDING" &&
      refund.status !== "EMAIL_DRAFTED"
    ) {
      setError(
        "The original refund email can no longer be edited after sending."
      );
      return;
    }

    try {
      setSavingEmail(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/refunds/${refund.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            emailSubject: subject,
            emailBody: email,
            status:
              refund.status === "PENDING"
                ? "EMAIL_DRAFTED"
                : refund.status,
          }),
        }
      );

      const data = await readJSON(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to save email"
        );
      }

      setRefund(
        data.refund || data
      );

      setSuccess(
        "Refund email draft saved successfully."
      );
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Unable to save email"
      );
    } finally {
      setSavingEmail(false);
    }
  }

  /* ======================================================
     SEND ORIGINAL EMAIL
  ====================================================== */

  async function sendEmail() {
    if (!refund) return;

    if (
      refund.status !== "EMAIL_DRAFTED" &&
      refund.status !== "PENDING"
    ) {
      setError(
        "The original refund email has already been sent."
      );
      return;
    }

    if (!refund.merchantEmail) {
      setError(
        "Merchant email is missing."
      );
      return;
    }

    if (!hasOriginalEmail) {
      setError(
        "Generate or write the refund email first."
      );
      return;
    }

    const confirmed =
      window.confirm(
        `Send this refund request to ${refund.merchantEmail}?`
      );

    if (!confirmed) return;

    try {
      setSendingEmail(true);
      setError("");
      setSuccess("");

      /*
       * Save latest edited version first.
       */

      const saveResponse =
        await fetch(
          `/api/refunds/${refund.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              emailSubject: subject,
              emailBody: email,
            }),
          }
        );

      if (!saveResponse.ok) {
        const data =
          await readJSON(saveResponse);

        throw new Error(
          data.error ||
            "Failed to save email before sending"
        );
      }

      /*
       * Existing Resend endpoint.
       *
       * This endpoint already moves the case to
       * WAITING_FOR_REFUND after successful sending.
       */

      const response = await fetch(
        `/api/refunds/${refund.id}/send`,
        {
          method: "POST",
        }
      );

      const data = await readJSON(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to send email"
        );
      }

      setRefund(
        data.refund || data
      );

      setSuccess(
        "Refund request sent successfully. The case is now waiting for the refund."
      );
    } catch (error) {
      console.error(
        "SEND EMAIL ERROR:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to send refund email"
      );
    } finally {
      setSendingEmail(false);
    }
  }

  /* ======================================================
     UPDATE STATUS
  ====================================================== */

  async function updateStatus(
    newStatus: RefundStatus
  ) {
    if (!refund) return;

    if (refund.status === "CLOSED") {
      setError(
        "This refund is closed and cannot be changed."
      );
      return;
    }

    const confirmed =
      window.confirm(
        `Change refund status to ${displayStatus(
          newStatus
        )}?`
      );

    if (!confirmed) return;

    try {
      setUpdatingStatus(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/refunds/${refund.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            status: newStatus,
          }),
        }
      );

      const data = await readJSON(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to update status"
        );
      }

      const updated =
        data.refund || data;

      setRefund(updated);

      /*
       * If status becomes follow-up required,
       * immediately switch the UI.
       */

      if (
        newStatus ===
        "FOLLOW_UP_REQUIRED"
      ) {
        setFollowUpMode(true);

        setFollowUpSubject(
          updated.emailSubject ||
            subject ||
            ""
        );

        setFollowUpBody(
          updated.emailBody ||
            email ||
            ""
        );
      }

      /*
       * If case is moved forward from follow-up,
       * keep follow-up mode visible when the deadline
       * is still overdue. This prevents the original
       * email from suddenly appearing again.
       */

      if (
        newStatus ===
          "WAITING_FOR_REFUND" &&
        isDeadlinePassed(
          updated.deadline
        )
      ) {
        setFollowUpMode(true);
      }

      setSuccess(
        `Status changed to ${displayStatus(
          newStatus
        )}.`
      );
    } catch (error) {
      console.error(
        "STATUS UPDATE ERROR:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to update status"
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  /* ======================================================
     GENERATE FOLLOW-UP
  ====================================================== */

  async function generateFollowUp() {
    if (!refund) return;

    if (
      refund.status !==
        "FOLLOW_UP_REQUIRED" &&
      !deadlinePassed
    ) {
      setError(
        "A follow-up can only be generated after the refund becomes overdue."
      );
      return;
    }

    try {
      setGeneratingFollowUp(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/refunds/${refund.id}/follow-up`,
        {
          method: "POST",
        }
      );

      const data = await readJSON(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to generate follow-up email"
        );
      }

      const generatedSubject =
        data.subject ||
        data.emailSubject ||
        "";

      const generatedBody =
        data.body ||
        data.emailBody ||
        data.email ||
        "";

      setFollowUpSubject(
        generatedSubject
      );

      setFollowUpBody(
        generatedBody
      );

      setFollowUpMode(true);

      setSuccess(
        `Follow-up email generated successfully${
          typeof data.daysOverdue ===
          "number"
            ? ` (${data.daysOverdue} day${
                data.daysOverdue === 1
                  ? ""
                  : "s"
              } overdue)`
            : ""
        }.`
      );
    } catch (error) {
      console.error(
        "FOLLOW-UP GENERATION ERROR:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to generate follow-up email"
      );
    } finally {
      setGeneratingFollowUp(false);
    }
  }

  /* ======================================================
     SAVE FOLLOW-UP
  ====================================================== */

  async function saveFollowUp() {
    if (!refund) return;

    if (!followUpSubject.trim()) {
      setError(
        "Follow-up subject is required."
      );
      return;
    }

    if (!followUpBody.trim()) {
      setError(
        "Follow-up body is required."
      );
      return;
    }

    try {
      setSavingFollowUp(true);
      setError("");
      setSuccess("");

      const response =
        await fetch(
          `/api/refunds/${refund.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              emailSubject:
                followUpSubject,
              emailBody:
                followUpBody,
              status:
                refund.status ===
                "WAITING_FOR_REFUND"
                  ? "WAITING_FOR_REFUND"
                  : "FOLLOW_UP_REQUIRED",
            }),
          }
        );

      const data = await readJSON(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to save follow-up"
        );
      }

      setRefund(
        data.refund || data
      );

      setFollowUpMode(true);

      setSuccess(
        "Follow-up email saved successfully."
      );
    } catch (error) {
      console.error(
        "FOLLOW-UP SAVE ERROR:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to save follow-up"
      );
    } finally {
      setSavingFollowUp(false);
    }
  }

  /* ======================================================
     SEND FOLLOW-UP
  ====================================================== */

  async function sendFollowUp() {
    if (!refund) return;

    if (!refund.merchantEmail) {
      setError(
        "Merchant email is missing."
      );
      return;
    }

    if (!hasFollowUpEmail) {
      setError(
        "Generate or write the follow-up email first."
      );
      return;
    }

    const confirmed =
      window.confirm(
        `Send this follow-up to ${refund.merchantEmail}?`
      );

    if (!confirmed) return;

    try {
      setSendingFollowUp(true);
      setError("");
      setSuccess("");

      /*
       * Save follow-up content into the existing
       * email fields because the current schema
       * does not have separate follow-up fields.
       */

      const saveResponse =
        await fetch(
          `/api/refunds/${refund.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              emailSubject:
                followUpSubject,
              emailBody:
                followUpBody,
              status:
                "FOLLOW_UP_REQUIRED",
            }),
          }
        );

      const saveData =
        await readJSON(saveResponse);

      if (!saveResponse.ok) {
        throw new Error(
          saveData.error ||
            "Failed to save follow-up email"
        );
      }

      /*
       * Use the existing Resend endpoint.
       *
       * Your /send route updates the case to
       * WAITING_FOR_REFUND after successful send.
       */

      const response = await fetch(
        `/api/refunds/${refund.id}/send`,
        {
          method: "POST",
        }
      );

      const data = await readJSON(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to send follow-up email"
        );
      }

      setRefund(
        data.refund || data
      );

      /*
       * Keep follow-up mode ON.
       *
       * The deadline is already overdue, so the
       * original email must remain hidden.
       */

      setFollowUpMode(true);

      setSuccess(
        "Follow-up email sent successfully. The case is now waiting for the merchant's response."
      );
    } catch (error) {
      console.error(
        "FOLLOW-UP SEND ERROR:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to send follow-up email"
      );
    } finally {
      setSendingFollowUp(false);
    }
  }

  /* ======================================================
     COPY EMAIL
  ====================================================== */

  async function copyEmail(
    followUp = false
  ) {
    const copySubject =
      followUp
        ? followUpSubject
        : subject;

    const copyBody =
      followUp
        ? followUpBody
        : email;

    if (!copyBody) {
      setError(
        "There is no email content to copy."
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(
        `Subject: ${copySubject}\n\n${copyBody}`
      );

      setSuccess(
        followUp
          ? "Follow-up email copied to clipboard."
          : "Refund email copied to clipboard."
      );
    } catch {
      setError(
        "Unable to copy email."
      );
    }
  }

  /* ======================================================
     UPLOAD PDF
  ====================================================== */

  async function uploadPDF(
    file: File
  ) {
    if (!refund) return;

    if (isClosed) {
      setError(
        "Closed refunds cannot accept new documents."
      );
      return;
    }

    setError("");
    setSuccess("");
    setVerification(null);

    if (
      file.type !== "application/pdf" &&
      !file.name
        .toLowerCase()
        .endsWith(".pdf")
    ) {
      setError(
        "Only PDF files are allowed."
      );
      return;
    }

    if (
      file.size >
      10 * 1024 * 1024
    ) {
      setError(
        "PDF must be smaller than 10 MB."
      );
      return;
    }

    try {
      setUploading(true);

      const formData =
        new FormData();

      formData.append(
        "file",
        file
      );

      const response =
        await fetch(
          `/api/refunds/${refund.id}/documents`,
          {
            method: "POST",
            body: formData,
          }
        );

      const data =
        await readJSON(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to upload PDF"
        );
      }

      const document =
        data.document as DocumentItem;

      setSelectedDocument(
        document
      );

      setUploadedFile({
        name: file.name,
        size: file.size,
      });

      setVerification(null);

      setRefund((previous) =>
        previous
          ? {
              ...previous,
              documents: [
                ...(previous.documents ||
                  []),
                document,
              ],
            }
          : previous
      );

      setSuccess(
        "PDF uploaded successfully. You can now extract the transaction data."
      );
    } catch (error) {
      console.error(
        "PDF UPLOAD ERROR:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to upload PDF"
      );
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    if (!file) return;

    uploadPDF(file);

    event.target.value = "";
  }

  /* ======================================================
     EXTRACT PDF
  ====================================================== */

  async function extractPDF() {
    if (
      !refund ||
      !selectedDocument
    ) {
      setError(
        "Please upload a PDF first."
      );
      return;
    }

    try {
      setExtracting(true);
      setError("");
      setSuccess("");

      const response =
        await fetch(
          `/api/refunds/${refund.id}/documents/${selectedDocument.id}/extract`,
          {
            method: "POST",
          }
        );

      const data =
        await readJSON(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to extract PDF"
        );
      }

      const updatedDocument = {
        ...selectedDocument,
        extractedText:
          data.text || "",
        status:
          "EXTRACTED",
      };

      setSelectedDocument(
        updatedDocument
      );

      setRefund((previous) =>
        previous
          ? {
              ...previous,
              documents:
                previous.documents?.map(
                  (document) =>
                    document.id ===
                    selectedDocument.id
                      ? updatedDocument
                      : document
                ),
            }
          : previous
      );

      setSuccess(
        `PDF text extracted successfully (${data.pages || 1} page${
          data.pages === 1
            ? ""
            : "s"
        }).`
      );
    } catch (error) {
      console.error(
        "PDF EXTRACTION ERROR:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to extract PDF"
      );
    } finally {
      setExtracting(false);
    }
  }

  /* ======================================================
     VERIFY PDF
  ====================================================== */

  async function verifyPDF() {
    if (
      !refund ||
      !selectedDocument
    ) {
      setError(
        "Please upload a PDF first."
      );
      return;
    }

    if (
      !selectedDocument.extractedText
    ) {
      setError(
        "Extract the PDF before verifying the transaction."
      );
      return;
    }

    try {
      setVerifying(true);
      setError("");
      setSuccess("");

      const response =
        await fetch(
          `/api/refunds/${refund.id}/documents/${selectedDocument.id}/verify`,
          {
            method: "POST",
          }
        );

      const data =
        await readJSON(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to verify transaction"
        );
      }

      /*
       * ======================================================
       * FIX: read the real per-field values from the API response.
       *
       * The route (/verify) returns:
       *   { result, score, checks: { amount: {expected, extracted, matches}, ... },
       *     evidence: { amount, merchant, transactionId, date, ... }, ... }
       *
       * There is no top-level "extracted" or "verification" key,
       * so the old code (data.extracted?.X ?? data.verification?.extracted?.X)
       * always fell through to null — every field showed "Not found"
       * even when checks.X.matches was true. We now read the actual
       * extracted value from checks.X.extracted (falling back to
       * evidence.X for safety).
       * ======================================================
       */

      const verificationData: Verification =
        {
          result:
            data.result ||
            "UNABLE_TO_VERIFY",

          score:
            Number(data.score ?? 0),

          checks: {
            amount:
              data.checks?.amount
                ?.matches ?? false,

            transactionId:
              data.checks?.transactionId
                ?.matches ?? false,

            merchant:
              data.checks?.merchant
                ?.matches ?? false,

            date:
              data.checks?.date
                ?.matches ?? false,
          },

          extracted: {
            amount:
              data.checks?.amount
                ?.extracted ??
              data.evidence?.amount ??
              null,

            transactionId:
              data.checks?.transactionId
                ?.extracted ??
              data.evidence
                ?.transactionId ??
              null,

            merchant:
              data.checks?.merchant
                ?.extracted ??
              data.evidence?.merchant ??
              null,

            date:
              data.checks?.date
                ?.extracted ??
              data.evidence?.date ??
              null,
          },
        };

      setVerification(
        verificationData
      );

      if (data.document) {
        setSelectedDocument(
          data.document
        );

        setRefund((previous) =>
          previous
            ? {
                ...previous,
                documents:
                  previous.documents?.map(
                    (document) =>
                      document.id ===
                      data.document.id
                        ? data.document
                        : document
                  ),
              }
            : previous
        );
      }

      setSuccess(
        `Transaction verification completed: ${displayStatus(
          verificationData.result
        )}.`
      );
    } catch (error) {
      console.error(
        "VERIFICATION ERROR:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to verify transaction"
      );
    } finally {
      setVerifying(false);
    }
  }

  /* ======================================================
     LOADING
  ====================================================== */

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f6f7f9]">
        <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-gray-950" />

            <p className="mt-4 text-sm font-bold text-gray-800">
              Loading refund details...
            </p>
          </div>
        </div>
      </main>
    );
  }

  /* ======================================================
     ERROR
  ====================================================== */

  if (error && !refund) {
    return (
      <main className="min-h-screen bg-[#f6f7f9] p-6 md:p-10">
        <div className="mx-auto max-w-5xl">
          <button
            onClick={() =>
              router.push(
                "/dashboard"
              )
            }
            className="mb-6 text-sm font-bold text-gray-700 hover:text-gray-950"
          >
            ← Back to Dashboard
          </button>
           
           
           
          <div className="rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-xl font-black text-red-700">
              !
            </div>

            <h2 className="text-xl font-black text-gray-950">
              Unable to load refund
            </h2>

            <p className="mt-2 text-sm font-medium text-gray-700">
              {error}
            </p>

            <p className="mt-4 rounded-lg bg-gray-100 p-3 font-mono text-xs font-semibold text-gray-700">
              Refund ID: {refundId}
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!refund) return null;

  

  /* ======================================================
     STATUS ACTIONS
  ====================================================== */

  const renderStatusActions = () => {
    switch (
      refund.status as RefundStatus
    ) {
      case "PENDING":
        return (
          <button
            onClick={generateEmail}
            disabled={generatingEmail}
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generatingEmail
              ? "Generating..."
              : "Generate Refund Email"}
          </button>
        );

      case "EMAIL_DRAFTED":
        return (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={generateEmail}
              disabled={generatingEmail}
              className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-900 hover:bg-gray-50 disabled:opacity-50"
            >
              {generatingEmail
                ? "Generating..."
                : "Regenerate Email"}
            </button>

            <button
              onClick={sendEmail}
              disabled={sendingEmail}
              className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {sendingEmail
                ? "Sending..."
                : "Send Refund Request"}
            </button>
          </div>
        );

      case "EMAIL_SENT":
        return (
          <button
            onClick={() =>
              updateStatus(
                "WAITING_FOR_REFUND"
              )
            }
            disabled={updatingStatus}
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            Mark Waiting for Refund
          </button>
        );

      case "WAITING_FOR_REFUND":
        if (isFollowUpRequired) {
          return (
            <button
              onClick={() =>
                updateStatus(
                  "FOLLOW_UP_REQUIRED"
                )
              }
              disabled={updatingStatus}
              className="rounded-xl bg-red-700 px-5 py-3 text-sm font-black text-white hover:bg-red-800 disabled:opacity-50"
            >
              {updatingStatus
                ? "Updating..."
                : "Start Follow-up"}
            </button>
          );
        }

        return (
          <button
            onClick={() =>
              updateStatus(
                "ACKNOWLEDGED"
              )
            }
            disabled={updatingStatus}
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            Mark Acknowledged
          </button>
        );

      case "ACKNOWLEDGED":
        return (
          <button
            onClick={() =>
              updateStatus(
                "REFUND_APPROVED"
              )
            }
            disabled={updatingStatus}
            className="rounded-xl bg-indigo-700 px-5 py-3 text-sm font-black text-white hover:bg-indigo-800 disabled:opacity-50"
          >
            Mark Refund Approved
          </button>
        );

      case "REFUND_APPROVED":
        return (
          <button
            onClick={() =>
              updateStatus(
                "REFUND_RECEIVED"
              )
            }
            disabled={updatingStatus}
            className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            Mark Refund Received
          </button>
        );

      case "REFUND_RECEIVED":
        return (
          <button
            onClick={() =>
              updateStatus("CLOSED")
            }
            disabled={updatingStatus}
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            Close Refund
          </button>
        );

      case "FOLLOW_UP_REQUIRED":
        return (
          <button
            onClick={generateFollowUp}
            disabled={generatingFollowUp}
            className="rounded-xl bg-red-700 px-5 py-3 text-sm font-black text-white hover:bg-red-800 disabled:opacity-50"
          >
            {generatingFollowUp
              ? "Generating..."
              : "Generate Follow-up Email"}
          </button>
        );

      case "CLOSED":
        return (
          <div className="rounded-xl border border-gray-300 bg-gray-100 px-5 py-3 text-sm font-black text-gray-700">
            Refund case closed
          </div>
        );

      default:
        return null;
    }
  };

  /* ======================================================
     PAGE
  ====================================================== */

  return (
    <main className="min-h-screen bg-[#f6f7f9]">
      {/* ==================================================
          HEADER
      ================================================== */}

      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
          <div>
            <button
              onClick={() =>
                router.push(
                  "/dashboard"
                )
              }
              className="text-lg font-black tracking-tight text-gray-950"
            >
              Refund Assister
            </button>

            <p className="mt-0.5 text-xs font-semibold text-gray-600">
              Refund management
            </p>
          </div>

          <button
            onClick={() =>
              router.push(
                "/dashboard"
              )
            }
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Dashboard
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
        {/* BACK */}

        <button
          onClick={() =>
            router.push(
              "/dashboard"
            )
          }
          className="mb-6 text-sm font-black text-gray-700 hover:text-gray-950"
        >
          ← Back to Dashboard
        </button>

        {/* ==================================================
            HEADER
        ================================================== */}

        <section className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-wider text-gray-500">
              Refund Case
            </p>

            <h1 className="text-3xl font-black tracking-tight text-gray-950 md:text-4xl">
              {refund.merchant}
            </h1>

            <p className="mt-2 font-mono text-xs font-semibold text-gray-600">
              {refund.id}
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 md:items-end">
            <span
              className={`w-fit rounded-full border px-4 py-2 text-sm font-black ${statusStyle(
                refund.status
              )}`}
            >
              {displayStatus(
                refund.status
              )}
            </span>

            {refreshing && (
              <span className="text-xs font-bold text-gray-500">
                Refreshing status...
              </span>
            )}
          </div>
        </section>

        {/* ==================================================
            ALERTS
        ================================================== */}

        {error && (
          <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4">
            <p className="text-sm font-black text-red-950">
              {error}
            </p>
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
            <p className="text-sm font-black text-emerald-950">
              {success}
            </p>
          </div>
        )}

        {/* ==================================================
            OVERDUE BANNER
        ================================================== */}

        {isFollowUpRequired &&
          refund.status !==
            "REFUND_RECEIVED" &&
          refund.status !== "CLOSED" && (
            <section className="mb-6 rounded-2xl border border-red-300 bg-red-50 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-red-700">
                    Action Required
                  </p>

                  <h2 className="mt-1 text-xl font-black text-red-950">
                    Refund is overdue
                  </h2>

                  <p className="mt-1 text-sm font-semibold text-red-900">
                    {daysOverdue > 0
                      ? `The merchant deadline passed ${daysOverdue} day${
                          daysOverdue ===
                          1
                            ? ""
                            : "s"
                        } ago.`
                      : "The refund deadline has passed."}
                  </p>
                </div>

                {refund.status ===
                  "FOLLOW_UP_REQUIRED" && (
                  <button
                    onClick={
                      generateFollowUp
                    }
                    disabled={
                      generatingFollowUp
                    }
                    className="rounded-xl bg-red-700 px-5 py-3 text-sm font-black text-white hover:bg-red-800 disabled:opacity-50"
                  >
                    {generatingFollowUp
                      ? "Generating..."
                      : "Generate Follow-up"}
                  </button>
                )}
              </div>
            </section>
          )}

        {/* ==================================================
            QUICK SUMMARY
        ================================================== */}

        <section className="mb-6 grid gap-4 md:grid-cols-4">
          <SummaryCard
            label="Refund Amount"
            value={`${refund.currency} ${Number(
              refund.amount
            ).toLocaleString("en-IN")}`}
          />

          <SummaryCard
            label="Deadline"
            value={
              refund.deadline
                ? new Date(
                    refund.deadline
                  ).toLocaleDateString(
                    "en-IN"
                  )
                : "Not specified"
            }
          />

          <SummaryCard
            label="Merchant Email"
            value={
              refund.merchantEmail ||
              "Not provided"
            }
          />

          <SummaryCard
            label="Documents"
            value={String(
              refund.documents
                ?.length || 0
            )}
          />
        </section>

        {/* ==================================================
            CURRENT ACTION
        ================================================== */}

        <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                Current Action
              </p>

              <h2 className="mt-1 text-xl font-black text-gray-950">
                {isClosed
                  ? "Case completed"
                  : isFollowUpRequired
                    ? "Follow-up required"
                    : displayStatus(
                        refund.status
                      )}
              </h2>

              <p className="mt-1 text-sm font-semibold text-gray-600">
                {isClosed
                  ? "No further action is required."
                  : isFollowUpRequired
                    ? "Contact the merchant again using the follow-up email below."
                    : "Complete the next available step to move the refund forward."}
              </p>
            </div>

            <div>
              {renderStatusActions()}
            </div>
          </div>
        </section>

        {/* ==================================================
            STATUS TIMELINE
        ================================================== */}

        <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                Lifecycle
              </p>

              <h2 className="mt-1 text-xl font-black text-gray-950">
                Refund Status
              </h2>
            </div>
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-[760px] items-start">
              {statusOrder.map(
                (
                  status,
                  index
                ) => {
                  const currentIndex =
                    statusOrder.indexOf(
                      refund.status as RefundStatus
                    );

                  const isCurrent =
                    refund.status ===
                    status;

                  const isComplete =
                    currentIndex >=
                      0 &&
                    index <
                      currentIndex;

                  const specialFollowUp =
                    refund.status ===
                    "FOLLOW_UP_REQUIRED" &&
                    status ===
                      "WAITING_FOR_REFUND";

                  return (
                    <div
                      key={status}
                      className="flex flex-1 items-start"
                    >
                      <div className="flex flex-col items-center">
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-black ${
                            isCurrent
                              ? "border-gray-950 bg-gray-950 text-white"
                              : isComplete
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : specialFollowUp
                                  ? "border-red-500 bg-red-100 text-red-800"
                                  : "border-gray-300 bg-white text-gray-500"
                          }`}
                        >
                          {isComplete
                            ? "✓"
                            : index + 1}
                        </div>

                        <p
                          className={`mt-2 max-w-[105px] text-center text-[11px] font-black leading-4 ${
                            isCurrent
                              ? "text-gray-950"
                              : "text-gray-600"
                          }`}
                        >
                          {displayStatus(
                            status
                          )}
                        </p>
                      </div>

                      {index <
                        statusOrder.length -
                          1 && (
                        <div
                          className={`mt-4 h-0.5 flex-1 ${
                            isComplete
                              ? "bg-emerald-500"
                              : "bg-gray-200"
                          }`}
                        />
                      )}
                    </div>
                  );
                }
              )}
            </div>
          </div>

          {refund.status ===
            "FOLLOW_UP_REQUIRED" && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-black text-red-950">
                Follow-up is now required because
                the expected refund deadline has
                passed.
              </p>
            </div>
          )}
        </section>

        {/* ==================================================
            REFUND INFORMATION
        ================================================== */}

        <section className="mb-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-lg font-black text-gray-950">
              Refund Information
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <Detail
                label="Merchant"
                value={
                  refund.merchant
                }
              />

              <Detail
                label="Merchant Email"
                value={
                  refund.merchantEmail ||
                  "Not provided"
                }
              />

              <Detail
                label="Order ID"
                value={
                  refund.orderId ||
                  "Not provided"
                }
              />

              <Detail
                label="Transaction ID"
                value={
                  refund.transactionId ||
                  "Not provided"
                }
              />

              <Detail
                label="Amount"
                value={`${refund.currency} ${Number(
                  refund.amount
                ).toLocaleString(
                  "en-IN"
                )}`}
              />

              <Detail
                label="Purchase Date"
                value={
                  refund.purchaseDate
                    ? new Date(
                        refund.purchaseDate
                      ).toLocaleDateString(
                        "en-IN"
                      )
                    : "Not provided"
                }
              />

              <Detail
                label="Deadline"
                value={
                  refund.deadline
                    ? new Date(
                        refund.deadline
                      ).toLocaleDateString(
                        "en-IN"
                      )
                    : "Not specified"
                }
              />

              <Detail
                label="Created"
                value={new Date(
                  refund.createdAt
                ).toLocaleString(
                  "en-IN"
                )}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-lg font-black text-gray-950">
              Activity
            </h2>

            <div className="space-y-4">
              <ActivityItem
                label="Case Created"
                value={new Date(
                  refund.createdAt
                ).toLocaleString(
                  "en-IN"
                )}
                active
              />

              <ActivityItem
                label="Email Generated"
                value={
                  refund.emailGeneratedAt
                    ? new Date(
                        refund.emailGeneratedAt
                      ).toLocaleString(
                        "en-IN"
                      )
                    : "Not yet"
                }
                active={
                  !!refund.emailGeneratedAt
                }
              />

              <ActivityItem
                label="Email Sent"
                value={
                  refund.emailSentAt
                    ? new Date(
                        refund.emailSentAt
                      ).toLocaleString(
                        "en-IN"
                      )
                    : "Not yet"
                }
                active={
                  !!refund.emailSentAt
                }
              />

              <ActivityItem
                label="Refund Deadline"
                value={
                  refund.deadline
                    ? new Date(
                        refund.deadline
                      ).toLocaleString(
                        "en-IN"
                      )
                    : "Not specified"
                }
                active={
                  !!refund.deadline
                }
                danger={
                  deadlinePassed &&
                  refund.status !==
                    "REFUND_RECEIVED" &&
                  refund.status !==
                    "CLOSED"
                }
              />

              {isFollowUpRequired && (
                <ActivityItem
                  label="Follow-up Required"
                  value={
                    daysOverdue > 0
                      ? `${daysOverdue} day${
                          daysOverdue ===
                          1
                            ? ""
                            : "s"
                        } overdue`
                      : "Action required"
                  }
                  active
                  danger
                />
              )}
            </div>
          </div>
        </section>

        {/* ==================================================
            REASON
        ================================================== */}

        <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-black text-gray-950">
            Refund Reason
          </h2>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="whitespace-pre-wrap text-[15px] font-semibold leading-7 text-gray-900">
              {refund.reason}
            </p>
          </div>
        </section>

        {/* ==================================================
            EMAIL SECTION
        ================================================== */}

        {!isClosed &&
          !isFollowUpRequired && (
            <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                    Original Request
                  </p>

                  <h2 className="mt-1 text-xl font-black text-gray-950">
                    Refund Email
                  </h2>

                  <p className="mt-1 text-sm font-semibold text-gray-600">
                    Generate, edit, save and send
                    the initial refund request.
                  </p>
                </div>

                {refund.status ===
                  "EMAIL_DRAFTED" && (
                  <span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-900">
                    Draft
                  </span>
                )}
              </div>

              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-black text-gray-950">
                    Subject
                  </label>

                  <input
                    value={subject}
                    onChange={(event) =>
                      setSubject(
                        event.target.value
                      )
                    }
                    disabled={
                      refund.status !==
                        "PENDING" &&
                      refund.status !==
                        "EMAIL_DRAFTED"
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-950 outline-none focus:border-gray-950 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-black text-gray-950">
                    Email Body
                  </label>

                  <textarea
                    value={email}
                    onChange={(event) =>
                      setEmail(
                        event.target.value
                      )
                    }
                    rows={12}
                    disabled={
                      refund.status !==
                        "PENDING" &&
                      refund.status !==
                        "EMAIL_DRAFTED"
                    }
                    className="w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-4 text-sm font-semibold leading-6 text-gray-950 outline-none focus:border-gray-950 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>

                <div className="flex flex-wrap gap-3 border-t border-gray-200 pt-5">
                  <button
                    onClick={generateEmail}
                    disabled={
                      generatingEmail ||
                      refund.status ===
                        "EMAIL_SENT" ||
                      refund.status ===
                        "WAITING_FOR_REFUND"
                    }
                    className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {generatingEmail
                      ? "Generating..."
                      : "Generate"}
                  </button>

                  <button
                    onClick={saveEmail}
                    disabled={
                      savingEmail ||
                      !hasOriginalEmail ||
                      refund.status ===
                        "EMAIL_SENT" ||
                      refund.status ===
                        "WAITING_FOR_REFUND"
                    }
                    className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {savingEmail
                      ? "Saving..."
                      : "Save Draft"}
                  </button>

                  <button
                    onClick={() =>
                      copyEmail(false)
                    }
                    disabled={
                      !hasOriginalEmail
                    }
                    className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Copy
                  </button>

                  <button
                    onClick={sendEmail}
                    disabled={
                      sendingEmail ||
                      !hasOriginalEmail ||
                      !refund.merchantEmail ||
                      refund.status ===
                        "EMAIL_SENT" ||
                      refund.status ===
                        "WAITING_FOR_REFUND"
                    }
                    className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sendingEmail
                      ? "Sending..."
                      : "Send Refund Request"}
                  </button>
                </div>

                {!hasOriginalEmail && (
                  <p className="text-xs font-bold text-gray-500">
                    Generate an email or enter
                    your own subject and message
                    to continue.
                  </p>
                )}
              </div>
            </section>
          )}

        {/* ==================================================
            FOLLOW-UP EMAIL
        ================================================== */}

        {isFollowUpRequired &&
          !isClosed && (
            <section className="mb-6 rounded-2xl border border-red-300 bg-white p-6 shadow-sm">
              <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-red-700">
                    Overdue Action
                  </p>

                  <h2 className="mt-1 text-xl font-black text-gray-950">
                    Follow-up Email
                  </h2>

                  <p className="mt-1 text-sm font-semibold text-gray-700">
                    Only the follow-up communication
                    is shown because the original
                    refund request is overdue.
                  </p>
                </div>

                <span className="rounded-full border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-black text-red-900">
                  {daysOverdue > 0
                    ? `${daysOverdue} days overdue`
                    : "Action required"}
                </span>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-black text-gray-950">
                    Subject
                  </label>

                  <input
                    value={
                      followUpSubject
                    }
                    onChange={(event) =>
                      setFollowUpSubject(
                        event.target.value
                      )
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-950 outline-none focus:border-gray-950 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-black text-gray-950">
                    Email Body
                  </label>

                  <textarea
                    value={
                      followUpBody
                    }
                    onChange={(event) =>
                      setFollowUpBody(
                        event.target.value
                      )
                    }
                    rows={12}
                    className="w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-4 text-sm font-semibold leading-6 text-gray-950 outline-none focus:border-gray-950 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div className="flex flex-wrap gap-3 border-t border-gray-200 pt-5">
                  <button
                    onClick={
                      generateFollowUp
                    }
                    disabled={
                      generatingFollowUp
                    }
                    className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {generatingFollowUp
                      ? "Generating..."
                      : "Generate Follow-up"}
                  </button>

                  <button
                    onClick={
                      saveFollowUp
                    }
                    disabled={
                      savingFollowUp ||
                      !hasFollowUpEmail
                    }
                    className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {savingFollowUp
                      ? "Saving..."
                      : "Save Follow-up"}
                  </button>

                  <button
                    onClick={() =>
                      copyEmail(true)
                    }
                    disabled={
                      !hasFollowUpEmail
                    }
                    className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Copy
                  </button>

                  <button
                    onClick={
                      sendFollowUp
                    }
                    disabled={
                      sendingFollowUp ||
                      !hasFollowUpEmail ||
                      !refund.merchantEmail
                    }
                    className="rounded-xl bg-red-700 px-5 py-3 text-sm font-black text-white hover:bg-red-800 disabled:opacity-50"
                  >
                    {sendingFollowUp
                      ? "Sending..."
                      : "Send Follow-up"}
                  </button>
                </div>
              </div>
            </section>
          )}

        {/* ==================================================
            PAYMENT PROOF
        ================================================== */}

        {!isClosed && (
          <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                  Evidence
                </p>

                <h2 className="mt-1 text-xl font-black text-gray-950">
                  Payment Proof
                </h2>

                <p className="mt-1 text-sm font-semibold text-gray-600">
                  Upload a PDF transaction document,
                  extract its text and verify it
                  against the refund case.
                </p>
              </div>

              {selectedDocument && (
                <span
                  className={`rounded-full border px-3 py-1.5 text-xs font-black ${documentStatusStyle(
                    selectedDocument.status
                  )}`}
                >
                  {displayStatus(
                    selectedDocument.status
                  )}
                </span>
              )}
            </div>

            {/* UPLOAD */}

            <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 p-6">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={
                  handleFileChange
                }
                className="hidden"
              />

              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-950 text-2xl text-white">
                  PDF
                </div>

                <h3 className="mt-4 text-lg font-black text-gray-950">
                  Upload transaction proof
                </h3>

                <p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-gray-600">
                  PDF only, maximum 10 MB.
                  The document will be stored
                  with this refund case.
                </p>

                <button
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  disabled={uploading}
                  className="mt-5 rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {uploading
                    ? "Uploading..."
                    : "Choose PDF"}
                </button>
              </div>
            </div>

            {/* SELECTED DOCUMENT */}

            {selectedDocument && (
              <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                      Selected Document
                    </p>

                    <p className="mt-1 truncate text-sm font-black text-gray-950">
                      {selectedDocument.filename}
                    </p>

                    {uploadedFile &&
                      uploadedFile.size >
                        0 && (
                        <p className="mt-1 text-xs font-semibold text-gray-500">
                          {formatFileSize(
                            uploadedFile.size
                          )}
                        </p>
                      )}
                  </div>

                  <a
                    href={
                      selectedDocument.fileUrl
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-black text-gray-900 hover:bg-gray-50"
                  >
                    Open PDF
                  </a>
                </div>

                {/* PROCESSING BUTTONS */}

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    onClick={
                      extractPDF
                    }
                    disabled={
                      extracting ||
                      !selectedDocument
                    }
                    className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {extracting
                      ? "Extracting..."
                      : selectedDocument.extractedText
                        ? "Extract Again"
                        : "Extract PDF"}
                  </button>

                  <button
                    onClick={
                      verifyPDF
                    }
                    disabled={
                      verifying ||
                      !selectedDocument.extractedText
                    }
                    className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {verifying
                      ? "Verifying..."
                      : "Verify Transaction"}
                  </button>
                </div>

                {!selectedDocument.extractedText && (
                  <p className="mt-3 text-xs font-bold text-gray-500">
                    Extract the PDF before
                    verification.
                  </p>
                )}

                {/* EXTRACTED TEXT */}

                {selectedDocument.extractedText && (
                  <details className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <summary className="cursor-pointer text-sm font-black text-gray-950">
                      View extracted PDF text
                    </summary>

                    <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-4 text-xs font-medium leading-5 text-gray-800">
                      {
                        selectedDocument.extractedText
                      }
                    </pre>
                  </details>
                )}
              </div>
            )}
          </section>
        )}

        {/* ==================================================
            VERIFICATION RESULT
        ================================================== */}

        {verification && (
          <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                  Document Verification
                </p>

                <h2 className="mt-1 text-2xl font-black text-gray-950">
                  {displayStatus(
                    verification.result
                  )}
                </h2>

                <p className="mt-1 max-w-2xl text-sm font-semibold text-gray-600">
                  The transaction details extracted
                  from the uploaded PDF were
                  compared against this refund
                  case.
                </p>
              </div>

              <div
                className={`flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-full border-8 ${
                  verification.score >= 80
                    ? "border-emerald-500 bg-emerald-50"
                    : verification.score >=
                        50
                      ? "border-amber-500 bg-amber-50"
                      : "border-red-500 bg-red-50"
                }`}
              >
                <span className="text-2xl font-black text-gray-950">
                  {verification.score}%
                </span>

                <span className="text-[10px] font-black uppercase text-gray-600">
                  Match
                </span>
              </div>
            </div>

            <div
              className={`mt-6 rounded-xl border p-4 ${verificationStyle(
                verification.result
              )}`}
            >
              <p className="text-sm font-black">
                {verification.result ===
                "VERIFIED"
                  ? "✓ The uploaded document matches the refund details."
                  : verification.result ===
                      "PARTIAL_MATCH"
                    ? "⚠ Some details match, but the document should be reviewed."
                    : verification.result ===
                        "MISMATCH"
                      ? "✕ The uploaded document does not sufficiently match this refund."
                      : "The system could not confidently verify the document."}
              </p>
            </div>

            {/* COMPARISON */}

            <div className="mt-6">
              <h3 className="mb-3 text-sm font-black text-gray-950">
                Field Comparison
              </h3>

              <div className="grid gap-4 md:grid-cols-2">
                <VerificationRow
                  label="Amount"
                  matched={
                    verification.checks
                      .amount
                  }
                  expected={`${refund.currency} ${Number(
                    refund.amount
                  ).toLocaleString(
                    "en-IN"
                  )}`}
                  extracted={
                    verification.extracted
                      .amount !==
                    null
                      ? `${refund.currency} ${Number(
                          verification
                            .extracted
                            .amount
                        ).toLocaleString(
                          "en-IN"
                        )}`
                      : "Not found"
                  }
                />

                <VerificationRow
                  label="Transaction ID"
                  matched={
                    verification.checks
                      .transactionId
                  }
                  expected={
                    refund.transactionId ||
                    "Not provided"
                  }
                  extracted={
                    verification
                      .extracted
                      .transactionId ||
                    "Not found"
                  }
                />

                <VerificationRow
                  label="Merchant"
                  matched={
                    verification.checks
                      .merchant
                  }
                  expected={
                    refund.merchant
                  }
                  extracted={
                    verification
                      .extracted
                      .merchant ||
                    "Not found"
                  }
                />

                <VerificationRow
                  label="Purchase Date"
                  matched={
                    verification.checks
                      .date
                  }
                  expected={
                    refund.purchaseDate
                      ? new Date(
                          refund.purchaseDate
                        ).toLocaleDateString(
                          "en-IN"
                        )
                      : "Not provided"
                  }
                  extracted={
                    verification
                      .extracted
                      .date
                      ? new Date(
                          verification
                            .extracted
                            .date
                        ).toLocaleDateString(
                          "en-IN"
                        )
                      : "Not found"
                  }
                />
              </div>
            </div>
          </section>
        )}

        {/* ==================================================
            DOCUMENT HISTORY
        ================================================== */}

        {refund.documents &&
          refund.documents.length >
            0 && (
            <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                  Evidence History
                </p>

                <h2 className="mt-1 text-xl font-black text-gray-950">
                  Uploaded Documents
                </h2>
              </div>

              <div className="space-y-3">
                {refund.documents
                  .slice()
                  .reverse()
                  .map(
                    (
                      document
                    ) => (
                      <div
                        key={
                          document.id
                        }
                        className={`rounded-xl border p-4 ${
                          selectedDocument?.id ===
                          document.id
                            ? "border-gray-400 bg-gray-50"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-gray-950">
                              {
                                document.filename
                              }
                            </p>

                            <p className="mt-1 text-xs font-semibold text-gray-500">
                              Uploaded{" "}
                              {new Date(
                                document.uploadedAt
                              ).toLocaleString(
                                "en-IN"
                              )}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-black ${documentStatusStyle(
                                document.status
                              )}`}
                            >
                              {displayStatus(
                                document.status
                              )}
                            </span>

                            {document.verificationResult && (
                              <span
                                className={`rounded-full border px-3 py-1 text-xs font-black ${verificationStyle(
                                  document.verificationResult
                                )}`}
                              >
                                {
                                  document.verificationResult
                                }{" "}
                                {document.verificationScore !==
                                  null &&
                                  document.verificationScore !==
                                    undefined &&
                                  `· ${document.verificationScore}%`}
                              </span>
                            )}

                            <button
                              onClick={() => {
                                setSelectedDocument(
                                  document
                                );

                                if (
                                  document.verificationResult
                                ) {
                                  setVerification(
                                    {
                                      result:
                                        document.verificationResult ||
                                        "UNABLE_TO_VERIFY",

                                      score:
                                        document.verificationScore ||
                                        0,

                                      checks:
                                        {
                                          amount:
                                            document.verificationResult ===
                                            "VERIFIED",

                                          transactionId:
                                            document.verificationResult ===
                                            "VERIFIED",

                                          merchant:
                                            document.verificationResult ===
                                            "VERIFIED",

                                          date:
                                            document.verificationResult ===
                                            "VERIFIED",
                                        },

                                      extracted:
                                        {
                                          amount:
                                            document.extractedAmount !==
                                            null &&
                                            document.extractedAmount !==
                                              undefined
                                              ? Number(
                                                  document.extractedAmount
                                                )
                                              : null,

                                          transactionId:
                                            document.extractedTransactionId ||
                                            null,

                                          merchant:
                                            document.extractedMerchant ||
                                            null,

                                          date:
                                            document.extractedDate ||
                                            null,
                                        },
                                    }
                                  );
                                }
                              }}
                              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-black text-gray-900 hover:bg-gray-50"
                            >
                              Select
                            </button>

                            <a
                              href={
                                document.fileUrl
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-black text-gray-900 hover:bg-gray-50"
                            >
                              Open
                            </a>
                          </div>
                        </div>
                      </div>
                    )
                  )}
              </div>
            </section>
          )}

        {/* ==================================================
            CLOSED STATE
        ================================================== */}

        {isClosed && (
          <section className="mb-6 rounded-2xl border border-emerald-300 bg-emerald-50 p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xl font-black text-white">
                ✓
              </div>

              <div>
                <h2 className="text-xl font-black text-emerald-950">
                  Refund case closed
                </h2>

                <p className="mt-1 text-sm font-semibold text-emerald-900">
                  This case has reached its final
                  state. Existing documents and
                  records remain available for review.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ==================================================
            FOOTER ACTIONS
        ================================================== */}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 py-6">
          <button
            onClick={() =>
              router.push(
                "/dashboard"
              )
            }
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-900 hover:bg-gray-50"
          >
            ← Dashboard
          </button>

          <button
  type="button"
  onClick={async () => {
    const confirmed = window.confirm(
      "Delete this refund case?\n\nThis will permanently delete the case and its uploaded documents."
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `/api/refunds/${refund.id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to delete refund case"
        );
      }

      alert("Refund case deleted successfully.");

      window.location.href = "/refunds";
    } catch (error) {
      console.error(
        "DELETE REFUND ERROR:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Failed to delete refund case"
      );
    }
  }}
  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
>
  Delete Refund
</button>

          <button
            onClick={() =>
              loadRefund(false)
            }
            disabled={refreshing}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            {refreshing
              ? "Refreshing..."
              : "Refresh Case"}
          </button>
        </div>
      </div>
    </main>
  );
}

/* ======================================================
   SMALL COMPONENTS
====================================================== */

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wider text-gray-500">
        {label}
      </p>

      <p className="mt-2 break-words text-lg font-black text-gray-950">
        {value}
      </p>
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wider text-gray-500">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-black text-gray-950">
        {value}
      </p>
    </div>
  );
}

function ActivityItem({
  label,
  value,
  active,
  danger = false,
}: {
  label: string;
  value: string;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div
        className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
          danger
            ? "bg-red-600"
            : active
              ? "bg-gray-950"
              : "bg-gray-300"
        }`}
      />

      <div>
        <p
          className={`text-sm font-black ${
            danger
              ? "text-red-950"
              : "text-gray-950"
          }`}
        >
          {label}
        </p>

        <p className="mt-0.5 text-xs font-semibold text-gray-600">
          {value}
        </p>
      </div>
    </div>
  );
}

function VerificationRow({
  label,
  matched,
  expected,
  extracted,
}: {
  label: string;
  matched: boolean;
  expected: string;
  extracted: string;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        matched
          ? "border-emerald-200 bg-emerald-50"
          : "border-red-200 bg-red-50"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-gray-950">
          {label}
        </p>

        <span
          className={`text-xs font-black ${
            matched
              ? "text-emerald-800"
              : "text-red-800"
          }`}
        >
          {matched
            ? "✓ MATCH"
            : "✕ NO MATCH"}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">
            Expected
          </p>

          <p className="mt-1 break-words text-sm font-black text-gray-950">
            {expected}
          </p>
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">
            PDF
          </p>

          <p className="mt-1 break-words text-sm font-black text-gray-950">
            {extracted}
          </p>
        </div>
      </div>
    </div>
  );
}

function formatFileSize(
  bytes: number
) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}