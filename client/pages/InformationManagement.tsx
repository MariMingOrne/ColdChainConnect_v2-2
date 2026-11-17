import { Routes, Route, useLocation } from "react-router-dom";
import { Pricing } from "./modules/Pricing";
import { Inventory } from "./Inventory";
import { Customers } from "./modules/Customers";
import { InventoryProvider } from "../context/InventoryContext";

const modules = [
  { label: "Products", path: "/products" },
  { label: "Inventory", path: "/inventory" },
  { label: "Customers", path: "/customers" },
];

export function InformationManagement() {
  const location = useLocation();
  return (
    <InventoryProvider>
      <div className="min-w-0 flex-1 overflow-auto">
        <div key={location.pathname} className="h-full animate-fade-in-up">
            <Routes>
              <Route path="/products" element={<Pricing />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/" element={<ProductsDefault />} />
            </Routes>
        </div>
      </div>
    </InventoryProvider>
  );
}

function ProductsDefault() {
  return <Pricing />;
}
