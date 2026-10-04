import { useEffect, useRef, useState } from "react";
import { Headphones, Mic, MicOff, MonitorUp, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Signal =
  | { type: "desc"; from: string; to: string; desc: RTCSessionDescriptionInit }
  | { type: "ice"; from: string; to: string; candidate: RTCIceCandidateInit };

type Peer = { pc: RTCPeerConnection; makingOffer: boolean; polite: boolean; screenSender?: RTCRtpSender };

const ICE: RTCConfiguration = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };

function RemoteMedia({ stream, name }: { stream: MediaStream; name: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(stream.getVideoTracks().length > 0);
  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = stream;
    if (videoRef.current) videoRef.current.srcObject = stream;
    const update = () => setHasVideo(stream.getVideoTracks().some((t) => t.readyState === "live"));
    stream.addEventListener("addtrack", update);
    stream.addEventListener("removetrack", update);
    update();
    return () => {
      stream.removeEventListener("addtrack", update);
      stream.removeEventListener("removetrack", update);
    };
  }, [stream]);
  return (
    <div className="flex flex-col gap-1">
      <audio ref={audioRef} autoPlay />
      {hasVideo ? <video ref={videoRef} autoPlay playsInline muted className="max-h-40 rounded-md border border-border bg-background" /> : null}
      <span className="text-[11px] text-muted-foreground">{name}</span>
    </div>
  );
}

export function AudioHuddle({ channelId, me }: { channelId: string; me: { id: string; name: string } | null }) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ptt, setPtt] = useState(false);
  const [talking, setTalking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [participants, setParticipants] = useState<Record<string, string>>({});
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const localRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, Peer>());
  const chanRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Mic enabled state: muted wins; push-to-talk requires holding.
  useEffect(() => {
    const enabled = !muted && (!ptt || talking);
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = enabled));
  }, [muted, ptt, talking, joined]);

  useEffect(() => {
    if (!joined || !ptt) return;
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setTalking(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setTalking(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [joined, ptt]);

  function send(msg: Signal) {
    void chanRef.current?.send({ type: "broadcast", event: "signal", payload: msg });
  }

  function getPeer(id: string) {
    let peer = peers.current.get(id);
    if (peer) return peer;
    const pc = new RTCPeerConnection(ICE);
    peer = { pc, makingOffer: false, polite: me!.id < id };
    peers.current.set(id, peer);
    localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current!));
    if (screenRef.current) {
      const track = screenRef.current.getVideoTracks()[0];
      if (track) peer.screenSender = pc.addTrack(track, screenRef.current);
    }
    pc.onicecandidate = ({ candidate }) => candidate && send({ type: "ice", from: me!.id, to: id, candidate: candidate.toJSON() });
    pc.ontrack = ({ streams: [s] }) => s && setStreams((prev) => ({ ...prev, [id]: s }));
    const p = peer;
    pc.onnegotiationneeded = async () => {
      try {
        p.makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription) send({ type: "desc", from: me!.id, to: id, desc: pc.localDescription.toJSON() });
      } finally {
        p.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(pc.connectionState)) dropPeer(id);
    };
    return peer;
  }

  function dropPeer(id: string) {
    peers.current.get(id)?.pc.close();
    peers.current.delete(id);
    setStreams(({ [id]: _, ...rest }) => rest);
  }

  async function onSignal(msg: Signal) {
    if (!me || msg.to !== me.id) return;
    const peer = getPeer(msg.from);
    const { pc } = peer;
    if (msg.type === "desc") {
      const collision = msg.desc.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
      if (collision && !peer.polite) return;
      await pc.setRemoteDescription(msg.desc);
      if (msg.desc.type === "offer") {
        await pc.setLocalDescription();
        if (pc.localDescription) send({ type: "desc", from: me.id, to: msg.from, desc: pc.localDescription.toJSON() });
      }
    } else {
      try {
        await pc.addIceCandidate(msg.candidate);
      } catch {
        /* ignore candidates for rejected offers */
      }
    }
  }

  async function join() {
    if (!me) return;
    try {
      localRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast.error("Microphone access was blocked. Allow it in your browser to join.");
      return;
    }
    const ch = supabase.channel(`huddle-${channelId}`, { config: { presence: { key: me.id }, broadcast: { self: false } } });
    chanRef.current = ch;
    ch.on("broadcast", { event: "signal" }, ({ payload }) => void onSignal(payload as Signal));
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<{ name: string }>();
      const list: Record<string, string> = {};
      for (const [id, metas] of Object.entries(state)) list[id] = metas[0]?.name ?? "Teammate";
      setParticipants(list);
      // Lower id initiates to avoid duplicate connections; negotiation is perfect-negotiation safe anyway.
      for (const id of Object.keys(list)) if (id !== me.id && !peers.current.has(id) && me.id < id) getPeer(id);
      for (const id of Array.from(peers.current.keys())) if (!list[id]) dropPeer(id);
    });
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") void ch.track({ name: me.name });
    });
    setJoined(true);
  }

  function leave() {
    peers.current.forEach((p) => p.pc.close());
    peers.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    screenRef.current = null;
    if (chanRef.current) void supabase.removeChannel(chanRef.current);
    chanRef.current = null;
    setJoined(false);
    setSharing(false);
    setStreams({});
    setParticipants({});
  }

  async function toggleScreen() {
    if (sharing) {
      screenRef.current?.getTracks().forEach((t) => t.stop());
      peers.current.forEach((p) => {
        if (p.screenSender) p.pc.removeTrack(p.screenSender);
        p.screenSender = undefined;
      });
      screenRef.current = null;
      setSharing(false);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenRef.current = s;
      const track = s.getVideoTracks()[0];
      if (!track) return;
      track.onended = () => void (sharing || toggleScreenOff());
      peers.current.forEach((p) => (p.screenSender = p.pc.addTrack(track, s)));
      setSharing(true);
    } catch {
      /* user cancelled */
    }
  }

  function toggleScreenOff() {
    peers.current.forEach((p) => {
      if (p.screenSender) p.pc.removeTrack(p.screenSender);
      p.screenSender = undefined;
    });
    screenRef.current = null;
    setSharing(false);
  }

  useEffect(() => () => leave(), [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!joined)
    return (
      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={join} disabled={!me}>
        <Headphones className="size-3.5 text-success" /> Join Audio Huddle
      </Button>
    );

  const others = Object.entries(participants).filter(([id]) => id !== me?.id);
  return (
    <div className="fixed right-4 bottom-24 z-40 w-72 rounded-xl border border-border bg-card p-3 shadow-lg">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="size-2 animate-pulse rounded-full bg-success" /> Huddle · {Object.keys(participants).length} in call
      </div>
      <div className="mt-2 space-y-2">
        {others.length === 0 ? <p className="text-xs text-muted-foreground">Waiting for teammates to join…</p> : null}
        {others.map(([id, name]) => (streams[id] ? <RemoteMedia key={id} stream={streams[id]} name={name} /> : <p key={id} className="text-xs text-muted-foreground">{name} · connecting…</p>))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" variant={muted ? "destructive" : "secondary"} onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"}>
          {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
        </Button>
        <Button size="sm" variant={ptt ? "default" : "outline"} onClick={() => setPtt((p) => !p)} className="text-xs">Push-to-talk</Button>
        <Button size="sm" variant={sharing ? "default" : "outline"} onClick={toggleScreen} aria-label="Share screen"><MonitorUp className="size-4" /></Button>
        <Button size="sm" variant="destructive" onClick={leave} aria-label="Leave huddle"><PhoneOff className="size-4" /></Button>
      </div>
      {ptt ? (
        <button
          type="button"
          onPointerDown={() => setTalking(true)}
          onPointerUp={() => setTalking(false)}
          onPointerLeave={() => setTalking(false)}
          className={`mt-2 w-full rounded-md border py-2 text-xs ${talking ? "border-success bg-success/15 text-success" : "border-border text-muted-foreground"}`}
        >
          {talking ? "Talking…" : "Hold here or hold Space to talk"}
        </button>
      ) : null}
    </div>
  );
}
