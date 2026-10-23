// The only addresses the app opens in the browser or the mail program.
export const SUPPORT = { en: 'https://onairgarage.com/support/', it: 'https://onairgarage.com/it/support/', es: 'https://onairgarage.com/es/support/' };
export const TOOL_PAGE = 'https://onairgarage.com/tools/audio-monitor-router/';
export const RELEASES = 'https://github.com/djgragra/audio-monitor-router/releases';
export const MAIL = 'mailto:hello@onairgarage.com';

const ALLOWED = new Set([...Object.values(SUPPORT), TOOL_PAGE, RELEASES, MAIL]);
export const isAllowedLink = (url) => ALLOWED.has(url);
