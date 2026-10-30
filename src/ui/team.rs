use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::app::{Toast, ToastKind};
use crate::models::{AdminRole, AuthSession, TeamInvite};
use crate::state::AppCore;
use crate::theme;
use crate::ui::widgets;

const ROLE_OPTIONS: [(AdminRole, &str); 4] = [
    (AdminRole::SuperAdmin, "Super Admin"),
    (AdminRole::SiteSuperAdmin, "Site Super Admin"),
    (AdminRole::Manager, "Manager"),
    (AdminRole::User, "User"),
];

pub struct TeamPage {
    members: Vec<crate::models::AuthUser>,
    invites: Vec<TeamInvite>,
    last_refresh: Instant,
    // create invite
    invite_email: String,
    invite_role: AdminRole,
    invite_is_dev: bool,
    // edit member
    editing: Option<String>,
    edit_role: AdminRole,
    edit_is_dev: bool,
    // reset password
    resetting: Option<String>,
    new_password: String,
    // confirm delete
    confirm: Option<String>,
}

impl Default for TeamPage {
    fn default() -> Self {
        Self {
            members: Vec::new(),
            invites: Vec::new(),
            last_refresh: Instant::now() - Duration::from_secs(3600),
            invite_email: String::new(),
            invite_role: AdminRole::Manager,
            invite_is_dev: false,
            editing: None,
            edit_role: AdminRole::Manager,
            edit_is_dev: false,
            resetting: None,
            new_password: String::new(),
            confirm: None,
        }
    }
}

fn role_str(role: AdminRole) -> &'static str {
    role.as_str()
}

impl TeamPage {
    pub fn show(
        &mut self,
        ui: &mut egui::Ui,
        core: &Arc<AppCore>,
        toasts: &mut Vec<Toast>,
        session: Option<&AuthSession>,
    ) {
        let Some(session) = session else {
            widgets::empty_state(ui, "Please sign in to manage the team.");
            return;
        };
        let token = session.token.clone();
        let is_developer = session.user.is_developer;

        if widgets::should_refresh(self.last_refresh, Duration::from_secs(10)) {
            self.last_refresh = Instant::now();
            self.refresh(core, &token);
        }

        theme::heading(ui, "Team");
        theme::muted(
            ui,
            "Only developer accounts can manage members and invites.",
        );
        ui.add_space(10.0);

        if !is_developer {
            widgets::empty_state(
                ui,
                "Your account cannot manage team access. Ask a developer user for invites.",
            );
            return;
        }

        // ── Invite creation ─────────────────────────────────────────────────
        widgets::section_header(ui, "Create invite");
        theme::card(ui, |ui| {
            widgets::labeled_text(
                ui,
                "Email",
                &mut self.invite_email,
                "teammate@mgenterprise.com",
            );
            ui.horizontal_wrapped(|ui| {
                ui.label(
                    egui::RichText::new(" Role")
                        .size(13.0)
                        .color(theme::tokens(ui).muted),
                );
                egui::ComboBox::from_id_salt("invite-role")
                    .width(170.0)
                    .selected_text(
                        ROLE_OPTIONS
                            .iter()
                            .find(|(role, _)| *role == self.invite_role)
                            .map(|(_, label)| *label)
                            .unwrap_or("Manager"),
                    )
                    .show_ui(ui, |ui| {
                        for (role, label) in ROLE_OPTIONS {
                            ui.selectable_value(&mut self.invite_role, role, label);
                        }
                    });
                ui.checkbox(&mut self.invite_is_dev, "Developer access");
                if ui.button("Send invite").clicked() {
                    if self.invite_email.trim().is_empty() {
                        toasts.push(Toast::new(ToastKind::Error, "Enter an email address"));
                    } else {
                        match crate::backend::auth::create_team_invite(
                            core,
                            &token,
                            self.invite_email.trim().to_string(),
                            role_str(self.invite_role.clone()).to_string(),
                            self.invite_is_dev,
                        ) {
                            Ok(invite) => {
                                toasts.push(Toast::new(
                                    ToastKind::Success,
                                    format!(
                                        "Invite created for {}. Accept code: {}",
                                        invite.email, invite.code
                                    ),
                                ));
                                self.invite_email.clear();
                                self.invite_is_dev = false;
                                self.last_refresh = Instant::now() - Duration::from_secs(3600);
                            }
                            Err(error) => toasts.push(Toast::new(
                                ToastKind::Error,
                                format!("Invite failed: {error}"),
                            )),
                        }
                    }
                }
            });
        });
        ui.add_space(6.0);

        // ── Members ─────────────────────────────────────────────────────────
        widgets::section_header(ui, "Members");
        for member in &self.members {
            theme::card(ui, |ui| {
                ui.horizontal_wrapped(|ui| {
                    ui.vertical(|ui| {
                        ui.horizontal_wrapped(|ui| {
                            ui.label(
                                egui::RichText::new(&member.name)
                                    .size(14.0)
                                    .strong()
                                    .color(theme::tokens(ui).text),
                            );
                            if member.is_developer {
                                theme::badge(ui, "DEVELOPER", theme::tokens(ui).primary);
                            }
                            theme::badge(ui, member.role.as_str(), theme::tokens(ui).amber);
                        });
                        theme::muted(ui, &member.email);
                        theme::muted(
                            ui,
                            &format!(
                                "Joined {}",
                                member
                                    .created_at
                                    .with_timezone(&chrono::Local)
                                    .format("%d %b %Y")
                            ),
                        );
                    });
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        let is_self = false; // deletion confirmation handled below
                        let _ = is_self;
                        if ui.button(" Reset password").clicked() {
                            self.resetting = Some(member.id.clone());
                            self.new_password.clear();
                        }
                        if ui.button(" Role").clicked() {
                            self.editing = Some(member.id.clone());
                            self.edit_role = member.role.clone();
                            self.edit_is_dev = member.is_developer;
                        }
                        if self.confirm.as_deref() != Some(member.id.as_str())
                            && super::icons::button(ui, super::icons::Icon::Delete, "Delete")
                                .clicked()
                        {
                            self.confirm = Some(member.id.clone());
                        }
                        if self.confirm.as_deref() == Some(member.id.as_str())
                            && ui
                                .button(
                                    egui::RichText::new("Really delete?")
                                        .color(theme::tokens(ui).red),
                                )
                                .clicked()
                        {
                            match crate::backend::auth::delete_team_member(
                                core,
                                &token,
                                member.id.clone(),
                            ) {
                                Ok(()) => {
                                    toasts.push(Toast::new(
                                        ToastKind::Success,
                                        format!("Removed {}", member.name),
                                    ));
                                    self.confirm = None;
                                    self.last_refresh = Instant::now() - Duration::from_secs(3600);
                                }
                                Err(error) => toasts.push(Toast::new(
                                    ToastKind::Error,
                                    format!("Delete failed: {error}"),
                                )),
                            }
                        }
                    });
                });
            });
            ui.add_space(4.0);
        }

        // ── Invites ─────────────────────────────────────────────────────────
        widgets::section_header(ui, "Pending invites");
        if self
            .invites
            .iter()
            .filter(|i| i.status == "pending")
            .count()
            == 0
        {
            theme::muted(ui, "No pending invites.");
        }
        for invite in &self.invites {
            if invite.status != "pending" {
                continue;
            }
            theme::card(ui, |ui| {
                ui.horizontal_wrapped(|ui| {
                    ui.vertical(|ui| {
                        ui.horizontal_wrapped(|ui| {
                            ui.label(
                                egui::RichText::new(&invite.email)
                                    .size(13.5)
                                    .strong()
                                    .color(theme::tokens(ui).text),
                            );
                            theme::badge(
                                ui,
                                &format!("Code {}", invite.code),
                                theme::tokens(ui).primary,
                            );
                            theme::badge(
                                ui,
                                role_str(invite.role.clone()),
                                theme::tokens(ui).amber,
                            );
                            if invite.is_developer {
                                theme::badge(ui, "DEVELOPER", theme::tokens(ui).primary);
                            }
                        });
                        theme::muted(
                            ui,
                            &format!(
                                "Expires {}",
                                invite
                                    .expires_at
                                    .with_timezone(&chrono::Local)
                                    .format("%d %b %H:%M")
                            ),
                        );
                    });
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if super::icons::button(ui, super::icons::Icon::Delete, "Delete").clicked()
                        {
                            match crate::backend::auth::delete_team_invite(
                                core,
                                &token,
                                invite.id.clone(),
                            ) {
                                Ok(()) => {
                                    toasts.push(Toast::new(
                                        ToastKind::Success,
                                        format!("Deleted invite for {}", invite.email),
                                    ));
                                    self.last_refresh = Instant::now() - Duration::from_secs(3600);
                                }
                                Err(error) => toasts.push(Toast::new(
                                    ToastKind::Error,
                                    format!("Delete failed: {error}"),
                                )),
                            }
                        }
                        if ui.button(" Code").clicked() {
                            ui.ctx().copy_text(invite.code.clone());
                            toasts.push(Toast::new(
                                ToastKind::Info,
                                format!("Invite code {} copied", invite.code),
                            ));
                        }
                    });
                });
            });
            ui.add_space(4.0);
        }

        // ── Edit role window ────────────────────────────────────────────────
        if let Some(member_id) = self.editing.clone() {
            let mut open = true;
            super::layout::dialog(ui, "Edit member role", 500.0)
                .id(egui::Id::unique("edit-role-window"))
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
                .open(&mut open)
                .show(ui.ctx(), |ui| {
                    ui.set_width(ui.available_width().min(420.0));
                    ui.label(
                        egui::RichText::new("Change member role")
                            .size(15.0)
                            .strong(),
                    );
                    ui.add_space(4.0);
                    egui::ComboBox::from_id_salt("member-role-select")
                        .width(200.0)
                        .selected_text(
                            ROLE_OPTIONS
                                .iter()
                                .find(|(role, _)| *role == self.edit_role)
                                .map(|(_, label)| *label)
                                .unwrap_or(""),
                        )
                        .show_ui(ui, |ui| {
                            for (role, label) in ROLE_OPTIONS {
                                ui.selectable_value(&mut self.edit_role, role, label);
                            }
                        });
                    ui.checkbox(&mut self.edit_is_dev, "Developer access");
                    ui.add_space(8.0);
                    ui.horizontal_wrapped(|ui| {
                        if ui.button("Save").clicked() {
                            match crate::backend::auth::update_team_member(
                                core,
                                &token,
                                member_id.clone(),
                                role_str(self.edit_role.clone()).to_string(),
                                self.edit_is_dev,
                            ) {
                                Ok(_) => {
                                    toasts.push(Toast::new(ToastKind::Success, "Member updated"))
                                }
                                Err(error) => toasts.push(Toast::new(
                                    ToastKind::Error,
                                    format!("Update failed: {error}"),
                                )),
                            }
                            self.editing = None;
                            self.last_refresh = Instant::now() - Duration::from_secs(3600);
                        }
                        if ui.button("Cancel").clicked() {
                            self.editing = None;
                        }
                    });
                });
            if !open {
                self.editing = None;
            }
        }

        // ── Reset password window ───────────────────────────────────────────
        if let Some(member_id) = self.resetting.clone() {
            let mut open = true;
            super::layout::dialog(ui, "Reset password", 500.0)
                .id(egui::Id::unique("reset-password-window"))
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
                .open(&mut open)
                .show(ui.ctx(), |ui| {
                    ui.set_width(ui.available_width().min(420.0));
                    ui.label(egui::RichText::new(" Reset password").size(15.0).strong());
                    widgets::labeled_password(ui, "New password", &mut self.new_password);
                    ui.add_space(8.0);
                    ui.horizontal_wrapped(|ui| {
                        if ui.button("Reset").clicked() {
                            if self.new_password.trim().is_empty() {
                                toasts.push(Toast::new(ToastKind::Error, "Enter a new password"));
                            } else {
                                match crate::backend::auth::reset_team_member_password(
                                    core,
                                    &token,
                                    member_id.clone(),
                                    self.new_password.clone(),
                                ) {
                                    Ok(()) => {
                                        toasts.push(Toast::new(
                                            ToastKind::Success,
                                            "Password reset; old sessions were revoked",
                                        ));
                                        self.resetting = None;
                                    }
                                    Err(error) => toasts.push(Toast::new(
                                        ToastKind::Error,
                                        format!("Reset failed: {error}"),
                                    )),
                                }
                            }
                        }
                        if ui.button("Cancel").clicked() {
                            self.resetting = None;
                        }
                    });
                });
            if !open {
                self.resetting = None;
            }
        }
    }

    fn refresh(&mut self, core: &Arc<AppCore>, token: &str) {
        if let Ok(members) = crate::backend::auth::get_team_members(core, token) {
            self.members = members;
        }
        if let Ok(invites) = crate::backend::auth::get_team_invites(core, token) {
            self.invites = invites;
        }
    }
}
