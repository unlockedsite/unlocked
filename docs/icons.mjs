const shapes = {
  settings: '<path d="M9.8 2.8h4.4l.6 2.4c.6.2 1.1.5 1.6.9l2.3-.8 2.2 3.8-1.8 1.6a8.7 8.7 0 0 1 0 1.8l1.8 1.6-2.2 3.8-2.3-.8c-.5.4-1 .7-1.6.9l-.6 2.4H9.8l-.6-2.4c-.6-.2-1.1-.5-1.6-.9l-2.3.8-2.2-3.8 1.8-1.6a8.7 8.7 0 0 1 0-1.8L3.1 9.1l2.2-3.8 2.3.8c.5-.4 1-.7 1.6-.9Z"/><circle cx="12" cy="11.6" r="3.1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  shield: '<path d="M12 2.5 20 6v5.7c0 5.2-3.3 8.1-8 10-4.7-1.9-8-4.8-8-10V6Z"/><path d="m9 12 2 2 4-4"/>',
  users: '<path d="M15 20v-2a3.5 3.5 0 0 0-3.5-3.5h-4A3.5 3.5 0 0 0 4 18v2m15.5 0v-2a3.6 3.6 0 0 0-2.5-3.4"/><circle cx="9.5" cy="7.7" r="3.4"/><path d="M15.5 4.5a3.4 3.4 0 0 1 0 6.5"/>',
  forward: '<path d="m9 5 7 7-7 7"/>',
  discord: '<path fill="currentColor" stroke="none" d="M20.3 5.2a19.6 19.6 0 0 0-4.8-1.5l-.6 1.2a18 18 0 0 0-5.8 0l-.6-1.2a19.5 19.5 0 0 0-4.8 1.5C.7 9.8-.1 14.3.3 18.7a19.4 19.4 0 0 0 5.9 3l1.2-2c-.7-.3-1.4-.6-2-1l.5-.4c3.8 1.8 8.4 1.8 12.2 0l.5.4-2 1 1.2 2a19.3 19.3 0 0 0 5.9-3c.5-5.1-.8-9.6-3.4-13.5ZM8.1 16c-1.1 0-2-1-2-2.3s.9-2.3 2-2.3 2 1 2 2.3-.9 2.3-2 2.3Zm7.8 0c-1.1 0-2-1-2-2.3s.9-2.3 2-2.3 2 1 2 2.3-.9 2.3-2 2.3Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.8"/><path d="m16 16 4.8 4.8"/>',
  bookmark: '<path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.9L6 21Z"/>',
  play: '<path d="M7 4.3a.7.7 0 0 1 1.1-.6l12 7.7a.7.7 0 0 1 0 1.2l-12 7.7a.7.7 0 0 1-1.1-.6Z" fill="currentColor" stroke="none"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  trophy: '<path d="M7.5 3.5h9v5.8a4.5 4.5 0 0 1-9 0Zm0 1.8H3.3v2.4a4 4 0 0 0 4.4 4m8.8-6.4h4.2v2.4a4 4 0 0 1-4.4 4M12 14v4.5m-4 2h8"/>',
  star: '<path d="m12 2.8 2.9 5.9 6.4 1-4.7 4.6 1.1 6.5-5.7-3.1-5.7 3.1 1.1-6.5-4.7-4.6 6.4-1Z"/>',
  monitor: '<rect x="2.5" y="3.5" width="19" height="13.5" rx="2.2"/><path d="M8 21h8m-4-4v4"/>',
  moon: '<path d="M20 15.8a8.8 8.8 0 0 1-11.8-12 9 9 0 1 0 11.8 12Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19"/>',
  filter: '<path d="M3 6h8m4 0h6M3 17h3m5 0h10"/><circle cx="13" cy="6" r="2.3"/><circle cx="8.5" cy="17" r="2.3"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9h.01"/>',
  check: '<path d="m4 12 5.2 5.2L20 6.5"/>',
  expand: '<path d="M8.5 3H3v5.5M15.5 3H21v5.5M21 15.5V21h-5.5M8.5 21H3v-5.5"/>',
  external: '<path d="M14 3h7v7m-1-6L10 14m0-9H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
  gamepad: '<path d="M8 7h8a4 4 0 0 1 4 3.2l1.4 6.8c.5 3-2.3 3.8-4.1 1.7L15 16H9l-2.3 2.7c-1.8 2.1-4.6 1.3-4.1-1.7L4 10.2A4 4 0 0 1 8 7Z"/><path d="M6.8 11.8h4m-2-2v4m7.3-1h.02m2-2h.02"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.4 9a2.7 2.7 0 0 1 5.2.7c0 2-2.6 2.2-2.6 4.3m0 3h.01"/>',
  bug: '<rect x="7" y="7.5" width="10" height="13" rx="5"/><path d="m9 6-2-3m8 3 2-3M3 9l4.5 2M3 15h4m-2 6 3.5-3M21 9l-4.5 2M21 15h-4m2 6-3.5-3M12 12v4"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
  bolt: '<path d="m14.2 2-10 12h7l-1.4 8 10-12h-7Z" fill="currentColor" stroke="none"/>'
};
export function icon(name) {
  return '<svg class="ico" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (shapes[name] || "") + '</svg>';
}
