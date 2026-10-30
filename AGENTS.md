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
