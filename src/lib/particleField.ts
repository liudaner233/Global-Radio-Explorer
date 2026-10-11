interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  driftX: number;
  driftY: number;
  size: number;
  alpha: number;
  color: string;
}

export function startParticleField(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = matchMedia('(pointer: coarse)');
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const limitedDevice = navigator.hardwareConcurrency <= 4 || memory <= 4;
  const particles: Particle[] = [];
  const pointer = { x: 0, y: 0, active: false, strength: 0 };
  const cellSize = 78;
  const radius = 160;
  let width = 1;
  let height = 1;
  let columns = 1;
  let rows = 1;
  let heads = new Int32Array(1);
  let next = new Int32Array(1);
  let frame = 0;
  let previousTime = 0;
  let sampledTime = 0;
  let sampledFrames = 0;
  let quality = 1;

  function resize() {
    const oldWidth = width;
    const oldHeight = height;
    width = window.innerWidth;
    height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, limitedDevice ? 1.25 : 1.75);
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
        color: Math.random() < 0.15 ? '220,235,255' : '96,165,250',
      });
    }
    next = new Int32Array(particles.length);
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
      const distance = Math.hypot(dx, dy);
      const influence = Math.max(0, 1 - distance / radius) * pointer.strength;
      const force = (influence * influence * 150) / Math.max(22, distance);
      particle.vx = particle.driftX + (particle.vx - particle.driftX) * damping + dx * force * dt;
      particle.vy = particle.driftY + (particle.vy - particle.driftY) * damping + dy * force * dt;
      particle.x = (particle.x + particle.vx * dt + width) % width;
      particle.y = (particle.y + particle.vy * dt + height) % height;
      const cell = Math.floor(particle.y / cellSize) * columns + Math.floor(particle.x / cellSize);
      next[i] = heads[cell];
      heads[cell] = i;
      context!.fillStyle = `rgba(${particle.color},${particle.alpha + influence * 0.22})`;
      context!.beginPath();
      context!.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context!.fill();
    }

    context!.lineWidth = 0.6;
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const nearPointer =
        Math.max(0, 1 - Math.hypot(particle.x - pointer.x, particle.y - pointer.y) / radius) *
        pointer.strength;
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
            const distance = Math.hypot(particle.x - other.x, particle.y - other.y);
            if (distance >= range || distance < 4) continue;
            context!.strokeStyle = `rgba(96,165,250,${(1 - distance / range) * (0.075 + nearPointer * 0.16)})`;
            context!.beginPath();
            context!.moveTo(particle.x, particle.y);
            context!.lineTo(other.x, other.y);
            context!.stroke();
            links++;
          }
        }
      }
    }
  }

  function animate(time: number) {
    const elapsed = previousTime ? time - previousTime : 16.7;
    previousTime = time;
    draw(Math.min(elapsed / 1000, 0.04));
    sampledTime += elapsed;
    sampledFrames++;
    if (sampledFrames >= 180) {
      if (sampledTime / sampledFrames > 25 && quality > 0.45) {
        quality = Math.max(0.45, quality * 0.8);
        resize();
      }
      sampledFrames = 0;
      sampledTime = 0;
    }
    frame = requestAnimationFrame(animate);
  }

  function resume() {
    cancelAnimationFrame(frame);
    previousTime = 0;
    sampledFrames = 0;
    sampledTime = 0;
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
