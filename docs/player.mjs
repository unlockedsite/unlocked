export const chromeOS = /^(?:Chrome|Chromium) OS$/i.test(navigator.userAgentData?.platform)
  || /\bCrOS\b/.test(navigator.userAgent);

export function createPlayer(stage, title, onDisplayChange) {
  const exitButton = stage.querySelector(".exit-stage");
  const toolbarButton = document.querySelector(".play-tools [data-action=fullscreen]");
  let frame, observer, fitFrame;
  let fullTab = false;
  let nativeActive = false, switching = false, disposed = false;

  function focusPlayer() {
    const target = frame || stage.querySelector(".startbox button") || exitButton;
    if (document.activeElement !== target) target.focus({preventScroll: true});
  }

  function setFullTab(open) {
    if (open === fullTab) return;
    fullTab = open;
    stage.classList.toggle("expanded", open);
    document.body.classList.toggle("player-expanded", open);
    fitFrame?.();
    if (open || frame) focusPlayer();
    else toolbarButton.focus({preventScroll: true});
    onDisplayChange();
  }

  function fullscreenChanged() {
    const active = Boolean(document.fullscreenElement && stage.contains(document.fullscreenElement));
    if (nativeActive === active) return;
    nativeActive = active;
    if (frame || active) focusPlayer();
    else toolbarButton.focus({preventScroll: true});
    onDisplayChange();
  }

  async function toggle() {
    if (switching || disposed) return;
    if (fullTab) { setFullTab(false); return; }
    if (chromeOS || !stage.requestFullscreen) { setFullTab(true); return; }
    switching = true;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.requestFullscreen();
    } catch {
      if (!disposed && !document.fullscreenElement) setFullTab(true);
    } finally {
      switching = false;
    }
  }

  function sizeChromebookFrame(limitResolution) {
    // Keep the game's CSS viewport fixed for this session. Only its presentation
    // scales on resize, so an expanding tab doesn't request a larger game canvas.
    const {clientWidth: width, clientHeight: height} = stage.parentElement;
    const ratio = limitResolution ? Math.min(1, 1280 / width, 720 / height) : 1;
    const gameWidth = Math.max(1, Math.round(width * ratio));
    const gameHeight = Math.max(1, Math.round(height * ratio));
    frame.classList.add("stable-viewport");
    frame.style.width = gameWidth + "px";
    frame.style.height = gameHeight + "px";
    fitFrame = () => {
      const scale = Math.min(stage.clientWidth / gameWidth, stage.clientHeight / gameHeight);
      frame.style.setProperty("--player-scale", String(scale));
    };
    fitFrame();
    observer = new ResizeObserver(fitFrame);
    observer.observe(stage);
  }

  function start(url, limitResolution) {
    if (frame || disposed) return false;
    frame = document.createElement("iframe");
    frame.title = title + " game player";
    frame.allow = (chromeOS ? "fullscreen 'none'" : "fullscreen") + "; autoplay; gamepad; encrypted-media";
    if (!chromeOS) frame.allowFullscreen = true;
    // Local imports retain an opaque origin. Third-party games may use their own storage.
    const local = new URL(url).origin === location.origin;
    frame.setAttribute("sandbox", "allow-scripts allow-pointer-lock allow-presentation allow-downloads allow-forms" + (local ? "" : " allow-same-origin"));
    frame.referrerPolicy = "no-referrer";
    stage.querySelector(".startbox").hidden = true;
    stage.querySelector(".stage-art").remove();
    stage.classList.remove("centered");
    if (chromeOS) sizeChromebookFrame(limitResolution);
    frame.src = url;
    stage.prepend(frame);
    focusPlayer();
    return true;
  }

  function keydown(event) {
    if (event.key === "Escape" && fullTab) setFullTab(false);
  }
  document.addEventListener("fullscreenchange", fullscreenChanged);
  document.addEventListener("keydown", keydown);
  return {
    start, toggle,
    expanded: () => fullTab || nativeActive,
    dispose() {
      disposed = true;
      observer?.disconnect();
      document.removeEventListener("fullscreenchange", fullscreenChanged);
      document.removeEventListener("keydown", keydown);
      document.body.classList.remove("player-expanded");
    }
  };
}
