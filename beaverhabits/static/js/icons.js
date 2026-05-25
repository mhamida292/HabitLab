// icons.js — shared icon rendering helpers
// Habits store either a lucide icon name (e.g. "droplet") or a legacy emoji.

/**
 * Is this value a legacy emoji rather than a lucide name?
 */
export function isEmoji(value) {
    if (!value || value.length === 0) return false;
    const cp = value.codePointAt(0);
    return cp > 0x2000; // emoji / pictograph range
}

/**
 * Build a DOM element for the given icon value.
 * - Lucide name  → <i data-lucide="name"> (replaced by lucide.createIcons())
 * - Emoji / text → <span> with the character
 */
export function buildIconEl(value, size = 18) {
    if (!value) value = 'map-pin';
    if (isEmoji(value)) {
        const span = document.createElement('span');
        span.style.cssText = `font-size:${size}px;line-height:1;display:flex;align-items:center;justify-content:center`;
        span.textContent = value;
        return span;
    }
    const i = document.createElement('i');
    i.setAttribute('data-lucide', value);
    i.style.cssText = `width:${size}px;height:${size}px;display:block`;
    return i;
}

/**
 * After injecting <i data-lucide="..."> into the DOM, call this to hydrate them.
 */
export function applyIcons() {
    window.lucide?.createIcons?.();
}

/**
 * Curated set of lucide icon names for the picker, grouped by category.
 */
export const ICON_NAMES = [
    // Movement
    'dumbbell', 'bike', 'waves', 'activity', 'footprints', 'zap', 'timer', 'heart-pulse',
    // Health
    'droplet', 'apple', 'pill', 'moon', 'bed', 'leaf', 'heart', 'wind',
    // Mind
    'book-open', 'pen-line', 'brain', 'library', 'palette', 'music', 'target', 'lightbulb',
    // Daily life
    'home', 'wallet', 'coffee', 'star', 'map-pin', 'sun', 'sunrise', 'flame',
    // Work / study
    'laptop', 'bar-chart-2', 'calendar', 'graduation-cap', 'check-circle', 'clipboard', 'key', 'file-text',
];
