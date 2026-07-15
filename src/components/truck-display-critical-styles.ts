export const TRUCK_DISPLAY_CRITICAL_CSS = `
.mg-truck-root{position:fixed;inset:0;width:100%;height:100%;height:100dvh;overflow:hidden;background:#f4f6f8;color:#111827;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;padding:0.35vh 0.5vw 0.45vh;box-sizing:border-box}
.mg-truck-root *,.mg-truck-root *::before,.mg-truck-root *::after{box-sizing:border-box}
.mg-truck-layout{display:grid;grid-template-rows:20vh minmax(0,1fr);height:100%;min-height:0;width:100%;overflow:hidden;gap:0.35vh}
.mg-truck-top-row{display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:0.4vw;margin:0;width:100%;min-height:0;overflow:hidden;padding-right:0.25vw}
.mg-truck-back-btn{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:clamp(34px,1.7vw,52px);height:clamp(34px,1.7vw,52px);margin:0 0.35vw 0 0;padding:0;border:2px solid #059669;border-radius:8px;background:#ecfdf5;color:#047857;font-size:clamp(0.95rem,1.35vw,1.65rem);font-weight:800;line-height:1;cursor:pointer;align-self:center}
.mg-truck-back-btn:active{background:#d1fae5}
.mg-truck-back-divider{margin-right:0.25vw!important;height:55%!important}
.mg-truck-clock-wrap{display:flex;align-items:center;justify-content:center;flex-shrink:1;min-width:0;margin:0;padding:0;height:100%}
.mg-truck-clock-time{font-family:monospace;font-size:clamp(1.15rem,1.65vw,2.35rem);font-weight:800;letter-spacing:0; color:#059669;white-space:nowrap;line-height:1;margin:0;padding:0;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.mg-truck-stats{display:flex;flex-wrap:nowrap;width:100%;min-width:0;flex:1 1 auto;overflow:hidden;align-items:stretch;margin:0;padding:0;height:100%}
.mg-truck-stat-cell{flex:1 1 0;min-width:0;display:flex;justify-content:center;align-items:center;overflow:hidden;height:100%}
.mg-truck-clock-cell{flex:0 0 8.5vw;min-width:0;max-width:9.5vw;display:flex;justify-content:center;align-items:center;overflow:hidden;height:100%;padding:0 0.25vw}
.mg-truck-stat-divider,.mg-truck-clock-divider{width:2px;height:58%;background:#d1d5db;flex-shrink:0;align-self:center;margin:0}
.mg-truck-stat{display:flex;flex-direction:column;align-items:center;justify-content:center;border:none;background:transparent;overflow:hidden;margin:0;padding:0;text-align:center;height:100%;width:100%}
.mg-truck-stat-title{margin:0;font-size:clamp(1rem,1.65vw,2.4rem);font-weight:800;color:#111827;line-height:1.05;white-space:nowrap}
.mg-truck-stat-value-line{margin:0.25vh 0 0;display:flex;align-items:baseline;justify-content:center;line-height:1;white-space:nowrap;overflow:hidden}
.mg-truck-stat-suffix{font-size:clamp(0.85rem,1.25vw,1.75rem);font-weight:700;color:#4b5563;line-height:1;white-space:nowrap;margin-right:0.25vw}
.mg-truck-stat-num{font-size:clamp(1.55rem,3.1vw,4.75rem);font-weight:900;line-height:1;margin:0}
.mg-truck-branding{flex:0 0 auto;display:flex;align-items:center;justify-content:flex-end;height:58%;max-height:7vh;margin-left:0.35vw;padding-left:0.35vw;border-left:2px solid #d1d5db;overflow:hidden}
.mg-truck-branding img{display:block;height:100%;max-height:7vh;width:auto;object-fit:contain}
.mg-truck-panel{position:relative;min-height:0;width:100%;overflow:hidden;display:flex;flex-direction:column}
.mg-truck-table-wrap{flex:1 1 auto;min-height:0;width:100%;overflow:hidden;display:flex;flex-direction:column}
.mg-truck-grid{display:flex;flex-direction:column;height:100%;width:100%;overflow:hidden;min-height:0}
.mg-truck-grid-head{flex:0 0 3.2vh;display:grid;grid-template-columns:5.5vw minmax(0,1fr) 12vw 11vw;align-items:end;border:none;width:100%;overflow:visible;margin:0;padding:0 0.5vw;gap:1vw}
.mg-truck-grid:not(.mg-truck-grid--waiting) .mg-truck-grid-head{grid-template-columns:5.5vw minmax(0,1fr) 12vw}
.mg-truck-grid-head .mg-truck-col-label{font-size:clamp(0.9rem,1.2vw,1.75rem);font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#4b5563;white-space:nowrap;line-height:1;overflow:visible;margin:0;padding:0}
.mg-truck-grid-body{position:relative;flex:1 1 auto;min-height:0;width:100%;overflow:hidden;display:grid;grid-template-rows:repeat(4,minmax(0,1fr));margin:0;padding:0;gap:0}
.mg-truck-grid-row{display:grid;grid-template-columns:5.5vw minmax(0,1fr) 12vw 11vw;align-items:center;border-top:1px solid #e5e7eb;width:100%;overflow:visible;margin:0;padding:0 0.5vw;gap:1vw;min-height:0;height:100%}
.mg-truck-grid:not(.mg-truck-grid--waiting) .mg-truck-grid-row{grid-template-columns:5.5vw minmax(0,1fr) 12vw}
.mg-truck-grid-row:first-child{border-top:none}
.mg-truck-grid-row--placeholder{visibility:hidden;pointer-events:none}
.mg-truck-col-gate,.mg-truck-col-plate,.mg-truck-col-status,.mg-truck-col-est{overflow:visible;min-width:0;margin:0;padding:0}
.mg-truck-gate{display:block;font-size:clamp(1.65rem,2.85vw,4.5rem);font-weight:800;letter-spacing:0.02em;text-transform:uppercase;white-space:nowrap;line-height:1;overflow:visible;margin:0;padding:0}
.mg-truck-plate{margin:0;padding:0;font-family:monospace;font-weight:800;color:#111827;letter-spacing:0;line-height:1;font-size:clamp(1.75rem,3.4vw,5.25rem);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.mg-truck-grid--waiting .mg-truck-plate{font-size:clamp(1.65rem,3.1vw,4.75rem)}
.mg-truck-status{display:block;font-size:clamp(1.2rem,2.15vw,3.5rem);font-weight:800;letter-spacing:0.02em;text-transform:uppercase;white-space:nowrap;overflow:visible;line-height:1;margin:0;padding:0}
.mg-truck-grid--waiting .mg-truck-status{font-size:clamp(1.1rem,2vw,3.1rem)}
.mg-truck-time{font-family:monospace;font-size:clamp(1.1rem,2vw,3.1rem);font-weight:800;color:#1f2937;white-space:nowrap;overflow:visible;display:block;line-height:1;margin:0;padding:0;text-align:left}
.mg-truck-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1vh 1vw;text-align:center;pointer-events:none}
.mg-truck-empty-title{margin:0;font-size:clamp(1.35rem,2.2vw,3rem);font-weight:800;color:#9ca3af;line-height:1}
.mg-truck-empty-sub{margin:0.8vh 0 0;font-size:clamp(0.95rem,1.35vw,1.75rem);font-weight:500;color:#6b7280;line-height:1}
`;
