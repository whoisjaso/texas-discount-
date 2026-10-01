"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeSale } from "@/lib/actions/complete-sale";

/**
 * Closing a sale.
 *
 * Marks the car sold and records who bought it against the vehicle, so
 * inventory and the sale record can never disagree about who has it.
 *
 * The two fields are here rather than assumed because both routinely change
 * between opening a deal and closing it: the price gets negotiated, and the ID
 * number often is not read off the licence until the buyer is at the desk.
 */
export default function CompleteSalePanel({
  dealId,
  buyerName,
  buyerIdNumber,
  salePrice,
}: {
  dealId: string;
  buyerName: string;
  buyerIdNumber: string;
  salePrice: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [idNumber, setIdNumber] = useState(buyerIdNumber);
  const [price, setPrice] = useState(
    salePrice != null ? String(salePrice) : "",
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const trimmedId = idNumber.trim();

      // One call, one transaction. This used to write the corrected ID to
      // the customer first and then complete the sale separately, so a
      // failure between the two left a corrected customer on an open deal
      // (review round 3, finding 5). completeSale carries the correction
      // into the atomic RPC, which updates the customer record too.
      const parsedPrice = price.trim() === "" ? null : Number(price);
      const result = await completeSale({
        dealId,
        buyerIdNumber: trimmedId || null,
        salePrice:
          parsedPrice != null && Number.isFinite(parsedPrice)
            ? parsedPrice
            : null,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="ed-admin-panel p-6 md:p-7"
      aria-label={buyerName ? `Close the sale to ${buyerName}` : "Close the sale"}
    >
      <h2 className="ed-doc-title">Close The Sale</h2>

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="ed-field-label">Buyer ID number</span>
          <input
            value={idNumber}
            onChange={(event) => setIdNumber(event.target.value)}
            className="ed-input"
            autoComplete="off"
            disabled={pending}
          />
        </label>

        <label className="block">
          <span className="ed-field-label">Sale price (USD)</span>
          <input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="ed-input"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            autoComplete="off"
            disabled={pending}
          />
        </label>
      </div>

      {error ? (
        <p role="alert" className="ed-body mt-5 text-[#E7A38A]">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        className="tj-action-base tj-action-primary tj-action-md mt-6"
        disabled={pending}
      >
        {pending ? "Closing…" : "Mark Sold And Close"}
      </button>
    </form>
  );
}
