interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  driftX: number;
  driftY: number;
  size: number;
  alpha: number;
  color: number;
  influence: number;
  opacity: number;
}

export function startParticleField(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = matchMedia('(pointer: coarse)');
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const limitedDevice = navigator.hardwareConcurrency <= 4 || memory <= 4;
  const particles: Particle[] = [];
  const particleColors = ['rgb(96,165,250)', 'rgb(220,235,255)'];
  const pointer = { x: 0, y: 0, active: false, strength: 0 };
  const cellSize = 78;
  const radius = 160;
  let width = 1;
  let height = 1;
  let columns = 1;
  let rows = 1;
  let heads = new Int32Array(1);
  let next = new Int32Array(1);
  let linkStarts = new Uint16Array(0);
  let linkEnds = new Uint16Array(0);
  let linkOpacities = new Uint8Array(0);
  let frame = 0;
  let previousTime = 0;
  let previousDraw = 0;
  let sampledTime = 0;
  let sampledFrames = 0;
  let sampledWork = 0;
  let sampledDraws = 0;
  let quality = 1;

  function resize() {
    const oldWidth = width;
    const oldHeight = height;
    width = window.innerWidth;
    height = window.innerHeight;
    const pixelBudget = (limitedDevice ? 1_500_000 : 2_600_000) * quality;
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      limitedDevice ? 1.25 : 1.5,
      Math.sqrt(pixelBudget / (width * height))
    );
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context!.setTransform(ratio, 0, 0, ratio, 0, 0);
    columns = Math.ceil(width / cellSize);
    rows = Math.ceil(height / cellSize);
    heads = new Int32Array(columns * rows);
    const density = coarsePointer.matches ? 0.42 : limitedDevice ? 0.65 : 1;
    const count = Math.round(
      Math.min(1100, Math.max(45, (width * height) / 2700)) * density * quality
    );
    for (const particle of particles) {
      particle.x *= width / oldWidth;
      particle.y *= height / oldHeight;
    }
    particles.length = Math.min(particles.length, count);
    while (particles.length < count) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 6;
      const driftX = Math.cos(angle) * speed;
      const driftY = Math.sin(angle) * speed;
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: driftX,
        vy: driftY,
        driftX,
        driftY,
        size: 0.4 + Math.random() * 0.85,
        alpha: 0.22 + Math.random() * 0.42,
        color: Math.random() < 0.15 ? 1 : 0,
        influence: 0,
        opacity: 0,
      });
    }
    next = new Int32Array(particles.length);
    linkStarts = new Uint16Array(particles.length * 2);
    linkEnds = new Uint16Array(particles.length * 2);
    linkOpacities = new Uint8Array(particles.length * 2);
    if (reducedMotion.matches) draw(0);
  }

  function draw(dt: number) {
    context!.clearRect(0, 0, width, height);
    pointer.strength += ((pointer.active ? 1 : 0) - pointer.strength) * (1 - Math.exp(-dt * 4));
    const damping = Math.exp(-dt * 2.6);
    heads.fill(-1);

    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const dx = pointer.x - particle.x;
      const dy = pointer.y - particle.y;
      const distanceSquared = dx * dx + dy * dy;
      const distance =
        pointer.strength > 0.002 && distanceSquared < radius * radius
          ? Math.sqrt(distanceSquared)
          : radius;
      const influence = Math.max(0, 1 - distance / radius) * pointer.strength;
      particle.influence = influence;
      particle.opacity = Math.min(7, Math.floor((particle.alpha + influence * 0.22) * 8));
      const force = (influence * influence * 150) / Math.max(22, distance);
      particle.vx = particle.driftX + (particle.vx - particle.driftX) * damping + dx * force * dt;
      particle.vy = particle.driftY + (particle.vy - particle.driftY) * damping + dy * force * dt;
      particle.x = (particle.x + particle.vx * dt + width) % width;
      particle.y = (particle.y + particle.vy * dt + height) % height;
      const cell = Math.floor(particle.y / cellSize) * columns + Math.floor(particle.x / cellSize);
      next[i] = heads[cell];
      heads[cell] = i;
    }

    for (let color = 0; color < particleColors.length; color++) {
      context!.fillStyle = particleColors[color];
      for (let opacity = 1; opacity < 8; opacity++) {
        context!.globalAlpha = (opacity + 0.5) / 8;
        context!.beginPath();
        for (const particle of particles) {
          if (particle.color !== color || particle.opacity !== opacity) continue;
          context!.moveTo(particle.x + particle.size, particle.y);
          context!.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        }
        context!.fill();
      }
    }

    let linkCount = 0;
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const nearPointer = particle.influence;
      const range = 44 + nearPointer * 30;
      const column = Math.floor(particle.x / cellSize);
      const row = Math.floor(particle.y / cellSize);
      let links = 0;
      let checked = 0;
      for (
        let y = Math.max(0, row - 1);
        y <= Math.min(rows - 1, row + 1) && links < 2 && checked < 28;
        y++
      ) {
        for (
          let x = Math.max(0, column - 1);
          x <= Math.min(columns - 1, column + 1) && links < 2 && checked < 28;
          x++
        ) {
          for (let j = heads[y * columns + x]; j !== -1 && links < 2 && checked < 28; j = next[j]) {
            checked++;
            if (j <= i) continue;
            const other = particles[j];
            const dx = particle.x - other.x;
            const dy = particle.y - other.y;
            const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared >= range * range || distanceSquared < 16) continue;
            const alpha = (1 - Math.sqrt(distanceSquared) / range) * (0.075 + nearPointer * 0.16);
            linkStarts[linkCount] = i;
            linkEnds[linkCount] = j;
            linkOpacities[linkCount] = Math.min(7, Math.floor(alpha * 32));
            linkCount++;
            links++;
          }
        }
      }
    }

    context!.lineWidth = 0.6;
    context!.strokeStyle = particleColors[0];
    for (let opacity = 0; opacity < 8; opacity++) {
      context!.globalAlpha = (opacity + 0.5) / 32;
      context!.beginPath();
      for (let link = 0; link < linkCount; link++) {
        if (linkOpacities[link] !== opacity) continue;
        const start = particles[linkStarts[link]];
        const end = particles[linkEnds[link]];
        context!.moveTo(start.x, start.y);
        context!.lineTo(end.x, end.y);
      }
      context!.stroke();
    }
    context!.globalAlpha = 1;
  }

  function animate(time: number) {
    const elapsed = previousTime ? time - previousTime : 16.7;
    previousTime = time;
    sampledTime += elapsed;
    sampledFrames++;
    const frameRate = limitedDevice || coarsePointer.matches ? 24 : 30;
    const interval = 1000 / (pointer.active ? Math.min(45, frameRate + 15) : frameRate);
    const drawElapsed = previousDraw ? time - previousDraw : interval;
    if (drawElapsed >= interval - 0.5) {
      const started = performance.now();
      draw(Math.min(drawElapsed / 1000, 0.1));
      sampledWork += performance.now() - started;
      sampledDraws++;
      previousDraw = time;
    }
    if (sampledFrames >= 120) {
      if (
        (sampledTime / sampledFrames > 25 ||
          sampledWork / Math.max(1, sampledDraws) > (limitedDevice ? 2 : 3)) &&
        quality > 0.45
      ) {
        quality = Math.max(0.45, quality * 0.8);
        resize();
      }
      sampledFrames = 0;
      sampledTime = 0;
      sampledWork = 0;
      sampledDraws = 0;
    }
    frame = requestAnimationFrame(animate);
  }

  function resume() {
    cancelAnimationFrame(frame);
    previousTime = 0;
    previousDraw = 0;
    sampledFrames = 0;
    sampledTime = 0;
    sampledWork = 0;
    sampledDraws = 0;
    if (!document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(animate);
    else if (!document.hidden) draw(0);
  }

  function move(event: PointerEvent) {
    if (event.pointerType === 'touch') return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = event.target instanceof HTMLCanvasElement;
  }

  function leave() {
    pointer.active = false;
  }

  resize();
  resume();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', move, { passive: true });
  document.documentElement.addEventListener('pointerleave', leave);
  window.addEventListener('blur', leave);
  document.addEventListener('visibilitychange', resume);
  reducedMotion.addEventListener('change', resume);
  coarsePointer.addEventListener('change', resize);

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', move);
    document.documentElement.removeEventListener('pointerleave', leave);
    window.removeEventListener('blur', leave);
    document.removeEventListener('visibilitychange', resume);
    reducedMotion.removeEventListener('change', resume);
    coarsePointer.removeEventListener('change', resize);
  };
}
