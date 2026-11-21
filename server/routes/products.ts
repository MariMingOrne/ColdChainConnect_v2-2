import type { RequestHandler } from "express";
import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { product_costs, products } from "../db/schema";
import { PRODUCT_UNITS, type ProductUnit } from "../../shared/api";
import type { AuthRequest } from "../middleware/auth";
import { logAction } from "../middleware/audit-logger";
import { demoProducts } from "../demo-data";

export const listProducts: RequestHandler = async (req, res) => {
  try {
    // Use demo data if no database
    if (!process.env.DATABASE_URL) {
      return res.json([...demoProducts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    }

    const includeArchived = req.query.include_archived === "true";
    const allProducts = await db.query.products.findMany({
      where: includeArchived ? undefined : eq(products.is_archived, false),
      orderBy: [desc(products.created_at)],
    });
    res.json(allProducts);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Reads an optional money field: undefined = not sent, null = cleared, string = a valid amount.
 * Returns "invalid" for anything that is not a non-negative number.
 */
function readOptionalMoney(value: unknown): string | null | undefined | "invalid" {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(amount) || amount < 0) return "invalid";
  return amount.toFixed(2);
}

function readUnit(value: unknown): ProductUnit | undefined | "invalid" {
  if (value === undefined) return undefined;
  return PRODUCT_UNITS.find((unit) => unit === value) ?? "invalid";
}

/** undefined = leave as is, null = clear, string = set. */
async function saveProductCost(productId: string, cost: string | null | undefined) {
  if (cost === undefined) return;
  if (cost === null) {
    await db.delete(product_costs).where(eq(product_costs.product_id, productId));
    return;
  }
  await db
    .insert(product_costs)
    .values({ product_id: productId, cost_price: cost })
    .onConflictDoUpdate({ target: product_costs.product_id, set: { cost_price: cost, updated_at: new Date() } });
}

/** GET /api/product-costs: { [productId]: costPrice }. Admin only. */
export const listProductCosts: RequestHandler = async (_req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json({});
    const rows = await db.select().from(product_costs);
    res.json(Object.fromEntries(rows.map((row) => [row.product_id, row.cost_price])));
  } catch (error) {
    console.error("Error listing product costs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const createProduct: RequestHandler = async (
  req: AuthRequest,
  res
) => {
  const { name, sku, price, image_filename, batch_tracking_enabled, reorder_point, weight, manufacturer, is_discontinued } = req.body;

  if (!name || !price) {
    return res.status(400).json({ error: "Name and price are required" });
  }
  const srp = readOptionalMoney(req.body.srp);
  const costPrice = readOptionalMoney(req.body.cost_price);
  const unit = readUnit(req.body.unit);
  if (srp === "invalid" || costPrice === "invalid") {
    return res.status(400).json({ error: "SRP and cost price must be zero or more" });
  }
  if (unit === "invalid") {
    return res.status(400).json({ error: `Unit must be one of ${PRODUCT_UNITS.join(", ")}` });
  }

  try {
    const id = randomUUID();
    await db.insert(products).values({
      id,
      name,
      sku: sku || null,
      price: price.toString(),
      image_filename: image_filename || null,
      batch_tracking_enabled: batch_tracking_enabled ?? true,
      reorder_point: reorder_point ?? null,
      weight: weight != null && weight !== "" ? weight.toString() : null,
      unit: unit ?? "PK",
      srp: srp ?? null,
      manufacturer: manufacturer || null,
      is_discontinued: is_discontinued ?? false,
    });

    await saveProductCost(id, costPrice);

    const newProduct = await db.query.products.findFirst({
      where: eq(products.id, id),
    });

    if (req.user) {
      await logAction(
        req.user.userId,
        "create",
        "product",
        id,
        undefined,
        newProduct
      );
    }

    res.status(201).json(newProduct);
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateProduct: RequestHandler = async (
  req: AuthRequest,
  res
) => {
  const { id } = req.params;
  const { name, sku, price, image_filename, batch_tracking_enabled, reorder_point, weight, manufacturer, is_discontinued } = req.body;
  const srp = readOptionalMoney(req.body.srp);
  const costPrice = readOptionalMoney(req.body.cost_price);
  const unit = readUnit(req.body.unit);
  if (srp === "invalid" || costPrice === "invalid") {
    return res.status(400).json({ error: "SRP and cost price must be zero or more" });
  }
  if (unit === "invalid") {
    return res.status(400).json({ error: `Unit must be one of ${PRODUCT_UNITS.join(", ")}` });
  }

  try {
    const existing = await db.query.products.findFirst({
      where: eq(products.id, id),
    });

    if (!existing) {
      return res.status(404).json({ error: "Product not found" });
    }

    await db
      .update(products)
      .set({
        name: name || existing.name,
        sku: sku !== undefined ? sku : existing.sku,
        price: price ? price.toString() : existing.price,
        image_filename: image_filename !== undefined ? image_filename : existing.image_filename,
        batch_tracking_enabled:
          batch_tracking_enabled ?? existing.batch_tracking_enabled,
        reorder_point: reorder_point !== undefined ? reorder_point : existing.reorder_point,
        weight: weight !== undefined ? (weight === null || weight === "" ? null : weight.toString()) : existing.weight,
        unit: unit ?? existing.unit,
        srp: srp !== undefined ? srp : existing.srp,
        manufacturer: manufacturer !== undefined ? manufacturer : existing.manufacturer,
        is_discontinued: is_discontinued !== undefined ? is_discontinued : existing.is_discontinued,
        updated_at: new Date(),
      })
      .where(eq(products.id, id));
    await saveProductCost(id, costPrice);

    const updated = await db.query.products.findFirst({
      where: eq(products.id, id),
    });

    if (req.user) {
      await logAction(
        req.user.userId,
        "update",
        "product",
        id,
        existing,
        updated
      );
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const setProductArchived: RequestHandler = async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (typeof req.body?.is_archived !== "boolean") {
    return res.status(400).json({ error: "Archive status must be a boolean" });
  }

  try {
    const existing = await db.query.products.findFirst({
      where: eq(products.id, id),
    });
    if (!existing) {
      return res.status(404).json({ error: "Product not found" });
    }

    const archived = req.body.is_archived;
    const [updated] = await db
      .update(products)
      .set({ is_archived: archived, updated_at: new Date() })
      .where(eq(products.id, id))
      .returning();

    if (req.user) {
      await logAction(req.user.userId, archived ? "archive" : "restore", "product", id, existing, updated);
    }

    res.json(updated);
  } catch (error) {
    console.error("Error archiving product:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
