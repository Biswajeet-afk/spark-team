import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function parts(msLeft: number) {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function Countdown({ dueAt, className }: { dueAt: string; className?: string }) {
  const target = new Date(dueAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = target - now;
  const overdue = diff <= 0;
  const { days, hours, minutes, seconds } = parts(Math.abs(diff));
  const urgent = !overdue && diff < 24 * 3600 * 1000;

  const cells = [
    { value: days, label: "days" },
    { value: hours, label: "hrs" },
    { value: minutes, label: "min" },
    { value: seconds, label: "sec" },
  ];

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {cells.map((cell) => (
        <div
          key={cell.label}
          className={cn(
            "min-w-11 rounded-md border bg-elevated px-2 py-1 text-center",
            overdue
              ? "border-destructive/40 text-destructive"
              : urgent
                ? "border-warning/40 text-warning"
                : "border-border text-foreground",
          )}
        >
          <div className="font-mono text-sm leading-5 tabular-nums">
            {cell.label === "days" ? cell.value : pad(cell.value)}
          </div>
          <div className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
            {cell.label}
          </div>
        </div>
      ))}
      <span
        className={cn(
          "ml-1 font-mono text-[10px] tracking-widest uppercase",
          overdue ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {overdue ? "overdue" : "remaining"}
      </span>
    </div>
  );
}
