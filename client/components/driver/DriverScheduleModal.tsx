import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Driver } from "@shared/api";
import { DriverScheduleView } from "./DriverScheduleView";

export function DriverScheduleModal({ driver, onClose }: { driver: Driver; onClose: () => void }) {
  return (
    <div className="flex-1 px-4 md:px-6 lg:px-7 py-4 md:py-6 space-y-6 max-w-2xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">Delivery Schedule · {driver.full_name || "Driver"}</h1>
        </div>
        <Button onClick={onClose} variant="outline">
          <ArrowLeft size={15} />
          Back
        </Button>
      </div>
      <DriverScheduleView driverId={driver.id} />
    </div>
  );
}
