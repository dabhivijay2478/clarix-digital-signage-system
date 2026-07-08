export const PLAYER_CRITICAL_CSS = `
html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#f4f6f8;color:#111827;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;color-scheme:light}
*,*::before,*::after{box-sizing:border-box}
.mg-player-shell{position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;overflow:hidden;background:#f4f6f8}
.mg-player-screen{position:absolute;top:0;left:0;width:100%;height:100%;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column;-webkit-box-align:center;-webkit-align-items:center;align-items:center;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;padding:56px;background:#f4f6f8;overflow:hidden}
.mg-player-badge{position:absolute;top:28px;right:28px;z-index:50;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;padding:14px 20px;border:1px solid #d1d5db;border-radius:16px;background:#fff;font-family:monospace;font-size:18px;color:#6b7280}
.mg-player-badge-dot{width:12px;height:12px;border-radius:50%;background:#10b981;margin-right:12px}
.mg-player-card{width:100%;max-width:840px;padding:56px;border:1px solid #d1d5db;border-radius:32px;background:#fff;text-align:center;box-shadow:0 12px 32px rgba(15,23,42,0.08)}
.mg-player-logo-wrap{width:140px;height:140px;margin:0 auto 36px;padding:12px;border-radius:24px;background:#fff;border:1px solid #e5e7eb;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center}
.mg-player-logo-wrap img{max-width:100%;max-height:100%;object-fit:contain}
.mg-player-title{margin:0 0 12px;font-size:48px;font-weight:700;color:#111827}
.mg-player-subtitle{margin:0 0 40px;font-size:22px;line-height:1.5;color:#6b7280}
.mg-player-list{width:100%;max-height:480px;overflow-y:auto;-webkit-overflow-scrolling:touch}
.mg-player-list-item{display:block;width:100%;margin-bottom:16px;padding:24px;border:1px solid #e5e7eb;border-radius:16px;background:#f9fafb;color:#111827;text-align:left;cursor:pointer;font:inherit}
.mg-player-list-item:hover,.mg-player-list-item:focus{border-color:#10b981;background:#ecfdf5;outline:none}
.mg-player-list-item-name{display:block;font-size:26px;font-weight:600;color:#111827}
.mg-player-list-item-meta{display:block;margin-top:8px;font-size:18px;color:#6b7280}
.mg-player-list-item-row{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;-webkit-box-pack:justify;-webkit-justify-content:space-between;justify-content:space-between}
.mg-player-list-item-status{font-size:18px;color:#6b7280;font-family:monospace}
.mg-player-footer{margin-top:40px;padding-top:32px;border-top:1px solid #e5e7eb;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;-webkit-box-pack:justify;-webkit-justify-content:space-between;justify-content:space-between;font-size:18px;color:#6b7280}
.mg-player-footer button{border:none;background:transparent;color:#6b7280;cursor:pointer;font:inherit;font-size:18px}
.mg-player-footer button:hover,.mg-player-footer button:focus{color:#111827;outline:none}
.mg-player-btn{display:inline-block;margin-top:24px;padding:16px 28px;border:1px solid #d1d5db;border-radius:12px;background:#fff;color:#111827;font-size:20px;cursor:pointer}
.mg-player-loading{padding:36px 0;text-align:center}
.mg-player-spinner{width:56px;height:56px;margin:0 auto 18px;border:3px solid #e5e7eb;border-top-color:#10b981;border-radius:50%;-webkit-animation:mg-spin 0.8s linear infinite;animation:mg-spin 0.8s linear infinite}
.mg-player-muted{font-size:20px;color:#6b7280}
.mg-player-stage{position:absolute;top:0;left:0;width:100%;height:100%;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;overflow:hidden;background:#000}
.mg-player-media{position:relative;width:100%;height:100%;overflow:hidden}
.mg-player-media img,.mg-player-media video,.mg-player-media iframe{display:block;width:100%;height:100%;border:none;object-fit:contain}
.mg-player-wait-icon{width:112px;height:112px;margin:0 auto 36px;border:2px solid #d1d5db;border-radius:50%;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;font-size:48px;color:#059669;background:#fff}
.mg-player-info-box{max-width:640px;margin:0 auto 40px;padding:28px 36px;border:1px solid #e5e7eb;border-radius:16px;background:#f9fafb}
.mg-player-info-box h2{margin:0 0 12px;font-size:24px;font-weight:600;color:#111827}
.mg-player-info-box p{margin:0;font-size:20px;line-height:1.5;color:#6b7280}
.mg-player-meta-table{display:inline-block;padding:20px 28px;border:1px solid #e5e7eb;border-radius:16px;background:#f9fafb;font-family:monospace;font-size:18px;color:#6b7280;text-align:left}
.mg-player-meta-row{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-pack:justify;-webkit-justify-content:space-between;justify-content:space-between;min-width:420px;margin-bottom:8px}
.mg-player-meta-row span:last-child{color:#111827}
.mg-player-actions{margin-top:56px;font-size:20px;font-weight:600}
.mg-player-actions button{border:none;background:transparent;color:#6b7280;cursor:pointer;font:inherit}
.mg-player-actions button:hover,.mg-player-actions button:focus{color:#111827;outline:none}
.mg-player-marquee{position:fixed;left:0;right:0;bottom:0;z-index:90;overflow:hidden;padding:20px 0;border-top:1px solid #d1d5db;background:rgba(255,255,255,0.95);color:#111827}
.mg-player-marquee-track{display:inline-block;white-space:nowrap;font-size:40px;font-weight:700;-webkit-animation:mg-marquee 20s linear infinite;animation:mg-marquee 20s linear infinite}
@-webkit-keyframes mg-spin{to{-webkit-transform:rotate(360deg);transform:rotate(360deg)}}
@keyframes mg-spin{to{transform:rotate(360deg)}}
@-webkit-keyframes mg-marquee{from{-webkit-transform:translateX(100%);transform:translateX(100%)}to{-webkit-transform:translateX(-100%);transform:translateX(-100%)}}
@keyframes mg-marquee{from{transform:translateX(100%)}to{transform:translateX(-100%)}}
`;
