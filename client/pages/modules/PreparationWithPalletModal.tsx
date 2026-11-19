import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreatePalletPage } from "./CreatePalletPage";
import { Preparation } from "./Preparation";

/** Preparation list with "Create pallet" opening as a modal over it, so the list never unmounts. */
function CreatePalletModal() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const close = () => {
    if (state?.fromPreparation) navigate(-1);
    else navigate("/booking-dispatch/preparation", { replace: true });
  };
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90dvh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create pallet</DialogTitle>
          <DialogDescription>Build pallets for the selected order</DialogDescription>
        </DialogHeader>
        <CreatePalletPage embedded />
      </DialogContent>
    </Dialog>
  );
}

export function PreparationWithPalletModal() {
  return (
    <>
      <Preparation />
      <Routes>
        <Route path=":orderId" element={<CreatePalletModal />} />
      </Routes>
    </>
  );
}
