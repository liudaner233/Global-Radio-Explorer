import React, { useEffect, useMemo, useRef, useState } from 'react';
import GlobeGL from 'react-globe.gl';
import * as THREE from 'three';
import { RadioStation } from '../types/radio';

interface GlobeProps {
  stations: RadioStation[];
  onSelectStation: (station: RadioStation) => void;
  selectedStation?: RadioStation | null;
}

interface StationPoint extends RadioStation {
  __idx: number;
}

interface StationMeta {
  station_id: string;
  name: string;
  country: string;
  codec: string;
  bitrate: number;
  streamUrl: string;
}

const HOVER_DEBOUNCE_MS = 50;

const createGlowTexture = () => {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 3, size / 2, size / 2, size / 2 - 8);
  gradient.addColorStop(0, 'rgba(0,255,65,0.95)');
  gradient.addColorStop(0.4, 'rgba(0,255,65,0.45)');
  gradient.addColorStop(0.85, 'rgba(0,255,65,0.10)');
  gradient.addColorStop(1, 'rgba(0,255,65,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
};

const Globe: React.FC<GlobeProps> = ({ stations, onSelectStation, selectedStation }) => {
  const globeEl = useRef<any>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const metadataCacheRef = useRef(new Map<string, StationMeta>());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const noiseSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const lastPovRef = useRef({ lng: 0, ts: performance.now() });

  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [hoveredMeta, setHoveredMeta] = useState<StationMeta | null>(null);

  const glowTexture = useMemo(() => createGlowTexture(), []);

  const packedStations = useMemo(() => {
    const rows = stations.filter((s) => Number.isFinite(s.geo_lat) && Number.isFinite(s.geo_long));
    const coords = new Float32Array(rows.length * 2);

    rows.forEach((station, i) => {
      coords[i * 2] = station.geo_lat as number;
      coords[i * 2 + 1] = station.geo_long as number;
    });

    const points: StationPoint[] = rows.map((station, index) => ({ ...station, __idx: index }));

    return { points, coords };
  }, [stations]);

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!audioCtxRef.current) {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.value = 0.001;
      gain.connect(ctx.destination);

      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const channel = noiseBuffer.getChannelData(0);
      for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;
      source.playbackRate.value = 0.9;
      source.connect(gain);
      source.start();

      audioCtxRef.current = ctx;
      gainRef.current = gain;
      noiseSourceRef.current = source;
    }

    return () => {
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
      noiseSourceRef.current?.stop();
      noiseSourceRef.current?.disconnect();
      gainRef.current?.disconnect();
      void audioCtxRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!globeEl.current) return;

    globeEl.current.pointOfView({ lat: 20, lng: 0, altitude: 2.2 });

    const controls = globeEl.current.controls?.();
    if (!controls) return;

    const onChange = () => {
      const pov = globeEl.current.pointOfView();
      const now = performance.now();
      const dt = Math.max(1, now - lastPovRef.current.ts);
      const omega = Math.abs((pov.lng || 0) - lastPovRef.current.lng) / dt;

      lastPovRef.current = { lng: pov.lng || 0, ts: now };

      const normalized = Math.min(1, omega * 20);
      const currentTime = audioCtxRef.current?.currentTime || 0;

      if (noiseSourceRef.current) {
        noiseSourceRef.current.playbackRate.setTargetAtTime(0.8 + normalized * 0.7, currentTime, 0.08);
      }

      if (gainRef.current) {
        const targetGain = hoveredMeta ? 0.001 : 0.01 + normalized * 0.15;
        gainRef.current.gain.setTargetAtTime(targetGain, currentTime, 0.08);
      }
    };

    controls.addEventListener('change', onChange);
    return () => controls.removeEventListener('change', onChange);
  }, [hoveredMeta]);

  useEffect(() => {
    if (selectedStation?.geo_lat !== null && selectedStation?.geo_long !== null && globeEl.current) {
      globeEl.current.pointOfView(
        { lat: selectedStation.geo_lat, lng: selectedStation.geo_long, altitude: 1.4 },
        1000
      );
    }
  }, [selectedStation]);

  const getMeta = (station: RadioStation): StationMeta => {
    const stationId = station.stationuuid || `${station.name}-${station.url}`;
    const cached = metadataCacheRef.current.get(stationId);
    if (cached) return cached;

    const meta: StationMeta = {
      station_id: stationId,
      name: station.name,
      country: station.country,
      codec: station.codec,
      bitrate: station.bitrate,
      streamUrl: station.url_resolved || station.url
    };
    metadataCacheRef.current.set(stationId, meta);
    return meta;
  };

  const playHoverBeep = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'triangle';
    osc.frequency.value = 880;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  };

  return (
    <div className="w-full h-full bg-zinc-950 fixed inset-0 z-0">
      <GlobeGL
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="https://api.maptiler.com/maps/satellite/{z}/{x}/{y}.jpg?key=get_your_own_key"
        bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
        pointsData={packedStations.points}
        pointLat={(d: StationPoint) => packedStations.coords[d.__idx * 2]}
        pointLng={(d: StationPoint) => packedStations.coords[d.__idx * 2 + 1]}
        pointColor={() => '#00FF41'}
        pointAltitude={0.01}
        pointRadius={0.12}
        pointsMerge={true}
        onPointClick={(point: object) => {
          onSelectStation(point as RadioStation);
          if (audioCtxRef.current?.state === 'suspended') {
            void audioCtxRef.current.resume();
          }
        }}
        onPointHover={(point: object | null) => {
          if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);

          if (!point) {
            setHoveredMeta(null);
            return;
          }

          hoverTimerRef.current = window.setTimeout(() => {
            const station = point as RadioStation;
            setHoveredMeta(getMeta(station));
            if (gainRef.current && audioCtxRef.current) {
              gainRef.current.gain.setTargetAtTime(0.001, audioCtxRef.current.currentTime, 0.06);
            }
            playHoverBeep();
          }, HOVER_DEBOUNCE_MS);
        }}
        customLayerData={packedStations.points}
        customThreeObject={() => {
          const material = new THREE.SpriteMaterial({
            map: glowTexture || undefined,
            color: 0x00ff41,
            transparent: true,
            opacity: 0.8,
            depthWrite: false
          });
          const sprite = new THREE.Sprite(material);
          sprite.scale.set(0.5, 0.5, 1);
          return sprite;
        }}
        customThreeObjectUpdate={(obj, d: any) => {
          const station = d as StationPoint;
          const isSelected = selectedStation?.stationuuid === station.stationuuid;
          const scale = isSelected ? 0.72 : 0.5;
          obj.scale.set(scale, scale, 1);
        }}
      />

      {hoveredMeta && (
        <div className="absolute left-4 bottom-28 z-20 rounded-xl border border-emerald-500/40 bg-black/70 px-4 py-3 text-xs text-emerald-200 backdrop-blur">
          <p className="font-semibold text-emerald-300">{hoveredMeta.name}</p>
          <p>{hoveredMeta.country} · {hoveredMeta.codec} · {hoveredMeta.bitrate} kbps</p>
        </div>
      )}
    </div>
  );
};

export default Globe;
