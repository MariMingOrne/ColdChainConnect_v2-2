import { useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { CreateAccountDialog } from "@/components/CreateAccountDialog";
import { Agents } from "./modules/Agents";
import { Drivers } from "./modules/Drivers";

export function ManageAccounts() {
  const location = useLocation();
  const [showCreateAccount, setShowCreateAccount] = useState(false);

  if (showCreateAccount) return <CreateAccountDialog onClose={() => setShowCreateAccount(false)} />;

  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex flex-1 flex-col overflow-auto">
        <div key={location.pathname} className="h-full animate-fade-in-up">
          <Routes>
            <Route path="/agents" element={<Agents />} />
            <Route path="/drivers" element={<Drivers />} />
            <Route path="/" element={<Agents />} />
          </Routes>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowCreateAccount(true)}
        className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-medium text-white shadow-lg md:bottom-4"
      >
        <UserPlus className="h-4 w-4" />
        <span>Create Accounts</span>
      </button>

    </div>
  );
}
