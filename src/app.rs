use std::sync::Arc;
use std::time::Instant;

use eframe::Storage;
use egui::Ui;

use crate::models::{AdminRole, AuthSession, AuthUser, DeviceIdentity};
use crate::state::AppCore;
use crate::theme;
use crate::ui;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Page {
    Dashboard,
    Screens,
    Content,
    Playlists,
    Schedule,
    Trucks,
    Marquee,
    Production,
    Analytics,
    Database,
    Settings,
    Team,
    Player,
}

impl Page {
    pub fn title(self) -> &'static str {
        match self {
            Page::Dashboard => "Dashboard",
            Page::Screens => "Screens",
            Page::Content => "Content",
            Page::Playlists => "Playlists",
            Page::Schedule => "Schedule",
            Page::Trucks => "Trucks",
            Page::Marquee => "Marquee",
            Page::Production => "Production",
            Page::Analytics => "Analytics",
            Page::Database => "Database",
            Page::Settings => "Settings",
            Page::Team => "Team",
            Page::Player => "Player",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToastKind {
    Success,
    Error,
    Info,
}

pub struct Toast {
    pub kind: ToastKind,
    pub text: String,
    pub created: Instant,
}

impl Toast {
    pub fn new(kind: ToastKind, text: impl Into<String>) -> Self {
        Self { kind, text: text.into(), created: Instant::now() }
    }
}

pub struct ClarixApp {
    pub core: Arc<AppCore>,
    pub session: Option<AuthSession>,
    pub page: Page,
    pub toasts: Vec<Toast>,
    pub identity_cache: Option<DeviceIdentity>,
    last_identity_fetch: Instant,

    pub login: ui::login::LoginPage,
    pub dashboard: ui::dashboard::DashboardPage,
    pub screens: ui::screens::ScreensPage,
    pub content: ui::content::ContentPage,
    pub playlists: ui::playlists::PlaylistsPage,
    pub schedule: ui::schedule::SchedulePage,
    pub trucks: ui::trucks::TrucksPage,
    pub marquee: ui::marquee::MarqueePage,
    pub analytics: ui::analytics::AnalyticsPage,
    pub database: ui::database_view::DatabasePage,
    pub settings: ui::settings::SettingsPage,
    pub team: ui::team::TeamPage,
    pub production: ui::production::ProductionPage,
    pub player: ui::player::PlayerPage,
}

impl ClarixApp {
    pub fn new(cc: &eframe::CreationContext<'_>, core: Arc<AppCore>) -> Self {
        let mut saved_token = String::new();
        let mut saved_page = String::new();
        let storage = cc.storage.as_ref();
        if let Some(storage) = storage {
            saved_token = storage.get_string("clarix_session_token").unwrap_or_default();
            saved_page = storage.get_string("clarix_page").unwrap_or_default();
        }

        let mut session = None;
        if !saved_token.is_empty() {
            if let Ok(Some(user)) = crate::backend::auth::get_current_user(&core, &saved_token) {
                session = Some(AuthSession {
                    token: saved_token,
                    expires_at: user.created_at + chrono::Duration::days(365),
                    user,
                });
            }
        }

        let page = page_from_name(&saved_page).unwrap_or(Page::Dashboard);

        Self {
            core,
            session,
            page,
            toasts: Vec::new(),
            identity_cache: None,
            last_identity_fetch: Instant::now() - std::time::Duration::from_secs(60),
            login: ui::login::LoginPage::default(),
            dashboard: ui::dashboard::DashboardPage::default(),
            screens: ui::screens::ScreensPage::default(),
            content: ui::content::ContentPage::default(),
            playlists: ui::playlists::PlaylistsPage::default(),
            schedule: ui::schedule::SchedulePage::default(),
            trucks: ui::trucks::TrucksPage::default(),
            marquee: ui::marquee::MarqueePage::default(),
            analytics: ui::analytics::AnalyticsPage::default(),
            database: ui::database_view::DatabasePage::default(),
            settings: ui::settings::SettingsPage::default(),
            team: ui::team::TeamPage::default(),
            production: ui::production::ProductionPage::default(),
            player: ui::player::PlayerPage::default(),
        }
    }

    pub fn push_toast(&mut self, kind: ToastKind, text: impl Into<String>) {
        self.toasts.push(Toast::new(kind, text));
        if self.toasts.len() > 6 {
            self.toasts.remove(0);
        }
    }

    pub fn user(&self) -> Option<&AuthUser> {
        self.session.as_ref().map(|session| &session.user)
    }

    pub fn is_super_admin(&self) -> bool {
        matches!(
            self.user().map(|u| u.role.clone()),
            Some(AdminRole::SuperAdmin | AdminRole::SiteSuperAdmin)
        )
    }
}

fn page_from_name(name: &str) -> Option<Page> {
    [
        ("Dashboard", Page::Dashboard),
        ("Screens", Page::Screens),
        ("Content", Page::Content),
        ("Playlists", Page::Playlists),
        ("Schedule", Page::Schedule),
        ("Trucks", Page::Trucks),
        ("Marquee", Page::Marquee),
        ("Production", Page::Production),
        ("Analytics", Page::Analytics),
        ("Database", Page::Database),
        ("Settings", Page::Settings),
        ("Team", Page::Team),
        ("Player", Page::Player),
    ]
    .into_iter()
    .find(|(label, _)| *label == name)
    .map(|(_, page)| page)
}

impl eframe::App for ClarixApp {
    fn ui(&mut self, ui: &mut Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        let signed_in = self.session.is_some();

        let full_bleed = !signed_in || self.page == Page::Player;
        egui::CentralPanel::default()
            .frame(egui::Frame::new().fill(theme::BG))
            .show(ui, |ui| {
                if !signed_in {
                    // Login takes the whole window.
                    if let Some(session) = self.login.show(ui, &self.core) {
                        self.session = Some(session);
                        self.page = Page::Dashboard;
                    }
                } else if self.page == Page::Player {
                    self.player.show(ui, &self.core);
                    if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
                        if self.player.exit_to_admin() {
                            self.page = Page::Dashboard;
                        }
                    }
                }
            });
        let _ = full_bleed;

        if signed_in && self.page != Page::Player {
            self.draw_admin_layout(ui);
        }

        draw_toasts(ui, &mut self.toasts);
    }

    fn logic(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.toasts
            .retain(|toast| toast.created.elapsed() < std::time::Duration::from_secs(4));

        if self.last_identity_fetch.elapsed() >= std::time::Duration::from_secs(5) {
            self.last_identity_fetch = Instant::now();
            if let Ok(identity) = crate::backend::network::get_device_identity(&self.core) {
                self.identity_cache = Some(identity);
            }
        }

        if self.page == Page::Player {
            self.player.logic(&self.core, ctx);
        }

        ctx.request_repaint_after(std::time::Duration::from_millis(250));
    }

    fn save(&mut self, storage: &mut dyn Storage) {
        if let Some(session) = &self.session {
            storage.set_string("clarix_session_token", session.token.clone());
        }
        storage.set_string("clarix_page", self.page.title().to_string());
    }
}

impl ClarixApp {
    fn draw_admin_layout(&mut self, ui: &mut Ui) {
        egui::Panel::left("sidebar")
            .default_size(208.0)
            .resizable(false)
            .frame(egui::Frame::new().fill(theme::PANEL).inner_margin(egui::Margin::same(10)))
            .show(ui, |ui| {
                draw_sidebar(ui, self);
            });

        egui::Panel::top("topbar")
            .frame(egui::Frame::new().fill(theme::PANEL).inner_margin(egui::Margin::symmetric(12, 8)))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(
                        egui::RichText::new(self.page.title())
                            .size(18.0)
                            .strong()
                            .color(theme::TEXT),
                    );
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if let Some(user) = self.user() {
                            theme::muted(ui, &format!("{} · {}", user.name, user.role.as_str()));
                        }
                        if ui.button("Sign out").clicked() {
                            if let Some(session) = self.session.take() {
                                let core = self.core.clone();
                                std::thread::spawn(move || {
                                    let _ = crate::backend::auth::logout_user(&core, session.token);
                                });
                            }
                            self.session = None;
                            self.page = Page::Dashboard;
                        }
                    });
                });
            });

        egui::CentralPanel::default()
            .frame(egui::Frame::new().fill(theme::BG).inner_margin(egui::Margin::same(14)))
            .show(ui, |ui| {
                let core = self.core.clone();
                egui::ScrollArea::vertical().auto_shrink(false).show(ui, |ui| {
                    let toasts = &mut self.toasts;
                    match self.page {
                        Page::Dashboard => self.dashboard.show(ui, &core, toasts),
                        Page::Screens => self.screens.show(ui, &core, toasts),
                        Page::Content => self.content.show(ui, &core, toasts),
                        Page::Playlists => self.playlists.show(ui, &core, toasts),
                        Page::Schedule => self.schedule.show(ui, &core, toasts),
                        Page::Trucks => self.trucks.show(ui, &core, toasts),
                        Page::Marquee => self.marquee.show(ui, &core, toasts),
                        Page::Production => self.production.show(ui, &core, toasts),
                        Page::Analytics => self.analytics.show(ui, &core, toasts),
                        Page::Database => self.database.show(ui, &core, toasts),
                        Page::Settings => self.settings.show(ui, &core, toasts),
                        Page::Team => {
                            let session = self.session.clone();
                            self.team.show(ui, &core, toasts, session.as_ref());
                        }
                        Page::Player => self.player.show(ui, &core),
                    }
                });
            });
    }
}

fn draw_sidebar(ui: &mut Ui, app: &mut ClarixApp) {
    ui.vertical(|ui| {
        ui.horizontal(|ui| {
            let (rect, _) = ui.allocate_exact_size(egui::vec2(26.0, 26.0), egui::Sense::hover());
            ui.painter().rect_filled(rect, 6.0, theme::PRIMARY);
            ui.painter().text(
                rect.center(),
                egui::Align2::CENTER_CENTER,
                "C",
                egui::FontId::proportional(16.0),
                theme::TEXT,
            );
            ui.label(egui::RichText::new("Clarix").size(17.0).strong().color(theme::TEXT));
        });
        theme::muted(ui, "MG Enterprise Signage");
        ui.add_space(10.0);
        ui.separator();

        let mut sections: Vec<(String, Vec<(Page, String)>)> = Vec::new();
        sections.push((
            "Manage".to_string(),
            vec![
                (Page::Dashboard, "🏠 Dashboard".to_string()),
                (Page::Screens, "🖥  Screens".to_string()),
                (Page::Content, "🗂  Content".to_string()),
                (Page::Playlists, "▶  Playlists".to_string()),
                (Page::Schedule, "🕑  Schedule".to_string()),
            ],
        ));
        sections.push((
            "Operations".to_string(),
            vec![
                (Page::Trucks, "🚚  Trucks".to_string()),
                (Page::Marquee, "📜  Marquee".to_string()),
                (Page::Production, "📊  Production".to_string()),
            ],
        ));
        sections.push((
            "Insights".to_string(),
            vec![
                (Page::Analytics, "📈  Analytics".to_string()),
                (Page::Database, "🗄  Database".to_string()),
            ],
        ));
        let mut system = vec![
            (Page::Settings, "⚙  Settings".to_string()),
            (Page::Player, "📺  Player".to_string()),
        ];
        if app.is_super_admin() {
            system.push((Page::Team, "👥  Team".to_string()));
        }
        sections.push(("System".to_string(), system));

        for (title, items) in &sections {
            ui.add_space(6.0);
            ui.label(egui::RichText::new(title.clone()).size(10.5).color(theme::MUTED));
            for (entry, label) in items {
                let selected = app.page == *entry;
                if ui
                    .add_sized(
                        [ui.available_width(), 28.0],
                        egui::Button::selectable(selected, egui::RichText::new(label.clone()).size(14.0)),
                    )
                    .clicked()
                {
                    app.page = *entry;
                }
            }
        }
    });
}

fn draw_toasts(ui: &mut Ui, toasts: &mut Vec<Toast>) {
    if toasts.is_empty() {
        return;
    }
    let screen = ui.ctx().content_rect();
    let mut offset = 24.0;
    for toast in toasts.iter() {
        let color = match toast.kind {
            ToastKind::Success => theme::GREEN,
            ToastKind::Error => theme::RED,
            ToastKind::Info => theme::PRIMARY,
        };
        let galley = ui.painter().layout_no_wrap(
            toast.text.clone(),
            egui::FontId::proportional(14.0),
            theme::TEXT,
        );
        let width = (galley.size().x + 40.0).max(280.0);
        let height = galley.size().y + 16.0;
        let rect = egui::Align2::CENTER_TOP.anchor_size(
            egui::pos2(screen.center().x, screen.top() + offset),
            egui::vec2(width, height),
        );
        let painter = ui.painter();
        painter.rect_filled(rect, 8.0, theme::CARD);
        painter.rect_stroke(rect, 8.0, egui::Stroke::new(1.0, color), egui::StrokeKind::Outside);
        painter.text(
            rect.center(),
            egui::Align2::CENTER_CENTER,
            &toast.text,
            egui::FontId::proportional(14.0),
            theme::TEXT,
        );
        offset += height + 8.0;
    }
}
