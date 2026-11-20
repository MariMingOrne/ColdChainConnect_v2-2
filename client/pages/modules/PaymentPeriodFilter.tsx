import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { formatBusinessDay, isSpecificDay, paymentPeriodOptions } from "@/lib/paymentPeriod";

interface PaymentPeriodFilterProps {
  period: string;
  today: string;
  onChange: (period: string) => void;
}

export function PaymentPeriodFilter({ period, today, onChange }: PaymentPeriodFilterProps) {
  const specificDay = isSpecificDay(period);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect aria-label="Date range" value={period} onChange={(event) => onChange(event.target.value)}>
        {paymentPeriodOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
        {specificDay && <option value={period}>{formatBusinessDay(period)}</option>}
      </NativeSelect>
      <Input
        type="date"
        aria-label="Filter by date"
        value={specificDay ? period : ""}
        max={today}
        onChange={(event) => onChange(event.target.value || "all")}
        className="w-auto"
      />
    </div>
  );
}
