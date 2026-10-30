//! All application pages. Every admin page exposes a `Page`-state struct with
//! `show(&mut self, ui, &core, &mut toasts)`; the player page omits `toasts`.

pub mod analytics;
pub mod content;
pub mod dashboard;
pub mod database_view;
pub mod login;
pub mod marquee;
pub mod player;
pub mod playlists;
pub mod production;
pub mod schedule;
pub mod screens;
pub mod settings;
pub mod team;
pub mod trucks;
pub mod widgets;
