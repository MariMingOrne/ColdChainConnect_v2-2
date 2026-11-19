import { randomUUID } from "crypto";
import { and, asc, eq, lt } from "drizzle-orm";
import { totalDiscountRate } from "../../shared/api";
import { db } from "../db";
import { accounts_receivable, agents, bookings, invoices, invoice_credit_applications, invoice_items } from "../db/schema";

function generateReceiptNumber(): string {
  const num = Math.floor(Math.random() * 99999).toString().padStart(6, "0");
  return `${num.slice(0, 3)} ${num.slice(3)}`;
}

export async function createInvoiceAfterPicking(bookingId: string) {
  return db.transaction(async (tx) => {
    await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.id, bookingId)).for("update");

    const existingInvoice = await tx.query.invoices.findFirst({
      where: eq(invoices.booking_id, bookingId),
    });
    if (existingInvoice) return { status: "existing" as const, invoice: existingInvoice };

    const booking = await tx.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
      with: {
        customer: { with: { discounts: true } },
        booking_items: { with: { product: true } },
        creator: true,
        order_pallets: { with: { items: true } },
      },
    });

    if (!booking) return { status: "not_found" as const, invoice: null };
    if (booking.status !== "approved") return { status: "not_ready" as const, invoice: null };

    const pallets = booking.order_pallets;
    if (pallets.length === 0 || pallets.some((pallet) => !["prepared", "approved", "shipped"].includes(pallet.status))) {
      return { status: "not_ready" as const, invoice: null };
    }

    const bookedQuantities = new Map<string, number>();
    for (const item of booking.booking_items) {
      bookedQuantities.set(item.product_id, (bookedQuantities.get(item.product_id) ?? 0) + item.qty_ordered);
    }

    const pickedQuantities = new Map<string, number>();
    for (const pallet of pallets) {
      for (const item of pallet.items) {
        pickedQuantities.set(item.product_id, (pickedQuantities.get(item.product_id) ?? 0) + item.qty_units);
      }
    }

    const quantitiesMatch = bookedQuantities.size === pickedQuantities.size &&
      [...bookedQuantities].every(([productId, quantity]) => pickedQuantities.get(productId) === quantity);
    if (!quantitiesMatch) return { status: "incomplete_pick" as const, invoice: null };

    // Receipts name the person, not the login: use the agent's full name when there is one.
    const preparer = await tx.query.agents.findFirst({
      where: eq(agents.user_id, booking.created_by),
      columns: { full_name: true },
    });
    const preparedBy = preparer?.full_name?.trim() || booking.creator?.username || "";

    const discountRate = totalDiscountRate(booking.customer?.discounts);
    const lineItems = booking.booking_items.map((item) => {
      const unitPrice = Number.parseFloat(item.product?.price ?? "0");
      return {
        product_id: item.product_id,
        product_name: item.product?.name ?? item.product_id,
        product_sku: item.product?.sku ?? null,
        unit_weight_kg: item.product?.weight ?? null,
        unit_label: item.product?.unit ?? "PK",
        qty_ordered: item.qty_ordered,
        unit_price: unitPrice,
        amount: unitPrice * item.qty_ordered,
      };
    });
    const gross = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const discountAmount = gross * discountRate;
    const totalAmountCents = Math.round((gross - discountAmount) * 100);
    const invoiceId = randomUUID();
    const availableCredits = await tx.select().from(accounts_receivable)
      .where(and(
        eq(accounts_receivable.customer_id, booking.customer_id),
        eq(accounts_receivable.credit_type, "overpayment"),
        eq(accounts_receivable.status, "outstanding"),
        lt(accounts_receivable.amount_due, "0"),
      ))
      .orderBy(asc(accounts_receivable.created_at), asc(accounts_receivable.id))
      .for("update");
    let remainingInvoiceCents = totalAmountCents;
    let creditAppliedCents = 0;
    const creditApplications: Array<{ creditId: string; amountCents: number; remainingCreditCents: number }> = [];
    for (const credit of availableCredits) {
      if (remainingInvoiceCents === 0) break;
      const availableCents = Math.abs(Math.round(Number(credit.amount_due) * 100));
      const amountCents = Math.min(availableCents, remainingInvoiceCents);
      creditAppliedCents += amountCents;
      remainingInvoiceCents -= amountCents;
      creditApplications.push({
        creditId: credit.id,
        amountCents,
        remainingCreditCents: availableCents - amountCents,
      });
    }

    await tx.insert(invoices).values({
      id: invoiceId,
      booking_id: bookingId,
      agent_id: booking.created_by,
      status: remainingInvoiceCents === 0 ? "paid" : "issued",
      payment_status: creditAppliedCents === 0 ? "unpaid" : remainingInvoiceCents === 0 ? "paid" : "partial",
      receipt_number: generateReceiptNumber(),
      customer_name: booking.customer?.store_name ?? "",
      customer_address: booking.customer?.location ?? "",
      customer_payment_type: booking.customer?.payment_type ?? "cod",
      discount_rate: String(discountRate),
      gross_amount: gross.toFixed(2),
      discount_amount: discountAmount.toFixed(2),
      total_amount: (totalAmountCents / 100).toFixed(2),
      credit_applied_amount: (creditAppliedCents / 100).toFixed(2),
      prepared_by: preparedBy,
    });

    for (const application of creditApplications) {
      await tx.update(accounts_receivable).set({
        amount_due: (-application.remainingCreditCents / 100).toFixed(2),
        status: application.remainingCreditCents === 0 ? "paid" : "outstanding",
        updated_at: new Date(),
      }).where(eq(accounts_receivable.id, application.creditId));
      await tx.insert(invoice_credit_applications).values({
        id: randomUUID(),
        credit_ar_id: application.creditId,
        invoice_id: invoiceId,
        amount_applied: (application.amountCents / 100).toFixed(2),
      });
    }

    if (lineItems.length > 0) {
      await tx.insert(invoice_items).values(lineItems.map((item) => ({
        id: randomUUID(),
        invoice_id: invoiceId,
        product_id: item.product_id,
        product_name: item.product_name,
        product_sku: item.product_sku,
        unit_weight_kg: item.unit_weight_kg,
        unit_label: item.unit_label,
        qty_ordered: item.qty_ordered,
        unit_price: item.unit_price.toFixed(2),
        amount: item.amount.toFixed(2),
      })));
    }

    const invoice = await tx.query.invoices.findFirst({
      where: eq(invoices.id, invoiceId),
      with: {
        invoice_items: true,
        booking: {
          with: {
            customer: true,
            booking_items: { with: { product: true } },
          },
        },
      },
    });

    return { status: "created" as const, invoice };
  });
}
