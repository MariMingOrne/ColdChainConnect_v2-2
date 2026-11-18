import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useAuth } from "@/hooks/useAuth";
import { Booking, InventoryBatch, Pallet } from "@shared/api";
import { CreatePalletForm } from "./CreatePalletForm";

export function CreatePalletPage() {
  const { orderId } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [order, setOrder] = useState<Booking | null>(null);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();

    async function loadPreparation() {
      setIsLoading(true);
      setError(null);
      try {
        const responses = await Promise.all([
          fetch("/api/bookings", { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }),
          fetch("/api/pallets", { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }),
          fetch(`/api/inventory-batches?order_id=${encodeURIComponent(orderId ?? "")}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }),
        ]);
        const failedIndex = responses.findIndex((response) => !response.ok);
        if (failedIndex !== -1) {
          const resource = ["orders", "pallets", "inventory"][failedIndex];
          throw new Error(`Could not load ${resource} (HTTP ${responses[failedIndex].status}).`);
        }
        const [ordersData, palletsData, batchesData] = await Promise.all([
          responses[0].json() as Promise<Booking[]>,
          responses[1].json() as Promise<Pallet[]>,
          responses[2].json() as Promise<InventoryBatch[]>,
        ]);
        setOrder(ordersData.find((booking) => booking.id === orderId) ?? null);
        setPallets(palletsData.filter((pallet) => pallet.order_id === orderId));
        setBatches(batchesData);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Could not load preparation data.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadPreparation();
    return () => controller.abort();
  }, [orderId, token]);

  const goBack = () => {
    if (state?.fromPreparation) {
      navigate(-1);
    } else {
      navigate("/booking-dispatch/preparation", { replace: true });
    }
  };
  const isPrepared = pallets.length > 0 && pallets.every((pallet) =>
    pallet.status === "prepared" || pallet.status === "approved" || pallet.status === "shipped",
  );
  const hasDraftPallets = pallets.some((pallet) => pallet.status === "draft");

  return (
    <div className="flex-1 flex flex-col gap-6 p-4 md:p-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Create Pallet</h1>
          <p className="page-subtitle">Build pallets for your selected order</p>
        </div>
        <button onClick={goBack} className="btn-ghost">
          <ArrowLeft size={15} />
          Back to Preparation
        </button>
      </div>

      {isLoading ? (
        <LoadingSpinner slow />
      ) : error ? (
        <Card className="p-4 bg-destructive-soft border-destructive/30"><p className="text-destructive">{error}</p></Card>
      ) : !order ? (
        <Card className="p-6"><p className="text-foreground">Order not found. Return to preparation and select an order.</p></Card>
      ) : hasDraftPallets ? (
        <Card className="p-6 space-y-2">
          <h2 className="font-rajdhani text-lg font-bold text-foreground">Pallets Already Created</h2>
          <p className="text-sm text-foreground">This order already has draft pallets. Return to preparation to review or undo them.</p>
        </Card>
      ) : token && (
        <CreatePalletForm order={order} batches={batches} token={token} isPrepared={isPrepared} onCreated={goBack} />
      )}
    </div>
  );
}
