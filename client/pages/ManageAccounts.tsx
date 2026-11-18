import NotFound from "./NotFound";
import { useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { CreateAccountDialog } from "@/components/CreateAccountDialog";
import { Agents } from "./modules/Agents";
import { Drivers } from "./modules/Drivers";
import { ManagedUsers } from "./modules/ManagedUsers";

export function ManageAccounts() {
  const location = useLocation();
  const [showCreateAccount, setShowCreateAccount] = useState(false);

  if (showCreateAccount) return <CreateAccountDialog onClose={() => setShowCreateAccount(false)} />;

  const openCreateAccount = () => setShowCreateAccount(true);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div key={location.pathname} className="h-full min-h-0 animate-fade-in-up">
          <Routes>
            <Route path="/agents" element={<Agents onCreateAccount={openCreateAccount} />} />
            <Route path="/drivers" element={<Drivers onCreateAccount={openCreateAccount} />} />
            <Route path="/admin" element={<ManagedUsers role="admin" onCreateAccount={openCreateAccount} />} />
            <Route path="/staff" element={<ManagedUsers role="staff" onCreateAccount={openCreateAccount} />} />
            <Route path="/" element={<Agents onCreateAccount={openCreateAccount} />} />
            <Route path="*" element={<NotFound embedded />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
