use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use chrono::Local;
use tokio::sync::broadcast;

use super::signage::{self, PageLayout, SignageStyle as S};
use crate::display_rules::{OperatingHours, PlaylistItemSchedule};
use crate::models::{
    ActiveTruck, ContentItem, ContentType, MarqueeSettings, Playlist, ScheduleSlot, Screen,
    TruckScreenAlert,
};
use crate::state::AppCore;

pub struct PlayerPage {
    bound_screen: Option<String>,
    picker_last_refresh: Instant,
    screens: Vec<Screen>,

    // Cached signage data.
    playlists: Vec<Playlist>,
    content: Vec<ContentItem>,
    marquee: Option<MarqueeSettings>,

    // Playback.
    is_playing: bool,
    item_index: usize,
    item_started: Instant,
    fade_alpha: f32,

    // Truck gates for the bound screen.
    active_trucks: Vec<ActiveTruck>,
    data_last_refresh: Instant,

    // Truck alert overlay.
    alert_rx: Option<broadcast::Receiver<TruckScreenAlert>>,
    alert: Option<TruckScreenAlert>,
    alert_since: Instant,

    // Textures for images & video frames.
    textures: HashMap<String, Option<egui::TextureHandle>>,

    // Video decoder pipeline.
    video: Option<VideoDecoder>,
    video_key: Option<String>,
    dashboards: Vec<crate::models::ProductionDashboard>,
}

impl Default for PlayerPage {
    fn default() -> Self {
        Self {
            bound_screen: None,
            picker_last_refresh: Instant::now() - Duration::from_secs(3600),
            screens: Vec::new(),
            playlists: Vec::new(),
            content: Vec::new(),
            marquee: None,
            is_playing: false,
            item_index: 0,
            item_started: Instant::now(),
            fade_alpha: 1.0,
            active_trucks: Vec::new(),
            data_last_refresh: Instant::now() - Duration::from_secs(3600),
            alert_rx: None,
            alert: None,
            alert_since: Instant::now(),
            textures: HashMap::new(),
            video: None,
            video_key: None,
            dashboards: Vec::new(),
        }
    }
}

impl PlayerPage {
    /// Admin exit from playback (Esc). Stops any running video pipeline.
    pub fn exit_to_admin(&mut self) -> bool {
        self.stop_video();
        true
    }

    pub fn logic(&mut self, core: &Arc<AppCore>, ctx: &egui::Context) {
        if self.bound_screen.is_some() {
            self.playback_logic(core, ctx);
        }
    }

    pub fn show(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>) {
        if self.bound_screen.is_none() {
            self.show_picker(ui, core);
            return;
        }
        self.show_signage(ui, core);
    }

    // ── Picker ─────────────────────────────────────────────────────────────

    fn show_picker(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>) {
        if widgets::should_refresh(self.picker_last_refresh, Duration::from_secs(3)) {
            self.picker_last_refresh = Instant::now();
            self.screens = crate::backend::screens::get_screens(&core.pool).unwrap_or_default();
            self.playlists =
                crate::backend::playlists::get_playlists(&core.pool).unwrap_or_default();
        }

        let rect = ui.available_rect_before_wrap();
        let card = egui::Align2::CENTER_CENTER.align_size_within_rect(
            egui::vec2(
                600.0_f32.min(rect.width() - 32.0),
                520.0_f32.min(rect.height() - 32.0),
            ),
            rect,
        );
        let mut child = ui.new_child(
            egui::UiBuilder::new()
                .max_rect(card)
                .layout(egui::Layout::top_down(egui::Align::Min)),
        );
        let ui = &mut child;
        egui::Frame::new()
            .fill(theme::tokens(ui).card)
            .stroke(egui::Stroke::new(1.0, theme::tokens(ui).stroke))
            .inner_margin(egui::Margin::same(20))
            .corner_radius(10.0)
            .show(ui, |ui| {
                ui.vertical_centered(|ui| {
                    ui.label(
                        egui::RichText::new("Player preview")
                            .size(20.0)
                            .strong()
                            .color(theme::tokens(ui).text),
                    );
                    theme::muted(
                        ui,
                        "Pick the screen this player window should render. Esc exits playback.",
                    );
                    ui.add_space(10.0);
                });
                let screens = self.screens.clone();
                let playlists = self.playlists.clone();
                egui::ScrollArea::vertical()
                    .max_height(card.height() - 96.0)
                    .show(ui, |ui| {
                        if screens.is_empty() {
                            widgets::empty_state(ui, "No screens configured yet.");
                        }
                        for screen in screens {
                            let playlist_name = screen
                                .playlist_id
                                .as_ref()
                                .and_then(|id| playlists.iter().find(|p| &p.id == id))
                                .map(|p| p.name.clone())
                                .unwrap_or_else(|| "—".to_string());
                            theme::card(ui, |ui| {
                                ui.horizontal_wrapped(|ui| {
                                    ui.vertical(|ui| {
                                        ui.label(
                                            egui::RichText::new(screen.name.clone())
                                                .strong()
                                                .color(theme::tokens(ui).text),
                                        );
                                        theme::muted(
                                            ui,
                                            &format!(
                                                "{} · purpose: {} · playlist: {}",
                                                if screen.location.is_empty() {
                                                    "No location"
                                                } else {
                                                    &screen.location
                                                },
                                                screen.purpose,
                                                playlist_name,
                                            ),
                                        );
                                    });
                                    ui.with_layout(
                                        egui::Layout::right_to_left(egui::Align::Center),
                                        |ui| {
                                            if ui
                                                .button(egui::RichText::new("Bind screen").strong())
                                                .clicked()
                                            {
                                                self.bind_screen(core, screen.id.clone());
                                            }
                                        },
                                    );
                                });
                            });
                            ui.add_space(4.0);
                        }
                    });
            });
    }

    fn bind_screen(&mut self, core: &Arc<AppCore>, screen_id: String) {
        self.bound_screen = Some(screen_id);
        self.alert_rx = Some(core.truck_alerts.0.subscribe());
        self.reset_playback(core);
    }

    fn reset_playback(&mut self, core: &Arc<AppCore>) {
        self.item_index = 0;
        self.is_playing = true;
        self.item_started = Instant::now();
        self.fade_alpha = 0.0;
        self.stop_video();
        self.refresh_data(core);
    }

    fn refresh_data(&mut self, core: &Arc<AppCore>) {
        self.playlists = crate::backend::playlists::get_playlists(&core.pool).unwrap_or_default();
        self.content = crate::backend::content::get_content_items(&core.pool).unwrap_or_default();
        self.marquee = crate::backend::app_config::get_marquee_settings(core).ok();
        self.screens = crate::backend::screens::get_screens(&core.pool).unwrap_or_default();
        self.dashboards =
            crate::backend::production::get_production_dashboards(core).unwrap_or_default();
    }

    fn screen(&self) -> Option<&Screen> {
        let id = self.bound_screen.as_ref()?;
        self.screens.iter().find(|screen| &screen.id == id)
    }

    /// Resolve the playlist currently assigned to this screen, with schedule
    /// slot overrides taking priority (ported from the old player page).
    fn resolve_playlist(&self, core: &Arc<AppCore>) -> Option<Playlist> {
        let screen = self.screen()?;
        let scheduled = core.scheduler.get_active_slot_for_screen(&screen.id);
        let playlist_id = match scheduled {
            Some(ScheduleSlot { playlist_id, .. }) => Some(playlist_id),
            None => screen.playlist_id.clone(),
        };
        playlist_id
            .and_then(|id| self.playlists.iter().find(|p| p.id == id).cloned())
            .filter(|playlist| !playlist.items.is_empty())
            .map(|playlist| {
                let mut playlist = playlist;
                playlist.items.sort_by_key(|item| item.order);
                playlist
            })
    }

    /// (gate numbers, purpose) for the bound screen, honouring gates.json.
    fn gate_purpose(&self, core: &Arc<AppCore>) -> Option<(Vec<String>, String)> {
        let screen = self.screen()?;
        let assigned_gates = crate::state::parse_screen_gates(screen.gate.as_deref());
        if screen.purpose != "playlist" {
            return Some((assigned_gates, screen.purpose.clone()));
        }
        if !assigned_gates.is_empty() {
            let gate_store = crate::state::load_gate_store(&core.config_dir);
            if let Some((first, gate)) = gate_store
                .assignments
                .iter()
                .find(|(_, ids)| ids.contains(&screen.id))
                .map(|(number, _)| {
                    (number.clone(), {
                        gate_store
                            .gates
                            .iter()
                            .find(|gate| &gate.number == number)
                            .cloned()
                            .unwrap_or_default()
                    })
                })
            {
                let _ = first;
                let purpose = if gate.purpose.is_empty() {
                    "playlist".to_string()
                } else {
                    gate.purpose
                };
                return Some((assigned_gates, purpose));
            }
            return Some((assigned_gates, "truck_gate".to_string()));
        }
        None
    }

    // ── Playback logic ─────────────────────────────────────────────────────

    fn playback_logic(&mut self, core: &Arc<AppCore>, ctx: &egui::Context) {
        // Drain truck alerts.
        let is_gate_screen = self
            .gate_purpose(core)
            .map(|(gates, purpose)| !gates.is_empty() || purpose != "playlist")
            .unwrap_or(false);
        if let Some(rx) = self.alert_rx.as_mut() {
            loop {
                match rx.try_recv() {
                    Ok(event) => {
                        if is_gate_screen {
                            self.alert = None;
                        } else {
                            self.alert = Some(event);
                            self.alert_since = Instant::now();
                        }
                    }
                    Err(broadcast::error::TryRecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
        }
        if self.alert.is_some()
            && self.alert_since.elapsed()
                > Duration::from_secs(
                    self.alert
                        .as_ref()
                        .map(|alert| alert.duration_secs.max(3) as u64)
                        .unwrap_or(3),
                )
        {
            self.alert = None;
        }

        // Periodic data re-resolution (15s like the old player).
        if widgets::should_refresh(self.data_last_refresh, Duration::from_secs(15)) {
            self.data_last_refresh = Instant::now();
            self.refresh_data(core);
        }
        if self
            .screen()
            .map(|screen| screen.purpose == "truck_gate")
            .unwrap_or(false)
        {
            self.active_trucks =
                crate::backend::trucks::get_active_trucks(&core.pool).unwrap_or_default();
        }

        // Fade ramp (simple crossfade-in for each new item).
        if self.fade_alpha < 1.0 {
            self.fade_alpha = (self.fade_alpha + 0.08).min(1.0);
        }

        // Advance playlist items.
        let playlist = self.resolve_playlist(core);
        if let Some(playlist) = playlist {
            self.is_playing = true;
            let playable = self.playable_items(&playlist);
            if playable.is_empty() {
                self.stop_video();
            } else {
                let index = self.item_index % playable.len();
                let item = playable[index].clone();
                let content = self
                    .content
                    .iter()
                    .find(|c| c.id == item.content_id)
                    .cloned();
                let duration_secs = content
                    .as_ref()
                    .map(|c| c.duration_secs.max(1) as u64)
                    .unwrap_or(10);
                if self.item_started.elapsed() >= Duration::from_secs(duration_secs) {
                    self.record_analytics(
                        core,
                        content.as_ref(),
                        "Complete",
                        Some(duration_secs as f64),
                    );
                    self.fade_alpha = 0.0;
                    self.item_index = (index + 1) % playable.len();
                    self.item_started = Instant::now();
                    let next_item = playable[self.item_index % playable.len()].clone();
                    let next_content = self
                        .content
                        .iter()
                        .find(|c| c.id == next_item.content_id)
                        .cloned();
                    self.record_analytics(core, next_content.as_ref(), "Play", None);
                    // Restart the video pipeline for the new item in show().
                    if content
                        .as_ref()
                        .map(|c| c.content_type == ContentType::Video)
                        .unwrap_or(false)
                    {
                        self.stop_video();
                    }
                }
                // Kill the video pipeline when the current item is not a video.
                let current_is_video = content
                    .as_ref()
                    .map(|c| c.content_type == ContentType::Video)
                    .unwrap_or(false);
                if !current_is_video && self.video.is_some() {
                    self.stop_video();
                }
            }
        } else {
            self.is_playing = false;
            self.stop_video();
        }

        ctx.request_repaint_after(Duration::from_millis(120));
    }

    fn playable_items(&self, playlist: &Playlist) -> Vec<crate::models::PlaylistItem> {
        let now = Local::now();
        let scheduled = playlist
            .items
            .iter()
            .filter(|item| {
                PlaylistItemSchedule::parse(item.display_schedule.as_ref())
                    .map(|schedule| schedule.is_active_now(now))
                    .unwrap_or(true)
            })
            .cloned()
            .collect::<Vec<_>>();

        if !scheduled.is_empty() {
            return scheduled;
        }
        self.screen()
            .and_then(|screen| screen.default_content_id.clone())
            .map(|id| {
                vec![crate::models::PlaylistItem {
                    content_id: id,
                    order: 0,
                    override_duration: None,
                    display_schedule: None,
                }]
            })
            .unwrap_or_default()
    }

    fn record_analytics(
        &self,
        core: &Arc<AppCore>,
        content: Option<&ContentItem>,
        event_type: &str,
        dwell_secs: Option<f64>,
    ) {
        if let (Some(screen), Some(content)) = (self.screen(), content) {
            let _ = crate::backend::analytics::record_analytics_event(
                core,
                screen.id.clone(),
                content.id.clone(),
                event_type.to_string(),
                dwell_secs,
            );
        }
    }

    pub fn stop_video(&mut self) {
        if let Some(mut decoder) = self.video.take() {
            decoder.shutdown();
        }
        self.video = None;
        self.video_key = None;
    }

    // ── Render ────────────────────────────────────────────────────────────

    fn show_signage(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>) {
        let rect = ui.available_rect_before_wrap();
        ui.painter().rect_filled(rect, 0.0, egui::Color32::BLACK);

        let screen = self.screen().cloned();
        let marquee = self.marquee.clone();
        let operating_hours = screen
            .as_ref()
            .map(|screen| OperatingHours::parse(screen.operating_hours.as_ref()));
        let blank = operating_hours
            .as_ref()
            .map(|hours| hours.blank_when_not_in_use && !hours.is_within_now(Local::now()))
            .unwrap_or(false);
        if blank {
            return;
        }

        let purpose = self
            .gate_purpose(core)
            .map(|(_, purpose)| purpose)
            .unwrap_or_else(|| "playlist".to_string());
        let playlist = self.resolve_playlist(core);
        let scale = S::scale(rect);
        let ticker_height = if marquee
            .as_ref()
            .is_some_and(|m| m.enabled && !m.text.is_empty())
        {
            64.0 * scale
        } else {
            0.0
        };
        let board_rect = egui::Rect::from_min_max(
            rect.min + egui::vec2(0.0, 44.0 * scale),
            rect.max - egui::vec2(0.0, ticker_height),
        );

        // Production dashboards render natively when configured.
        if purpose == "production_dashboard" {
            let dashboard_id = screen
                .as_ref()
                .and_then(|screen| screen.production_dashboard_id.clone())
                .or_else(|| self.dashboards.first().map(|d| d.id.clone()));
            render_dashboard_native(ui, core, board_rect, dashboard_id, &mut self.dashboards);
        } else if let Some(playlist) = playlist {
            self.draw_media(ui, core, &playlist, rect);
        } else if purpose == "truck_gate" {
            self.draw_truck_tokens(ui, core, board_rect);
        } else {
            painters::idle_message(ui, rect);
        }

        // Truck alert overlay on regular screens.
        if let Some(alert) = self.alert.clone() {
            painters::truck_alert(ui, rect, &alert);
        }

        // Marquee at the bottom.
        if let Some(marquee) = marquee.filter(|m| m.enabled && !m.text.is_empty()) {
            painters::marquee(ui, rect, &marquee, ui.input(|i| i.time));
        }

        // Exit affordance + clock.
        ui.painter().text(
            rect.left_top() + egui::vec2(18.0, 18.0),
            egui::Align2::LEFT_TOP,
            "Esc: exit",
            egui::FontId::proportional(16.0),
            S::MUTED,
        );
        ui.painter().text(
            rect.right_top() + egui::vec2(-20.0, 14.0),
            egui::Align2::RIGHT_TOP,
            Local::now().format("%H:%M").to_string(),
            egui::FontId::proportional(22.0),
            S::MUTED,
        );
    }

    fn draw_media(
        &mut self,
        ui: &mut egui::Ui,
        core: &Arc<AppCore>,
        playlist: &Playlist,
        rect: egui::Rect,
    ) {
        let playable = self.playable_items(playlist);
        if playable.is_empty() {
            painters::idle_message(ui, rect);
            return;
        }
        let index = self.item_index % playable.len();
        let item = playable[index].clone();
        let content = self
            .content
            .iter()
            .find(|c| c.id == item.content_id)
            .cloned();

        let Some(content) = content else {
            painters::idle_message(ui, rect);
            return;
        };

        match content.content_type {
            ContentType::Image => self.draw_image(ui, &content, rect),
            ContentType::Video => self.draw_video(ui, &content, rect),
            _ => painters::static_content(ui, rect, &content),
        }
        let _ = core;
    }

    fn draw_image(&mut self, ui: &mut egui::Ui, content: &ContentItem, rect: egui::Rect) {
        let key = content.file_path.clone().unwrap_or_default();
        if key.is_empty() {
            painters::missing(ui, rect, content);
            return;
        }
        if !self.textures.contains_key(&key) {
            self.textures
                .insert(key.clone(), image_texture(ui.ctx(), &key));
        }
        if self.textures.len() > 32 {
            self.textures.clear();
        }
        let Some(Some(handle)) = self.textures.get(&key) else {
            painters::missing(ui, rect, content);
            return;
        };
        let size = fit_cover(handle.size_vec2(), rect.size());
        let top_left = rect.center() - size / 2.0;
        ui.painter().image(
            handle.id(),
            egui::Rect::from_min_size(top_left, size),
            uv_full(),
            alpha_tint(self.fade_alpha),
        );
    }

    fn draw_video(&mut self, ui: &mut egui::Ui, content: &ContentItem, rect: egui::Rect) {
        let key = content.file_path.clone().unwrap_or_default();
        if key.is_empty() {
            painters::missing(ui, rect, content);
            return;
        }
        if self.video_key.as_deref() != Some(key.as_str()) {
            self.stop_video();
            self.video = VideoDecoder::spawn(key.clone());
            self.video_key = Some(key.clone());
        }
        let texture_key = format!("video:{key}");
        if let Some(frame) = self.video.as_ref().and_then(|decoder| decoder.try_take()) {
            let color = egui::ColorImage::from_rgb(
                [frame.width as usize, frame.height as usize],
                &frame.rgb,
            );
            let handle =
                ui.ctx()
                    .load_texture("player-video-frame", color, egui::TextureOptions::default());
            self.textures.insert(texture_key.clone(), Some(handle));
        }
        if let Some(Some(handle)) = self.textures.get(&texture_key) {
            let size = fit_cover(handle.size_vec2(), rect.size());
            let top_left = rect.center() - size / 2.0;
            ui.painter().image(
                handle.id(),
                egui::Rect::from_min_size(top_left, size),
                uv_full(),
                alpha_tint(self.fade_alpha),
            );
        } else {
            super::icons::paint(
                ui.painter(),
                egui::Rect::from_center_size(rect.center(), egui::vec2(48.0, 48.0)),
                super::icons::Icon::Play,
                S::MUTED,
            );
        }
        let _ = self.video_key.clone();
    }

    // ── Truck token display ───────────────────────────────────────────────

    fn draw_truck_tokens(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>, rect: egui::Rect) {
        let Some((gates, _)) = self.gate_purpose(core) else {
            painters::idle_message(ui, rect);
            return;
        };
        if gates.is_empty() {
            painters::idle_message(ui, rect);
            return;
        }
        let scale = S::scale(rect);
        let bounds = egui::Rect::from_min_max(
            rect.min + egui::vec2(20.0, 20.0) * scale,
            rect.max - egui::vec2(20.0, 44.0) * scale,
        );
        let layout = PageLayout::new(
            bounds,
            gates.len(),
            egui::vec2(540.0, 480.0) * scale,
            3,
            ui.input(|i| i.time),
            20.0 * scale,
        );
        let store = crate::state::load_gate_store(&core.config_dir);
        for (offset, index) in layout.range.clone().enumerate() {
            painters::truck_gate_column(
                ui,
                layout.cell(offset),
                &gates[index],
                &self.active_trucks,
                &store,
                &[],
            );
        }
        signage::page_indicator(ui.painter(), rect, &layout, scale);
    }
}

// ── Video pipeline (ffmpeg sidecar → rawvideo pipe → egui texture) ─────────

pub struct DecodedVideoFrame {
    width: u32,
    height: u32,
    rgb: Vec<u8>,
}

pub struct VideoDecoder {
    stop: Arc<AtomicBool>,
    child: Arc<Mutex<Option<std::process::Child>>>,
    sink: Arc<Mutex<Option<DecodedVideoFrame>>>,
}

impl VideoDecoder {
    fn spawn(path: String) -> Option<Self> {
        let path = if std::path::Path::new(&path).is_absolute() {
            path
        } else {
            let cwd = std::env::current_dir()
                .map(|d| d.to_string_lossy().to_string())
                .unwrap_or_default();
            format!("{cwd}{}{path}", std::path::MAIN_SEPARATOR)
        };

        let ffmpeg = std::path::PathBuf::from(ffmpeg_sidecar::paths::ffmpeg_path());
        let (source_w, source_h) = probe_video_dims(&path).unwrap_or((1920, 1080));
        let out_w = 960u32;
        let out_h = (((source_h as f64) * 960.0 / (source_w.max(1) as f64)) as u32).max(2) & !1;

        let result = std::process::Command::new(&ffmpeg)
            .args([
                "-re".to_string(),
                "-nostdin".to_string(),
                "-i".to_string(),
                path.clone(),
                "-an".to_string(),
                "-vf".to_string(),
                format!("scale={out_w}:{out_h}"),
                "-pix_fmt".to_string(),
                "rgb24".to_string(),
                "-f".to_string(),
                "rawvideo".to_string(),
                "pipe:1".to_string(),
            ])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .stdin(std::process::Stdio::null())
            .spawn();

        let mut child = match result {
            Ok(child) => child,
            Err(error) => {
                tracing::warn!("ffmpeg failed to start: {error}");
                return None;
            }
        };
        let stdout = child.stdout.take();
        let Some(stdout) = stdout else {
            return None;
        };

        let stop = Arc::new(AtomicBool::new(false));
        let child_handle = Arc::new(Mutex::new(Some(child)));
        let sink = Arc::new(Mutex::new(None::<DecodedVideoFrame>));

        let reader_stop = stop.clone();
        let reader_child = child_handle.clone();
        let reader_sink = sink.clone();
        std::thread::spawn(move || {
            use std::io::Read;
            let mut reader = std::io::BufReader::new(stdout);
            let frame_bytes = (out_w as usize) * (out_h as usize) * 3;
            let mut buffer = vec![0u8; frame_bytes];
            loop {
                if reader_stop.load(Ordering::Relaxed) {
                    break;
                }
                let mut filled = 0usize;
                while filled < frame_bytes {
                    match reader.read(&mut buffer[filled..]) {
                        Ok(0) => break,
                        Ok(n) => filled += n,
                        Err(_) => break,
                    }
                }
                if filled < frame_bytes {
                    break;
                }
                if let Ok(mut slot) = reader_sink.lock() {
                    *slot = Some(DecodedVideoFrame {
                        width: out_w,
                        height: out_h,
                        rgb: buffer.clone(),
                    });
                }
            }
            if let Ok(mut handle) = reader_child.lock() {
                if let Some(process) = handle.as_mut() {
                    let _ = process.kill();
                }
            }
            reader_stop.store(true, Ordering::Relaxed);
        });

        Some(Self {
            stop,
            child: child_handle,
            sink,
        })
    }

    fn try_take(&self) -> Option<DecodedVideoFrame> {
        self.sink.lock().ok().and_then(|mut slot| slot.take())
    }

    fn shutdown(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Ok(mut handle) = self.child.lock() {
            if let Some(process) = handle.as_mut() {
                let _ = process.kill();
            }
        }
    }
}

impl Drop for VideoDecoder {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn probe_video_dims(path: &str) -> Option<(u32, u32)> {
    let ffprobe = std::path::PathBuf::from(ffmpeg_sidecar::ffprobe::ffprobe_path());
    let output = std::process::Command::new(&ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0:s=x",
            path,
        ])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let mut parts = text.split('x');
    let width: u32 = parts.next()?.trim().parse().ok()?;
    let height: u32 = parts.next()?.trim().parse().ok()?;
    if width == 0 || height == 0 {
        return None;
    }
    Some((width, height))
}

// ── Image helpers ───────────────────────────────────────────────────────────

fn uv_full() -> egui::Rect {
    egui::Rect::from_min_max(egui::pos2(0.0, 0.0), egui::pos2(1.0, 1.0))
}

fn alpha_tint(alpha: f32) -> egui::Color32 {
    egui::Color32::from_rgba_unmultiplied(255, 255, 255, (alpha.clamp(0.0, 1.0) * 255.0) as u8)
}

fn fit_cover(source: egui::Vec2, max: egui::Vec2) -> egui::Vec2 {
    if source.x <= 0.0 || source.y <= 0.0 || max.x <= 0.0 || max.y <= 0.0 {
        return max;
    }
    let scale = (max.x / source.x).max(max.y / source.y);
    source * scale
}

fn image_texture(ctx: &egui::Context, path: &str) -> Option<egui::TextureHandle> {
    let bytes = std::fs::read(path).ok()?;
    let image = image::load_from_memory(&bytes).ok()?;
    let rgba = image.to_rgba8();
    let color = egui::ColorImage::from_rgba_unmultiplied(
        [rgba.width() as usize, rgba.height() as usize],
        rgba.as_raw(),
    );
    Some(ctx.load_texture(
        format!("player-{path}"),
        color,
        egui::TextureOptions::default(),
    ))
}

// ── Production dashboard native renderer (read-only) ───────────────────────

fn render_dashboard_native(
    ui: &mut egui::Ui,
    core: &Arc<AppCore>,
    rect: egui::Rect,
    dashboard_id: Option<String>,
    _dashboards: &mut Vec<crate::models::ProductionDashboard>,
) {
    ui.painter_at(rect).rect_filled(rect, 0.0, S::BG);
    let Some(id) = dashboard_id else {
        painters::idle_message(ui, rect);
        return;
    };
    let Ok(bundle) = crate::backend::production::get_production_dashboard(core, id) else {
        signage::text(
            ui.painter(),
            rect.shrink(32.0),
            "Dashboard data unavailable",
            28.0 * S::scale(rect),
            S::MUTED,
        );
        return;
    };
    let scale = S::scale(rect);
    let title = egui::Rect::from_min_max(
        rect.min + egui::vec2(24.0, 20.0) * scale,
        egui::pos2(rect.right() - 24.0 * scale, rect.top() + 78.0 * scale),
    );
    signage::text(
        ui.painter(),
        title,
        &bundle.dashboard.name,
        32.0 * scale,
        S::TEXT,
    );
    let Some(table) = bundle
        .dataset
        .selected_table_id
        .as_ref()
        .and_then(|id| bundle.dataset.tables.iter().find(|t| &t.id == id))
    else {
        signage::text(
            ui.painter(),
            rect.shrink(80.0 * scale),
            "Select a data table to display this dashboard",
            26.0 * scale,
            S::MUTED,
        );
        return;
    };
    let bounds = egui::Rect::from_min_max(
        rect.min + egui::vec2(24.0, 96.0) * scale,
        rect.max - egui::vec2(24.0, 44.0) * scale,
    );
    let max_columns = (bundle
        .dashboard
        .layout
        .get("columns")
        .and_then(|n| n.as_u64())
        .unwrap_or(12) as usize)
        .div_ceil(6)
        .clamp(1, 4);
    let layout = PageLayout::new(
        bounds,
        bundle.dashboard.widgets.len(),
        egui::vec2(600.0, 340.0) * scale,
        max_columns,
        ui.input(|i| i.time),
        20.0 * scale,
    );
    for (offset, index) in layout.range.clone().enumerate() {
        artists::production_widget(
            ui,
            layout.cell(offset),
            &bundle.dashboard.widgets[index],
            table,
        );
    }
    if bundle.dashboard.widgets.is_empty() {
        signage::text(
            ui.painter(),
            bounds,
            "No dashboard widgets configured",
            26.0 * scale,
            S::MUTED,
        );
    }
    signage::page_indicator(ui.painter(), rect, &layout, scale);
}

// ── Painter-based material widgets ─────────────────────────────────────────

mod painters {
    use super::*;

    pub fn idle_message(ui: &mut egui::Ui, rect: egui::Rect) {
        let p = ui.painter_at(rect);
        p.rect_filled(rect, 0.0, S::BG);
        signage::text(
            &p,
            rect.shrink(rect.width() * 0.1),
            "No active content. Assign a playlist or default content to this screen.",
            30.0 * S::scale(rect),
            S::MUTED,
        );
    }

    pub fn missing(ui: &mut egui::Ui, rect: egui::Rect, content: &ContentItem) {
        let p = ui.painter_at(rect);
        p.rect_filled(rect, 0.0, S::BG);
        signage::text(
            &p,
            rect.shrink(rect.width() * 0.1),
            &format!("{}\nContent file missing", content.name),
            30.0 * S::scale(rect),
            S::MUTED,
        );
    }

    pub fn static_content(ui: &mut egui::Ui, rect: egui::Rect, content: &ContentItem) {
        let p = ui.painter_at(rect);
        p.rect_filled(rect, 0.0, S::BG);
        let message = match content.content_type {
            ContentType::WebApp => "Embedded web pages are not supported in the native player.",
            ContentType::Document => "Document playback is not available in the native player.",
            ContentType::Spreadsheet => {
                "Spreadsheet previews are not available in the native player."
            }
            ContentType::Presentation => {
                "Presentation previews are not available in the native player."
            }
            _ => "This content type cannot be embedded in the native player.",
        };
        let inner = rect.shrink(rect.width() * 0.1);
        let title =
            egui::Rect::from_min_max(inner.min, egui::pos2(inner.right(), inner.center().y));
        signage::text(&p, title, &content.name, 36.0 * S::scale(rect), S::TEXT);
        let detail =
            egui::Rect::from_min_max(egui::pos2(inner.left(), inner.center().y), inner.max);
        signage::text(&p, detail, message, 26.0 * S::scale(rect), S::MUTED);
    }

    pub fn truck_alert(ui: &mut egui::Ui, rect: egui::Rect, alert: &TruckScreenAlert) {
        let scale = S::scale(rect);
        let size = egui::vec2(
            (720.0 * scale).min(rect.width() - 32.0),
            (150.0 * scale).min(rect.height() * 0.25),
        );
        let card = egui::Align2::CENTER_TOP.align_size_within_rect(size, rect.shrink(24.0 * scale));
        let p = ui.painter_at(card);
        p.rect_filled(card, 10.0, S::SURFACE);
        p.rect_stroke(
            card,
            10.0,
            egui::Stroke::new(2.0, S::AMBER),
            egui::StrokeKind::Inside,
        );
        let inner = card.shrink(18.0 * scale);
        let title = egui::Rect::from_min_max(
            inner.min,
            egui::pos2(inner.right(), inner.top() + inner.height() * 0.6),
        );
        signage::text(
            &p,
            title,
            &format!("{}  /  {}", alert.truck_number, alert.status_label),
            30.0 * scale,
            S::AMBER,
        );
        let gate = alert
            .gate
            .as_ref()
            .map(|g| format!("Gate {}", g.to_uppercase()))
            .unwrap_or_else(|| "Yard".into());
        signage::text(
            &p,
            egui::Rect::from_min_max(egui::pos2(inner.left(), title.bottom()), inner.max),
            &gate,
            24.0 * scale,
            S::TEXT,
        );
    }

    pub fn marquee(ui: &mut egui::Ui, rect: egui::Rect, marquee: &MarqueeSettings, time: f64) {
        let scale = S::scale(rect);
        let height = 64.0 * scale;
        let bar = egui::Rect::from_min_max(
            rect.left_bottom() - egui::vec2(0.0, height),
            rect.right_bottom(),
        );
        let painter = ui.painter_at(bar);
        painter.rect_filled(
            bar,
            0.0,
            egui::Color32::from_rgba_unmultiplied(10, 12, 18, 220),
        );
        let galley = painter.layout_no_wrap(
            marquee.text.clone(),
            egui::FontId::proportional(28.0 * S::scale(rect)),
            S::AMBER,
        );
        let width = galley.size().x;
        let speed = marquee.speed.max(15) as f32;
        let loop_len = (rect.width() + width + 80.0).max(1.0);
        let offset = (time as f32 * speed) % loop_len;
        let position = egui::pos2(bar.right() - offset, bar.center().y);
        painter.text(
            position,
            egui::Align2::LEFT_CENTER,
            marquee.text.clone(),
            egui::FontId::proportional(28.0 * S::scale(rect)),
            S::AMBER,
        );
    }

    pub fn truck_gate_column(
        ui: &mut egui::Ui,
        rect: egui::Rect,
        gate: &str,
        trucks: &[ActiveTruck],
        store: &crate::state::GateStoreData,
        _content: &[ContentItem],
    ) {
        let p = ui.painter_at(rect);
        p.rect_filled(rect, 12.0, S::SURFACE);
        p.rect_stroke(
            rect,
            12.0,
            egui::Stroke::new(1.0, S::BORDER),
            egui::StrokeKind::Inside,
        );
        let scale = (rect.width() / 800.0)
            .min(rect.height() / 700.0)
            .clamp(0.4, 3.0);
        let pad = 24.0 * scale;
        let inner = rect.shrink(pad);
        let row = |top: f32, bottom: f32| {
            egui::Rect::from_min_max(
                egui::pos2(inner.left(), inner.top() + top * inner.height()),
                egui::pos2(inner.right(), inner.top() + bottom * inner.height()),
            )
        };
        signage::text(
            &p,
            row(0.0, 0.12),
            &format!("GATE {}", gate.to_uppercase()),
            28.0 * scale,
            S::BLUE,
        );
        let queue: Vec<_> = trucks
            .iter()
            .filter(|t| {
                !t.is_out
                    && t.gate_no
                        .as_deref()
                        .map(|g| g.eq_ignore_ascii_case(gate))
                        .unwrap_or(false)
            })
            .collect();
        let loading = store
            .gates
            .iter()
            .find(|g| g.number.eq_ignore_ascii_case(gate))
            .map(|g| g.loading_duration_mins)
            .unwrap_or(30);
        if let Some(current) = queue.first() {
            let (status, label) = truck_status_info(current);
            let color = if status == "loading" {
                S::GREEN
            } else if status == "waiting" {
                S::AMBER
            } else {
                S::MUTED
            };
            signage::text(
                &p,
                row(0.26, 0.51),
                &current.registration_number,
                76.0 * scale,
                S::TEXT,
            );
            signage::text(&p, row(0.54, 0.66), label, 30.0 * scale, color);
            let next = queue
                .get(1)
                .map(|n| format!("Next: {}", n.registration_number))
                .unwrap_or_else(|| format!("Queue empty  /  {loading} min loading"));
            signage::text(&p, row(0.72, 0.86), &next, 24.0 * scale, S::MUTED);
            signage::text(
                &p,
                row(0.9, 1.0),
                &format!("Queued: {}", queue.len().saturating_sub(1)),
                20.0 * scale,
                S::MUTED,
            );
        } else {
            signage::text(&p, row(0.3, 0.55), "GATE AVAILABLE", 50.0 * scale, S::TEXT);
            signage::text(
                &p,
                row(0.64, 0.8),
                &format!("Loading time {loading} min"),
                26.0 * scale,
                S::MUTED,
            );
        }
    }

    pub fn truck_status_info(truck: &ActiveTruck) -> (&'static str, &'static str) {
        if truck.is_out {
            ("out", "Loading out.")
        } else if truck.is_loading || truck.is_in {
            ("loading", "Loading in.")
        } else if truck.is_waiting {
            ("waiting", "Waiting")
        } else {
            ("registered", "Registered")
        }
    }
}

mod artists {
    use super::*;
    use crate::models::{ProductionTable, ProductionWidget};

    pub fn production_widget(
        ui: &mut egui::Ui,
        rect: egui::Rect,
        widget: &ProductionWidget,
        table: &ProductionTable,
    ) {
        let p = ui.painter_at(rect);
        let scale = S::scale(ui.ctx().content_rect())
            .min(rect.width() / 360.0)
            .min(rect.height() / 240.0)
            .max(0.4);
        p.rect_filled(rect, 10.0, S::SURFACE);
        p.rect_stroke(
            rect,
            10.0,
            egui::Stroke::new(1.0, S::BORDER),
            egui::StrokeKind::Inside,
        );
        let title = egui::Rect::from_min_max(
            rect.min + egui::vec2(20.0, 12.0) * scale,
            egui::pos2(rect.right() - 20.0 * scale, rect.top() + 56.0 * scale),
        );
        signage::text(&p, title, &widget.title, 28.0 * scale, S::TEXT);
        let series = aggregate(widget, table);
        if series.is_empty() {
            signage::text(
                &p,
                rect.shrink(50.0 * scale),
                "No data",
                24.0 * scale,
                S::MUTED,
            );
            return;
        }
        let plot = egui::Rect::from_min_max(
            rect.min + egui::vec2(24.0, 90.0) * scale,
            rect.max - egui::vec2(24.0, 55.0) * scale,
        );
        if !plot.is_positive() {
            return;
        }
        let maximum = series
            .iter()
            .map(|(_, v)| v.abs())
            .fold(0.0_f64, f64::max)
            .max(1.0);
        let count = series.len().min(12);
        let band = plot.width() / count.max(1) as f32;
        let has_negative = series.iter().take(count).any(|(_, v)| *v < 0.0);
        let base = if has_negative {
            plot.center().y
        } else {
            plot.bottom()
        };
        p.line_segment(
            [
                egui::pos2(plot.left(), base),
                egui::pos2(plot.right(), base),
            ],
            egui::Stroke::new(1.0, S::BORDER),
        );
        for (i, (label, value)) in series.iter().take(count).enumerate() {
            let color = widget
                .color_map
                .get(label)
                .and_then(|v| egui::Color32::from_hex(v).ok())
                .unwrap_or([S::BLUE, S::GREEN, S::AMBER][i % 3]);
            let h =
                (plot.height() * if has_negative { 0.5 } else { 1.0 } * (*value / maximum) as f32)
                    .abs();
            let x = plot.left() + i as f32 * band;
            let bar = egui::Rect::from_min_size(
                egui::pos2(x + band * 0.12, if *value < 0.0 { base } else { base - h }),
                egui::vec2(band * 0.65, h),
            );
            p.rect_filled(bar, 3.0, color);
            let value_rect = egui::Rect::from_min_size(
                egui::pos2(
                    x,
                    if *value < 0.0 {
                        bar.bottom()
                    } else {
                        bar.top() - 30.0 * scale
                    },
                ),
                egui::vec2(band, 26.0 * scale),
            );
            signage::text(
                &p,
                value_rect,
                &format!("{value:.0}"),
                22.0 * scale,
                S::TEXT,
            );
            let label_rect = egui::Rect::from_min_size(
                egui::pos2(x, plot.bottom() + 10.0 * scale),
                egui::vec2(band - 4.0, 36.0 * scale),
            );
            signage::text(&p, label_rect, label, 22.0 * scale, S::MUTED);
        }
    }

    fn aggregate(widget: &ProductionWidget, table: &ProductionTable) -> Vec<(String, f64)> {
        let Some(x_key) = &widget.x_key else {
            return Vec::new();
        };
        let mut values: HashMap<String, (f64, usize)> = HashMap::new();

        let filters_ok = |row: &serde_json::Map<String, serde_json::Value>| {
            widget.filters.iter().all(|filter| {
                row.get(&filter.key)
                    .map(|value| {
                        let text = if let Some(s) = value.as_str() {
                            s.to_string()
                        } else {
                            value.to_string().trim_matches('"').to_string()
                        };
                        match filter.op.as_str() {
                            "=" => text == filter.value,
                            "!=" => text != filter.value,
                            "contains" => text.contains(&filter.value),
                            "startsWith" => text.starts_with(&filter.value),
                            _ => true,
                        }
                    })
                    .unwrap_or(true)
            })
        };

        for row in &table.rows {
            if !filters_ok(row) {
                continue;
            }
            let group = row
                .get(x_key)
                .map(label_value)
                .unwrap_or_else(|| "—".to_string());
            let entry = values.entry(group).or_insert((0.0, 0));
            if let Some(measure) = &widget.measure_key {
                if let Some(cell) = row.get(measure) {
                    let parsed = cell
                        .as_f64()
                        .or_else(|| {
                            cell.as_str()
                                .and_then(|text| text.replace(',', "").trim().parse().ok())
                        })
                        .unwrap_or(0.0);
                    match widget.aggregation.as_str() {
                        "avg" => {
                            entry.0 += parsed;
                            entry.1 += 1;
                        }
                        "min" => entry.0 = entry.0.min(parsed).min(entry.0),
                        "max" => entry.0 = entry.0.max(parsed).max(entry.0),
                        _ => entry.0 += parsed,
                    }
                }
            } else {
                entry.0 += 1.0;
            }
        }

        let mut series: Vec<(String, f64)> = values
            .into_iter()
            .map(|(key, (sum, count))| {
                let value = match widget.aggregation.as_str() {
                    "avg" => {
                        if count.is_empty2() {
                            sum / (count as f64).max(1.0)
                        } else {
                            sum / (count as f64)
                        }
                    }
                    _ => sum,
                };
                (key, value)
            })
            .collect();
        series.sort_by(|a, b| a.0.cmp(&b.0));
        if let Some(top_n) = widget.top_n {
            series.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
            series.truncate(top_n.clamp(1, 24) as usize);
        }
        series
    }

    fn label_value(value: &serde_json::Value) -> String {
        match value {
            serde_json::Value::String(text) => text.clone(),
            serde_json::Value::Number(number) => number.to_string(),
            serde_json::Value::Bool(flag) => flag.to_string(),
            other => other.to_string().trim_matches('"').to_string(),
        }
    }

    /// Helper keeping integer semantics clear.
    trait IsEmptyFix {
        fn is_empty2(&self) -> bool;
    }
    impl IsEmptyFix for usize {
        fn is_empty2(&self) -> bool {
            false
        }
    }
}

use crate::theme;
use crate::ui::widgets;

#[cfg(any(test, debug_assertions))]
pub(crate) fn review_dashboard(
    ui: &mut egui::Ui,
    core: &Arc<AppCore>,
    rect: egui::Rect,
    dashboards: &mut Vec<crate::models::ProductionDashboard>,
) {
    render_dashboard_native(ui, core, rect, Some("dashboard".into()), dashboards);
}
#[cfg(any(test, debug_assertions))]
pub(crate) fn review_gate(ui: &mut egui::Ui, core: &Arc<AppCore>, rect: egui::Rect) {
    let trucks = crate::backend::trucks::get_active_trucks(&core.pool).unwrap();
    let store = crate::state::load_gate_store(&core.config_dir);
    let scale = S::scale(rect);
    let layout = PageLayout::new(
        rect.shrink(24.0 * scale),
        store.gates.len(),
        egui::vec2(540.0, 480.0) * scale,
        3,
        ui.input(|i| i.time),
        20.0 * scale,
    );
    for (offset, index) in layout.range.clone().enumerate() {
        painters::truck_gate_column(
            ui,
            layout.cell(offset),
            &store.gates[index].number,
            &trucks,
            &store,
            &[],
        );
    }
    signage::page_indicator(ui.painter(), rect, &layout, scale);
    if let Ok(marquee) = crate::backend::app_config::get_marquee_settings(core) {
        painters::marquee(ui, rect, &marquee, ui.input(|i| i.time));
    }
}

#[cfg(debug_assertions)]
pub(crate) fn review_alert(ui: &mut egui::Ui, rect: egui::Rect) {
    let alert:TruckScreenAlert=serde_json::from_value(serde_json::json!({
        "id":"review-alert","truck_id":"truck-0","truck_number":"MH 12 AB 4810","gate":"d1",
        "status":"loading","status_label":"Loading in.","changed_at":"2026-10-30T08:00:00Z","duration_secs":10
    })).unwrap();
    painters::truck_alert(ui, rect, &alert);
}
