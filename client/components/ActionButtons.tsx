import { Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActionButtonsProps {
  onView?: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  showDelete?: boolean;
  size?: "sm" | "md";
}

export function ActionButtons({
  onView,
  onEdit,
  onDelete,
  showDelete = true,
  size = "sm",
}: ActionButtonsProps) {
  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const buttonSize = size === "sm" ? "h-8 w-8" : "h-10 w-10";

  return (
    <div className="flex items-center justify-center gap-1">
      {onView && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onView}
          aria-label="View details"
          title="View details"
          className={buttonSize}
        >
          <Eye className={iconSize} aria-hidden="true" />
        </Button>
      )}
      {onEdit && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onEdit}
          aria-label="Edit"
          title="Edit"
          className={buttonSize}
        >
          <Pencil className={iconSize} aria-hidden="true" />
        </Button>
      )}
      {showDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label="Delete"
          title="Delete"
          className={`${buttonSize} text-muted-foreground hover:bg-destructive-soft hover:text-destructive focus-visible:text-destructive`}
        >
          <Trash2 className={iconSize} aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
