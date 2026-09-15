import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { myProfileQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { playMessageChime, useSoundEnabled } from "@/lib/notification-prefs";
import { DISCIPLINES, type Discipline } from "@/lib/domain";
import { MemberAvatar } from "@/components/app/member-avatar";
import { DisciplineBadge } from "@/components/app/discipline-badge";

export const Route = createFileRoute("/_authenticated/app/settings")({
  component: ProfileSettings,
});

function ProfileSettings() {
  const { data: profile } = useQuery(myProfileQuery);
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [discipline, setDiscipline] = useState<Discipline>("other");
  const [sound, setSound] = useSoundEnabled();

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setUsername(profile.username ?? "");
    setBio(profile.bio ?? "");
    setAvatarUrl(profile.avatar_url ?? "");
    setDiscipline(profile.discipline);
  }, [profile]);

  const uploadPhoto = useMutation({
    mutationFn: async (file: File) => {
      if (!profile) throw new Error("Profile not loaded");
      if (!file.type.startsWith("image/")) throw new Error("Pick an image file.");
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${profile.id}/${crypto.randomUUID()}.${ext}`;
      const upload = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upload.error) throw new Error(upload.error.message);
      const { data, error } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (error || !data) throw new Error(error?.message ?? "Could not read the uploaded photo.");
      const update = await supabase
        .from("profiles")
        .update({ avatar_url: data.signedUrl })
        .eq("id", profile.id);
      if (update.error) throw new Error(update.error.message);
      return data.signedUrl;
    },
    onSuccess: async (url) => {
      setAvatarUrl(url);
      await queryClient.invalidateQueries();
      toast.success("Profile photo updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Profile not loaded");
      const cleanUsername = username.trim().replace(/\s+/g, "_");
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          username: cleanUsername || null,
          bio: bio.trim() || null,
          avatar_url: avatarUrl.trim() || null,
          discipline,
        })
        .eq("id", profile.id);
      if (error) {
        throw new Error(
          error.code === "23505" ? "That username is already taken." : error.message,
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      toast.success("Profile updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="scroll-slim flex-1 overflow-y-auto">
      <div className="mx-auto max-w-xl px-8 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your discipline badge appears next to every message and task you own.
        </p>

        <div className="mt-8 flex items-center gap-4 rounded-xl border border-border bg-card p-4">
          <MemberAvatar
            profile={{
              full_name: fullName,
              username,
              email: profile?.email ?? null,
              avatar_url: avatarUrl,
            }}
            className="size-12"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">
                {username.trim() || fullName || "Unnamed"}
              </span>
              <DisciplineBadge discipline={discipline} />
            </div>
            <span className="block truncate text-xs text-muted-foreground">{profile?.email}</span>
          </div>
          <div>
            <input
              id="photo"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) uploadPhoto.mutate(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadPhoto.isPending}
              onClick={() => document.getElementById("photo")?.click()}
            >
              {uploadPhoto.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Upload photo
            </Button>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="username">Username (shown to teammates)</Label>
            <Input
              id="username"
              placeholder="codewizard"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This is the name other members see next to your messages and tasks.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name (private)</Label>
            <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Only project owners can see your real name on the Team page.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="discipline">Discipline</Label>
            <Select value={discipline} onValueChange={(v) => setDiscipline(v as Discipline)}>
              <SelectTrigger id="discipline">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISCIPLINES.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="avatar">Avatar image URL</Label>
            <Input
              id="avatar"
              placeholder="https://…"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              rows={3}
              placeholder="What do you work on?"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save changes
          </Button>
        </div>

        <div className="mt-10 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Notifications</h2>
          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="sound" className="text-sm">
                Message sound
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Play a short chime when a new message arrives while you are away.
              </p>
            </div>
            <Switch
              id="sound"
              checked={sound}
              onCheckedChange={(next) => {
                setSound(next);
                if (next) playMessageChime();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
