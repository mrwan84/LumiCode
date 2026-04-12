export function playSuccessMelody() {
  try {
    const ctx = new AudioContext();
    const notes = [523, 659, 784];
    const noteDuration = 0.12;
    const gap = 0.04;

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "triangle";
      const startTime = ctx.currentTime + i * (noteDuration + gap);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration);
      osc.start(startTime);
      osc.stop(startTime + noteDuration);
    });

    const totalDuration = notes.length * (noteDuration + gap) * 1000 + 200;
    setTimeout(() => ctx.close(), totalDuration);
  } catch (_) {}
}

export function playErrorMelody() {
  try {
    const ctx = new AudioContext();
    const notes = [784, 659, 523];
    const noteDuration = 0.12;
    const gap = 0.04;

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sawtooth";
      const startTime = ctx.currentTime + i * (noteDuration + gap);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.12, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration);
      osc.start(startTime);
      osc.stop(startTime + noteDuration);
    });

    const totalDuration = notes.length * (noteDuration + gap) * 1000 + 200;
    setTimeout(() => ctx.close(), totalDuration);
  } catch (_) {}
}

export function playWorkingBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 440;
    osc.type = "sine";
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    setTimeout(() => ctx.close(), 300);
  } catch (_) {}
}

export function playIdleTone() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 330;
    osc.type = "sine";
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    setTimeout(() => ctx.close(), 400);
  } catch (_) {}
}

export function playSoundForEvent(event: string) {
  switch (event) {
    case "done":
      playSuccessMelody();
      break;
    case "error":
      playErrorMelody();
      break;
    case "working":
    case "thinking":
      playWorkingBeep();
      break;
    case "idle":
      playIdleTone();
      break;
  }
}
