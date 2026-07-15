export const TRUCK_DISPLAY_CRITICAL_CSS = `
.mg-truck-root{position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;overflow:hidden;background:#f4f6f8;color:#111827;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;padding:24px;box-sizing:border-box}
.mg-truck-root *,.mg-truck-root *::before,.mg-truck-root *::after{box-sizing:border-box}
.mg-truck-layout{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column;height:100%;min-height:0;width:100%;max-width:100%;overflow:hidden}
.mg-truck-header-block{-webkit-flex-shrink:0;flex-shrink:0;margin-bottom:8px}
.mg-truck-title-main{margin:0;font-size:32px;font-weight:800;color:#111827;line-height:1}
.mg-truck-title-sub{margin:0 0 4px;font-size:14px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#059669;line-height:1}
.mg-truck-top-row{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:horizontal;-webkit-box-direction:normal;-webkit-flex-direction:row;flex-direction:row;-webkit-box-align:center;-webkit-align-items:center;align-items:center;-webkit-box-pack:start;-webkit-justify-content:flex-start;justify-content:flex-start;gap:0;margin:0 0 20px 0;-webkit-flex-shrink:0;flex-shrink:0;width:100%;max-width:100%;overflow:visible}
.mg-truck-clock-wrap{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;-webkit-flex-shrink:0;flex-shrink:0;white-space:nowrap;margin:0;padding:0}
.mg-truck-clock-time{font-family:monospace;font-size:2.75rem;font-weight:800;letter-spacing:0.02em;color:#059669;white-space:nowrap;line-height:1;margin:0;padding:0}
.mg-truck-stats{display:-webkit-box;display:-webkit-flex;display:flex;gap:0;-webkit-flex-wrap:nowrap;flex-wrap:nowrap;width:100%;min-width:0;-webkit-box-flex:1;-webkit-flex:1 1 auto;flex:1 1 auto;overflow:visible;-webkit-box-align:center;-webkit-align-items:center;align-items:center;margin:0;padding:0}
.mg-truck-stat-cell{-webkit-box-flex:1;-webkit-flex:1 1 0;flex:1 1 0;min-width:0;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;-webkit-box-align:center;-webkit-align-items:center;align-items:center;overflow:visible}
.mg-truck-clock-cell{-webkit-box-flex:1;-webkit-flex:1 1 0;flex:1 1 0;min-width:0;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;-webkit-box-align:center;-webkit-align-items:center;align-items:center;overflow:visible}
.mg-truck-stat-divider{width:3px;height:clamp(52px,5.5vw,76px);background:#d1d5db;-webkit-flex-shrink:0;flex-shrink:0;-webkit-align-self:center;align-self:center;margin:0}
.mg-truck-clock-divider{width:3px;height:clamp(52px,5.5vw,76px);background:#d1d5db;-webkit-flex-shrink:0;flex-shrink:0;-webkit-align-self:center;align-self:center;margin:0}
.mg-truck-stat{-webkit-box-flex:0;-webkit-flex:0 0 auto;flex:0 0 auto;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column;-webkit-box-align:center;-webkit-align-items:center;align-items:center;border:none;background:transparent;overflow:visible;margin:0;padding:0;text-align:center}
.mg-truck-stat-title{margin:0;font-size:1.75rem;font-weight:800;color:#111827;line-height:1.1;white-space:nowrap}
.mg-truck-stat-value-line{margin:6px 0 0;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:baseline;-webkit-align-items:baseline;align-items:baseline;line-height:1;white-space:nowrap;overflow:visible}
.mg-truck-stat-suffix{font-size:1.5rem;font-weight:700;color:#4b5563;line-height:1;white-space:nowrap;margin-right:8px}
.mg-truck-stat-num{font-size:2.75rem;font-weight:900;line-height:1;margin:0}
.mg-truck-panel{-webkit-box-flex:1;-webkit-flex:1 1 auto;flex:1 1 auto;min-height:0;width:100%;max-width:100%;overflow:visible;border:none;border-radius:0;background:transparent;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column}
.mg-truck-table-wrap{-webkit-box-flex:1;-webkit-flex:1 1 auto;flex:1 1 auto;min-height:0;width:100%;max-width:100%;overflow:visible;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column}
.mg-truck-grid{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column;height:100%;width:100%;overflow:visible}
.mg-truck-grid-head{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-flex:0 0 auto;flex:0 0 auto;-webkit-box-align:end;-webkit-align-items:flex-end;align-items:flex-end;border:none;width:100%;overflow:visible;margin:0 0 12px 0;padding:0;gap:32px}
.mg-truck-grid-head .mg-truck-col-gate,.mg-truck-grid-head .mg-truck-col-plate,.mg-truck-grid-head .mg-truck-col-status,.mg-truck-grid-head .mg-truck-col-est{margin-right:32px}
.mg-truck-grid-head .mg-truck-col-est:last-child,.mg-truck-grid-head .mg-truck-col-status:last-child{margin-right:0}
.mg-truck-grid-head .mg-truck-col-label{font-size:2rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#4b5563;white-space:nowrap;line-height:1;overflow:visible;text-overflow:clip;max-width:none;margin:0;padding:0}
.mg-truck-grid-body{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column;-webkit-box-flex:1;-webkit-flex:1 1 auto;flex:1 1 auto;min-height:0;width:100%;overflow:visible;margin:0;padding:0;gap:0}
.mg-truck-grid-row{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-flex:1;-webkit-flex:1 1 0;flex:1 1 0;-webkit-box-align:center;-webkit-align-items:center;align-items:center;border:none;width:100%;overflow:visible;margin:0;padding:0;gap:32px}
.mg-truck-grid-row .mg-truck-col-gate,.mg-truck-grid-row .mg-truck-col-plate,.mg-truck-grid-row .mg-truck-col-status,.mg-truck-grid-row .mg-truck-col-est{margin-right:32px}
.mg-truck-grid-row .mg-truck-col-est:last-child,.mg-truck-grid-row .mg-truck-col-status:last-child{margin-right:0}
.mg-truck-col-gate{-webkit-flex:0 0 auto;flex:0 0 auto;overflow:visible;text-overflow:clip;max-width:none;margin:0;padding:0}
.mg-truck-col-plate{-webkit-box-flex:1;-webkit-flex:1 1 auto;flex:1 1 auto;overflow:visible;text-overflow:clip;max-width:none;margin:0;padding:0;min-width:0}
.mg-truck-col-status{-webkit-flex:0 0 auto;flex:0 0 auto;overflow:visible;text-overflow:clip;max-width:none;margin:0;padding:0}
.mg-truck-col-est{-webkit-flex:0 0 auto;flex:0 0 auto;overflow:visible;text-overflow:clip;max-width:none;margin:0;padding:0}
.mg-truck-grid--waiting .mg-truck-col-status{-webkit-flex:0 0 auto;flex:0 0 auto}
.mg-truck-grid--waiting .mg-truck-col-est{-webkit-flex:0 0 auto;flex:0 0 auto}
.mg-truck-gate{display:block;font-size:4.5rem;font-weight:800;letter-spacing:0.02em;text-transform:uppercase;white-space:nowrap;line-height:1;overflow:visible;text-overflow:clip;max-width:none;margin:0;padding:0}
.mg-truck-plate{margin:0;padding:0;font-family:monospace;font-weight:800;color:#111827;letter-spacing:0;line-height:1;font-size:5.5rem;white-space:nowrap;overflow:visible;text-overflow:clip;max-width:none}
.mg-truck-grid--waiting .mg-truck-plate{font-size:4.75rem}
.mg-truck-status{display:block;font-size:3.75rem;font-weight:800;letter-spacing:0.02em;text-transform:uppercase;white-space:nowrap;overflow:visible;text-overflow:clip;max-width:none;line-height:1;margin:0;padding:0}
.mg-truck-grid--waiting .mg-truck-status{font-size:3.25rem}
.mg-truck-time{font-family:monospace;font-size:3.25rem;font-weight:800;color:#1f2937;white-space:nowrap;overflow:visible;text-overflow:clip;display:block;max-width:none;line-height:1;margin:0;padding:0}
.mg-truck-empty{height:100%;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;flex-direction:column;-webkit-box-align:center;-webkit-align-items:center;align-items:center;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;padding:24px;text-align:center}
.mg-truck-empty-title{margin:0;font-size:44px;font-weight:800;color:#9ca3af;line-height:1}
.mg-truck-empty-sub{margin:8px 0 0;font-size:24px;font-weight:500;color:#6b7280;line-height:1}
.mg-truck-branding{position:fixed;right:40px;bottom:40px;z-index:9999;pointer-events:none;background:transparent!important;border:0!important;border-radius:0!important;padding:0!important;box-shadow:none!important;backdrop-filter:none!important;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center}
.mg-truck-branding img{display:block;height:90px;width:auto;object-fit:contain;filter:none!important}
`;
