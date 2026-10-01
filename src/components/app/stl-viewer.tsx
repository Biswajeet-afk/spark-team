import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { Box, Grid3x3 } from "lucide-react";
import { Button } from "@/components/ui/button";

function useStl(url: string) {
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        if (!alive) return;
        const g = new STLLoader().parse(buf);
        g.computeVertexNormals();
        g.center();
        g.computeBoundingBox();
        setGeo(g);
      })
      .catch(() => alive && setError("Could not load this 3D file."));
    return () => {
      alive = false;
    };
  }, [url]);
  return { geo, error };
}

export default function StlViewer({ url, name }: { url: string; name: string }) {
  const { geo, error } = useStl(url);
  const [wire, setWire] = useState(false);
  const dims = useMemo(() => {
    const b = geo?.boundingBox;
    if (!b) return null;
    const s = new THREE.Vector3();
    b.getSize(s);
    return s;
  }, [geo]);

  return (
    <div className="w-full min-w-[min(100%,26rem)] overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
        <Box className="size-3.5 text-primary" />
        <span className="truncate font-medium">{name}</span>
        <Button size="sm" variant={wire ? "secondary" : "ghost"} className="ml-auto h-6 gap-1 px-2 text-xs" onClick={() => setWire((w) => !w)}>
          <Grid3x3 className="size-3" /> Wireframe
        </Button>
      </div>
      <div className="relative h-64 bg-background">
        {error ? (
          <p className="p-4 text-xs text-destructive">{error}</p>
        ) : geo ? (
          <Canvas camera={{ position: [0, 0, 100], fov: 45 }} dpr={[1, 2]}>
            <color attach="background" args={["#141418"]} />
            <ambientLight intensity={0.4} />
            <directionalLight position={[50, 80, 60]} intensity={1.4} />
            <Suspense fallback={null}>
              <Environment>
                <Lightformer intensity={2} position={[0, 5, 0]} scale={[10, 10, 1]} />
                <Lightformer intensity={1} color="#8bb" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
              </Environment>
            </Suspense>
            <Bounds fit clip observe margin={1.3}>
              <mesh geometry={geo} rotation-x={-Math.PI / 2}>
                <meshStandardMaterial color="#9aa4ff" metalness={0.25} roughness={0.45} wireframe={wire} />
              </mesh>
            </Bounds>
            <OrbitControls makeDefault enableDamping />
          </Canvas>
        ) : (
          <p className="p-4 text-xs text-muted-foreground">Loading model…</p>
        )}
        {dims ? (
          <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-card/80 px-2 py-1 font-mono text-[10px] text-muted-foreground">
            {dims.x.toFixed(1)} × {dims.y.toFixed(1)} × {dims.z.toFixed(1)} units · drag to rotate, scroll/pinch to zoom
          </div>
        ) : null}
      </div>
    </div>
  );
}
