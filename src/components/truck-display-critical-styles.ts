export const TRUCK_DISPLAY_CRITICAL_CSS = `
.mg-truck-root{position:fixed;inset:0;width:100%;height:100%;height:100dvh;overflow:hidden;background:#f4f6f8;color:#111827;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;padding:0;box-sizing:border-box}
.mg-truck-root *,.mg-truck-root *::before,.mg-truck-root *::after{box-sizing:border-box}
.mg-truck-layout{display:grid;grid-template-rows:18vh minmax(0,1fr);height:100%;min-height:0;width:100%;overflow:hidden;gap:0}
.mg-truck-top-row{display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:0.5vw;margin:0;width:100%;min-height:0;overflow:hidden;padding:0 0.4vw}
.mg-truck-back-btn{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:clamp(40px,2vw,64px);height:clamp(40px,2vw,64px);margin:0 0.5vw 0 0;padding:0;border:none;border-radius:8px;background:#ecfdf5;color:#047857;font-size:clamp(1.1rem,1.6vw,2rem);font-weight:800;line-height:1;cursor:pointer;align-self:center}
.mg-truck-back-btn:active{background:#d1fae5}
.mg-truck-stat-divider,.mg-truck-clock-divider,.mg-truck-back-divider{display:none!important}
.mg-truck-clock-wrap{display:flex;align-items:center;justify-content:center;flex-shrink:1;min-width:0;margin:0;padding:0;height:100%}
.mg-truck-clock-time{font-family:monospace;font-size:clamp(1.5rem,2.2vw,3.25rem);font-weight:800;letter-spacing:0;color:#059669;white-space:nowrap;line-height:1;margin:0;padding:0;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.mg-truck-stats{display:flex;flex-wrap:nowrap;width:100%;min-width:0;flex:1 1 auto;overflow:hidden;align-items:stretch;margin:0;padding:0;height:100%;gap:0.25vw}
.mg-truck-stat-cell{flex:1 1 0;min-width:0;display:flex;justify-content:center;align-items:center;overflow:hidden;height:100%}
.mg-truck-clock-cell{flex:0 0 9vw;min-width:0;max-width:10vw;display:flex;justify-content:center;align-items:center;overflow:hidden;height:100%;padding:0}
.mg-truck-stat{display:flex;flex-direction:column;align-items:center;justify-content:center;border:none;background:transparent;overflow:hidden;margin:0;padding:0;text-align:center;height:100%;width:100%}
.mg-truck-stat-title{margin:0;font-size:clamp(1.25rem,1.85vw,2.5rem);font-weight:800;color:#111827;line-height:1.05;white-space:nowrap}
.mg-truck-stat-value-line{margin:0.2vh 0 0;display:flex;align-items:baseline;justify-content:center;line-height:1;white-space:nowrap;overflow:hidden}
.mg-truck-stat-suffix{font-size:clamp(1rem,1.45vw,2rem);font-weight:700;color:#4b5563;line-height:1;white-space:nowrap;margin-right:0.35vw}
.mg-truck-stat-num{font-size:clamp(2rem,3.5vw,5.5rem);font-weight:900;line-height:1;margin:0}
.mg-truck-branding{flex:0 0 auto;display:flex;align-items:center;justify-content:flex-end;height:62%;max-height:8vh;margin-left:0.5vw;padding:0;border:none;overflow:hidden}
.mg-truck-branding img{display:block;height:100%;max-height:8vh;width:auto;object-fit:contain}
.mg-truck-panel{position:relative;min-height:0;width:100%;overflow:hidden;display:flex;flex-direction:column;padding:0 0.4vw 0.3vh}
.mg-truck-table-wrap{flex:1 1 auto;min-height:0;width:100%;overflow:hidden;display:flex;flex-direction:column}
.mg-truck-grid{display:flex;flex-direction:column;height:100%;width:100%;overflow:hidden;min-height:0;gap:0}
.mg-truck-grid-head{flex:0 0 auto;display:grid;grid-template-columns:6vw minmax(0,1fr) 14vw 12vw;align-items:end;border:none;width:100%;overflow:visible;margin:0;padding:0;gap:0.75vw}
.mg-truck-grid:not(.mg-truck-grid--waiting) .mg-truck-grid-head{grid-template-columns:6vw minmax(0,1fr) 14vw}
.mg-truck-grid-head .mg-truck-col-label{font-size:clamp(1.1rem,1.5vw,2.25rem);font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#4b5563;white-space:nowrap;line-height:1;overflow:visible;margin:0;padding:0}
.mg-truck-grid-body{position:relative;flex:1 1 auto;min-height:0;width:100%;overflow:hidden;display:grid;grid-template-rows:repeat(4,minmax(0,1fr));margin:0;padding:0;gap:0}
.mg-truck-grid-row{display:grid;grid-template-columns:6vw minmax(0,1fr) 14vw 12vw;align-items:center;border:none;width:100%;overflow:visible;margin:0;padding:0;gap:0.75vw;min-height:0;height:100%}
.mg-truck-grid:not(.mg-truck-grid--waiting) .mg-truck-grid-row{grid-template-columns:6vw minmax(0,1fr) 14vw}
.mg-truck-grid-row--placeholder{visibility:hidden;pointer-events:none}
.mg-truck-col-gate,.mg-truck-col-plate,.mg-truck-col-status,.mg-truck-col-est{overflow:visible;min-width:0;margin:0;padding:0}
.mg-truck-gate{display:block;font-size:clamp(2.25rem,3.8vw,6rem);font-weight:800;letter-spacing:0.02em;text-transform:uppercase;white-space:nowrap;line-height:1;overflow:visible;margin:0;padding:0}
.mg-truck-plate{margin:0;padding:0;font-family:monospace;font-weight:800;color:#111827;letter-spacing:0;line-height:1;font-size:clamp(2.5rem,4.5vw,7rem);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.mg-truck-grid--waiting .mg-truck-plate{font-size:clamp(2.25rem,4.1vw,6.25rem)}
.mg-truck-status{display:block;font-size:clamp(1.85rem,3.2vw,5.25rem);font-weight:800;letter-spacing:0.02em;text-transform:uppercase;white-space:nowrap;overflow:visible;line-height:1;margin:0;padding:0}
.mg-truck-grid--waiting .mg-truck-status{font-size:clamp(1.65rem,2.9vw,4.75rem)}
.mg-truck-time{font-family:monospace;font-size:clamp(1.65rem,2.9vw,4.75rem);font-weight:800;color:#1f2937;white-space:nowrap;overflow:visible;display:block;line-height:1;margin:0;padding:0;text-align:left}
.mg-truck-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1vh 1vw;text-align:center;pointer-events:none}
.mg-truck-empty-title{margin:0;font-size:clamp(1.75rem,2.8vw,3.75rem);font-weight:800;color:#9ca3af;line-height:1}
.mg-truck-empty-sub{margin:0.6vh 0 0;font-size:clamp(1rem,1.5vw,2rem);font-weight:500;color:#6b7280;line-height:1}
`;
