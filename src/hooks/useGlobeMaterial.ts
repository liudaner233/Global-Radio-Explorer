import { useEffect, useState } from 'react';
import * as THREE from 'three';

const DEFAULT_GLOBE_TEXTURE_URL = `${import.meta.env.BASE_URL}maps/earth-blue-marble.jpg`;
const DEFAULT_GLOBE_BUMP_URL = `${import.meta.env.BASE_URL}maps/earth-topology.png`;

const TEXTURE_TIMEOUT_MS = 8000;

export function useGlobeMaterial() {
  const [globeMaterial] = useState(
    () =>
      new THREE.MeshPhongMaterial({
        color: '#1d4ed8',
        emissive: '#0b1022',
        emissiveIntensity: 0.45,
        shininess: 8,
        bumpScale: 0,
      })
  );

  useEffect(() => {
    let active = true;
    let textureFailed = false;
    const textures: THREE.Texture[] = [];
    const loader = new THREE.TextureLoader();
    const timeout = setTimeout(() => {
      textureFailed = true;
    }, TEXTURE_TIMEOUT_MS);
    const failTexture = () => {
      textureFailed = true;
      clearTimeout(timeout);
    };
    try {
      textures.push(
        loader.load(
          DEFAULT_GLOBE_TEXTURE_URL,
          (texture) => {
            if (!active || textureFailed) {
              texture.dispose();
              return;
            }
            clearTimeout(timeout);
            texture.colorSpace = THREE.SRGBColorSpace;
            globeMaterial.map = texture;
            globeMaterial.color.set('#ffffff');
            globeMaterial.emissive.set('#000000');
            globeMaterial.emissiveIntensity = 0;
            globeMaterial.shininess = 0.6;
            globeMaterial.needsUpdate = true;
            textures.push(
              loader.load(
                DEFAULT_GLOBE_BUMP_URL,
                (bumpTexture) => {
                  if (!active) {
                    bumpTexture.dispose();
                    return;
                  }
                  globeMaterial.bumpMap = bumpTexture;
                  globeMaterial.bumpScale = 10;
                  globeMaterial.needsUpdate = true;
                },
                undefined,
                () => undefined
              )
            );
          },
          undefined,
          failTexture
        )
      );
    } catch {
      failTexture();
    }
    return () => {
      active = false;
      clearTimeout(timeout);
      globeMaterial.map = null;
      globeMaterial.bumpMap = null;
      textures.forEach((texture) => texture.dispose());
      globeMaterial.dispose();
    };
  }, [globeMaterial]);

  return globeMaterial;
}
