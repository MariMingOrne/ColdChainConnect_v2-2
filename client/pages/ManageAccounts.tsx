import { PageDialog } from "@/components/shared/PageDialog";
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

  const openCreateAccount = () => setShowCreateAccount(true);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="h-full min-h-0">
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
      {showCreateAccount && (
        <PageDialog onClose={() => setShowCreateAccount(false)} label="Create account">
          <CreateAccountDialog onClose={() => setShowCreateAccount(false)} />
        </PageDialog>
      )}
    </div>
  );
}
