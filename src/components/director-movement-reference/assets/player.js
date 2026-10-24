(() => {
  const config = window.referenceConfig;
  const content = window.referenceScene ?? {};
  const picture = document.getElementById("picture");
  const scene = document.getElementById("scene");
  const paused = document.getElementById("paused");
  document.getElementById("hint").textContent = config.hint;
  const duration = content.durationMs ?? config.durationMs;
  const loop = content.loop === true;
  let playing = false;
  let elapsed = 0;
  let previous = null;
  let raf = null;
  let resumeAfterVisibility = false;
  let resumeAfterScrub = false;
  let lastProgressSentAt = 0;

  function update() {
    paused.hidden = playing;
    picture.setAttribute("aria-label", playing ? config.pauseLabel : config.playLabel);
    picture.setAttribute("aria-pressed", String(!playing));
    picture.dataset.playing = String(playing);
  }
  function reportProgress(force = false) {
    const now = performance.now();
    if (!force && now - lastProgressSentAt < 100) return;
    lastProgressSentAt = now;
    window.parent.postMessage({ type: "reference-progress", progress: progressAt(elapsed) }, "*");
  }
  function progressAt(time) {
    if (time <= 0) return 0;
    if (!loop) return Math.max(0, Math.min(1, time / duration));
    const wrapped = time % duration;
    return wrapped === 0 ? 1 : Math.max(0, Math.min(1, wrapped / duration));
  }
  function render(forceProgressReport = false) {
    const progress = progressAt(elapsed);
    window.LunaReferenceElements?.render(progress);
    content.render?.(progress);
    reportProgress(forceProgressReport);
  }
  function seek(progress) {
    elapsed = Math.max(0, Math.min(1, progress)) * duration;
    previous = null;
    const position = Math.max(0, Math.min(1, progress));
    for (const animation of scene.getAnimations({ subtree: true })) {
      animation.currentTime = position * duration;
    }
    for (const video of scene.querySelectorAll("video")) {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = position * video.duration;
      }
    }
    render(true);
  }
  function synchronizeMedia() {
    for (const animation of scene.getAnimations({ subtree: true })) {
      if (playing) animation.play(); else animation.pause();
    }
    for (const video of scene.querySelectorAll("video")) {
      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      if (playing) video.play().catch(pause); else video.pause();
    }
  }
  function tick(timestamp) {
    if (!playing) return;
    if (previous !== null) elapsed += timestamp - previous;
    previous = timestamp;
    if (!loop && elapsed >= duration) {
      elapsed = duration;
      render(true);
      pause();
      return;
    }
    render();
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    playing = false;
    cancelAnimationFrame(raf);
    raf = null;
    previous = null;
    synchronizeMedia();
    update();
  }
  function play() {
    if (playing && raf !== null) return;
    if (!loop && elapsed >= duration) elapsed = 0;
    playing = true;
    previous = null;
    synchronizeMedia();
    update();
    raf = requestAnimationFrame(tick);
  }
  if (config.staticFrame) {
    playing = false;
    render();
    synchronizeMedia();
    paused.hidden = true;
    picture.removeAttribute("role");
    picture.removeAttribute("tabindex");
    picture.removeAttribute("aria-pressed");
    picture.removeAttribute("aria-label");
    picture.dataset.playing = "false";
    return;
  }
  function toggle() { if (playing) pause(); else play(); }
  picture.addEventListener("click", toggle);
  picture.addEventListener("keydown", event => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggle();
    }
  });
  function visibility(hidden) {
    if (hidden) {
      if (resumeAfterVisibility) return;
      resumeAfterVisibility = playing;
      pause();
    } else if (resumeAfterVisibility) {
      resumeAfterVisibility = false;
      play();
    }
  }
  document.addEventListener("visibilitychange", () => visibility(document.hidden));
  window.addEventListener("message", event => {
    if (event.source !== parent) return;
    if (event.data?.type === "reference-visibility") {
      visibility(event.data.hidden === true);
    } else if (event.data?.type === "reference-seek" && Number.isFinite(Number(event.data.progress))) {
      seek(Number(event.data.progress));
    } else if (event.data?.type === "reference-scrub-start") {
      resumeAfterScrub = playing;
      pause();
    } else if (event.data?.type === "reference-scrub-end") {
      if (resumeAfterScrub && (loop || elapsed < duration)) play();
      resumeAfterScrub = false;
    }
  });
  window.addEventListener("pagehide", pause);
  render();
  synchronizeMedia();
  update();
})();
