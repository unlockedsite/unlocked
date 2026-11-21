export const chromeOS = /^(?:Chrome|Chromium) OS$/i.test(navigator.userAgentData?.platform)
  || /\bCrOS\b/.test(navigator.userAgent);

export function createPlayer(stage, title, onDisplayChange, onError) {
  const exitButton = stage.querySelector(".exit-stage");
  const toolbarButton = document.querySelector(".play-tools [data-action=fullscreen]");
  let frame, observer, fitFrame;
  let nativeActive = false, switching = false, disposed = false, fallbackActive = false;

  function focusPlayer() {
    const target = frame || stage.querySelector(".startbox button") || exitButton;
    if (document.activeElement !== target) target.focus({preventScroll: true});
    if (target === frame) frame.contentWindow?.focus();
  }

  function fullscreenChanged() {
    if (disposed) return;
    const element = document.fullscreenElement || document.webkitFullscreenElement;
    const active = Boolean(element && stage.contains(element)) || fallbackActive;
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
      if (fallbackActive) {\n        fallbackActive=false;stage.classList.remove("fallback-fullscreen");document.body.classList.remove("player-fullscreen-open");\n      } else if (document.fullscreenElement || document.webkitFullscreenElement) {
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

  function sizeFrame(limitResolution) {
    const slot = stage.parentElement;
    const initialWidth = Math.max(1, slot.clientWidth);
    const initialHeight = Math.max(1, slot.clientHeight);
    fitFrame = () => {
      const expanded = Boolean(document.fullscreenElement || document.webkitFullscreenElement || fallbackActive);
      const scaled = chromeOS || expanded;
      frame.classList.toggle("stable-viewport", scaled);
      if (!scaled) {
        frame.style.removeProperty("width");
        frame.style.removeProperty("height");
        return;
      }
      const width = Math.max(1, stage.clientWidth);
      const height = Math.max(1, stage.clientHeight);
      // Match the display's aspect ratio while keeping the game's render budget bounded.
      const ratio = Math.min(1, initialWidth / width, initialHeight / height,
        limitResolution ? 1280 / width : 1, limitResolution ? 720 / height : 1);
      frame.style.width = width * ratio + "px";
      frame.style.height = height * ratio + "px";
      frame.style.setProperty("--player-scale", String(1 / ratio));
    };
    fitFrame();
    observer = new ResizeObserver(fitFrame);
    observer.observe(stage);
  }

  function start(url, limitResolution) {
    if (frame || disposed) return false;
    frame = document.createElement("iframe");
    frame.title = title + " game player";
    frame.tabIndex = 0;
    // Navigation can reset focus after the launch click. Hand it to the loaded game
    // unless the player has already moved to another control.
    frame.addEventListener("load", () => {
      if (!disposed && (document.activeElement === frame || document.activeElement === document.body)) focusPlayer();
    }, {once: true});
    frame.allow = "fullscreen; autoplay; gamepad; encrypted-media";
    frame.allowFullscreen = true;
    // Local imports retain an opaque origin. Third-party games may use their own storage.
    const local = new URL(url).origin === location.origin;
    frame.setAttribute("sandbox", "allow-scripts allow-pointer-lock allow-presentation allow-downloads allow-forms" + (local ? "" : " allow-same-origin"));
    frame.referrerPolicy = "no-referrer";
    stage.querySelector(".startbox").hidden = true;
    stage.querySelector(".stage-art").remove();
    stage.classList.remove("centered");
    sizeFrame(limitResolution);
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
      disposed = true;\n      fallbackActive=false;stage.classList.remove("fallback-fullscreen");document.body.classList.remove("player-fullscreen-open");
      observer?.disconnect();
      document.removeEventListener("fullscreenchange", fullscreenChanged);
      document.removeEventListener("webkitfullscreenchange", fullscreenChanged);
    }
  };
}
