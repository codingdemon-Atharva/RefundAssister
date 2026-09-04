"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Refund = {
  id: string;
  merchant: string;
  merchantEmail?: string | null;
  orderId?: string | null;
  transactionId?: string | null;
  amount: string;
  currency: string;
  reason: string;
  purchaseDate?: string | null;
  deadline?: string | null;
  status: string;
  emailSubject?: string | null;
  emailBody?: string | null;
  emailSentAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

function statusLabel(status: string) {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusClass(status: string) {
  switch (status) {
    case "REFUND_RECEIVED":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";

    case "FOLLOW_UP_REQUIRED":
      return "bg-red-100 text-red-800 border-red-200";

    case "WAITING_FOR_REFUND":
      return "bg-orange-100 text-orange-800 border-orange-200";

    case "EMAIL_SENT":
      return "bg-purple-100 text-purple-800 border-purple-200";

    case "EMAIL_DRAFTED":
      return "bg-blue-100 text-blue-800 border-blue-200";

    case "REFUND_APPROVED":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";

    case "CLOSED":
      return "bg-gray-200 text-gray-800 border-gray-300";

    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

function getDaysLate(deadline: string | null) {
  if (!deadline) return 0;

  const deadlineDate = new Date(deadline);
  const now = new Date();

  const difference =
    now.getTime() - deadlineDate.getTime();

  return Math.max(
    0,
    Math.ceil(
      difference / (1000 * 60 * 60 * 24)
    )
  );
}

export default function DashboardPage() {
  const router = useRouter();

  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingDeadlines, setCheckingDeadlines] =
    useState(false);

  const [error, setError] = useState("");

  async function loadRefunds() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        "/api/refunds",
        {
          cache: "no-store",
        }
      );

      const text = await response.text();

      let data;

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(
          `Server returned invalid response (${response.status})`
        );
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to load refunds"
        );
      }

      setRefunds(
        Array.isArray(data)
          ? data
          : data.refunds || []
      );
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Unable to load refunds"
      );
    } finally {
      setLoading(false);
    }
  }

  async function checkDeadlines() {
    try {
      setCheckingDeadlines(true);
      setError("");

      const response = await fetch(
        "/api/refunds/check-deadlines",
        {
          method: "POST",
        }
      );

      const text = await response.text();

      let data;

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(
          `Server returned invalid response (${response.status})`
        );
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to check deadlines"
        );
      }

      await loadRefunds();
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Unable to check deadlines"
      );
    } finally {
      setCheckingDeadlines(false);
    }
  }

  useEffect(() => {
    loadRefunds();
  }, []);

  const pendingRefunds = refunds.filter(
    (refund) =>
      refund.status !== "REFUND_RECEIVED" &&
      refund.status !== "CLOSED"
  );

  const followUps = refunds.filter(
    (refund) =>
      refund.status === "FOLLOW_UP_REQUIRED"
  );

  const receivedRefunds = refunds.filter(
    (refund) =>
      refund.status === "REFUND_RECEIVED"
  );

  const totalPending = pendingRefunds.reduce(
    (total, refund) =>
      total + Number(refund.amount || 0),
    0
  );

  return (
    <main className="min-h-screen bg-[#f6f7f9]">

      {/* HEADER */}

      <header className="border-b border-gray-200 bg-white">

        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">

          <div>
            <h1 className="text-xl font-bold text-gray-950">
              Refund Assister
            </h1>

            <p className="mt-0.5 text-xs font-medium text-gray-600">
              Track and manage your refund requests
            </p>
          </div>

          <button
            onClick={() =>
              router.push("/refunds/new")
            }
            className="rounded-lg bg-black px-5 py-3 text-sm font-bold text-white transition hover:bg-gray-800"
          >
            + New Refund
          </button>

        </div>

      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">

        {/* TITLE */}

        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">

          <div>

            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Dashboard
            </p>

            <h2 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
              Refund Overview
            </h2>

            <p className="mt-2 text-sm font-medium text-gray-600">
              Monitor active refunds, deadlines and follow-ups.
            </p>

          </div>

          <button
            onClick={checkDeadlines}
            disabled={checkingDeadlines}
            className="w-fit rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            {checkingDeadlines
              ? "Checking..."
              : "Check Deadlines"}
          </button>

        </div>

        {/* ERROR */}

        {error && (
          <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4">

            <p className="text-sm font-bold text-red-900">
              {error}
            </p>

          </div>
        )}

        {/* STATS */}

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <StatCard
            title="Total Cases"
            value={refunds.length.toString()}
          />

          <StatCard
            title="Pending"
            value={pendingRefunds.length.toString()}
          />

          <StatCard
            title="Follow-ups"
            value={followUps.length.toString()}
            danger={followUps.length > 0}
          />

          <StatCard
            title="Pending Value"
            value={`₹${totalPending.toLocaleString("en-IN")}`}
          />

        </section>

        {/* FOLLOW UPS */}

        {followUps.length > 0 && (
          <section className="mb-8">

            <div className="mb-4">

              <p className="text-xs font-bold uppercase tracking-wider text-red-600">
                Action Required
              </p>

              <h3 className="mt-1 text-xl font-bold text-gray-950">
                Follow-up Required
              </h3>

            </div>

            <div className="space-y-4">

              {followUps.map((refund) => {

                const daysLate =
                  getDaysLate(
                    refund.deadline || null
                  );

                return (
                  <div
                    key={refund.id}
                    className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm"
                  >

                    <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">

                      <div>

                        <div className="flex flex-wrap items-center gap-2">

                          <h4 className="text-lg font-bold text-gray-950">
                            {refund.merchant}
                          </h4>

                          <span className="rounded-full border border-red-200 bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">
                            {daysLate}{" "}
                            {daysLate === 1
                              ? "day"
                              : "days"}{" "}
                            late
                          </span>

                        </div>

                        <p className="mt-2 text-sm font-semibold text-gray-700">
                          Refund amount:{" "}
                          <span className="font-bold text-gray-950">
                            {refund.currency}{" "}
                            {refund.amount}
                          </span>
                        </p>

                        {refund.deadline && (
                          <p className="mt-1 text-xs font-semibold text-gray-600">
                            Deadline:{" "}
                            {new Date(
                              refund.deadline
                            ).toLocaleDateString()}
                          </p>
                        )}

                      </div>

                      <div className="flex flex-wrap gap-2">

                        <button
                          onClick={() =>
                            router.push(
                              `/refunds/${refund.id}`
                            )
                          }
                          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-900 hover:bg-gray-50"
                        >
                          View Case
                        </button>

                        <button
                          onClick={() =>
                            router.push(
                              `/refunds/${refund.id}?followup=true`
                            )
                          }
                          className="rounded-lg bg-black px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800"
                        >
                          Follow Up
                        </button>

                      </div>

                    </div>

                  </div>
                );
              })}

            </div>

          </section>
        )}

        {/* ALL REFUNDS */}

        <section>

          <div className="mb-4 flex items-end justify-between">

            <div>

              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Cases
              </p>

              <h3 className="mt-1 text-xl font-bold text-gray-950">
                All Refunds
              </h3>

            </div>

            <p className="text-sm font-semibold text-gray-500">
              {refunds.length}{" "}
              {refunds.length === 1
                ? "case"
                : "cases"}
            </p>

          </div>

          {loading ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">

              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-black" />

              <p className="mt-4 text-sm font-bold text-gray-700">
                Loading refunds...
              </p>

            </div>
          ) : refunds.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">

              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-2xl">
                ₹
              </div>

              <h4 className="mt-4 text-lg font-bold text-gray-950">
                No refund cases yet
              </h4>

              <p className="mt-2 text-sm font-medium text-gray-600">
                Create your first refund case to get started.
              </p>

              <button
                onClick={() =>
                  router.push("/refunds/new")
                }
                className="mt-5 rounded-lg bg-black px-5 py-3 text-sm font-bold text-white hover:bg-gray-800"
              >
                Create Refund
              </button>

            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">

              <div className="divide-y divide-gray-200">

                {refunds.map((refund) => (

                  <button
                    key={refund.id}
                    onClick={() =>
                      router.push(
                        `/refunds/${refund.id}`
                      )
                    }
                    className="block w-full p-5 text-left transition hover:bg-gray-50"
                  >

                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

                      <div className="min-w-0">

                        <div className="flex flex-wrap items-center gap-2">

                          <h4 className="truncate text-base font-bold text-gray-950">
                            {refund.merchant}
                          </h4>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(
                              refund.status
                            )}`}
                          >
                            {statusLabel(
                              refund.status
                            )}
                          </span>

                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-gray-600">

                          {refund.orderId && (
                            <span>
                              Order:{" "}
                              <strong className="text-gray-900">
                                {refund.orderId}
                              </strong>
                            </span>
                          )}

                          {refund.transactionId && (
                            <span>
                              Transaction:{" "}
                              <strong className="text-gray-900">
                                {refund.transactionId}
                              </strong>
                            </span>
                          )}

                        </div>

                      </div>

                      <div className="shrink-0 md:text-right">

                        <p className="text-lg font-bold text-gray-950">
                          {refund.currency}{" "}
                          {refund.amount}
                        </p>

                        {refund.deadline && (
                          <p className="mt-1 text-xs font-semibold text-gray-600">
                            Deadline:{" "}
                            {new Date(
                              refund.deadline
                            ).toLocaleDateString()}
                          </p>
                        )}

                      </div>

                    </div>

                  </button>

                ))}

              </div>

            </div>
          )}

        </section>

        {/* RECEIVED */}

        {receivedRefunds.length > 0 && (
          <section className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">

            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Completed
            </p>

            <p className="mt-1 text-sm font-bold text-emerald-950">
              {receivedRefunds.length} refund
              {receivedRefunds.length === 1
                ? ""
                : "s"} received successfully.
            </p>

          </section>
        )}

      </div>

    </main>
  );
}

function StatCard({
  title,
  value,
  danger = false,
}: {
  title: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
        danger
          ? "border-red-200"
          : "border-gray-200"
      }`}
    >

      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
        {title}
      </p>

      <p
        className={`mt-2 text-2xl font-bold ${
          danger
            ? "text-red-700"
            : "text-gray-950"
        }`}
      >
        {value}
      </p>

    </div>
  );
}