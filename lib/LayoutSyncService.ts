/**
 * [Scorelens V2] LayoutSyncService
 * ==================================
 * Computes the Verovio rendering options (scale, margins, spacing)
 * that best match the original scanned image's layout metrics.
 *
 * Input:  LayoutMap bundle from Scorelens-Engine_V2
 * Output: Verovio option overrides for pixel-accurate layout replication
 */

export interface LayoutMap {
  image_width: number;
  image_height: number;
  margin_left: number;
  margin_right: number;
  margin_top: number;
  margin_bottom: number;
  avg_staff_space: number;
  avg_system_distance: number;
  systems: Array<{
    group: number;
    y_top: number;
    y_bottom: number;
    x_left: number;
    x_right: number;
    track_count: number;
    staves: Array<{
      track: number;
      group: number;
      x_left: number;
      y_upper: number;
      x_right: number;
      y_lower: number;
      staff_space: number;
      line_count: number;
    }>;
  }>;
  system_break_ys: number[];
}

export interface VerovioLayoutOptions {
  scale: number;
  pageMarginTop: number;
  pageMarginBottom: number;
  pageMarginLeft: number;
  pageMarginRight: number;
  spacingSystem: number;
  spacingStaff: number;
  pageWidth: number;
  pageHeight: number;
}

export interface SystemSyncInfo {
  /** Number of systems (rows) detected on the page */
  systemCount: number;
  /** Number of staves per system (1 = single staff, 2 = grand staff, etc.) */
  tracksPerSystem: number;
  /** Average staff space in pixels (from scanned image) */
  avgStaffSpace: number;
  /** Average system-to-system distance in pixels */
  avgSystemDistance: number;
  /** Verovio options that best replicate the original layout */
  verovioOptions: VerovioLayoutOptions;
  /** System break Y positions as fractions of image height (0.0–1.0) */
  systemBreakRatios: number[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Verovio's internal coordinate unit = 1/10 of a staff space.
 * Standard MusicXML page width in Verovio units ≈ 2100.
 *
 * We target a canonical page width of 2800 Verovio units (≈ A4 landscape).
 */
const VRV_PAGE_WIDTH = 2800;
const VRV_PAGE_HEIGHT = 3960;

/**
 * Verovio `scale` is a percentage (10–400).
 * At scale=100, 1 staff space ≈ 8.8px on a 96dpi screen.
 * At scale=45 (our default), 1 staff space ≈ 4px.
 *
 * Formula: targetScale = (desiredStaffSpacePx / 8.8) * 100
 */
const VRV_BASE_STAFF_SPACE_PX = 8.8;

// ─── Core Computation ────────────────────────────────────────────────────────

/**
 * Derive Verovio layout options from the scanned image's LayoutMap.
 */
export function computeLayoutSync(
  layout: LayoutMap,
  containerWidthPx: number = 900
): SystemSyncInfo {
  const {
    image_width,
    image_height,
    margin_left,
    margin_right,
    margin_top,
    margin_bottom,
    avg_staff_space,
    avg_system_distance,
    systems,
    system_break_ys,
  } = layout;

  const systemCount = systems.length;
  const tracksPerSystem = systems[0]?.track_count ?? 1;

  // ── 1. Compute Verovio scale from staff_space ───────────────────────────
  // We want Verovio to render staff spaces that visually match the scanned image.
  // The scanned image occupies `containerWidthPx` on screen.
  // Staff space in image pixels, normalized to our container:
  const imageToContainerRatio = containerWidthPx / (image_width || containerWidthPx);
  const normalizedStaffSpace = avg_staff_space * imageToContainerRatio;

  // Verovio scale needed to produce this staff space size
  const rawScale = (normalizedStaffSpace / VRV_BASE_STAFF_SPACE_PX) * 100;
  // Clamp to reasonable range [20, 120]
  const scale = Math.min(120, Math.max(20, Math.round(rawScale)));

  // ── 2. Convert image margins (relative 0–1) → Verovio page units ────────
  // Verovio page margins are in internal units (not pixels).
  // At scale=100, 1 internal unit ≈ 0.18px.
  // We convert from relative margin → pixel margin → Verovio unit.
  const pxPerVrvUnit = (scale / 100) * 0.9; // approximate at current scale

  const marginLeftPx = margin_left * containerWidthPx;
  const marginRightPx = margin_right * containerWidthPx;
  const marginTopPx = margin_top * (containerWidthPx * (image_height / (image_width || 1)));
  const marginBottomPx = margin_bottom * (containerWidthPx * (image_height / (image_width || 1)));

  const toVrvUnits = (px: number) => Math.round(px / pxPerVrvUnit);

  const pageMarginLeft = Math.max(20, Math.min(300, toVrvUnits(marginLeftPx)));
  const pageMarginRight = Math.max(20, Math.min(300, toVrvUnits(marginRightPx)));
  const pageMarginTop = Math.max(40, Math.min(400, toVrvUnits(marginTopPx)));
  const pageMarginBottom = Math.max(40, Math.min(400, toVrvUnits(marginBottomPx)));

  // ── 3. Compute inter-system spacing ─────────────────────────────────────
  // Verovio `spacingSystem` = distance between consecutive systems in internal units.
  // Expressed as multiple of staff space. Typical range: 6–24.
  const systemDistInStaffSpaces = avg_system_distance / (avg_staff_space || 10);
  const spacingSystem = Math.min(24, Math.max(6, Math.round(systemDistInStaffSpaces * 5)));

  // Verovio `spacingStaff` = distance between staves within same system.
  // For a Grand Staff (2 tracks), the gap between treble and bass is usually ~2 staff spaces.
  const spacingStaff = tracksPerSystem > 1 ? 8 : 10;

  // ── 4. System break ratios ──────────────────────────────────────────────
  const systemBreakRatios = system_break_ys.map(y =>
    Math.round((y / (image_height || 1)) * 1000) / 1000
  );

  const verovioOptions: VerovioLayoutOptions = {
    scale,
    pageMarginTop,
    pageMarginBottom,
    pageMarginLeft,
    pageMarginRight,
    spacingSystem,
    spacingStaff,
    pageWidth: VRV_PAGE_WIDTH,
    pageHeight: VRV_PAGE_HEIGHT,
  };

  console.log(
    `[LayoutSync] 🎯 Scale: ${scale} | Margins: T${pageMarginTop} B${pageMarginBottom} L${pageMarginLeft} R${pageMarginRight}` +
    ` | spacingSystem: ${spacingSystem} | systems: ${systemCount} | tracks/system: ${tracksPerSystem}`
  );

  return {
    systemCount,
    tracksPerSystem,
    avgStaffSpace: avg_staff_space,
    avgSystemDistance: avg_system_distance,
    verovioOptions,
    systemBreakRatios,
  };
}

/**
 * Build a scroll-sync mapping: maps each system's Y-fraction in the
 * scanned image to the corresponding Verovio SVG page index.
 *
 * Used by the side-by-side view to keep both panels in lock-step.
 */
export function buildScrollSyncMap(
  systemBreakRatios: number[],
  verovioPageCount: number
): Array<{ imageYRatio: number; verovioPage: number; verovioYRatio: number }> {
  const map = systemBreakRatios.map((ratio, idx) => {
    // Estimate which Verovio page this system falls on.
    // Simple heuristic: distribute systems evenly across pages.
    const verovioPage = Math.min(
      verovioPageCount - 1,
      Math.floor((idx / systemBreakRatios.length) * verovioPageCount)
    );
    // Estimate Y ratio within that Verovio page
    const systemsPerPage = Math.ceil(systemBreakRatios.length / verovioPageCount);
    const systemOnPage = idx % systemsPerPage;
    const verovioYRatio = systemsPerPage > 0 ? systemOnPage / systemsPerPage : 0;

    return { imageYRatio: ratio, verovioPage, verovioYRatio };
  });

  return map;
}

/**
 * Given the current scroll position of the original image panel (0.0–1.0),
 * returns the target scroll position for the Verovio panel.
 */
export function syncScroll(
  imageScrollRatio: number,
  scrollSyncMap: ReturnType<typeof buildScrollSyncMap>
): number {
  if (scrollSyncMap.length === 0) return imageScrollRatio;

  // Find the two surrounding sync points
  let lower = scrollSyncMap[0];
  let upper = scrollSyncMap[scrollSyncMap.length - 1];

  for (let i = 0; i < scrollSyncMap.length - 1; i++) {
    if (
      imageScrollRatio >= scrollSyncMap[i].imageYRatio &&
      imageScrollRatio <= scrollSyncMap[i + 1].imageYRatio
    ) {
      lower = scrollSyncMap[i];
      upper = scrollSyncMap[i + 1];
      break;
    }
  }

  // Linear interpolation between the two sync points
  const range = upper.imageYRatio - lower.imageYRatio;
  if (range <= 0) return lower.verovioYRatio;
  const t = (imageScrollRatio - lower.imageYRatio) / range;
  return lower.verovioYRatio + t * (upper.verovioYRatio - lower.verovioYRatio);
}
