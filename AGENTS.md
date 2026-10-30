# Clarix — agent guidance

This is a pure **Rust** desktop app (eframe/egui 0.37 GUI + SQLite + axum LAN server). There is no Node/Next.js/Tauri frontend anymore.

## Stack
- `eframe`/`egui` **0.37.0** (glow renderer). egui 0.37 differs from older docs: app shells are drawn in `eframe::App::ui(&mut self, ui: &mut egui::Ui, frame)`; panels are unified `egui::Panel::left/right/top/bottom(id)`; selectable items are `egui::Button::selectable(...)`; contraption types accept `&mut Ui`, not `&mut Context` (except `Window::show(ctx, …)`).
- `egui` must be a direct dependency (`egui = "0.37"`) — eframe does not re-export it into the extern prelude.
- `cargo check --all-targets` must stay green; warnings are acceptable.
- `build.rs` embeds `.env` as `build_env.rs` (an **array expression**, included in expression position by `auth_config.rs`).

## Layout
- `src/ui/` — all egui pages (`show(&mut self, ui, core: &Arc<AppCore>, toasts: &mut Vec<Toast>)` unless noted; Player is `show(ui, &core)`; Team takes `session: Option<&AuthSession>`).
- `src/backend/` — SQLite-backed command layer; async fns run via `core.block_on(...)`.
- `src/lan/` — axum controller server (port 7420), pairing/sync, mDNS discovery.
- `src-tauri/`, React/Tauri scripts are legacy history — do not resurrect.

## Models nuances
- `AdminRole`/`AppWeekday` derive `Clone` but not `Copy` — clone instead of moving out of refs.
- Truck status semantics live in `src/ui/trucks.rs` (port of the old `truckStore.ts`): keep waiting⇄loading timestamp sharing, gate capacity 2, alert publish format, and force-sync behavior intact when touching it.

## Layout/verification gotchas
- Fixed-position UI (login etc.) must use exact geometry: `Align2::align_size_within_rect(size, outer)` + `ui.new_child(UiBuilder::new().max_rect(rect).layout(...))`. Do NOT trust `allocate_ui_with_layout` to clamp children width, and remember `Frame::show`'s child Ui inherits the parent's layout direction (re-wrap with `Layout::top_down` inside horizontal rows).
- Cards inside horizontal grid rows (Screens/Content/settings mode cards, `stat_card`): hand-allocate the card with `allocate_exact_size` + `painter_at(rect)` paint. Re-wrapping a `Frame::show` child via `new_child(max_rect(inner.max_rect()))` does NOT work there — `inner.max_rect()` is the whole remaining row, so content spills across the panel; even `set_min_width` child shenanigans fail. Interactive bits go into small `new_child` sub-rects of the card rect (see `widgets::stat_card`, `content.rs` `draw_item_card`, `settings.rs` `draw_device_mode_card`).
- `Ui::new_child` returns an owned `Ui`: shadow it as `let ui = &mut child;` (passing the owned value where `&mut Ui` is expected is a compile error).
- Fullwidth glyphs (`＋`, etc.) render as tofu boxes with egui's default fonts — stick to ASCII for button labels (`"+"`, `"+" Add Truck`).
- `empty_state` (widgets.rs) biases itself toward the upper-middle of the remaining vertical space (capped 120px) — keep `empty_state` calls as late content on a page or reorder info blocks above them (see production.rs).
- Screenshot verification under 125% DPI: a DPI-unaware PowerShell gets a 0.8× virtualized `GetWindowRect`, and `PrintWindow` copies unscaled physical pixels — captures silently clip at the virtualized bounds. Call `SetProcessDpiAwarenessContext(IntPtr(-4))` first, then capture the true window size (e.g. 1618×1047).
