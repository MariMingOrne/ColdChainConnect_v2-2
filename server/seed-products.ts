import type { products } from "./db/schema";

type SeedProduct = Pick<typeof products.$inferInsert, "name" | "sku" | "price" | "srp" | "unit" | "manufacturer" | "weight" | "reorder_point" | "image_filename">;

export const seedProducts: SeedProduct[] = [
  { name: "Bossing Hotdogs Kingsize 1.14Kg (14+2 pcs)", sku: "FG00000277", price: "200.00", srp: null, unit: "EA", manufacturer: "Frabelle Food Corp", weight: "1.14", reorder_point: 300, image_filename: "c8f5ef57-08f7-4731-ac69-882fd418774c.png" },
  { name: "Bossing Tocinitos 200g", sku: "FG00000280", price: "85.00", srp: null, unit: "EA", manufacturer: "Frabelle Food Corp", weight: "0.20", reorder_point: 300, image_filename: "a19ab7fe-b84f-416c-8a78-e405f1f6311e.png" },
  { name: "Bossing Chicken Franks Kingsize 1.15kg (15pcs)", sku: "FG00000285", price: "210.00", srp: null, unit: "EA", manufacturer: "Frabelle Food Corp", weight: "1.15", reorder_point: 300, image_filename: "6aee59b7-2258-451d-940a-83c870f06956.png" },
  { name: "Bossing Skinless Longganiza - 250g", sku: "FMP1-00086", price: "90.00", srp: null, unit: "EA", manufacturer: "Frabelle Food Corp", weight: "0.25", reorder_point: 300, image_filename: "1bf48c82-4694-476a-b637-2888a0f1bcb2.png" },
  { name: "Bossing Hungarian Sausage with Cheese 500g", sku: "J&FBO-BHSWC.5", price: "180.00", srp: null, unit: "EA", manufacturer: "Frabelle Food Corp", weight: "0.50", reorder_point: 300, image_filename: "ea8e6576-f84b-4a0a-9a59-3b9b01656fb4.png" },
  { name: "Spicy Pork Samgyupsal 250g", sku: "FG00000015", price: "135.00", srp: null, unit: "EA", manufacturer: "Frabelle Food Corp", weight: "0.25", reorder_point: 300, image_filename: "74bd99a5-695f-4c28-b222-01f6d99b6fbb.png" },
  { name: "Beef Bulgogi Samgyupsal 250g", sku: "FG00000016", price: "135.00", srp: null, unit: "EA", manufacturer: "Frabelle Food Corp", weight: "0.25", reorder_point: 300, image_filename: "5b79b234-5249-448a-aae2-849d1a574367.png" },
  { name: "Frabelle Foods Chicken Nuggets 1kg Pack 1kg", sku: "FG00000040", price: "340.00", srp: "0.00", unit: "EA", manufacturer: "Frabelle Food Corp", weight: "1.00", reorder_point: 300, image_filename: "ce2b526a-2bf9-476e-ae89-6cb4952980bf.png" },
  { name: "Frabelle Foods Chicken Nuggets 200g with Bbq Sauce", sku: "FG00000042", price: "90.00", srp: null, unit: "EA", manufacturer: "Frabelle Food Corp", weight: "0.20", reorder_point: 300, image_filename: "966c1e96-79ea-41fe-8b4b-535bd4447334.png" },
  { name: "Frabelle Foods Chicken Nuggets 5 x 1kg", sku: "FG00000297", price: "1625.00", srp: null, unit: "PK", manufacturer: "Frabelle Food Corp", weight: "5.00", reorder_point: 299, image_filename: "a2281962-c6d4-47df-9ce9-decfcd5bff4c.png" },
  { name: "FF Big Rooster Chicken Balls 250g", sku: "FG00000320", price: "75.00", srp: null, unit: "EA", manufacturer: "Frabelle Food Corp", weight: "0.25", reorder_point: 300, image_filename: "72b55a46-0b7a-495d-95c3-2f2abdab9434.png" },
  { name: "Frozen Imitation Crabstick 200g", sku: "FG00000327", price: "65.00", srp: null, unit: "EA", manufacturer: "Frabelle Food Corp", weight: "0.20", reorder_point: 297, image_filename: "c06c8a98-e2b4-4c8b-97e6-81584095744c.png" },
  { name: "Frabelle Foods Sweet & Spicy Dilis 60g", sku: "FG00000328", price: "77.00", srp: null, unit: "EA", manufacturer: "Frabelle Food Corp", weight: "0.60", reorder_point: 300, image_filename: "ab20b12b-8b98-40e4-95c9-369c85db66af.png" },
];
