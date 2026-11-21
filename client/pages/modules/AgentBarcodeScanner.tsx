import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Folder, SwitchCamera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AgentBarcodeScannerProps {
  onClose: () => void;
  onDetected: (code: string) => void;
}

export function AgentBarcodeScanner({ onClose, onDetected }: AgentBarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manualCode, setManualCode] = useState("");
  const [scanError, setScanError] = useState("");
  const [isDecodingImage, setIsDecodingImage] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  useEffect(() => {
    if (isDecodingImage) return;
    const reader = new BrowserMultiFormatReader();
    let active = true;
    let stopScanner: (() => void) | undefined;

    if (videoRef.current) {
      reader.decodeFromConstraints(
        { video: { facingMode: { ideal: facingMode } } },
        videoRef.current,
        (result, _error, controls) => {
          if (!active || isDecodingImage || !result) return;
          active = false;
          controls.stop();
          onDetected(result.getText());
        },
      ).then((controls) => {
        stopScanner = controls.stop;
        if (!active) controls.stop();
      }).catch((error: unknown) => {
        if (active) {
          setScanError(error instanceof Error ? error.message : "Camera could not be started.");
        }
      });
    }

    return () => {
      active = false;
      stopScanner?.();
    };
  }, [facingMode, isDecodingImage, onDetected]);

  const handleImageSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setScanError("Choose an image file to scan.");
      return;
    }

    setScanError("");
    setIsDecodingImage(true);
    const imageUrl = URL.createObjectURL(file);
    const reader = new BrowserMultiFormatReader();
    try {
      let code: string;
      try {
        code = (await reader.decodeFromImageUrl(imageUrl)).getText();
      } catch {
        const bitmap = await createImageBitmap(file);
        try {
          const scale = Math.min(3, 4096 / Math.max(bitmap.width, bitmap.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(bitmap.width * scale);
          canvas.height = Math.round(bitmap.height * scale);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Could not process selected image.");
          context.imageSmoothingEnabled = false;
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          code = reader.decodeFromCanvas(canvas).getText();
        } finally {
          bitmap.close();
        }
      }
      onDetected(code);
    } catch {
      setScanError("Could not read a barcode in that image. Try a clearer or closer image, or enter the code manually.");
    } finally {
      URL.revokeObjectURL(imageUrl);
      setIsDecodingImage(false);
    }
  };

  const submitManualCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = manualCode.trim();
    if (code) onDetected(code);
  };

  return (
    <div className="fixed inset-x-0 bottom-16 top-16 z-30 flex flex-col bg-black text-white">
      <header className="flex items-center justify-between px-5 pb-4 pt-5">
        <p className="font-rajdhani text-xl font-bold">Barcode Scanner</p>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={() => {
              setScanError("");
              setFacingMode((current) => current === "environment" ? "user" : "environment");
            }}
            disabled={isDecodingImage}
            aria-label={`Switch to ${facingMode === "environment" ? "front" : "rear"} camera`} variant="ghost" className="gap-2 bg-white/10 text-white hover:bg-white/20 hover:text-white">
            <SwitchCamera size={18} />
            {facingMode === "environment" ? "Rear" : "Front"}
          </Button>
          <Button type="button" onClick={onClose} aria-label="Close scanner" variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white"><X size={24} aria-hidden="true" /></Button>
        </div>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-4">
        <div className="relative w-full max-w-md overflow-hidden rounded-xl border-2 border-accent-2 bg-black">
          <video ref={videoRef} autoPlay muted playsInline className="aspect-[4/3] w-full object-cover" />
          <div className="pointer-events-none absolute inset-[15%] rounded-xl border-2 border-white/90 shadow-[0_0_0_999px_hsl(var(--foreground)/0.25)]" />
        </div>
        <p className="max-w-md text-center text-sm text-white/80">
          {isDecodingImage ? "Scanning selected image…" : `Point the ${facingMode === "environment" ? "rear" : "front"} camera at a pallet or order barcode.`}
        </p>
        {scanError && <p role="alert" className="max-w-md text-center text-sm text-destructive">{scanError}</p>}
        <form onSubmit={submitManualCode} className="flex w-full max-w-md items-center gap-2">
          <Input
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
            aria-label="Enter barcode manually"
            placeholder="Enter barcode or order code"
            className="min-w-0 flex-1 rounded-lg border border-white/30 bg-card px-3 py-2 text-sm text-foreground placeholder:text-foreground/80 dark:placeholder:text-foreground/70"
          />
          <Input
            type="file"
            accept="image/*"
            aria-label="Choose barcode image"
            disabled={isDecodingImage}
            onChange={handleImageSelect}
            className="peer sr-only"
            id="barcode-image-input"
          />
          <label
            htmlFor="barcode-image-input"
            title="Choose barcode image"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/30 peer-focus-visible:ring-2 peer-focus-visible:ring-accent-2 ${isDecodingImage ? "pointer-events-none opacity-50" : "cursor-pointer hover:bg-card/10"}`}
          >
            <Folder size={18} aria-hidden="true" />
            <span className="sr-only">Choose barcode image</span>
          </label>
          <Button type="submit" variant="accent" disabled={!manualCode.trim()}>
            Search
          </Button>
        </form>
      </div>
    </div>
  );
}
