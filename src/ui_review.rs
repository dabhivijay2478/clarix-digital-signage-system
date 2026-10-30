//! Development-only visual review. Uses disposable fixtures, never the user's data.
use super::*;
use crate::models::*;
use crate::ui::signage::SignageStyle as S;

const PAGES: [Page; 13] = [
    Page::Dashboard,
    Page::Screens,
    Page::Content,
    Page::Playlists,
    Page::Schedule,
    Page::Trucks,
    Page::Marquee,
    Page::Production,
    Page::Analytics,
    Page::Database,
    Page::Settings,
    Page::Team,
    Page::Player,
];

fn session() -> AuthSession {
    AuthSession {
        token: "ui-review-token".into(),
        expires_at: chrono::Utc::now() + chrono::Duration::days(1),
        user: AuthUser {
            id: "reviewer".into(),
            name: "Alex Morgan".into(),
            email: "alex@example.test".into(),
            role: AdminRole::SuperAdmin,
            is_developer: true,
            created_at: chrono::Utc::now(),
        },
    }
}

fn fixture(populated: bool) -> Arc<AppCore> {
    let path = std::env::temp_dir().join(format!("clarix-ui-review-{}", uuid::Uuid::new_v4()));
    let pool = crate::db::init_db(path.to_str().unwrap()).unwrap();
    let core = Arc::new(AppCore::new(
        pool,
        path,
        Arc::new(tokio::runtime::Runtime::new().unwrap()),
    ));
    let conn = core.pool.get().unwrap();
    // The seeded environment account stays out of screenshots and fixtures.
    conn.execute_batch("DELETE FROM sessions; DELETE FROM users;")
        .unwrap();
    let now = chrono::Utc::now().to_rfc3339();
    let expiry = (chrono::Utc::now() + chrono::Duration::days(1)).to_rfc3339();
    conn.execute("INSERT INTO users(id,name,email,password_hash,role,is_developer,created_at,updated_at) VALUES('reviewer','Alex Morgan','alex@example.test','unused','SuperAdmin',1,?1,?1)",[&now]).unwrap();
    conn.execute("INSERT INTO sessions(id,user_id,token,created_at,expires_at) VALUES('review-session','reviewer','ui-review-token',?1,?2)",rusqlite::params![now,expiry]).unwrap();
    conn.execute(
        "UPDATE device_settings SET display_name='Clarix Operations',content_library_path=?1",
        [core
            .config_dir
            .join("library")
            .to_string_lossy()
            .to_string()],
    )
    .unwrap();
    if populated {
        conn.execute("INSERT INTO playlists(id,name,created_at) VALUES('playlist','Warehouse daily briefing',?1)",[&now]).unwrap();
        for (i, name) in [
            "Warehouse entrance",
            "Dispatch gate D1",
            "Production floor: assembly and quality control",
        ]
        .iter()
        .enumerate()
        {
            conn.execute("INSERT INTO screens(id,name,location,created_at,playlist_id) VALUES(?1,?2,'Main operations building',?3,'playlist')",rusqlite::params![format!("screen-{i}"),name,now]).unwrap();
        }
        for (i, (name, kind)) in [
            ("Safety briefing", "Video"),
            ("Shift overview and daily production goals", "Image"),
            ("Operations dashboard", "Spreadsheet"),
            ("Company announcements", "WebApp"),
        ]
        .iter()
        .enumerate()
        {
            conn.execute("INSERT INTO content_items(id,name,content_type,duration_secs,created_at) VALUES(?1,?2,?3,30,?4)",rusqlite::params![format!("content-{i}"),name,kind,now]).unwrap();
            conn.execute("INSERT INTO playlist_items(id,playlist_id,content_id,order_index) VALUES(?1,'playlist',?2,?3)",rusqlite::params![format!("item-{i}"),format!("content-{i}"),i]).unwrap();
        }
        conn.execute("INSERT INTO schedule_slots(id,name,playlist_id,start_time,duration_mins,created_at) VALUES('slot','Morning shift','playlist','08:00:00',480,?1)",[&now]).unwrap();
        for i in 0..8 {
            conn.execute("INSERT INTO active_trucks(id,registration_number,gate_no,waiting_at,created_at,order_index) VALUES(?1,?2,?3,?4,?4,?5)",rusqlite::params![format!("truck-{i}"),format!("MH 12 AB {}",4810+i),format!("d{}",i%2+1),now,i]).unwrap();
        }
        for (i, event) in ["Impression", "Play", "Complete", "Skip"]
            .iter()
            .enumerate()
        {
            for j in 0..(i + 1) * 4 {
                conn.execute("INSERT INTO analytics_events(id,screen_id,content_id,event_type,timestamp,dwell_secs) VALUES(?1,'screen-0','content-0',?2,?3,24.0)",rusqlite::params![format!("event-{i}-{j}"),event,now]).unwrap();
            }
        }
        let tables = serde_json::json!([{"id":"table","name":"Production","sheet_name":"Daily","kind":"production","columns":[{"key":"Line","label":"Line","data_type":"string"},{"key":"Units","label":"Units","data_type":"number"}],"rows":[{"Line":"Assembly","Units":240},{"Line":"Packing","Units":180},{"Line":"Quality","Units":220}]}]);
        assert!(serde_json::from_value::<Vec<ProductionTable>>(tables.clone()).is_ok());
        conn.execute("INSERT INTO production_datasets(id,name,source_name,selected_table_id,tables_json,created_at,updated_at) VALUES('dataset','Daily production','production.csv','table',?1,?2,?2)",rusqlite::params![tables.to_string(),now]).unwrap();
        let widgets: Vec<ProductionWidget> = (0..9)
            .map(|i| ProductionWidget {
                id: format!("widget-{i}"),
                title: format!("Production by line / shift {}", i + 1),
                widget_type: "chart".into(),
                chart_type: "bar".into(),
                source_table_id: "table".into(),
                x_key: Some("Line".into()),
                series_keys: vec![],
                measure_key: Some("Units".into()),
                group_by_key: None,
                aggregation: "sum".into(),
                filters: vec![],
                top_n: None,
                color_map: std::collections::HashMap::from([("Assembly".into(), "#62E5AB".into())]),
            })
            .collect();
        conn.execute("INSERT INTO production_dashboards(id,name,dataset_id,widgets_json,layout_json,created_at,updated_at) VALUES('dashboard','Production performance','dataset',?1,'{\"columns\":12}',?2,?2)",rusqlite::params![serde_json::to_string(&widgets).unwrap(),now]).unwrap();
        conn.execute("UPDATE marquee_settings SET enabled=1,text='Safety first. Keep dispatch lanes clear and follow your gate assignment.'",[]).unwrap();
        let gates = crate::state::GateStoreData {
            gates: (1..=4)
                .map(|i| crate::state::GateConfig {
                    number: format!("d{i}"),
                    purpose: "truck_gate".into(),
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        };
        crate::state::save_gate_store(&core.config_dir, &gates).unwrap();
    }
    drop(conn);
    core
}

fn app(core: Arc<AppCore>) -> ClarixApp {
    ClarixApp {
        core,
        session: Some(session()),
        page: Page::Dashboard,
        toasts: vec![],
        identity_cache: None,
        last_identity_fetch: Instant::now(),
        appearance: theme::AppearancePreference::Dark,
        navigation_open: false,
        login: Default::default(),
        dashboard: Default::default(),
        screens: Default::default(),
        content: Default::default(),
        playlists: Default::default(),
        schedule: Default::default(),
        trucks: Default::default(),
        marquee: Default::default(),
        analytics: Default::default(),
        database: Default::default(),
        settings: Default::default(),
        team: Default::default(),
        production: Default::default(),
        player: Default::default(),
    }
}

#[cfg(test)]
#[test]
fn every_management_page_fits_desktop_widths_in_both_themes() {
    for populated in [false, true] {
        let core = fixture(populated);
        let path = core.config_dir.clone();
        for theme in [egui::Theme::Light, egui::Theme::Dark] {
            for (width, height) in [
                (800.0, 600.0),
                (1024.0, 640.0),
                (1280.0, 800.0),
                (1920.0, 1080.0),
            ] {
                for scale in [1.0, 1.25, 2.0] {
                    let ctx = egui::Context::default();
                    theme::apply(&ctx);
                    ctx.set_theme(theme);
                    for page in PAGES {
                        let mut app = app(core.clone());
                        app.page = page;
                        for frame in 0..3 {
                            let mut raw = egui::RawInput {
                                screen_rect: Some(egui::Rect::from_min_size(
                                    egui::Pos2::ZERO,
                                    egui::vec2(width, height),
                                )),
                                time: Some(frame as f64 / 60.0),
                                ..Default::default()
                            };
                            raw.viewports
                                .get_mut(&egui::ViewportId::ROOT)
                                .unwrap()
                                .native_pixels_per_point = Some(scale);
                            let mut output = ctx.run_ui(raw, |ui| {
                                if page == Page::Player {
                                    app.player.show(ui, &app.core);
                                } else {
                                    app.draw_admin_layout(ui);
                                }
                                assert!(
                                    ui.min_rect().right() <= width + 1.0,
                                    "{page:?} {theme:?} populated={populated} width={width}: {:?}",
                                    ui.min_rect()
                                );
                            });
                            output.textures_delta.clear();
                        }
                    }
                }
            }
        }
        drop(core);
        remove_fixture(&path);
    }
}

// Invoke with cargo run -- --ui-review. Only compiled in development builds.
#[cfg(debug_assertions)]
pub(super) fn run() {
    let core = fixture(true);
    let path = core.config_dir.clone();
    let mut scenes = Vec::new();
    for theme in [egui::Theme::Light, egui::Theme::Dark] {
        for size in [
            (800.0, 600.0),
            (1024.0, 640.0),
            (1280.0, 800.0),
            (1920.0, 1080.0),
        ] {
            for scale in [1.0, 1.25, 2.0] {
                for scene in 0..17 {
                    scenes.push((theme, size, scene, scale));
                }
            }
        }
    }
    for size in [(1080.0, 1920.0), (3840.0, 2160.0)] {
        for scene in 14..17 {
            scenes.push((egui::Theme::Dark, size, scene, 1.0));
        }
    }
    if std::env::args().any(|arg| arg == "--signage-only") {
        scenes.retain(|(_, _, scene, _)| *scene >= 14);
    }
    let args: Vec<_> = std::env::args().collect();
    if let Some(filter) = args
        .windows(2)
        .find(|w| w[0] == "--only")
        .map(|w| w[1].clone())
    {
        scenes.retain(|(_, _, scene, _)| {
            filter.split(',').any(|name| {
                if *scene >= 14 {
                    name == "Signage"
                } else if *scene == 0 {
                    name == "Login"
                } else {
                    name == PAGES[*scene - 1].title()
                }
            })
        });
    }
    let output = std::path::PathBuf::from("target/ui-review");
    std::fs::create_dir_all(&output).unwrap();
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("Clarix visual review (demo data)")
            .with_inner_size([800.0, 600.0]),
        ..Default::default()
    };
    eframe::run_native(
        "Clarix visual review",
        options,
        Box::new(move |cc| {
            theme::apply(&cc.egui_ctx);
            Ok(Box::new(Review {
                app: app(core),
                scenes,
                index: 0,
                frames: 0,
                captured: Arc::new(std::sync::atomic::AtomicBool::new(false)),
                pending: false,
                output,
            }))
        }),
    )
    .unwrap();
    remove_fixture(&path);
}
#[cfg(debug_assertions)]
struct Review {
    app: ClarixApp,
    scenes: Vec<(egui::Theme, (f32, f32), usize, f32)>,
    index: usize,
    frames: usize,
    captured: Arc<std::sync::atomic::AtomicBool>,
    pending: bool,
    output: std::path::PathBuf,
}
#[cfg(debug_assertions)]
impl eframe::App for Review {
    fn ui(&mut self, ui: &mut Ui, _frame: &mut eframe::Frame) {
        use std::sync::atomic::Ordering;
        let ctx = ui.ctx().clone();
        if self.pending && self.captured.load(Ordering::Acquire) {
            self.pending = false;
            self.index += 1;
            self.frames = 0;
        }
        if self.index >= self.scenes.len() {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
            return;
        }
        let (theme, (width, height), scene, scale) = self.scenes[self.index];
        ctx.set_theme(theme);
        self.app.appearance = if theme == egui::Theme::Light {
            theme::AppearancePreference::Light
        } else {
            theme::AppearancePreference::Dark
        };
        if self.frames < 3 {
            ctx.set_pixels_per_point(scale);
            ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(egui::vec2(width, height)));
        }
        let name = if scene == 0 {
            egui::CentralPanel::default()
                .frame(egui::Frame::new().fill(theme::tokens(ui).bg))
                .show(ui, |ui| {
                    self.app
                        .login
                        .show(ui, &self.app.core, &mut self.app.appearance);
                });
            "Login".to_string()
        } else if scene <= 13 {
            self.app.page = PAGES[scene - 1];
            if self.app.page == Page::Player {
                egui::CentralPanel::default()
                    .frame(egui::Frame::new().fill(theme::tokens(ui).bg))
                    .show(ui, |ui| self.app.player.show(ui, &self.app.core));
            } else {
                self.app.draw_admin_layout(ui);
            }
            self.app.page.title().to_string()
        } else {
            egui::CentralPanel::default()
                .frame(egui::Frame::new().fill(S::BG))
                .show(ui, |ui| {
                    let rect = ui.available_rect_before_wrap();
                    if scene == 14 {
                        let mut dashboards = vec![];
                        crate::ui::player::review_dashboard(
                            ui,
                            &self.app.core,
                            rect,
                            &mut dashboards,
                        );
                    } else {
                        crate::ui::player::review_gate(ui, &self.app.core, rect);
                        if scene == 16 {
                            crate::ui::player::review_alert(ui, rect);
                        }
                    }
                });
            format!("Signage-{scene}")
        };
        self.frames += 1;
        if self.frames >= 8 && !self.pending {
            self.pending = true;
            self.captured.store(false, Ordering::Release);
            let complete = self.captured.clone();
            let file = self.output.join(format!(
                "{theme:?}-{width:.0}x{height:.0}@{scale:.2}-{name}.png"
            ));
            ctx.request_screenshot(move |image| {
                let bytes: Vec<u8> = image.pixels.iter().flat_map(|c| c.to_array()).collect();
                image::save_buffer(
                    &file,
                    &bytes,
                    image.size[0] as u32,
                    image.size[1] as u32,
                    image::ColorType::Rgba8,
                )
                .unwrap();
                println!(
                    "Captured {} ({}x{})",
                    file.display(),
                    image.size[0],
                    image.size[1]
                );
                complete.store(true, Ordering::Release);
            });
        }
        ctx.request_repaint();
    }
}

#[cfg(test)]
mod interactions {
    use super::*;
    fn render(
        ctx: &egui::Context,
        app: &mut ClarixApp,
        events: Vec<egui::Event>,
    ) -> egui::FullOutput {
        ctx.run_ui(
            egui::RawInput {
                screen_rect: Some(egui::Rect::from_min_size(
                    egui::Pos2::ZERO,
                    egui::vec2(800.0, 600.0),
                )),
                events,
                ..Default::default()
            },
            |ui| app.draw_admin_layout(ui),
        )
    }
    fn point(output: &egui::FullOutput, label: &str) -> egui::Pos2 {
        output
            .shapes
            .iter()
            .find_map(|s| {
                if let egui::Shape::Text(t) = &s.shape {
                    if t.galley.job.text.trim() == label {
                        Some(t.pos + t.galley.rect.center().to_vec2())
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .unwrap_or_else(|| panic!("No visible button labelled {label}"))
    }
    fn click(ctx: &egui::Context, app: &mut ClarixApp, at: egui::Pos2) -> egui::FullOutput {
        let mut down = render(
            ctx,
            app,
            vec![
                egui::Event::PointerMoved(at),
                egui::Event::PointerButton {
                    pos: at,
                    button: egui::PointerButton::Primary,
                    pressed: true,
                    modifiers: Default::default(),
                },
            ],
        );
        down.textures_delta.clear();
        render(
            ctx,
            app,
            vec![egui::Event::PointerButton {
                pos: at,
                button: egui::PointerButton::Primary,
                pressed: false,
                modifiers: Default::default(),
            }],
        )
    }
    #[test]
    fn main_creation_dialogs_open_and_appearance_changes_through_real_controls() {
        let core = fixture(true);
        let path = core.config_dir.clone();
        for (page, button, title) in [
            (Page::Screens, "+ Add screen", "Add screen"),
            (Page::Content, "Add web URL", "Add web content"),
            (Page::Playlists, "+ New playlist", "New playlist"),
            (Page::Schedule, "+ Add Schedule Slot", "New Schedule Slot"),
            (Page::Trucks, "+ Add Truck", "Add new truck"),
        ] {
            let ctx = egui::Context::default();
            theme::apply(&ctx);
            ctx.set_theme(egui::Theme::Dark);
            let mut app = app(core.clone());
            app.page = page;
            let mut output = render(&ctx, &mut app, vec![]);
            output.textures_delta.clear();
            output = render(&ctx, &mut app, vec![]);
            let at = point(&output, button);
            output.textures_delta.clear();
            output = click(&ctx, &mut app, at);
            output.textures_delta.clear();
            output = render(&ctx, &mut app, vec![]);
            let found = output.shapes.iter().any(
                |s| matches!(&s.shape,egui::Shape::Text(t) if t.galley.job.text.contains(title)),
            );
            output.textures_delta.clear();
            assert!(found, "{page:?}: clicking {button} should open {title}");
        }
        let ctx = egui::Context::default();
        theme::apply(&ctx);
        ctx.set_theme(egui::Theme::Dark);
        let mut app = app(core.clone());
        app.page = Page::Settings;
        let mut output = render(&ctx, &mut app, vec![]);
        output.textures_delta.clear();
        output = render(&ctx, &mut app, vec![]);
        let at = point(&output, "Light");
        output.textures_delta.clear();
        output = click(&ctx, &mut app, at);
        output.textures_delta.clear();
        assert_eq!(app.appearance, theme::AppearancePreference::Light);
        assert_eq!(ctx.theme(), egui::Theme::Light);
        drop(app);
        drop(core);
        remove_fixture(&path);
    }
    #[test]
    fn signage_rendering_is_identical_in_light_and_dark_desktop_themes() {
        use std::hash::{Hash, Hasher};
        let core = fixture(true);
        let path = core.config_dir.clone();
        for size in [
            egui::vec2(1920.0, 1080.0),
            egui::vec2(1080.0, 1920.0),
            egui::vec2(3840.0, 2160.0),
        ] {
            for time in [0.0, 10.0, 20.0] {
                let mut signatures = vec![];
                for appearance in [egui::Theme::Light, egui::Theme::Dark] {
                    let ctx = egui::Context::default();
                    theme::apply(&ctx);
                    ctx.set_theme(appearance);
                    let mut output = ctx.run_ui(
                        egui::RawInput {
                            screen_rect: Some(egui::Rect::from_min_size(egui::Pos2::ZERO, size)),
                            time: Some(time),
                            ..Default::default()
                        },
                        |ui| {
                            crate::ui::player::review_dashboard(
                                ui,
                                &core,
                                ui.max_rect(),
                                &mut vec![],
                            );
                        },
                    );
                    let meshes =
                        ctx.tessellate(std::mem::take(&mut output.shapes), output.pixels_per_point);
                    let mut hash = std::collections::hash_map::DefaultHasher::new();
                    for primitive in meshes {
                        if let egui::epaint::Primitive::Mesh(mesh) = primitive.primitive {
                            for vertex in mesh.vertices {
                                vertex.pos.x.to_bits().hash(&mut hash);
                                vertex.pos.y.to_bits().hash(&mut hash);
                                vertex.color.to_array().hash(&mut hash);
                            }
                        }
                    }
                    signatures.push(hash.finish());
                    output.textures_delta.clear();
                }
                assert_eq!(
                    signatures[0], signatures[1],
                    "Signage inherited desktop theme at {size:?} time={time}"
                );
            }
        }
        drop(core);
        remove_fixture(&path);
    }
}

fn remove_fixture(path: &std::path::Path) {
    let root = std::env::temp_dir().canonicalize().unwrap();
    let resolved = path.canonicalize().unwrap();
    assert!(
        resolved.starts_with(root)
            && resolved
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("clarix-ui-review-")
    );
    std::fs::remove_dir_all(resolved).unwrap();
}
