export const TRUCK_DISPLAY_CRITICAL_CSS = `
.mg-truck-root{position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;overflow:hidden;background:#f4f6f8;color:#111827;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;padding:24px;box-sizing:border-box}
.mg-truck-root *,.mg-truck-root *::before,.mg-truck-root *::after{box-sizing:border-box}
.mg-truck-layout{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column;height:100%;min-height:0;width:100%;max-width:100%;overflow:hidden}
.mg-truck-header-block{-webkit-flex-shrink:0;flex-shrink:0;margin-bottom:8px}
.mg-truck-title-main{margin:0;font-size:32px;font-weight:800;color:#111827;line-height:1}
.mg-truck-title-sub{margin:0 0 4px;font-size:14px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#059669;line-height:1}
.mg-truck-top-row{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto;-webkit-box-align:baseline;-webkit-align-items:baseline;align-items:baseline;gap:16px 24px;margin-bottom:12px;-webkit-flex-shrink:0;flex-shrink:0;width:100%;max-width:100%;overflow:visible}
.mg-truck-clock-wrap{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:baseline;-webkit-align-items:baseline;align-items:baseline;-webkit-flex-shrink:0;flex-shrink:0;white-space:nowrap;justify-self:end;grid-column:2;grid-row:1;min-width:-webkit-max-content;min-width:max-content}
.mg-truck-clock-time{font-family:monospace;font-size:clamp(1.75rem,3vw,4rem);font-weight:800;letter-spacing:0.02em;color:#059669;white-space:nowrap;line-height:1;margin:0}
.mg-truck-stats{display:-webkit-box;display:-webkit-flex;display:flex;gap:4px 0;-webkit-flex-wrap:wrap;flex-wrap:wrap;min-width:0;overflow:visible;-webkit-box-align:baseline;-webkit-align-items:baseline;align-items:baseline;grid-column:1;grid-row:1}
.mg-truck-stat-divider{width:3px;height:clamp(28px,4vw,52px);background:#d1d5db;-webkit-flex-shrink:0;flex-shrink:0;-webkit-align-self:center;align-self:center;margin:0 clamp(8px,1.2vw,20px)}
.mg-truck-stat{-webkit-box-flex:0;-webkit-flex:0 0 auto;flex:0 0 auto;display:-webkit-inline-box;display:-webkit-inline-flex;display:inline-flex;-webkit-box-align:baseline;-webkit-align-items:baseline;align-items:baseline;border:none;background:transparent;overflow:visible}
.mg-truck-stat-line{margin:0;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:baseline;-webkit-align-items:baseline;align-items:baseline;line-height:1;white-space:nowrap}
.mg-truck-stat-label{font-size:clamp(1.25rem,2.1vw,2.625rem);font-weight:800;color:#111827;line-height:1;white-space:nowrap}
.mg-truck-stat-num{font-size:clamp(2rem,3.4vw,4.25rem);font-weight:900;line-height:1;margin-left:clamp(6px,0.6vw,10px)}
.mg-truck-panel{-webkit-box-flex:1;-webkit-flex:1 1 auto;flex:1 1 auto;min-height:0;width:100%;max-width:100%;overflow:hidden;border:none;border-radius:0;background:transparent;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column}
.mg-truck-table-wrap{-webkit-box-flex:1;-webkit-flex:1 1 auto;flex:1 1 auto;min-height:0;width:100%;max-width:100%;overflow:hidden;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column}
.mg-truck-table{width:100%;max-width:100%;height:100%;border-collapse:collapse;table-layout:fixed}
.mg-truck-table thead th{padding:8px 12px;border-bottom:2px solid #d1d5db;background:transparent;font-size:20px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#4b5563;text-align:left;white-space:nowrap;height:40px}
.mg-truck-table thead th.col-gate{padding-left:12px}
.mg-truck-table tbody{height:calc(100% - 40px)}
.mg-truck-table tbody tr{height:25%}
.mg-truck-table tbody td{padding:8px 12px;border-bottom:1px solid #e5e7eb;vertical-align:middle}
.mg-truck-table tbody td.col-gate{padding-left:12px;overflow:visible}
.mg-truck-table .col-gate{width:14%}
.mg-truck-table .col-plate{width:48%}
.mg-truck-table .col-status{width:20%}
.mg-truck-table .col-est{width:18%}
.mg-truck-gate{display:inline-block;font-size:clamp(2.25rem,5vh,4rem);font-weight:800;letter-spacing:0.02em;text-transform:uppercase;white-space:nowrap;line-height:1}
.mg-truck-plate{margin:0;font-family:monospace;font-weight:800;color:#111827;letter-spacing:0.02em;line-height:1;font-size:clamp(3rem,7vh,6rem);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.mg-truck-status{display:inline-block;font-size:clamp(2rem,4.2vh,3.75rem);font-weight:800;letter-spacing:0.02em;text-transform:uppercase;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;line-height:1}
.mg-truck-time{font-family:monospace;font-size:clamp(2rem,4.2vh,3.75rem);font-weight:800;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:100%;line-height:1}
.mg-truck-empty{height:100%;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column;-webkit-box-align:center;-webkit-align-items:center;align-items:center;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;padding:24px;text-align:center}
.mg-truck-empty-title{margin:0;font-size:44px;font-weight:800;color:#9ca3af;line-height:1}
.mg-truck-empty-sub{margin:8px 0 0;font-size:24px;font-weight:500;color:#6b7280;line-height:1}
`;
