use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use chrono::Local;
use tokio::sync::broadcast;

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
        let card = egui::Align2::CENTER_CENTER.anchor_size(rect.center(), egui::vec2(560.0, 440.0));
        ui.allocate_rect(card, egui::Sense::hover());
        egui::Frame::new()
            .fill(theme::CARD)
            .stroke(egui::Stroke::new(1.0, theme::STROKE))
            .inner_margin(egui::Margin::same(20))
            .corner_radius(10.0)
            .show(ui, |ui| {
                ui.vertical_centered(|ui| {
                    ui.label(
                        egui::RichText::new("Player preview")
                            .size(20.0)
                            .strong()
                            .color(theme::TEXT),
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
                                ui.horizontal(|ui| {
                                    ui.vertical(|ui| {
                                        ui.label(
                                            egui::RichText::new(screen.name.clone())
                                                .strong()
                                                .color(theme::TEXT),
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
                                                .button(egui::RichText::new("▶ Bind").strong())
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
        self.playlists =
            crate::backend::playlists::get_playlists(&core.pool).unwrap_or_default();
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
                .map(|(number, _)| (number.clone(), {
                    gate_store
                        .gates
                        .iter()
                        .find(|gate| &gate.number == number)
                        .cloned()
                        .unwrap_or_default()
                }))
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
                > Duration::from_secs(self.alert.as_ref().map(|alert| alert.duration_secs.max(3) as u64).unwrap_or(3))
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
                    self.record_analytics(core, content.as_ref(), "Complete", Some(duration_secs as f64));
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

        // Production dashboards render natively when configured.
        if purpose == "production_dashboard" {
            let dashboard_id = screen
                .as_ref()
                .and_then(|screen| screen.production_dashboard_id.clone())
                .or_else(|| self.dashboards.first().map(|d| d.id.clone()));
            render_dashboard_native(ui, core, rect, dashboard_id, &mut self.dashboards);
        } else if let Some(playlist) = playlist {
            self.draw_media(ui, core, &playlist, rect);
        } else if purpose == "truck_gate" {
            self.draw_truck_tokens(ui, core, rect);
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
            "✕",
            egui::FontId::proportional(16.0),
            egui::Color32::from_rgba_unmultiplied(180, 186, 200, 110),
        );
        ui.painter().text(
            rect.right_bottom() - egui::vec2(16.0, 14.0),
            egui::Align2::RIGHT_BOTTOM,
            Local::now().format("%H:%M").to_string(),
            egui::FontId::proportional(22.0),
            egui::Color32::from_rgba_unmultiplied(220, 226, 240, 140),
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
            self.textures.insert(key.clone(), image_texture(ui.ctx(), &key));
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
        if let Some(frame ) = self.video.as_ref().and_then(|decoder| decoder.try_take()) {
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
            ui.painter().text(
                rect.center(),
                egui::Align2::CENTER_CENTER,
                "▶",
                egui::FontId::proportional(64.0),
                egui::Color32::from_gray(120),
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
        let store = crate::state::load_gate_store(&core.config_dir);
        let trucks = self.active_trucks.clone();
        let content = Vec::new();
        let columns = gates.len();
        let width = rect.width() / columns as f32;

        for (index, gate) in gates.iter().enumerate() {
            let gate_rect = egui::Rect::from_min_size(
                rect.left_top() + egui::vec2(width * index as f32, 0.0),
                egui::vec2(width, rect.height()),
            );
            painters::truck_gate_column(ui, gate_rect, gate, &trucks, &store, &content);
        }
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
        let out_h = (((source_h as f64) * 960.0 / (source_w.max(1) as f64)) as u32)
            .max(2)
            & !1;

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

        Some(Self { stop, child: child_handle, sink })
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
    if source.x <= 0.0
        || source.y <= 0.0
        || max.x <= 0.0
        || max.y <= 0.0
    {
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
    Some(ctx.load_texture(format!("player-{path}"), color, egui::TextureOptions::default()))
}

// ── Production dashboard native renderer (read-only) ───────────────────────

fn render_dashboard_native(
    ui: &mut egui::Ui,
    core: &Arc<AppCore>,
    rect: egui::Rect,
    dashboard_id: Option<String>,
    dashboards: &mut Vec<crate::models::ProductionDashboard>,
) {
    ui.painter().rect_filled(rect, 0.0, egui::Color32::from_rgb(12, 14, 20));
    let Some(id) = dashboard_id else {
        ui.painter().text(
            rect.center(),
            egui::Align2::CENTER_CENTER,
            "No production dashboard bound to this screen",
            egui::FontId::proportional(22.0),
            egui::Color32::from_gray(110),
        );
        return;
    };
    let Ok(bundle) = crate::backend::production::get_production_dashboard(core, id) else {
        ui.painter().text(
            rect.center(),
            egui::Align2::CENTER_CENTER,
            "Dashboard data unavailable",
            egui::FontId::proportional(20.0),
            egui::Color32::from_gray(110),
        );
        return;
    };
    let _ = dashboards;

    let title = bundle.dashboard.name.clone();
    ui.painter().text(
        rect.left_top() + egui::vec2(24.0, 30.0),
        egui::Align2::LEFT_TOP,
        title,
        egui::FontId::proportional(26.0),
        ui.visuals().text_color(),
    );

    let columns = 12.0;
    let cell_w = rect.width() / columns;
    let layout = bundle.dashboard.layout.as_object().cloned().unwrap_or_default();
    let grid_columns = layout
        .get("columns")
        .and_then(|value| value.as_f64())
        .unwrap_or(12.0)
        .max(4.0);
    let _ = columns;

    let widgets = bundle.dashboard.widgets.clone();
    let rows = bundle
        .dataset
        .selected_table_id
        .as_ref()
        .and_then(|table_id| {
            bundle
                .dataset
                .tables
                .iter()
                .find(|table| &table.id == table_id)
                .cloned()
        });
    let Some(table) = rows else {
        return;
    };

    // Simple stacked layout: each widget takes a 6-grid-column half unless
    // there is a single widget, then full width.
    let mut offset_x = 0.0;
    let mut offset_y = 70.0;
    let area_width = rect.width() - 48.0;
    for widget in &widgets {
        let span = if widgets.len() == 1 {
            area_width
        } else {
            (cell_w * grid_columns as f32 * 0.5 - 12.0).max(240.0)
        };
        if offset_x + span > area_width + 1.0 {
            offset_x = 0.0;
            offset_y += 260.0;
        }
        let widget_rect = egui::Rect::from_min_size(
            rect.min + egui::vec2(24.0 + offset_x, offset_y),
            egui::vec2(span, 230.0),
        );
        artists::production_widget(ui, widget_rect, widget, &table);
        offset_x += span + 12.0;
        if offset_y + 260.0 > rect.height() - 70.0 {
            break;
        }
    }
}

// ── Painter-based material widgets ─────────────────────────────────────────

mod painters {
    use super::*;

    pub fn idle_message(ui: &mut egui::Ui, rect: egui::Rect) {
        ui.painter().text(
            rect.center(),
            egui::Align2::CENTER_CENTER,
            "No active content — assign a playlist or default content to this screen.",
            egui::FontId::proportional(20.0),
            egui::Color32::from_gray(120),
        );
    }

    pub fn missing(ui: &mut egui::Ui, rect: egui::Rect, content: &ContentItem) {
        ui.painter().rect_filled(
            rect.shrink2(egui::vec2(40.0, 40.0)),
            10.0,
            egui::Color32::from_gray(24),
        );
        ui.painter().text(
            rect.center(),
            egui::Align2::CENTER_CENTER,
            format!("{}\n(content file missing)", content.name),
            egui::FontId::proportional(18.0),
            egui::Color32::from_gray(110),
        );
    }

    pub fn static_content(ui: &mut egui::Ui, rect: egui::Rect, content: &ContentItem) {
        ui.painter()
            .rect_filled(rect, 0.0, egui::Color32::from_rgb(12, 14, 20));
        let message = match content.content_type {
            ContentType::WebApp => "Embedded web pages are not supported in the native player.",
            ContentType::Document => "Documents render on the web player; native preview coming soon.",
            ContentType::Spreadsheet => "Spreadsheet previews are not native yet.",
            ContentType::Presentation => "Presentation previews are not native yet.",
            _ => "This content type cannot be embedded in the native player.",
        };
        ui.painter().text(
            rect.center() - egui::vec2(0.0, 24.0),
            egui::Align2::CENTER_CENTER,
            content.name.clone(),
            egui::FontId::proportional(26.0),
            egui::Color32::from_gray(200),
        );
        ui.painter().text(
            rect.center() + egui::vec2(0.0, 24.0),
            egui::Align2::CENTER_CENTER,
            message,
            egui::FontId::proportional(15.0),
            egui::Color32::from_gray(120),
        );
        if let Some(url) = &content.url {
            if !url.is_empty() {
                ui.painter().text(
                    rect.center() + egui::vec2(0.0, 64.0),
                    egui::Align2::CENTER_CENTER,
                    url.clone(),
                    egui::FontId::monospace(12.0),
                    egui::Color32::from_gray(90),
                );
            }
        }
    }

    pub fn truck_alert(ui: &mut egui::Ui, rect: egui::Rect, alert: &TruckScreenAlert) {
        let card = egui::Align2::CENTER_TOP
            .anchor_size(rect.center_top(), egui::vec2(460.0, 110.0))
            .translate(egui::vec2(0.0, 36.0));
        let painter = ui.painter();
        painter.rect_filled(card, 12.0, egui::Color32::from_rgb(30, 22, 10));
        painter.rect_stroke(
            card,
            12.0,
            egui::Stroke::new(2.0, crate::theme::AMBER),
            egui::StrokeKind::Outside,
        );
        painter.text(
            card.min + egui::vec2(20.0, 26.0),
            egui::Align2::LEFT_TOP,
            format!("🚚 {} — {}", alert.truck_number, alert.status_label),
            egui::FontId::proportional(22.0),
            egui::Color32::from_rgb(255, 214, 143),
        );
        painter.text(
            card.min + egui::vec2(20.0, 64.0),
            egui::Align2::LEFT_TOP,
            alert
                .gate
                .as_ref()
                .map(|gate| format!("Gate {}", gate.to_uppercase()))
                .unwrap_or_else(|| "Yard".to_string()),
            egui::FontId::proportional(14.0),
            egui::Color32::from_gray(150),
        );
    }

    pub fn marquee(ui: &mut egui::Ui, rect: egui::Rect, marquee: &MarqueeSettings, time: f64) {
        let height = 48.0;
        let bar =
            egui::Rect::from_min_max(rect.left_bottom() - egui::vec2(0.0, height), rect.right_bottom());
        let painter = ui.painter();
        painter.rect_filled(bar, 0.0, egui::Color32::from_rgba_unmultiplied(10, 12, 18, 220));
        let galley = painter.layout_no_wrap(
            marquee.text.clone(),
            egui::FontId::proportional(24.0),
            egui::Color32::from_rgb(255, 219, 139),
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
            egui::FontId::proportional(24.0),
            egui::Color32::from_rgb(255, 219, 139),
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
        let painter = ui.painter();
        painter.rect_filled(rect, 0.0, egui::Color32::from_rgb(10, 12, 17));
        painter.rect_stroke(
            rect,
            0.0,
            egui::Stroke::new(1.0, egui::Color32::from_gray(45)),
            egui::StrokeKind::Inside,
        );

        let queue: Vec<&ActiveTruck> = trucks
            .iter()
            .filter(|truck| !truck.is_out && truck.gate_no.as_deref().map(|g| g.eq_ignore_ascii_case(gate)).unwrap_or(false))
            .collect();

        painter.text(
            rect.min + egui::vec2(24.0, 30.0),
            egui::Align2::LEFT_TOP,
            format!("GATE {}", gate.to_uppercase()),
            egui::FontId::proportional(20.0),
            egui::Color32::from_rgb(120, 160, 255),
        );

        let loading_mins = store
            .gates
            .iter()
            .find(|gatecfg| gatecfg.number.eq_ignore_ascii_case(gate))
            .map(|gatecfg| gatecfg.loading_duration_mins)
            .unwrap_or(30);

        match queue.first() {
            Some(current) => {
                let (status, label) = painters::truck_status_info(current);
                let label_color = match status {
                    "loading" => egui::Color32::from_rgb(120, 220, 160),
                    "waiting" => egui::Color32::from_rgb(255, 197, 110),
                    "out" => egui::Color32::from_gray(150),
                    _ => egui::Color32::from_gray(190),
                };
                painter.text(
                    rect.center() - egui::vec2(0.0, 30.0),
                    egui::Align2::CENTER_CENTER,
                    current.registration_number.clone(),
                    egui::FontId::proportional(64.0),
                    egui::Color32::WHITE,
                );
                painter.text(
                    rect.center() + egui::vec2(0.0, 44.0),
                    egui::Align2::CENTER_CENTER,
                    label,
                    egui::FontId::proportional(20.0),
                    label_color,
                );
                let next = queue.get(1).map(|next| format!("Next: {}", next.registration_number))
                    .unwrap_or_else(|| format!("Queue empty · {loading_mins} min loading"));
                painter.text(
                    rect.center() + egui::vec2(0.0, 92.0),
                    egui::Align2::CENTER_CENTER,
                    next,
                    egui::FontId::proportional(17.0),
                    egui::Color32::from_gray(140),
                );
                painter.text(
                    egui::pos2(rect.left() + 24.0, rect.bottom() - 24.0),
                    egui::Align2::LEFT_BOTTOM,
                    format!("Queued: {}", queue.len().saturating_sub(1)),
                    egui::FontId::proportional(14.0),
                    egui::Color32::from_gray(110),
                );
            }
            None => {
                painter.text(
                    rect.center() - egui::vec2(0.0, 30.0),
                    egui::Align2::CENTER_CENTER,
                    "NO TRUCK",
                    egui::FontId::proportional(44.0),
                    egui::Color32::from_gray(60),
                );
                painter.text(
                    rect.center() + egui::vec2(0.0, 44.0),
                    egui::Align2::CENTER_CENTER,
                    format!("Loading time {loading_mins} min"),
                    egui::FontId::proportional(16.0),
                    egui::Color32::from_gray(100),
                );
            }
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
        let painter = ui.painter();
        painter.rect_filled(rect, 8.0, egui::Color32::from_rgb(22, 26, 38));
        painter.rect_stroke(
            rect,
            8.0,
            egui::Stroke::new(1.0, egui::Color32::from_gray(52)),
            egui::StrokeKind::Outside,
        );
        painter.text(
            rect.min + egui::vec2(14.0, 24.0),
            egui::Align2::LEFT_CENTER,
            widget.title.clone(),
            egui::FontId::proportional(16.0),
            egui::Color32::from_gray(200),
        );

        let series = aggregate(widget, table);
        if series.is_empty() {
            painter.text(
                rect.center() + egui::vec2(0.0, 10.0),
                egui::Align2::CENTER_CENTER,
                "No data",
                egui::FontId::proportional(14.0),
                egui::Color32::from_gray(90),
            );
            return;
        }

        let max_value = series
            .iter()
            .map(|(_, value)| *value)
            .fold(0.0f64, f64::max)
            .max(1.0);
        let plot_rect = egui::Rect::from_min_max(
            rect.min + egui::vec2(20.0, 54.0),
            rect.max - egui::vec2(20.0, 26.0),
        );
        let bars = series.len().min(12);
        let bar_width = plot_rect.width() / bars.max(1) as f32 * 0.7;

        for (index, (label, value)) in series.iter().take(bars).enumerate() {
            let shade = egui::Color32::from_rgba_unmultiplied(
                92 + (index * 22) as u8 % 120,
                150,
                246 - (index * 14) as u8 % 90,
                255,
            );
            let height = plot_rect.height() * (value / max_value) as f32;
            let bar_rect = egui::Rect::from_min_size(
                egui::pos2(
                    plot_rect.left() + index as f32 * (plot_rect.width() / bars.max(1) as f32),
                    plot_rect.bottom() - height,
                ),
                egui::vec2(bar_width, height),
            );
            painter.rect_filled(bar_rect, 3.0, shade);
            painter.text(
                egui::pos2(bar_rect.center().x, plot_rect.bottom() + 10.0),
                egui::Align2::CENTER_TOP,
                label.clone(),
                egui::FontId::proportional(10.0),
                egui::Color32::from_gray(150),
            );
            painter.text(
                egui::pos2(bar_rect.center().x, bar_rect.top() - 6.0),
                egui::Align2::CENTER_BOTTOM,
                format!("{:.0}", value),
                egui::FontId::proportional(10.5),
                egui::Color32::from_gray(190),
            );
        }
    }

    fn aggregate(widget: &ProductionWidget, table: &ProductionTable) -> Vec<(String, f64)> {
        let Some(x_key) = &widget.x_key else { return Vec::new() };
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
