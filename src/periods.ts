/** Select consistently sized two-calendar-month mapping periods. */
import type {Manifest, WindowMetadata} from './types';

function monthIndex(value: string): number {
  const date = new Date(value);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

/** Show the two-month comparison periods. */
export function mapWindows(manifest: Manifest): WindowMetadata[] {
  const twoMonth = manifest.windows.filter((window) =>
    monthIndex(window.period_end) - monthIndex(window.period_start) === 2);
  return twoMonth.length > 0 ? twoMonth : manifest.windows;
}

/** Prefer the mid-summer comparison period when it is available. */
export function initialMapWindowId(manifest: Manifest): string {
  const available = mapWindows(manifest);
  const preferred = `${manifest.target_year}_Jul-Aug`;
  return available.find((window) => window.id === preferred)?.id
    ?? available.find((window) => window.id === manifest.default_window)?.id
    ?? available[0]?.id
    ?? manifest.default_window;
}
