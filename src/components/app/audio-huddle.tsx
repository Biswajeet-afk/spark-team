import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import {
  Bot,
  Captions,
  Eye,
  Headphones,
  HeadphoneOff,
  Maximize,
  Mic,
  MicOff,
  Minus,
  Monitor,
  MonitorUp,
  PhoneOff,
  PictureInPicture2,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { setMyHuddle } from "@/hooks/use-huddle-index";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Signal =
  | { type: "desc"; from: string; to: string; desc: RTCSessionDescriptionInit }
  | { type: "ice"; from: string; to: string; candidate: RTCIceCandidateInit };

type Peer = { pc: RTCPeerConnection; makingOffer: boolean; polite: boolean; screenSender?: RTCRtpSender | undefined };
type Status = { name: string; avatar: string | null; muted: boolean; deafened: boolean; sharing: boolean; mock?: boolean };
type Media = { audio?: MediaStream | undefined; screen?: MediaStream | undefined };

export type HuddleDetection = { id: string; text: string; keyword: string };

const ICE: RTCConfiguration = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };
const KEYWORDS = ["we decided", "decided", "decision", "assign task", "assign", "pinout", "deadline", "let's go with", "action item", "todo", "to do"];

/** Shared AudioContext analysers → speaking flag per stream. */
function useSpeaking(stream: MediaStream | undefined | null, enabled = true) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!stream || !enabled || stream.getAudioTracks().length === 0) {
      setSpeaking(false);
      return;
    }
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const id = setInterval(() => {
      analyser.getByteFrequencyData(buf);
      let sum = 0;
      for (const v of buf) sum += v;
      setSpeaking(sum / buf.length > 12);
    }, 150);
    return () => {
      clearInterval(id);
      void ctx.close();
    };
  }, [stream, enabled]);
  return speaking;
}

function formatDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [h, m, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

function Participant({
  status,
  stream,
  isMe,
  forceSpeaking,
  deafened,
}: {
  status: Status;
  stream?: MediaStream | undefined;
  isMe?: boolean;
  forceSpeaking?: boolean;
  deafened: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const live = useSpeaking(stream, !status.muted);
  const speaking = (live || !!forceSpeaking) && !status.muted;
  useEffect(() => {
    if (audioRef.current && stream && !isMe) audioRef.current.srcObject = stream;
  }, [stream, isMe]);
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = deafened;
  }, [deafened]);
  return (
    <div className="flex w-14 flex-col items-center gap-1" title={status.name}>
      {!isMe && stream ? <audio ref={audioRef} autoPlay /> : null}
      <div className="relative">
        <div
          className={cn(
            "grid size-10 place-items-center overflow-hidden rounded-full border-2 bg-elevated font-mono text-xs transition-shadow",
            speaking ? "border-success shadow-[0_0_0_4px_color-mix(in_oklch,var(--success)_35%,transparent)] animate-pulse" : "border-border",
          )}
        >
          {status.avatar ? <img src={status.avatar} alt="" className="size-full object-cover" /> : initials(status.name)}
        </div>
        <div className="absolute -right-1 -bottom-1 flex gap-0.5">
          {status.muted ? <MicOff className="size-3.5 rounded-full bg-destructive p-0.5 text-destructive-foreground" /> : null}
          {status.deafened ? <HeadphoneOff className="size-3.5 rounded-full bg-destructive p-0.5 text-destructive-foreground" /> : null}
          {status.sharing ? <Monitor className="size-3.5 rounded-full bg-primary p-0.5 text-primary-foreground" /> : null}
        </div>
      </div>
      <span className="w-full truncate text-center text-[10px] text-muted-foreground">
        {isMe ? "You" : status.name}
        {status.mock ? " (demo)" : ""}
      </span>
    </div>
  );
}

function ScreenViewer({ stream, name, onClose }: { stream: MediaStream; name: string; onClose: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  const onDown = (e: RPointerEvent) => {
    if (zoom <= 1) return;
    drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent) => drag.current && setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });

  async function pip() {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await videoRef.current?.requestPictureInPicture();
    } catch {
      toast.error("Picture-in-picture is not available in this browser.");
    }
  }

  return (
    <div ref={wrapRef} className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-1 border-b border-border px-3 py-1.5 text-xs">
        <Monitor className="size-3.5 text-primary" />
        <span className="font-medium">{name}'s screen</span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button size="icon-sm" variant="ghost" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}><Minus className="size-3.5" /></Button>
          <span className="w-10 text-center font-mono text-[10px]">{Math.round(zoom * 100)}%</span>
          <Button size="icon-sm" variant="ghost" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(5, z + 0.25))}><Plus className="size-3.5" /></Button>
          <Button size="icon-sm" variant="ghost" aria-label="Reset view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><RotateCcw className="size-3.5" /></Button>
          <Button size="icon-sm" variant="ghost" aria-label="Picture in picture" onClick={pip}><PictureInPicture2 className="size-3.5" /></Button>
          <Button size="icon-sm" variant="ghost" aria-label="Fullscreen" onClick={() => void wrapRef.current?.requestFullscreen()}><Maximize className="size-3.5" /></Button>
          <Button size="icon-sm" variant="ghost" aria-label="Stop watching" onClick={onClose}><X className="size-3.5" /></Button>
        </div>
      </div>
      <div
        className={cn("relative h-[min(45vh,420px)] overflow-hidden bg-background", zoom > 1 ? "cursor-grab active:cursor-grabbing" : "")}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => setZoom((z) => Math.min(5, Math.max(1, z - e.deltaY * 0.002)))}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="size-full object-contain"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center" }}
        />
      </div>
    </div>
  );
}

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

export function AudioHuddle({
  channelId,
  channelName,
  me,
  onDetection,
}: {
  channelId: string;
  channelName: string;
  me: { id: string; name: string; avatar: string | null } | null;
  onDetection: (d: HuddleDetection) => void;
}) {
  const [joined, setJoined] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [ptt, setPtt] = useState(false);
  const [talking, setTalking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [participants, setParticipants] = useState<Record<string, Status>>({});
  const [media, setMedia] = useState<Record<string, Media>>({});
  const [watching, setWatching] = useState<string | null>(null);
  const [mocks, setMocks] = useState<Record<string, Status>>({});
  const [mockSpeaking, setMockSpeaking] = useState<Record<string, boolean>>({});
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcript, setTranscript] = useState<{ id: string; text: string; at: number }[]>([]);
  const [interim, setInterim] = useState("");
  const localRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, Peer>());
  const chanRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const wantRec = useRef(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const micOn = !muted && !deafened && (!ptt || talking);
  const myStatus: Status | null = me ? { name: me.name, avatar: me.avatar, muted: !micOn, deafened, sharing } : null;

  useEffect(() => {
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = micOn));
  }, [micOn, joined]);

  // Broadcast my status to the room whenever it changes.
  useEffect(() => {
    if (joined && myStatus && chanRef.current) void chanRef.current.track(myStatus);
  }, [joined, myStatus?.muted, myStatus?.deafened, myStatus?.sharing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!joined) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [joined]);

  // Hotkeys: M mute, D deafen, hold Space push-to-talk.
  useEffect(() => {
    if (!joined) return;
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement || (t instanceof HTMLElement && t.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "KeyM" && !e.repeat) setMuted((m) => !m);
      else if (e.code === "KeyD" && !e.repeat) setDeafened((d) => !d);
      else if (e.code === "Space" && ptt) {
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

  // Demo teammates randomly "talk" so the UI can be tested solo.
  useEffect(() => {
    const ids = Object.keys(mocks);
    if (!ids.length) return;
    const id = setInterval(() => {
      setMockSpeaking(Object.fromEntries(ids.map((m) => [m, Math.random() > 0.6])));
    }, 900);
    return () => clearInterval(id);
  }, [mocks]);

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
    pc.ontrack = ({ track, streams: [s] }) => {
      if (!s) return;
      const kind = track.kind === "video" ? "screen" : "audio";
      setMedia((prev) => ({ ...prev, [id]: { ...prev[id], [kind]: s } }));
      if (kind === "screen")
        track.addEventListener("ended", () => setMedia((prev) => ({ ...prev, [id]: { ...prev[id], screen: undefined } })));
    };
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
    setMedia(({ [id]: _, ...rest }) => rest);
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
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast.warning("No microphone access — joined listen-only. Allow the mic in your browser to talk.");
      setMuted(true);
    }
    localRef.current = stream;
    setLocalStream(stream);
    // Channel-scoped voice room: each text channel has its own huddle.
    const ch = supabase.channel(`huddle-${channelId}`, { config: { presence: { key: me.id }, broadcast: { self: false } } });
    chanRef.current = ch;
    ch.on("broadcast", { event: "signal" }, ({ payload }) => void onSignal(payload as Signal));
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<Status>();
      const list: Record<string, Status> = {};
      for (const [id, metas] of Object.entries(state)) {
        const m = metas[0];
        if (m) list[id] = { name: m.name ?? "Teammate", avatar: m.avatar ?? null, muted: !!m.muted, deafened: !!m.deafened, sharing: !!m.sharing };
      }
      setParticipants(list);
      for (const id of Object.keys(list)) if (id !== me.id && !peers.current.has(id) && me.id < id) getPeer(id);
      for (const id of Array.from(peers.current.keys())) if (!list[id]) dropPeer(id);
    });
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") void ch.track({ name: me.name, avatar: me.avatar, muted: !stream, deafened: false, sharing: false });
    });
    setStartedAt(Date.now());
    setNow(Date.now());
    setJoined(true);
    setMyHuddle(channelId);
  }

  function stopTranscript() {
    wantRec.current = false;
    recRef.current?.stop();
    recRef.current = null;
    setTranscribing(false);
    setInterim("");
  }

  function leave() {
    stopTranscript();
    peers.current.forEach((p) => p.pc.close());
    peers.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    screenRef.current = null;
    setLocalStream(null);
    if (chanRef.current) void supabase.removeChannel(chanRef.current);
    chanRef.current = null;
    setJoined(false);
    setSharing(false);
    setMedia({});
    setParticipants({});
    setMocks({});
    setWatching(null);
    setMyHuddle(null);
  }

  function stopShare() {
    screenRef.current?.getTracks().forEach((t) => t.stop());
    peers.current.forEach((p) => {
      if (p.screenSender) p.pc.removeTrack(p.screenSender);
      p.screenSender = undefined;
    });
    screenRef.current = null;
    setSharing(false);
    setWatching((w) => (w === me?.id ? null : w));
  }

  async function toggleScreen() {
    if (sharing) return stopShare();
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenRef.current = s;
      const track = s.getVideoTracks()[0];
      if (!track) return;
      track.onended = () => stopShare();
      peers.current.forEach((p) => (p.screenSender = p.pc.addTrack(track, s)));
      setSharing(true);
    } catch {
      /* user cancelled */
    }
  }

  function toggleTranscript() {
    if (transcribing) return stopTranscript();
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) {
      toast.error("Live transcript needs Chrome or Edge.");
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        const text = r[0].transcript.trim();
        if (!r.isFinal) {
          partial += text + " ";
          continue;
        }
        if (!text) continue;
        const id = crypto.randomUUID();
        setTranscript((t) => [...t, { id, text, at: Date.now() }]);
        const lower = text.toLowerCase();
        const keyword = KEYWORDS.find((k) => lower.includes(k));
        if (keyword) onDetection({ id, text, keyword });
      }
      setInterim(partial.trim());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") {
        toast.error("Microphone permission is needed for the transcript.");
        stopTranscript();
      }
    };
    // Chrome stops after silence; keep it running while enabled.
    rec.onend = () => {
      if (wantRec.current) {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }
    };
    wantRec.current = true;
    recRef.current = rec;
    rec.start();
    setTranscribing(true);
    setTranscriptOpen(true);
  }

  function addMock() {
    const names = ["Demo · Priya", "Demo · Arjun", "Demo · Mei", "Demo · Leo"];
    const n = Object.keys(mocks).length;
    if (n >= names.length) return;
    const id = `mock-${n}`;
    setMocks((m) => ({ ...m, [id]: { name: names[n]!, avatar: null, muted: n === 2, deafened: false, sharing: false, mock: true } }));
  }

  useEffect(() => () => leave(), [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!joined)
    return (
      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={join} disabled={!me}>
        <Headphones className="size-3.5 text-success" /> Join Audio Huddle
      </Button>
    );

  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const others = Object.entries(participants).filter(([id]) => id !== me?.id);
  const sharers = others.filter(([id, s]) => s.sharing && media[id]?.screen);
  const watchStream = watching === me?.id ? screenRef.current : watching ? media[watching]?.screen : null;
  const watchName = watching === me?.id ? "Your" : watching ? (participants[watching]?.name ?? "Teammate") : "";
  const total = Object.keys(participants).length + Object.keys(mocks).length;

  return (
    <>
      <Button size="sm" variant="secondary" className="h-7 gap-1.5 border border-success/40 text-xs text-success" onClick={() => setTranscriptOpen(true)}>
        <span className="size-2 animate-pulse rounded-full bg-success" /> Connected to Huddle
        <span className="font-mono text-[10px] text-muted-foreground">{formatDuration(elapsed)}</span>
      </Button>

      {watchStream ? (
        <div className="fixed top-16 left-1/2 z-30 w-[min(92vw,900px)] -translate-x-1/2">
          <ScreenViewer stream={watchStream} name={watchName === "Your" ? "You" : watchName} onClose={() => setWatching(null)} />
        </div>
      ) : null}

      <div className="fixed bottom-4 left-1/2 z-40 w-[min(96vw,760px)] -translate-x-1/2 rounded-2xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-2 text-xs">
          <span className="size-2 animate-pulse rounded-full bg-success" />
          <span className="font-medium">#{channelName} voice</span>
          <span className="font-mono text-muted-foreground">{formatDuration(elapsed)} · {total} in call</span>
          {sharers.length ? (
            <div className="ml-auto flex gap-1">
              {sharers.map(([id, s]) => (
                <Button key={id} size="sm" variant={watching === id ? "default" : "outline"} className="h-6 gap-1 text-[11px]" onClick={() => setWatching(watching === id ? null : id)}>
                  <Eye className="size-3" /> Watch {s.name}'s screen
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="scroll-slim mt-2 flex gap-2 overflow-x-auto pb-1">
          {myStatus ? <Participant status={myStatus} stream={localStream ?? undefined} isMe deafened forceSpeaking={false} /> : null}
          {others.map(([id, s]) => <Participant key={id} status={s} stream={media[id]?.audio} deafened={deafened} />)}
          {Object.entries(mocks).map(([id, s]) => <Participant key={id} status={s} forceSpeaking={!!mockSpeaking[id]} deafened={deafened} />)}
          {others.length === 0 && !Object.keys(mocks).length ? (
            <p className="self-center text-xs text-muted-foreground">Waiting for teammates in #{channelName}…</p>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant={muted ? "destructive" : "secondary"} onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute (M)" : "Mute (M)"} title="Mute (M)">
            {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </Button>
          <Button size="sm" variant={deafened ? "destructive" : "secondary"} onClick={() => setDeafened((d) => !d)} aria-label="Deafen (D)" title="Deafen (D)">
            {deafened ? <HeadphoneOff className="size-4" /> : <Headphones className="size-4" />}
          </Button>
          <Button size="sm" variant={ptt ? "default" : "outline"} onClick={() => setPtt((p) => !p)} className="text-xs" title="Hold Space to talk">
            Push-to-talk{ptt ? (talking ? " · live" : " · hold Space") : ""}
          </Button>
          <Button size="sm" variant={sharing ? "default" : "outline"} onClick={toggleScreen} className="gap-1 text-xs">
            <MonitorUp className="size-4" /> {sharing ? "Stop sharing" : "Share Screen"}
          </Button>
          {sharing ? (
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setWatching(watching === me?.id ? null : me!.id)}>Preview</Button>
          ) : null}
          <Button size="sm" variant={transcribing ? "default" : "outline"} onClick={toggleTranscript} className="gap-1 text-xs">
            <Captions className="size-4" /> {transcribing ? "Transcribing…" : "Live AI Transcript"}
          </Button>
          <Button size="sm" variant="ghost" onClick={addMock} className="gap-1 text-xs text-muted-foreground" title="Add a simulated teammate for testing">
            <Bot className="size-4" /> Demo user
          </Button>
          <Button size="sm" variant="destructive" onClick={leave} className="ml-auto gap-1 text-xs">
            <PhoneOff className="size-4" /> Leave
          </Button>
        </div>
        {ptt ? (
          <button
            type="button"
            onPointerDown={() => setTalking(true)}
            onPointerUp={() => setTalking(false)}
            onPointerLeave={() => setTalking(false)}
            className={cn("mt-2 w-full rounded-md border py-1.5 text-xs", talking ? "border-success bg-success/15 text-success" : "border-border text-muted-foreground")}
          >
            {talking ? "Talking…" : "Hold here or hold Space to talk"}
          </button>
        ) : null}
      </div>

      <Sheet open={transcriptOpen} onOpenChange={setTranscriptOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><Captions className="size-4" /> Huddle transcript</SheetTitle>
          </SheetHeader>
          <div className="flex items-center gap-2 px-4">
            <Button size="sm" variant={transcribing ? "destructive" : "default"} onClick={toggleTranscript}>
              {transcribing ? "Stop transcript" : "Start live transcript"}
            </Button>
            <span className="text-[11px] text-muted-foreground">Captures your mic. Decisions, tasks, pinouts and deadlines are flagged in chat.</span>
          </div>
          <div className="scroll-slim mx-4 mb-4 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border border-border bg-background p-3 text-sm">
            {transcript.length === 0 && !interim ? <p className="text-muted-foreground">Nothing transcribed yet.</p> : null}
            {transcript.map((t) => {
              const flagged = KEYWORDS.some((k) => t.text.toLowerCase().includes(k));
              return (
                <p key={t.id} className={flagged ? "border-l-2 border-warning pl-2" : ""}>
                  <span className="mr-2 font-mono text-[10px] text-muted-foreground">{new Date(t.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  {t.text}
                </p>
              );
            })}
            {interim ? <p className="text-muted-foreground italic">{interim}…</p> : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
