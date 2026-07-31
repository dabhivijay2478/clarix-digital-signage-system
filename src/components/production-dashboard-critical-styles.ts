export const PRODUCTION_DASHBOARD_CRITICAL_CSS = `
.production-player-surface{color-scheme:light;background:#ffffff;color:#000000;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;box-sizing:border-box;overflow:hidden}
.production-player-surface *,.production-player-surface *::before,.production-player-surface *::after{box-sizing:border-box}
.production-report{display:flex;flex-direction:column;width:100%;min-width:0;gap:8px;color:#000000}
.production-report-table-wrap{width:100%;max-width:100%;overflow-x:auto;border:1px solid #111111;background:#ffffff}
.production-report-table{width:100%;min-width:900px;border-collapse:collapse;table-layout:fixed;background:#ffffff;color:#000000;font-family:Arial,Helvetica,sans-serif;font-size:clamp(12px,1vw,16px);line-height:1.15}
.production-report-table th,.production-report-table td{height:34px;border:1px solid #111111;padding:5px 7px;text-align:center;vertical-align:middle;white-space:nowrap;font-weight:700;letter-spacing:0}
.production-report-table thead th{height:38px;background:#c00000;color:#ffffff!important;font-weight:800}
.production-report-table thead th:first-child{width:12.5%}
.production-report-table thead th span{display:inline-flex;align-items:center;justify-content:center;gap:4px}
.production-report-table thead svg{width:15px;height:15px;stroke:#ffffff;color:#ffffff;flex:0 0 auto}
.production-report-table tbody .production-line-row th,.production-report-table tbody .production-line-row td{background:#d9edf7;color:#000000}
.production-report-table tbody .production-line-row .production-ask-cell{color:#ff0000;font-weight:800}
.production-report-table tbody .production-line-row .production-forecast-cell{background:#e2f0d9;color:#ff0000;font-weight:800}
.production-report-table tbody .production-line-row .production-live-cell{background:#92d050;color:#000000}
.production-report-table tbody .production-total-row th,.production-report-table tbody .production-total-row td{background:#c00000;color:#ffffff!important;font-weight:800}
.production-chart-panel{display:flex;flex-direction:column;width:100%;height:clamp(410px,56vh,650px);min-height:360px;overflow:hidden;border:2px solid #111111;border-radius:16px;background:#ffffff;color:#000000;padding:8px 10px 6px}
.production-chart-panel h2{flex:0 0 auto;margin:0;padding:0 0 4px;text-align:center;color:#4a4a4a;font-size:clamp(18px,1.65vw,28px);font-weight:800;line-height:1.15;text-decoration:underline;text-underline-offset:3px;letter-spacing:0}
.production-chart-host{display:flex;flex:1 1 0;min-height:0;width:100%}
.production-chart-host .mg-prod-chart{width:100%!important;height:100%!important;min-height:0!important;max-height:none!important;color:#000000;position:relative}
.production-chart-host .recharts-wrapper{position:relative!important;width:100%!important;height:100%!important;min-height:0!important}
.production-chart-host .recharts-surface{width:100%!important;height:100%!important}
.production-chart-host .recharts-text,.production-chart-host .recharts-cartesian-axis-tick text,.production-chart-host .recharts-label{fill:#000000!important}
.production-chart-legend{display:flex;flex:0 0 auto;align-items:center;justify-content:center;gap:28px;min-height:26px;padding:1px 0 2px;color:#000000;font-size:clamp(11px,1vw,16px);font-weight:700;line-height:1}
.production-chart-legend span{display:inline-flex;align-items:center;gap:7px}
.production-chart-legend i{position:relative;display:block;width:32px;height:4px;background:currentColor}
.production-chart-legend i::after{position:absolute;top:50%;left:50%;width:11px;height:11px;border:3px solid currentColor;border-radius:50%;background:#ffffff;content:"";transform:translate(-50%,-50%)}
.mg-prod-player-layout{display:flex;flex-direction:column;width:100%;height:100%;min-height:100%;overflow:hidden;padding:0.7vh 0.65vw;background:#ffffff}
.mg-prod-player-layout .production-report{flex:1 1 0;height:100%;min-height:0;gap:0.65vh}
.mg-prod-player-layout .production-report-table-wrap{flex:0 0 auto;overflow:hidden}
.mg-prod-player-layout .production-report-table{min-width:0;font-size:clamp(16px,2.2vh,34px)}
.mg-prod-player-layout .production-report-table th,.mg-prod-player-layout .production-report-table td{height:clamp(34px,5.3vh,72px);padding:0.55vh 0.35vw}
.mg-prod-player-layout .production-report-table thead th{height:clamp(36px,5.6vh,76px);font-size:clamp(13px,1.85vh,28px)}
.mg-prod-player-layout .production-report-table thead svg{width:clamp(14px,1.9vh,28px);height:clamp(14px,1.9vh,28px)}
.mg-prod-player-layout .production-chart-panel{flex:1 1 0;height:auto;min-height:0;border-width:2px;border-radius:clamp(12px,1.2vw,24px);padding:0.7vh 0.7vw 0.35vh}
.mg-prod-player-layout .production-chart-panel h2{font-size:clamp(18px,2.5vh,40px);padding-bottom:0.25vh}
.mg-prod-player-layout .production-chart-legend{min-height:clamp(24px,3.5vh,48px);gap:clamp(24px,2.2vw,48px);font-size:clamp(13px,1.8vh,28px)}
.mg-prod-player-layout .production-chart-legend i{width:clamp(30px,2.7vw,52px);height:clamp(3px,0.4vh,6px)}
@media (max-width:900px){
  .production-report-table{font-size:12px}
  .production-chart-panel{height:430px;min-height:430px}
}
`;
