import { Navigate, Route, Routes } from "react-router-dom";
import NotFound from "./NotFound";
import { Expenses } from "./modules/Expenses";
import { PaymentVerification } from "./modules/PaymentVerification";

/** Accounting hub: verify field-recorded payments and run the expense workflow. */
export function Accounting() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="h-full min-h-0 overflow-y-auto">
          <Routes>
            <Route path="/payments" element={<PaymentVerification />} />
            <Route path="/cash" element={<Navigate to="/accounting/payments" replace />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/" element={<Navigate to="/accounting/payments" replace />} />
            <Route path="*" element={<NotFound embedded />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
