import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { responseError } from "@/lib/format";
import { OriginalReceiptModal, type ReceiptExt } from "./DeliveryHistory";

export function PaymentReceipt() {
  const { id } = useParams();
  const token = useAuth((state) => state.token);
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState<ReceiptExt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    const controller = new AbortController();
    setReceipt(null);
    setError(null);
    fetch(`/api/payments/${encodeURIComponent(id)}/receipt`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response, "Could not load receipt"));
        return response.json() as Promise<ReceiptExt>;
      })
      .then(setReceipt)
      .catch((err) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load receipt");
      });
    return () => controller.abort();
  }, [id, token]);

  if (error) return <div className="space-y-4 p-6"><p role="alert" className="text-sm text-destructive">{error}</p><Button asChild variant="outline"><Link to="/accounting/payments">Back to payments</Link></Button></div>;
  if (!receipt) return <LoadingSpinner />;

  return <OriginalReceiptModal receipt={receipt} onClose={() => navigate("/accounting/payments")} />;
}
