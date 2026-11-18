import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

export interface RecordDetailField {
  label: string;
  value: ReactNode;
}

export interface RecordDetails {
  title: string;
  subtitle?: string;
  fields: RecordDetailField[];
}

interface RecordDetailsDialogProps {
  details: RecordDetails | null;
  onClose: () => void;
}

export function RecordDetailsDialog({ details, onClose }: RecordDetailsDialogProps) {
  if (!details) return null;

  return (
    <div className="flex-1 flex flex-col gap-6 p-4 md:p-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{details.title}</h1>
          {details.subtitle && <p className="page-subtitle">{details.subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} className="btn-ghost">
          <ArrowLeft size={15} />
          Back
        </button>
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {details.fields.map((field) => (
          <div key={field.label} className="rounded-lg border border-border bg-muted/50 px-3 py-2">
            <dt className="text-xs font-semibold text-muted-foreground">{field.label}</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-foreground">{field.value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
