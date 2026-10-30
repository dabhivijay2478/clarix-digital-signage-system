# Native desktop design system

Clarix remains a Rust application on egui/eframe 0.37 with the glow renderer. No web frontend or data migration is involved.

## Desktop appearance

The default appearance follows the operating system. System, Light, and Dark are available on login, in Settings, and in the account menu. The preference is stored under clarix_appearance in eframe storage and restored at startup. Theme changes apply immediately and system appearance changes continue to be observed in System mode.

Use theme::tokens(ui) for desktop colors, including painter-based controls. Primary actions use theme::primary_button so their text stays readable in both themes. PlatformStyle supplies control height, border thickness, and rounding. Installed platform fonts are used when available, with bundled egui and system fallback fonts retained.

Shared components are in src/ui/widgets.rs; font-independent line icons are in src/ui/icons.rs. Interactive icons and navigation use real buttons for focus, keyboard activation, and accessible labels. Status colors always have text labels.

## Layout

The startup size remains 1280 × 800 logical points; the minimum is 800 × 600.

| Window width | Navigation |
| --- | --- |
| Below 1000 | Menu-triggered drawer |
| 1000–1279 | 64-point icon rail |
| 1280 and above | 224-point sidebar |

Navigation scrolls at limited heights. The shell owns page-level vertical scrolling; wide data tables own horizontal scrolling. Card grids use actual content width. Dialogs share viewport constraints and scrolling through layout::dialog. Custom cards allocate exact rectangles and place bounded child UIs inside them.

## Live signage

SignageStyle is independent of desktop appearance and OS styling. Production widgets and gate groups paginate every ten seconds using the egui monotonic frame clock; playlist timing, scheduling, queues, and alerts retain their existing business rules. Sparse final pages expand to fill the display. Chart colors honor existing configured mappings, and default category positions remain stable between frames.

Media sizing rules are preserved. This redesign does not add support for embedded web pages or document playback in the native player. The Tizen receiver is unchanged.

## Verification

Run cargo check --all-targets and cargo test --all-targets. Tests cover appearance persistence and theme resolution, navigation breakpoints, grid containment, pagination, real pointer interaction with creation dialogs and theme controls, theme-independent signage rendering, and every management page with empty/populated fixtures at 800 × 600, 1024 × 640, 1280 × 800, and 1920 × 1080 at 100%, 125%, and 200% scale.

Development builds also provide cargo run -- --ui-review. It launches an automated native visual review against a disposable demo database, saves PNGs under target/ui-review, and closes when complete. It never opens the user's database or starts the LAN server. Add --signage-only to capture only signage scenes. Screenshots include both themes at all desktop sizes/scales, plus portrait 1080 × 1920 and landscape 3840 × 2160 signage. This entry point is excluded from release builds.

The native CI workflow checks and tests Windows, Linux, and macOS. Linux builds explicitly enable both X11 and Wayland. Windows is the available native visual verification host; Linux and macOS still require their own runtime smoke checks. CI configuration alone is not evidence that those jobs have run.


### Verification on the available Windows host

- cargo check --locked --all-targets --offline passed; warnings remain acceptable under repository guidance.
- cargo test --locked --all-targets --offline passed all 10 tests.
- The full native review produced 414 PNGs, with every image matching its requested logical size and scale. Detailed captures and a contact sheet were inspected, and affected scenes were refreshed after refinements.
- Backend, schema, LAN, and scheduler source files were unchanged. Truck-state transitions, timestamp sharing, gate capacity, alert formats, and force-sync behavior were preserved while their UI was redesigned.
- Linux and macOS runtime smoke checks and the new hosted CI jobs have not been executed from this Windows environment.
