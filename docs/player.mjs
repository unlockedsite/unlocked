export const chromeOS = /^(?:Chrome|Chromium) OS$/i.test(navigator.userAgentData?.platform)
  || /\bCrOS\b/.test(navigator.userAgent);

export function createPlayer(stage, title, onDisplayChange, onError) {
  const exitButton = stage.querySelector(".exit-stage");
  const toolbarButton = document.querySelector(".play-tools [data-action=fullscreen]");
  let frame, observer, fitFrame;
  let nativeActive = false, switching = false, disposed = false;

  function focusPlayer() {
    const target = frame || stage.querySelector(".startbox button") || exitButton;
    if (document.activeElement !== target) target.focus({preventScroll: true});
  }

  function fullscreenChanged() {
    if (disposed) return;
    const element = document.fullscreenElement || document.webkitFullscreenElement;
    const active = Boolean(element && stage.contains(element));
    if (nativeActive === active) return;
    nativeActive = active;
    fitFrame?.();
    if (frame || active) focusPlayer();
    else toolbarButton.focus({preventScroll: true});
    onDisplayChange();
  }

  async function toggle() {
    if (switching || disposed) return;
    switching = true;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else if (stage.requestFullscreen) {
        await stage.requestFullscreen({navigationUI: "hide"});
      } else {
        await stage.webkitRequestFullscreen();
      }
      fullscreenChanged();
    } catch {
      if (!disposed) onError("The browser blocked fullscreen. Open Unlocked directly and try again.");
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
    frame.allow = "fullscreen; autoplay; gamepad; encrypted-media";
    frame.allowFullscreen = true;
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

  document.addEventListener("fullscreenchange", fullscreenChanged);
  document.addEventListener("webkitfullscreenchange", fullscreenChanged);
  return {
    start, toggle,
    expanded: () => nativeActive,
    dispose() {
      disposed = true;
      observer?.disconnect();
      document.removeEventListener("fullscreenchange", fullscreenChanged);
      document.removeEventListener("webkitfullscreenchange", fullscreenChanged);
    }
  };
}
