use std::sync::Arc;

use egui::{Align2, Color32, FontId, Rect, RichText, Sense, Vec2};

use crate::state::AppCore;
use crate::theme;

pub struct LoginPage {
    email: String,
    password: String,
    invite_code: String,
    invite_name: String,
    invite_password: String,
    mode: LoginMode,
    error: Option<String>,
}

#[derive(PartialEq)]
enum LoginMode {
    SignIn,
    AcceptInvite,
}

impl Default for LoginPage {
    fn default() -> Self {
        Self {
            email: String::new(),
            password: String::new(),
            invite_code: String::new(),
            invite_name: String::new(),
            invite_password: String::new(),
            mode: LoginMode::SignIn,
            error: None,
        }
    }
}

impl LoginPage {
    pub fn show(
        &mut self,
        ui: &mut egui::Ui,
        core: &Arc<AppCore>,
        appearance: &mut theme::AppearancePreference,
    ) -> Option<crate::models::AuthSession> {
        let mut session = None;

        draw_backdrop(ui);

        theme::appearance_control(ui, appearance);
        let outer = ui.available_rect_before_wrap();

        if outer.width() >= 940.0 && outer.height() >= 520.0 {
            // Exact geometry: row = 390px brand column + 82px gap + 408px card,
            // centered in the panel. Child UIs are pinned via max_rect so nothing
            // can drift or overflow.
            let row = Align2::CENTER_CENTER.align_size_within_rect(egui::vec2(880.0, 480.0), outer);
            let brand_rect = Rect::from_min_size(row.min, egui::vec2(390.0, row.height()));
            let card_rect = Rect::from_min_size(
                row.min + egui::vec2(472.0, 0.0),
                egui::vec2(408.0, row.height()),
            );

            let mut brand_child = ui.new_child(
                egui::UiBuilder::new()
                    .max_rect(brand_rect)
                    .layout(egui::Layout::top_down(egui::Align::Min)),
            );
            draw_brand_column(&mut brand_child);

            let mut card_child = ui.new_child(
                egui::UiBuilder::new()
                    .max_rect(card_rect)
                    .layout(egui::Layout::top_down(egui::Align::Min)),
            );
            egui::ScrollArea::vertical()
                .id_salt("login-form")
                .show(&mut card_child, |ui| {
                    draw_sign_in_card(ui, core, self, &mut session)
                });
        } else {
            // Narrow window: just the card, centered.
            let card_rect = Align2::CENTER_CENTER.align_size_within_rect(
                egui::vec2(408.0_f32.min(outer.width() - 32.0), outer.height() - 24.0),
                outer,
            );
            let mut card_child = ui.new_child(
                egui::UiBuilder::new()
                    .max_rect(card_rect)
                    .layout(egui::Layout::top_down(egui::Align::Min)),
            );
            egui::ScrollArea::vertical()
                .id_salt("login-form")
                .show(&mut card_child, |ui| {
                    draw_sign_in_card(ui, core, self, &mut session)
                });
        }

        draw_footer(ui);

        session // value returned
    }

    fn error_banner(ui: &mut egui::Ui, message: &str) {
        ui.add_space(6.0);
        egui::Frame::new()
            .fill(theme::with_alpha(theme::tokens(ui).red, 0.14))
            .stroke(egui::Stroke::new(
                1.0,
                theme::with_alpha(theme::tokens(ui).red, 0.55),
            ))
            .inner_margin(egui::Margin::symmetric(10, 7))
            .corner_radius(7.0)
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.label(
                    RichText::new(message.to_string())
                        .color(theme::tokens(ui).red)
                        .size(12.5),
                );
            });
    }

    fn field_label(ui: &mut egui::Ui, text: &str) {
        ui.label(
            RichText::new(text.to_uppercase())
                .size(10.5)
                .color(theme::tokens(ui).muted)
                .strong(),
        );
        ui.add_space(1.0);
    }

    fn auth_button(ui: &mut egui::Ui, label: &str) -> bool {
        ui.add_space(2.0);
        let response = ui.add_sized(
            [ui.available_width(), 34.0],
            egui::Button::new(
                RichText::new(label.to_string())
                    .size(14.0)
                    .strong()
                    .color(theme::tokens(ui).on_primary),
            )
            .fill(theme::tokens(ui).primary)
            .corner_radius(8.0),
        );
        response.clicked()
    }

    /// Dashed separator with an "or" chip in the middle.
    fn or_divider(ui: &mut egui::Ui) {
        ui.add_space(10.0);
        let width = ui.available_width();
        let (rect, _) = ui.allocate_exact_size(Vec2::new(width, 14.0), Sense::hover());
        let painter = ui.painter();
        let mid = rect.center();
        painter.line_segment(
            [rect.left_center(), mid - egui::vec2(24.0, 0.0)],
            egui::Stroke::new(1.0, theme::with_alpha(theme::tokens(ui).stroke, 0.7)),
        );
        painter.line_segment(
            [mid + egui::vec2(24.0, 0.0), rect.right_center()],
            egui::Stroke::new(1.0, theme::with_alpha(theme::tokens(ui).stroke, 0.7)),
        );
        painter.text(
            mid,
            Align2::CENTER_CENTER,
            "OR",
            FontId::proportional(10.0),
            theme::tokens(ui).muted,
        );
        ui.add_space(2.0);
    }
}

fn draw_backdrop(ui: &mut egui::Ui) {
    let full = ui.clip_rect();
    let painter = ui.painter();
    // Solid base.
    painter.rect_filled(full, 0.0, theme::tokens(ui).bg);
    // Soft glows ("aurora"): large translucent circles so edges stay dark.
    let r = full.width().max(full.height());
    painter.circle_filled(
        full.left_top() + egui::vec2(r * 0.35, r * 0.22),
        r * 0.30,
        theme::with_alpha(theme::tokens(ui).primary, 0.04),
    );
    painter.circle_filled(
        full.left_top() + egui::vec2(r * 0.62, r * 1.25),
        r * 0.38,
        theme::with_alpha(theme::tokens(ui).green, 0.03),
    );
    painter.circle_filled(
        full.left_top() + egui::vec2(r * 1.18, r * 0.16),
        r * 0.30,
        theme::with_alpha(Color32::from_rgb(126, 96, 240), 0.03),
    );
}

fn draw_brand_column(ui: &mut egui::Ui) {
    // Clamp width so the copy wraps instead of stretching the row.
    ui.allocate_ui_with_layout(
        egui::vec2(390.0, 40.0),
        egui::Layout::top_down(egui::Align::Min),
        |ui| {
            // Logo tile.
            let (tile, _) = ui.allocate_exact_size(Vec2::new(64.0, 64.0), Sense::hover());
            let painter = ui.painter();
            painter.rect_filled(tile, 16.0, theme::tokens(ui).primary);
            painter.rect_stroke(
                tile,
                16.0,
                egui::Stroke::new(1.0, theme::with_alpha(theme::tokens(ui).text, 0.25)),
                egui::StrokeKind::Outside,
            );
            painter.text(
                tile.center(),
                Align2::CENTER_CENTER,
                "C",
                FontId::proportional(34.0),
                theme::tokens(ui).on_primary,
            );

            ui.add_space(26.0);
            ui.label(RichText::new("Clarix").size(40.0).strong().color(theme::tokens(ui).text));
            ui.label(
                RichText::new("MG ENTERPRISE SIGNAGE")
                    .size(12.0)
                    .strong()
                    .color(theme::tokens(ui).primary),
            );
            ui.add_space(16.0);
            ui.label(
                RichText::new(
                    "Run every screen, playlist and truck gate on your network — from one native window.",
                )
                .size(14.5)
                .color(theme::tokens(ui).muted),
            );
            ui.add_space(22.0);

            for (icon, title, detail) in [
                (
                    super::icons::Icon::Screen,
                    "Screens & players",
                    "Pair devices and push content over LAN",
                ),
                (
                    super::icons::Icon::Truck,
                    "Truck gates",
                    "Token queues, loading status and alerts",
                ),
                (
                    super::icons::Icon::Chart,
                    "Production dashboards",
                    "Import reports and broadcast them live",
                ),
            ] {
                ui.horizontal(|ui| {
                    let (chip, _) = ui.allocate_exact_size(Vec2::new(34.0, 34.0), Sense::hover());
                    let painter = ui.painter();
                    painter.rect_filled(chip, 8.0, theme::with_alpha(theme::tokens(ui).card_hover, 0.9));
                    super::icons::paint(painter,chip.shrink(8.0),icon,theme::tokens(ui).primary);
                    ui.add_space(8.0);
                    ui.vertical(|ui| {
                        ui.label(RichText::new(title).size(13.5).strong().color(theme::tokens(ui).text));
                        ui.label(RichText::new(detail).size(12.5).color(theme::tokens(ui).muted));
                    });
                });
                ui.add_space(10.0);
            }
        },
    );
}

fn draw_sign_in_card(
    ui: &mut egui::Ui,
    core: &Arc<AppCore>,
    page: &mut LoginPage,
    session: &mut Option<crate::models::AuthSession>,
) {
    egui::Frame::new()
        .fill(theme::tokens(ui).card)
        .stroke(egui::Stroke::new(1.0, theme::tokens(ui).stroke))
        .shadow(egui::Shadow {
            offset: [0, 18],
            blur: 44,
            spread: 0,
            color: theme::tokens(ui).shadow,
        })
        .inner_margin(egui::Margin::same(26))
        .corner_radius(14.0)
        .show(ui, |ui| {
            // Frame content inherits the top_down layout from the card container,
            // and is exactly 356px wide (408 card − 2×26 margin).
            match page.mode {
                LoginMode::SignIn => page.sign_in(ui, core, session),
                LoginMode::AcceptInvite => page.accept_invite(ui, core, session),
            }
        });
}

fn draw_footer(ui: &mut egui::Ui) {
    let bottom_left = ui.clip_rect().right_bottom() - egui::vec2(0.0, 16.0);
    ui.painter().text(
        bottom_left,
        Align2::RIGHT_BOTTOM,
        format!("Clarix v{}", env!("CARGO_PKG_VERSION")),
        FontId::proportional(11.0),
        theme::with_alpha(theme::tokens(ui).muted, 0.8),
    );
}

impl LoginPage {
    fn sign_in(
        &mut self,
        ui: &mut egui::Ui,
        core: &Arc<AppCore>,
        session: &mut Option<crate::models::AuthSession>,
    ) {
        ui.label(
            RichText::new("Welcome back")
                .size(20.0)
                .strong()
                .color(theme::tokens(ui).text),
        );
        ui.add_space(2.0);
        ui.label(
            RichText::new("Sign in to manage your screens")
                .size(12.5)
                .color(theme::tokens(ui).muted),
        );
        ui.add_space(16.0);

        Self::field_label(ui, "Email");
        let email_edit = egui::TextEdit::singleline(&mut self.email)
            .hint_text("you@company.com")
            .desired_width(ui.available_width());
        let email_response = ui.add_sized([ui.available_width(), 30.0], email_edit);
        if ui.memory(|m| m.focused().is_none()) {
            email_response.request_focus();
        }
        ui.add_space(10.0);

        Self::field_label(ui, "Password");
        let password_edit = egui::TextEdit::singleline(&mut self.password)
            .hint_text("••••••••")
            .password(true)
            .desired_width(ui.available_width());
        let password_response = ui.add_sized([ui.available_width(), 30.0], password_edit);
        let enter_pressed =
            password_response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
        ui.add_space(14.0);

        let sign_in_clicked = Self::auth_button(ui, "Sign in");
        if sign_in_clicked || enter_pressed {
            self.error = None;
            match crate::backend::auth::login_user(core, self.email.clone(), self.password.clone())
            {
                Ok(value) => {
                    session.replace(value);
                }
                Err(error) => {
                    self.error = Some(error);
                }
            }
        }

        if let Some(error) = &self.error {
            Self::error_banner(ui, error);
        }

        ui.add_space(4.0);
        Self::or_divider(ui);
        ui.vertical_centered(|ui| {
            if ui
                .button(
                    RichText::new("Have an invite code? Accept invite")
                        .color(theme::tokens(ui).primary)
                        .size(12.5),
                )
                .clicked()
            {
                self.mode = LoginMode::AcceptInvite;
                self.error = None;
            }
        });
    }

    fn accept_invite(
        &mut self,
        ui: &mut egui::Ui,
        core: &Arc<AppCore>,
        session: &mut Option<crate::models::AuthSession>,
    ) {
        ui.label(
            RichText::new("Join the team")
                .size(20.0)
                .strong()
                .color(theme::tokens(ui).text),
        );
        ui.add_space(2.0);
        ui.label(
            RichText::new("Accept your invite and create an account")
                .size(12.5)
                .color(theme::tokens(ui).muted),
        );
        ui.add_space(16.0);

        Self::field_label(ui, "Invite code");
        let code_edit = egui::TextEdit::singleline(&mut self.invite_code)
            .hint_text("e.g. ABC-1234")
            .desired_width(ui.available_width());
        let code_response = ui.add_sized([ui.available_width(), 30.0], code_edit);
        if ui.memory(|m| m.focused().is_none()) {
            code_response.request_focus();
        }
        ui.add_space(10.0);

        Self::field_label(ui, "Your name");
        ui.add_sized(
            [ui.available_width(), 30.0],
            egui::TextEdit::singleline(&mut self.invite_name).hint_text("Full name"),
        );
        ui.add_space(10.0);

        Self::field_label(ui, "Password");
        let password_edit = egui::TextEdit::singleline(&mut self.invite_password)
            .hint_text("Create a password")
            .password(true)
            .desired_width(ui.available_width());
        let password_response = ui.add_sized([ui.available_width(), 30.0], password_edit);
        let enter_pressed =
            password_response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
        ui.add_space(14.0);

        let join_clicked = Self::auth_button(ui, "Join team");
        if join_clicked || enter_pressed {
            self.error = None;
            match crate::backend::auth::accept_team_invite(
                core,
                self.invite_code.clone(),
                self.invite_name.clone(),
                self.invite_password.clone(),
            ) {
                Ok(value) => {
                    session.replace(value);
                }
                Err(error) => {
                    self.error = Some(error);
                }
            }
        }

        if let Some(error) = &self.error {
            Self::error_banner(ui, error);
        }

        ui.add_space(4.0);
        Self::or_divider(ui);
        ui.vertical_centered(|ui| {
            if ui
                .button(
                    RichText::new("← Back to sign in")
                        .color(theme::tokens(ui).primary)
                        .size(12.5),
                )
                .clicked()
            {
                self.mode = LoginMode::SignIn;
                self.error = None;
            }
        });
    }
}
