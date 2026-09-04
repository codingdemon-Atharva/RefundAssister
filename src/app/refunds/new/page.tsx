"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function NewRefundPage() {
  const router = useRouter();

  const [merchant, setMerchant] = useState("");
  const [merchantEmail, setMerchantEmail] = useState("");
  const [orderId, setOrderId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [reason, setReason] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [deadline, setDeadline] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/refunds", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          merchant,
          merchantEmail,
          orderId: orderId || null,
          transactionId: transactionId || null,
          amount,
          currency,
          reason,
          purchaseDate: purchaseDate || null,
          deadline: deadline || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to create refund case.");
        return;
      }

      /*
       * Redirect directly to the newly-created
       * refund details page.
       */
      router.push(`/refunds/${data.id}`);
    } catch (error) {
      console.error(error);

      setError("Unable to create refund case. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fa]">
      {/* NAVBAR */}

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="text-xl font-bold tracking-tight text-slate-950"
          >
            Refund
            <span className="text-blue-600">Assister</span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="text-sm font-medium text-slate-500 transition hover:text-slate-950"
          >
            Dashboard
          </button>
        </div>
      </header>

      {/* PAGE */}

      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* BACK */}

        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="mb-7 text-sm font-medium text-slate-500 transition hover:text-slate-950"
        >
          ← Back to Dashboard
        </button>

        {/* TITLE */}

        <div className="mb-8">
          <p className="mb-2 text-sm font-medium text-blue-600">
            New refund case
          </p>

          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            Create a refund request
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Add the transaction details below. Refund Assister will use these
            details to prepare a professional refund request email.
          </p>
        </div>

        {/* ERROR */}

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        )}

        {/* FORM */}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* MERCHANT */}

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-950">
                Merchant information
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Tell us where the refund should be requested.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label
                  htmlFor="merchant"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Merchant
                </label>

                <input
                  id="merchant"
                  type="text"
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  placeholder="e.g. Amazon"
                  required
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="merchantEmail"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Company email
                </label>

                <input
                  id="merchantEmail"
                  type="email"
                  value={merchantEmail}
                  onChange={(e) => setMerchantEmail(e.target.value)}
                  placeholder="support@company.com"
                  required
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />

                <p className="mt-2 text-xs text-slate-400">
                  The email will only be sent after you review and approve it.
                </p>
              </div>
            </div>
          </section>

          {/* TRANSACTION */}

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-950">
                Transaction details
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Provide the information that identifies the purchase.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label
                  htmlFor="orderId"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Order ID
                </label>

                <input
                  id="orderId"
                  type="text"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="e.g. ORD-12345"
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="transactionId"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Transaction ID
                </label>

                <input
                  id="transactionId"
                  type="text"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="e.g. TXN-98765"
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          </section>

          {/* AMOUNT */}

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-950">
                Refund amount
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Enter the amount you expect to receive back.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              <div className="md:col-span-2">
                <label
                  htmlFor="amount"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Amount
                </label>

                <input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="currency"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Currency
                </label>

                <select
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="INR">INR — Indian Rupee</option>

                  <option value="USD">USD — US Dollar</option>

                  <option value="EUR">EUR — Euro</option>

                  <option value="GBP">GBP — Pound</option>
                </select>
              </div>
            </div>
          </section>

          {/* DATES */}

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-950">
                Purchase timeline
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                These dates help track when the refund should arrive.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label
                  htmlFor="purchaseDate"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Purchase date
                </label>

                <input
                  id="purchaseDate"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="deadline"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Expected refund deadline
                </label>

                <input
                  id="deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />

                <p className="mt-2 text-xs text-slate-400">
                  We will use this date later to determine when bank
                  verification is required.
                </p>
              </div>
            </div>
          </section>

          {/* REASON */}

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-950">
                Refund reason
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Describe why you are requesting the refund.
              </p>
            </div>

            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain the reason for your refund request..."
              required
              className="min-h-[160px] w-full resize-y rounded-lg border border-slate-200 px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </section>

          {/* SUBMIT */}

          <section className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              disabled={loading}
              className="rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-slate-950 px-7 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Refund Case"}
            </button>
          </section>
        </form>
      </div>
    </main>
  );
}