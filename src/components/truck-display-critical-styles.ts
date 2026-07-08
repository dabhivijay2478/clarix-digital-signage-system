export const TRUCK_DISPLAY_CRITICAL_CSS = `
.mg-truck-root{position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;overflow:hidden;background:#f4f6f8;color:#111827;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;padding:12px 20px;box-sizing:border-box}
.mg-truck-root *,.mg-truck-root *::before,.mg-truck-root *::after{box-sizing:border-box}
.mg-truck-layout{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column;height:100%;min-height:0;width:100%;max-width:100%;overflow:hidden}
.mg-truck-header-block{margin-bottom:6px;-webkit-flex-shrink:0;flex-shrink:0}
.mg-truck-title-main{margin:0;font-size:30px;font-weight:800;color:#111827}
.mg-truck-title-sub{margin:0 0 2px;font-size:14px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#059669}
.mg-truck-top-row{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:baseline;-webkit-align-items:baseline;align-items:baseline;-webkit-box-pack:justify;-webkit-justify-content:space-between;justify-content:space-between;gap:16px;margin-bottom:8px;-webkit-flex-wrap:nowrap;flex-wrap:nowrap;-webkit-flex-shrink:0;flex-shrink:0;width:100%;max-width:100%;overflow:hidden}
.mg-truck-clock-wrap{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:baseline;-webkit-align-items:baseline;align-items:baseline;-webkit-flex-shrink:0;flex-shrink:0;margin-left:auto;white-space:nowrap}
.mg-truck-clock-time{font-family:monospace;font-size:56px;font-weight:800;letter-spacing:0.02em;color:#059669;white-space:nowrap;line-height:1}
.mg-truck-stats{display:-webkit-box;display:-webkit-flex;display:flex;gap:24px;-webkit-flex-wrap:nowrap;flex-wrap:nowrap;-webkit-box-flex:1;-webkit-flex:1 1 auto;flex:1 1 auto;min-width:0;overflow:hidden;-webkit-box-align:baseline;-webkit-align-items:baseline;align-items:baseline}
.mg-truck-stat{-webkit-box-flex:0;-webkit-flex:0 0 auto;flex:0 0 auto;min-width:0;display:-webkit-inline-box;display:-webkit-inline-flex;display:inline-flex;-webkit-box-align:baseline;-webkit-align-items:baseline;align-items:baseline;padding:0;border:none;background:transparent;overflow:visible}
.mg-truck-stat-line{margin:0;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:baseline;-webkit-align-items:baseline;align-items:baseline;line-height:1;white-space:nowrap}
.mg-truck-stat-num{font-size:60px;font-weight:900;line-height:1;-webkit-flex-shrink:0;flex-shrink:0}
.mg-truck-stat-sep{margin:0 8px;font-size:42px;font-weight:700;color:#9ca3af;line-height:1;-webkit-flex-shrink:0;flex-shrink:0}
.mg-truck-stat-label{font-size:38px;font-weight:800;color:#111827;line-height:1;white-space:nowrap}
.mg-truck-panel{-webkit-box-flex:1;-webkit-flex:1 1 auto;flex:1 1 auto;min-height:0;width:100%;max-width:100%;overflow:hidden;border:none;border-radius:0;background:transparent;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column}
.mg-truck-table-wrap{-webkit-box-flex:1;-webkit-flex:1 1 auto;flex:1 1 auto;min-height:0;width:100%;max-width:100%;overflow:hidden;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column}
.mg-truck-table{width:100%;max-width:100%;height:100%;border-collapse:collapse;table-layout:fixed}
.mg-truck-table thead th{padding:6px 12px 8px 0;border-bottom:2px solid #d1d5db;background:transparent;font-size:18px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#4b5563;text-align:left;white-space:nowrap;height:36px}
.mg-truck-table tbody{height:calc(100% - 36px)}
.mg-truck-table tbody tr{height:25%}
.mg-truck-table tbody td{padding:0 12px 0 0;border-bottom:1px solid #e5e7eb;vertical-align:middle;overflow:hidden}
.mg-truck-table .col-gate{width:12%}
.mg-truck-table .col-plate{width:50%}
.mg-truck-table .col-status{width:20%}
.mg-truck-table .col-est{width:18%}
.mg-truck-gate{display:inline-block;font-size:clamp(2rem,4.5vh,3.5rem);font-weight:800;letter-spacing:0.02em;text-transform:uppercase;white-space:nowrap;line-height:1}
.mg-truck-plate{margin:0;font-family:monospace;font-weight:800;color:#111827;letter-spacing:0.02em;line-height:1;font-size:clamp(2.75rem,6.5vh,5.5rem);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.mg-truck-status{display:inline-block;font-size:clamp(1.75rem,3.8vh,3.25rem);font-weight:800;letter-spacing:0.02em;text-transform:uppercase;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;line-height:1}
.mg-truck-time{font-family:monospace;font-size:clamp(1.75rem,3.8vh,3.25rem);font-weight:800;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:100%;line-height:1}
.mg-truck-empty{height:100%;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column;-webkit-box-align:center;-webkit-align-items:center;align-items:center;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;padding:24px;text-align:center}
.mg-truck-empty-title{margin:0;font-size:40px;font-weight:800;color:#9ca3af}
.mg-truck-empty-sub{margin:10px 0 0;font-size:22px;font-weight:500;color:#6b7280}
`;
