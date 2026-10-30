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
        Self {
            kind,
            text: text.into(),
            created: Instant::now(),
        }
    }
}

pub struct ClarixApp {
    pub core: Arc<AppCore>,
    pub session: Option<AuthSession>,
    pub page: Page,
    pub toasts: Vec<Toast>,
    pub identity_cache: Option<DeviceIdentity>,
    last_identity_fetch: Instant,
    appearance: theme::AppearancePreference,
    navigation_open: bool,

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
            saved_token = storage
                .get_string("clarix_session_token")
                .unwrap_or_default();
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

        let appearance = theme::AppearancePreference::load(cc.storage);
        appearance.apply(&cc.egui_ctx);
        let page = page_from_name(&saved_page).unwrap_or(Page::Dashboard);

        Self {
            core,
            session,
            page,
            toasts: Vec::new(),
            identity_cache: None,
            appearance,
            navigation_open: false,
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

        if !signed_in {
            // Login takes the whole window.
            egui::CentralPanel::default()
                .frame(egui::Frame::new().fill(theme::tokens(ui).bg))
                .show(ui, |ui| {
                    if let Some(session) = self.login.show(ui, &self.core, &mut self.appearance) {
                        self.session = Some(session);
                        self.page = Page::Dashboard;
                    }
                });
        } else if self.page == Page::Player {
            egui::CentralPanel::default()
                .frame(egui::Frame::new().fill(theme::tokens(ui).bg))
                .show(ui, |ui| {
                    self.player.show(ui, &self.core);
                    if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
                        if self.player.exit_to_admin() {
                            self.page = Page::Dashboard;
                        }
                    }
                });
        } else {
            // Admin shell: side/top panels + content panel are added directly to
            // the root ui. A full-size CentralPanel must NOT come first — it would
            // consume all remaining space and starve the panels (blank window).
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
        self.appearance.save(storage);
        if let Some(session) = &self.session {
            storage.set_string("clarix_session_token", session.token.clone());
        }
        storage.set_string("clarix_page", self.page.title().to_string());
    }
}

impl ClarixApp {
    fn sign_out(&mut self) {
        if let Some(session) = self.session.take() {
            let core = self.core.clone();
            std::thread::spawn(move || {
                let _ = crate::backend::auth::logout_user(&core, session.token);
            });
        }
        self.session = None;
        self.page = Page::Dashboard;
    }

    fn draw_admin_layout(&mut self, ui: &mut Ui) {
        use ui::layout::{navigation, Navigation};
        let mode = navigation(ui.ctx().content_rect().width());
        let t = theme::tokens(ui);
        if mode != Navigation::Drawer {
            self.navigation_open = false;
            let rail = mode == Navigation::Rail;
            egui::Panel::left("sidebar")
                .exact_size(if rail { 64.0 } else { 224.0 })
                .resizable(false)
                .frame(
                    egui::Frame::new()
                        .fill(t.panel)
                        .inner_margin(egui::Margin::same(if rail { 8 } else { 14 })),
                )
                .show(ui, |ui| draw_sidebar(ui, self, rail));
        }
        egui::Panel::top("topbar")
            .frame(
                egui::Frame::new()
                    .fill(t.panel)
                    .inner_margin(egui::Margin::symmetric(18, 12)),
            )
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    if mode == Navigation::Drawer
                        && ui::icons::button(ui, ui::icons::Icon::Menu, "Open navigation").clicked()
                    {
                        self.navigation_open = !self.navigation_open;
                    }
                    ui.label(egui::RichText::new(self.page.title()).size(18.0).strong());
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        let account = self
                            .user()
                            .map(|u| (u.name.clone(), u.role.as_str().to_string()));
                        if let Some((name, role)) = account {
                            ui.menu_button(format!("{}  Account", initials_of(&name)), |ui| {
                                ui.add(
                                    egui::Label::new(egui::RichText::new(&name).strong()).wrap(),
                                );
                                theme::muted(ui, &role);
                                ui.separator();
                                theme::appearance_control(ui, &mut self.appearance);
                                ui.separator();
                                if ui.button("Sign out").clicked() {
                                    self.sign_out();
                                    ui.close();
                                }
                            });
                        }
                        let port = self.core.server_port.lock().map(|p| *p).unwrap_or(0);
                        let identity = self.identity_cache.as_ref();
                        let label = identity.map(|d| d.role.as_str()).unwrap_or("Device");
                        if port > 0 {
                            theme::badge(ui, label, t.green);
                        } else {
                            theme::badge(ui, label, t.muted);
                        }
                    });
                });
            });
        if self.navigation_open {
            egui::Panel::left("navigation-drawer")
                .exact_size(224.0)
                .resizable(false)
                .frame(
                    egui::Frame::new()
                        .fill(t.panel)
                        .inner_margin(egui::Margin::same(14)),
                )
                .show(ui, |ui| draw_sidebar(ui, self, false));
        }
        egui::CentralPanel::default()
            .frame(
                egui::Frame::new()
                    .fill(t.bg)
                    .inner_margin(egui::Margin::same(20)),
            )
            .show(ui, |ui| {
                let core = self.core.clone();
                egui::ScrollArea::vertical()
                    .id_salt(("page", self.page.title()))
                    .auto_shrink(false)
                    .show(ui, |ui| {
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
                            Page::Settings => {
                                self.settings.show(ui, &core, toasts, &mut self.appearance);
                            }
                            Page::Team => {
                                let session = self.session.clone();
                                self.team.show(ui, &core, toasts, session.as_ref());
                            }
                            Page::Player => self.player.show(ui, &core),
                        }
                    });
            });
        if self.navigation_open && ui.ctx().input(|i| i.key_pressed(egui::Key::Escape)) {
            self.navigation_open = false;
        }
    }
}

fn initials_of(name: &str) -> String {
    name.split_whitespace()
        .filter_map(|word| word.chars().next())
        .take(2)
        .collect::<String>()
        .to_uppercase()
}

fn page_icon(page: Page) -> ui::icons::Icon {
    use ui::icons::Icon;
    match page {
        Page::Dashboard => Icon::Dashboard,
        Page::Screens => Icon::Screen,
        Page::Content => Icon::Content,
        Page::Playlists | Page::Player => Icon::Play,
        Page::Schedule => Icon::Calendar,
        Page::Trucks => Icon::Truck,
        Page::Marquee => Icon::Message,
        Page::Production | Page::Analytics => Icon::Chart,
        Page::Database => Icon::Database,
        Page::Settings => Icon::Settings,
        Page::Team => Icon::Team,
    }
}

fn draw_sidebar(ui: &mut Ui, app: &mut ClarixApp, rail: bool) {
    let t = theme::tokens(ui);
    ui.horizontal(|ui| {
        let (r, _) = ui.allocate_exact_size(egui::vec2(32.0, 32.0), egui::Sense::hover());
        ui.painter()
            .rect_filled(r, theme::PlatformStyle::current().radius, t.primary);
        ui.painter().text(
            r.center(),
            egui::Align2::CENTER_CENTER,
            "C",
            egui::FontId::proportional(20.0),
            t.on_primary,
        );
        if !rail {
            ui.label(egui::RichText::new("Clarix").size(21.0).strong());
        }
    });
    if !rail {
        theme::muted(ui, "MG Enterprise Signage");
    }
    ui.add_space(14.0);
    let mut target = None;
    egui::ScrollArea::vertical()
        .id_salt("navigation-scroll")
        .auto_shrink(false)
        .show(ui, |ui| {
            for (section, pages) in [
                (
                    "WORKSPACE",
                    &[
                        Page::Dashboard,
                        Page::Screens,
                        Page::Content,
                        Page::Playlists,
                        Page::Schedule,
                    ][..],
                ),
                (
                    "OPERATIONS",
                    &[Page::Trucks, Page::Marquee, Page::Production][..],
                ),
                ("INSIGHTS", &[Page::Analytics, Page::Database][..]),
                ("SYSTEM", &[Page::Settings, Page::Player, Page::Team][..]),
            ] {
                if !rail {
                    ui.add_space(8.0);
                    ui.label(
                        egui::RichText::new(section)
                            .size(10.0)
                            .strong()
                            .color(t.muted),
                    );
                } else {
                    ui.add_space(6.0);
                }
                for &page in pages {
                    if page == Page::Team && !app.is_super_admin() {
                        continue;
                    }
                    let selected = app.page == page;
                    let label = "";
                    let response = ui.add_sized(
                        [ui.available_width(), 38.0],
                        egui::Button::selectable(selected, label),
                    );
                    response.widget_info(|| {
                        egui::WidgetInfo::selected(
                            egui::Role::Button,
                            ui.is_enabled(),
                            selected,
                            page.title(),
                        )
                    });
                    let center = if rail {
                        response.rect.center()
                    } else {
                        egui::pos2(response.rect.left() + 19.0, response.rect.center().y)
                    };
                    ui::icons::paint(
                        ui.painter(),
                        egui::Rect::from_center_size(center, egui::vec2(18.0, 18.0)),
                        page_icon(page),
                        if selected { t.primary } else { t.muted },
                    );
                    if !rail {
                        ui.painter().text(
                            egui::pos2(response.rect.left() + 38.0, response.rect.center().y),
                            egui::Align2::LEFT_CENTER,
                            page.title(),
                            egui::FontId::proportional(14.0),
                            if selected { t.text } else { t.muted },
                        );
                    }
                    if response.on_hover_text(page.title()).clicked() {
                        target = Some(page);
                    }
                }
            }
        });
    if let Some(page) = target {
        app.page = page;
        app.navigation_open = false;
    }
}

fn draw_toasts(ui: &mut Ui, toasts: &mut Vec<Toast>) {
    if toasts.is_empty() {
        return;
    }
    egui::Area::new(egui::Id::unique("notices"))
        .anchor(egui::Align2::RIGHT_TOP, [-20.0, 76.0])
        .order(egui::Order::Tooltip)
        .show(ui.ctx(), |ui| {
            ui.set_width(360.0_f32.min(ui.ctx().content_rect().width() - 40.0));
            for toast in toasts.iter().rev().take(3) {
                let t = theme::tokens(ui);
                let (label, color) = match toast.kind {
                    ToastKind::Success => ("Success", t.green),
                    ToastKind::Error => ("Error", t.red),
                    ToastKind::Info => ("Info", t.primary),
                };
                egui::Frame::new()
                    .fill(t.card)
                    .stroke(egui::Stroke::new(1.0, t.stroke))
                    .inner_margin(egui::Margin::same(14))
                    .corner_radius(8.0)
                    .show(ui, |ui| {
                        ui.label(egui::RichText::new(label).strong().color(color));
                        ui.add(egui::Label::new(&toast.text).wrap());
                    });
            }
        });
}

#[cfg(any(test, debug_assertions))]
#[path = "ui_review.rs"]
mod ui_review;

#[cfg(debug_assertions)]
pub(crate) fn run_ui_review() {
    ui_review::run();
}
