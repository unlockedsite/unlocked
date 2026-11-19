export function normalize(text) {
  return String(text ?? "").normalize("NFKD").replace(/\p{M}/gu, "")
    .toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function matches(game, query) {
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return !String(query).trim();
  return [game.title, ...(game.aliases || []), game.id].some(name => {
    const title = normalize(name);
    return words.every(word => title.includes(word)) ||
      title.replaceAll(" ", "").includes(words.join(""));
  });
}
