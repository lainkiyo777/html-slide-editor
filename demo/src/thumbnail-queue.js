function defaultClock() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function defaultYield() {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

function normalizeDuration(result, startedAt, clock) {
  if (Number.isFinite(result?.durationMs)) return Math.max(0, Math.round(result.durationMs));
  return Math.max(0, Math.round(clock() - startedAt));
}

function summarizeDurations(durations) {
  if (durations.length === 0) {
    return { averageDurationMs: 0, fastest: null, slowest: null };
  }

  const total = durations.reduce((sum, item) => sum + item.durationMs, 0);
  const fastest = durations.reduce((best, item) => item.durationMs < best.durationMs ? item : best);
  const slowest = durations.reduce((worst, item) => item.durationMs > worst.durationMs ? item : worst);
  return {
    averageDurationMs: Math.round(total / durations.length),
    fastest: { ...fastest },
    slowest: { ...slowest }
  };
}

export async function runThumbnailQueue({
  slides,
  cache,
  capture,
  generation = 0,
  getGeneration = () => generation,
  onProgress = () => {},
  yieldToMainThread = defaultYield,
  clock = defaultClock
}) {
  const queueStartedAt = clock();
  const errors = [];
  const durations = [];
  let success = 0;
  let failed = 0;
  let cancelled = false;

  for (const slide of slides) {
    if (getGeneration() !== generation) {
      cancelled = true;
      break;
    }

    const captureStartedAt = clock();
    try {
      const result = await capture(slide);
      if (getGeneration() !== generation) {
        cancelled = true;
        break;
      }
      if (typeof result?.dataUrl !== 'string' || result.dataUrl.length === 0) {
        throw new Error('Thumbnail capture returned no image data.');
      }

      const durationMs = normalizeDuration(result, captureStartedAt, clock);
      cache.set(slide.id, result.dataUrl);
      durations.push({ slideId: slide.id, durationMs });
      success += 1;
      onProgress({
        slideId: slide.id,
        status: 'ready',
        completed: success + failed,
        success,
        failed,
        total: slides.length,
        result
      });
    } catch (error) {
      if (getGeneration() !== generation) {
        cancelled = true;
        break;
      }

      const durationMs = Math.max(0, Math.round(clock() - captureStartedAt));
      durations.push({ slideId: slide.id, durationMs });
      failed += 1;
      const failure = {
        slideId: slide.id,
        stage: 'capture',
        error: String(error?.message ?? error)
      };
      errors.push(failure);
      onProgress({
        slideId: slide.id,
        status: 'error',
        completed: success + failed,
        success,
        failed,
        total: slides.length,
        error: failure
      });
    }

    await yieldToMainThread();
  }

  const durationSummary = summarizeDurations(durations);
  return {
    total: slides.length,
    completed: success + failed,
    success,
    failed,
    cancelled,
    errors,
    durations,
    totalDurationMs: Math.max(0, Math.round(clock() - queueStartedAt)),
    ...durationSummary
  };
}
