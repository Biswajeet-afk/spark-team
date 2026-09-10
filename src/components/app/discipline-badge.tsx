import { cn } from "@/lib/utils";
import { disciplineMeta, type Discipline } from "@/lib/domain";

const TONE: Record<Discipline, string> = {
  engineering: "text-disc-engineering border-disc-engineering/35 bg-disc-engineering/10",
  design: "text-disc-design border-disc-design/35 bg-disc-design/10",
  business: "text-disc-business border-disc-business/35 bg-disc-business/10",
  data: "text-disc-data border-disc-data/35 bg-disc-data/10",
  research: "text-disc-research border-disc-research/35 bg-disc-research/10",
  other: "text-disc-other border-disc-other/35 bg-disc-other/10",
};

export function DisciplineBadge({
  discipline,
  className,
  full = false,
}: {
  discipline: Discipline | null | undefined;
  className?: string;
  full?: boolean;
}) {
  const meta = disciplineMeta(discipline);
  return (
    <span
      title={meta.label}
      className={cn(
        "inline-flex shrink-0 items-center rounded border px-1.5 py-px font-mono text-[10px] leading-4 font-medium tracking-wider uppercase",
        TONE[meta.value],
        className,
      )}
    >
      {full ? meta.label : meta.short}
    </span>
  );
}
