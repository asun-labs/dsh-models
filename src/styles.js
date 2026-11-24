export const styles = `
.seal-models-page { box-sizing:border-box; height:100%; min-width:0; overflow:auto; padding:var(--seal-page-inset,32px); color:var(--dsw-alias-label-primary); font:14px/1.6 var(--seal-page-font,"Segoe UI","Microsoft YaHei UI",sans-serif); }
.seal-models-page * { box-sizing:border-box; }
.seal-models-header { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:24px; }
.seal-models-header h1 { margin:0; font-size:24px; font-weight:600; line-height:32px; letter-spacing:normal; }
.seal-models-header p { margin:6px 0 0; color:var(--dsw-alias-label-secondary); }
.seal-models-page a { color:var(--dsw-alias-label-primary); text-decoration:none; }
.seal-models-page a:hover { text-decoration:underline; }
.seal-models-page :is(a,button,input,select):focus-visible { outline:2px solid var(--dsw-alias-label-secondary); outline-offset:3px; }
.seal-models-filters { display:flex; align-items:end; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
.seal-models-filters label { display:flex; flex-direction:column; gap:6px; font-size:12px; color:var(--dsw-alias-label-secondary); }
.seal-models-search { flex:1; min-width:200px; }
.seal-models-page :is(input,select,button) { height:36px; border:1px solid var(--dsw-alias-border-l2); border-radius:8px; padding:0 12px; background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); font:inherit; }
.seal-models-filters select { min-width:200px; }
.seal-models-page button { cursor:pointer; }
.seal-models-page button:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover); }
.seal-models-page button:disabled { opacity:.4; cursor:default; }
.seal-models-summary { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.seal-models-summary span,.seal-models-note,.seal-models-page footer { font-size:12px; color:var(--dsw-alias-label-secondary); }
.seal-models-note { margin:8px 0 20px; }
.seal-models-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr)); gap:16px; }
.seal-model-card { overflow:hidden; min-width:0; border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-bg-layer-1); }
.seal-model-image { height:158px; position:relative; display:grid; place-items:center; background:var(--dsw-alias-bg-layer-2); }
.seal-model-image img { object-fit:contain; width:128px; height:128px; }
.seal-model-placeholder { color:var(--dsw-alias-label-secondary); font-size:12px; }
.seal-model-format { position:absolute; right:10px; top:10px; border-radius:4px; background:var(--dsw-alias-bg-layer-1); padding:2px 6px; font-size:10px; color:var(--dsw-alias-label-secondary); }
.seal-model-body { padding:14px; }
.seal-model-category { color:var(--dsw-alias-label-secondary); font-size:11px; }
.seal-model-body h2 { margin:4px 0 8px; font-size:15px; line-height:1.5; font-weight:600; overflow-wrap:anywhere; }
.seal-model-description { color:var(--dsw-alias-label-secondary); font-size:12px; line-height:1.6; height:58px; margin:0; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; }
.seal-model-directory { margin:10px 0 12px; font-size:10px; color:var(--dsw-alias-label-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.seal-model-links { display:flex; justify-content:space-between; gap:8px; font-size:12px; padding-top:12px; border-top:1px solid var(--dsw-alias-border-l1); }
.seal-model-links>span { color:var(--dsw-alias-label-secondary); }
.seal-models-pagination { display:flex; justify-content:center; align-items:center; gap:18px; margin:24px 0; }
.seal-models-empty { padding:64px 16px; text-align:center; color:var(--dsw-alias-label-secondary); }
.seal-models-empty h2 { font-size:16px; font-weight:500; }
.seal-models-page footer { padding-top:16px; border-top:1px solid var(--dsw-alias-border-l1); }
@media(max-width:640px) { .seal-models-page { padding:20px 16px; } .seal-models-header { align-items:flex-start; } .seal-models-header>a { font-size:12px; white-space:nowrap; } .seal-models-filters label { flex:1; } }
`
