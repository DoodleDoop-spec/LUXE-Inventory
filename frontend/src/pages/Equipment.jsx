import { Wrench } from "lucide-react";

export default function Equipment() {
  return (
    <div className="space-y-8" data-testid="equipment-page">
      <div className="space-y-2">
        <div className="eyebrow">EQUIPMENT</div>
        <h1 className="font-display text-4xl sm:text-5xl tracking-tight font-bold text-[#09090B]">
          Equipment Inventory
        </h1>
        <p className="text-sm text-[#71717A]">
          Track your hardware, tools, and equipment separately from costumes.
        </p>
      </div>

      <div className="border border-[#E4E4E7] bg-[#FAFAFA] p-12 text-center flex flex-col items-center gap-4" data-testid="equipment-empty">
        <div className="w-16 h-16 rounded-full bg-white border border-[#E4E4E7] flex items-center justify-center">
          <Wrench className="h-7 w-7 text-[#71717A]" strokeWidth={1.5} />
        </div>
        <div>
          <div className="eyebrow mb-2">COMING SOON</div>
          <h2 className="font-display text-xl font-semibold text-[#09090B] mb-2">
            Equipment tracking is in the works
          </h2>
          <p className="text-sm text-[#71717A] max-w-md">
            You&apos;ll be able to log lights, cables, mics, props and other backstage equipment here.
            The structure will mirror inventory — locations, quantities, flags, and shows they&apos;re assigned to.
          </p>
        </div>
      </div>
    </div>
  );
}
