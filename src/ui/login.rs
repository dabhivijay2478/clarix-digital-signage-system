use std::sync::Arc;

use crate::state::AppCore;

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
    pub fn show(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>) -> Option<crate::models::AuthSession> {
        let mut session = None;

        // Centered card.
        let available = ui.available_rect_before_wrap();
        let card_size = egui::vec2(380.0, if self.mode == LoginMode::SignIn { 300.0 } else { 400.0 });
        let rect = egui::Align2::CENTER_CENTER.anchor_size(available.center(), card_size);
        ui.allocate_rect(rect, egui::Sense::hover());

        egui::Frame::new()
            .fill(crate::theme::CARD)
            .stroke(egui::Stroke::new(1.0, crate::theme::STROKE))
            .inner_margin(egui::Margin::same(24))
            .corner_radius(10.0)
            .show(ui, |ui| {
                ui.set_width(rect.width() - 48.0);
                ui.add_space(4.0);
                ui.horizontal(|ui| {
                    let (rect, _) = ui.allocate_exact_size(egui::vec2(36.0, 36.0), egui::Sense::hover());
                    ui.painter().rect_filled(rect, 8.0, crate::theme::PRIMARY);
                    ui.painter().text(
                        rect.center(),
                        egui::Align2::CENTER_CENTER,
                        "C",
                        egui::FontId::proportional(22.0),
                        crate::theme::TEXT,
                    );
                    ui.add_space(4.0);
                    ui.label(
                        egui::RichText::new("MG Enterprise · Clarix")
                            .size(18.0)
                            .strong()
                            .color(crate::theme::TEXT),
                    );
                });
                ui.label(
                    egui::RichText::new("Digital Signage Management")
                        .size(12.0)
                        .color(crate::theme::MUTED),
                );
                ui.add_space(14.0);

                match self.mode {
                    LoginMode::SignIn => self.draw_sign_in(ui, core, &mut session),
                    LoginMode::AcceptInvite => self.draw_accept_invite(ui, core, &mut session),
                }

                if let Some(error) = &self.error {
                    ui.add_space(6.0);
                    ui.label(
                        egui::RichText::new(error.clone())
                            .color(crate::theme::RED)
                            .size(12.5),
                    );
                }
            });

        session
    }

    fn draw_sign_in(
        &mut self,
        ui: &mut egui::Ui,
        core: &Arc<AppCore>,
        session: &mut Option<crate::models::AuthSession>,
    ) {
        ui.add_sized(
            [ui.available_width(), 28.0],
            egui::TextEdit::singleline(&mut self.email).hint_text("Email"),
        );
        ui.add_space(6.0);
        let password_edit = egui::TextEdit::singleline(&mut self.password)
            .hint_text("Password")
            .password(true);
        let response = ui.add_sized([ui.available_width(), 28.0], password_edit);
        let enter_pressed = response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));

        ui.add_space(10.0);
        if ui
            .add_sized(
                [ui.available_width(), 32.0],
                egui::Button::new("Sign in"),
            )
            .clicked()
            || enter_pressed
        {
            self.error = None;
            match crate::backend::auth::login_user(core, self.email.clone(), self.password.clone()) {
                Ok(value) => {
                    session.replace(value);
                }
                Err(error) => {
                    self.error = Some(error);
                }
            }
        }

        ui.add_space(8.0);
        if ui
            .button(
                egui::RichText::new("Have an invite code? Accept invite")
                    .color(crate::theme::PRIMARY)
                    .size(12.5),
            )
            .clicked()
        {
            self.mode = LoginMode::AcceptInvite;
            self.error = None;
        }
    }

    fn draw_accept_invite(
        &mut self,
        ui: &mut egui::Ui,
        core: &Arc<AppCore>,
        session: &mut Option<crate::models::AuthSession>,
    ) {
        ui.add_sized(
            [ui.available_width(), 28.0],
            egui::TextEdit::singleline(&mut self.invite_code).hint_text("Invite code"),
        );
        ui.add_space(6.0);
        ui.add_sized(
            [ui.available_width(), 28.0],
            egui::TextEdit::singleline(&mut self.invite_name).hint_text("Your name"),
        );
        ui.add_space(6.0);
        let password_edit = egui::TextEdit::singleline(&mut self.invite_password)
            .hint_text("Password")
            .password(true);
        let response = ui.add_sized([ui.available_width(), 28.0], password_edit);
        let enter_pressed = response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));

        ui.add_space(10.0);
        if ui
            .add_sized(
                [ui.available_width(), 32.0],
                egui::Button::new("Join team"),
            )
            .clicked()
            || enter_pressed
        {
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

        ui.add_space(8.0);
        if ui
            .button(
                egui::RichText::new("Back to sign in")
                    .color(crate::theme::PRIMARY)
                    .size(12.5),
            )
            .clicked()
        {
            self.mode = LoginMode::SignIn;
            self.error = None;
        }
    }
}
