try {
  const preference = localStorage.getItem("unlocked.theme");
  if (preference === "light" || preference === "dark") document.documentElement.dataset.theme = preference;
} catch { /* Device appearance still applies when browser storage is unavailable. */ }
