/** Original vendor marketing is not a personal-workspace navigation target. */
export function isVendorRoute(href: string, base = location.origin): boolean {
  try {
    const url = new URL(href, base);
    return /(^|\.)(maidrum\.com|apps\.apple\.com|play\.google\.com|open\.kakao\.com|docs\.google\.com)$/.test(url.hostname);
  } catch { return false; }
}
export function neutralizeMarketing(): void {
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(a => {
    if(isVendorRoute(a.href)) {
      a.removeAttribute('href'); a.removeAttribute('target');
      a.hidden = true;
    }
  });
}
