import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { displayName, initials, type Profile } from "@/lib/domain";

export function MemberAvatar({
  profile,
  className,
  online,
}: {
  profile: Pick<Profile, "full_name" | "email" | "avatar_url"> | null | undefined;
  className?: string;
  online?: boolean;
}) {
  const name = displayName(profile);
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar className={cn("size-8 rounded-md border border-border", className)}>
        {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt={name} /> : null}
        <AvatarFallback className="rounded-md bg-elevated font-mono text-[11px] font-medium text-muted-foreground">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      {online === undefined ? null : (
        <span
          aria-label={online ? "Online" : "Offline"}
          className={cn(
            "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-sidebar",
            online ? "bg-success" : "bg-muted-foreground/50",
          )}
        />
      )}
    </span>
  );
}
