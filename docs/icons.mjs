const shapes = {
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
