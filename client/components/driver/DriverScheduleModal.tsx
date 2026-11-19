import { Button } from "@/components/ui/button";
import { Driver } from "@shared/api";
import { DriverScheduleView } from "./DriverScheduleView";

export function DriverScheduleModal({ driver, onClose }: { driver: Driver; onClose: () => void }) {
  return (
    <div className="flex-1 p-6 space-y-6 mx-auto w-full max-w-2xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">Delivery Schedule · {driver.full_name || "Driver"}</h1>
        </div>
      </div>
      <DriverScheduleView driverId={driver.id} />
    </div>
  );
}
