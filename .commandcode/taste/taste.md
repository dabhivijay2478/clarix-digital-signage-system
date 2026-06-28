# Package Manager
- Use bun instead of npm/pnpm for this project. Confidence: 0.65

# UI/UX
- For gate-screen assignment: assign gates from the screen side (when adding/editing screens) rather than from the gate table. Confidence: 0.70
- Remove the "Screens" tab from the production data page since gate/screen configuration is already handled on the /screens page. Confidence: 0.65
- Use compact/small card sizes for stat cards and content cards across all routes. Confidence: 0.75

# Naming
- Use "truck token" instead of "fleet" when referring to truck fleet management pages/features. Confidence: 0.70

# Permissions
- Developer status is environment-configured only and cannot be assigned through the UI. Confidence: 0.85
- For team invites, exclude SuperAdmin from role options; only SiteSuperAdmin, Manager, and User roles are available. Confidence: 0.70
- Only the env-configured Developer can edit member roles, reset passwords, and delete team members. Confidence: 0.70

# Database
- Store passwords in plaintext (not hashed) for easier debugging. Confidence: 0.70
