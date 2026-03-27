import React, { useEffect, useRef, useState, useMemo } from 'react';
import GlobeGL from 'react-globe.gl';
import * as THREE from 'three';
import { RadioStation } from '../types/radio';

interface GlobeProps {
  stations: RadioStation[];
  onSelectStation: (station: RadioStation) => void;
  selectedStation?: RadioStation | null;
}

const Globe: React.FC<GlobeProps> = ({ stations, onSelectStation, selectedStation }) => {
  const globeEl = useRef<any>();
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Filter stations that have geo coordinates
  const geoStations = useMemo(() => {
    return stations.filter(s => s.geo_lat !== null && s.geo_long !== null);
  }, [stations]);

  useEffect(() => {
    const initGlobe = () => {
      if (globeEl.current) {
        try {
          // Set initial camera position
          globeEl.current.pointOfView({ lat: 20, lng: 0, altitude: 2.5 });
          
          // Safely attempt to adjust material if method exists
          if (typeof globeEl.current.getGlobeMaterial === 'function') {
            const globeMaterial = globeEl.current.getGlobeMaterial();
            if (globeMaterial) {
              globeMaterial.bumpScale = 10;
            }
          }
        } catch (err) {
          console.error("Globe initialization error:", err);
        }
      }
    };

    // Small delay to ensure the component is fully mounted and internal scene is ready
    const timer = setTimeout(initGlobe, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (selectedStation && selectedStation.geo_lat !== null && selectedStation.geo_long !== null && globeEl.current) {
      globeEl.current.pointOfView({
        lat: selectedStation.geo_lat,
        lng: selectedStation.geo_long,
        altitude: 1.5
      }, 1000);
    }
  }, [selectedStation]);

  return (
    <div className="w-full h-full bg-zinc-950 fixed inset-0 z-0 flex items-center justify-center">
      <GlobeGL
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="https://unpkg.com/three-globe/example/img/earth-night.jpg"
        bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
        
        onGlobeReady={() => console.log("Globe is ready and rendering")}
        
        pointsData={geoStations}
        pointLat="geo_lat"
        pointLng="geo_long"
        pointColor={() => '#60a5fa'}
        pointAltitude={0.01}
        pointRadius={0.2}
        pointsMerge={false}
        
        onPointClick={(point: any) => onSelectStation(point as RadioStation)}
        
        htmlElementsData={selectedStation ? [selectedStation] : []}
        htmlElement={(d: any) => {
          const el = document.createElement('div');
          el.innerHTML = `
            <div class="relative">
              <div class="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full animate-ping"></div>
              <div class="absolute -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-blue-400 rounded-full border-2 border-white"></div>
            </div>
          `;
          return el;
        }}
        htmlLat="geo_lat"
        htmlLng="geo_long"
      />
    </div>
  );
};

export default Globe;
