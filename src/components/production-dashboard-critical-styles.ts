export const PRODUCTION_DASHBOARD_CRITICAL_CSS = `
.production-player-surface{color-scheme:light;background:#ffffff;color:#000000;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;box-sizing:border-box;overflow:hidden}
.production-player-surface *,.production-player-surface *::before,.production-player-surface *::after{box-sizing:border-box}
.production-player-surface{--background:#ffffff;--foreground:#000000;--card:#ffffff;--card-foreground:#000000;--primary:#059669;--primary-foreground:#ffffff;--muted:#f1f5f9;--muted-foreground:#000000;--border:#e2e8f0}
.production-player-surface,.production-player-surface *{color:#000000!important}
.production-player-surface .recharts-text,.production-player-surface .recharts-cartesian-axis-tick text,.production-player-surface .recharts-label{fill:#000000!important}
.mg-prod-player-layout{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column;width:100%;height:100%;min-height:100%;overflow:hidden;gap:0;padding:0}
.mg-prod-player-layout>.mg-prod-table-card{-webkit-flex:0 0 48%;flex:0 0 48%;height:48%;min-height:0;overflow:hidden}
.mg-prod-player-layout>.mg-prod-chart-card{-webkit-box-flex:1;-webkit-flex:1 1 52%;flex:1 1 52%;height:52%;min-height:0;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column;overflow:hidden}
.mg-prod-player-layout [data-slot="card"]{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column;gap:0;border-radius:0;border:0;background:#ffffff;color:#000000;box-shadow:none;padding-top:0;padding-bottom:0;margin:0}
.mg-prod-player-layout .mg-prod-card-header{display:grid;gap:0;padding:0.45vh 0.8vw;border-bottom:0;-webkit-flex-shrink:0;flex-shrink:0}
.mg-prod-player-layout .mg-prod-card-title{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;gap:0.6vw;font-size:clamp(22px,2.7vh,44px);font-weight:800;line-height:1.08;color:#000000}
.mg-prod-player-layout .mg-prod-card-title-icon{width:clamp(22px,2.7vh,42px);height:clamp(22px,2.7vh,42px);-webkit-flex-shrink:0;flex-shrink:0;color:#000000}
.mg-prod-player-layout .mg-prod-card-desc{font-size:clamp(15px,1.75vh,28px);line-height:1.2;color:#000000}
.mg-prod-player-layout [data-slot="card-content"]{padding:0;min-height:0}
.mg-prod-player-layout>.mg-prod-table-card>[data-slot="card-content"]{-webkit-box-flex:1;-webkit-flex:1 1 0;flex:1 1 0;display:-webkit-box;display:-webkit-flex;display:flex;min-height:0;overflow:hidden}
.mg-prod-player-layout>.mg-prod-table-card [data-slot="table-container"]{height:100%;min-height:0}
.mg-prod-player-layout>.mg-prod-table-card [data-slot="table"]{height:100%}
.mg-prod-player-layout>.mg-prod-chart-card .mg-prod-card-header{padding:0.2vh 0.8vw}
.mg-prod-player-layout>.mg-prod-chart-card .mg-prod-card-title{font-size:clamp(16px,1.9vh,30px);line-height:1.05}
.mg-prod-player-layout .mg-prod-chart-content{-webkit-box-flex:1;-webkit-flex:1 1 0;flex:1 1 0;min-height:0;height:100%;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column;padding:0;overflow:hidden}
.mg-prod-player-layout [data-slot="table-container"]{position:relative;width:100%;overflow:hidden}
.mg-prod-player-layout [data-slot="table"]{width:100%;border-collapse:collapse;table-layout:fixed;font-size:clamp(19px,2.8vh,44px);line-height:1.2}
.mg-prod-player-layout [data-slot="table-header"] [data-slot="table-row"]{border-bottom:0;background:#f8fafc}
.mg-prod-player-layout .mg-prod-th{height:auto;padding:1vh 0.55vw;text-align:center;vertical-align:middle;font-size:clamp(15px,2vh,32px);font-weight:800;letter-spacing:0;text-transform:uppercase;color:#000000;white-space:nowrap;line-height:1.1}
.mg-prod-player-layout [data-slot="table-body"] [data-slot="table-row"]{border-bottom:0}
.mg-prod-player-layout .mg-prod-td{padding:1.25vh 0.55vw;text-align:center;vertical-align:middle;white-space:nowrap;font-size:clamp(19px,2.8vh,44px);font-weight:650;color:#000000;line-height:1.16}
.mg-prod-player-layout [data-slot="table-footer"] [data-slot="table-row"]{border-top:0;background:#f1f5f9;font-weight:700}
.mg-prod-player-layout [data-slot="badge"]{display:-webkit-inline-box;display:-webkit-inline-flex;display:inline-flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;border-radius:999px;border:0;background:rgba(34,197,94,0.1);padding:0.3vh 0.7vw;font-size:clamp(16px,1.9vh,30px);font-weight:800;color:#000000!important;white-space:nowrap;line-height:1.1}
.mg-prod-player-layout .mg-prod-chart{aspect-ratio:auto!important;-webkit-box-flex:1;-webkit-flex:1 1 0;flex:1 1 0;width:100%!important;height:100%!important;min-height:0!important;max-height:none!important;font-size:clamp(12px,1.35vh,20px);color:#000000;position:relative}
.mg-prod-player-layout .recharts-responsive-container{width:100%!important;height:100%!important;min-height:0!important;position:relative}
.mg-prod-player-layout .recharts-wrapper{position:relative!important;width:100%!important;height:100%!important;min-height:0!important}
.mg-prod-player-layout .recharts-surface{width:100%!important;height:100%!important;overflow:visible}
.mg-prod-player-layout .recharts-cartesian-grid line{stroke:#e2e8f0;stroke-dasharray:3 3}
.mg-prod-player-layout .recharts-legend-wrapper{font-size:clamp(12px,1.35vh,20px);font-weight:700;color:#000000;padding-top:0.15vh}
.mg-prod-player-layout .recharts-legend-item-text{color:#000000!important;font-size:clamp(12px,1.35vh,20px);font-weight:700}
.mg-prod-player-layout .recharts-default-legend{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;gap:1vw;padding-top:0.4vh;margin:0}
.mg-prod-player-layout .mg-prod-line-dot{display:inline-block;width:clamp(8px,1vh,18px);height:clamp(8px,1vh,18px);border-radius:50%;margin-right:0.35vw;vertical-align:middle}
.mg-prod-player-layout .mg-prod-ask-badge{display:-webkit-inline-box;display:-webkit-inline-flex;display:inline-flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;border-radius:6px;padding:0.3vh 0.7vw;font-size:clamp(16px,1.9vh,30px);font-weight:800;color:#1a1a1a!important;background:#ffe600;min-width:56px;line-height:1.1}
`;
