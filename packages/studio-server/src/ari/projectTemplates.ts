export type AdTemplate = "blank" | "product";
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );

/** A local, silent, editable 7 s portrait source. No runtime network dependency. */
export function adTemplate(name: string, template: AdTemplate): string {
  const product = template === "product";
  return `<!doctype html>
<html lang="fi"><head><meta charset="utf-8"><title>${escapeHtml(name)}</title>
<style>
@font-face { font-family:'Ari Sans'; font-style:normal; font-weight:400; src:url('assets/fonts/inter-400.woff2') format('woff2'); }
@font-face { font-family:'Ari Sans'; font-style:normal; font-weight:700; src:url('assets/fonts/inter-700.woff2') format('woff2'); }
html,body { margin:0; width:1080px; height:1920px; overflow:hidden; background:#172b27; }
#main { position:relative; width:1080px; height:1920px; font-family:'Ari Sans'; color:#172b27; }
#tausta { position:absolute; inset:0; background:#f2eedf; }
#pääviesti { position:absolute; left:90px; top:220px; width:900px; font-size:100px; line-height:1.1; font-weight:700; margin:0; }
#tuotekuva { position:absolute; left:240px; top:690px; width:600px; height:640px; object-fit:contain; }
#toimintakehote { position:absolute; left:90px; top:1560px; width:900px; font-size:56px; line-height:1.2; margin:0; }
</style><script src="assets/gsap.min.js"></script><script src="assets/MotionPathPlugin.min.js"></script></head><body>
<div id="main" data-composition-id="main" data-start="0" data-duration="7" data-width="1080" data-height="1920">
<div id="tausta" class="clip" data-start="0" data-duration="7" data-track-index="0" data-label="Tausta"></div>
${
  product
    ? `<h1 id="pääviesti" class="clip" data-start="0" data-duration="7" data-track-index="1" data-label="Pääviesti">Oma pääviestisi tähän</h1>
<img id="tuotekuva" class="clip" data-start="0" data-duration="7" data-track-index="2" data-label="Tuotekuva" src="assets/product.png" alt="Mallipohjan esimerkkituote">
<p id="toimintakehote" class="clip" data-start="0" data-duration="7" data-track-index="3" data-label="Toimintakehote">Tutustu tuotteeseen</p>`
    : ""
}
</div><script>
const tl = gsap.timeline({ paused: true });
tl.to('#tausta', { duration: 7, backgroundColor: '#f2eedf', ease: 'none' }, 0);
${product ? "tl.fromTo('#pääviesti', { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'power2.out' }, 0);" : "tl.fromTo('#tausta', { opacity: 0 }, { opacity: 1, duration: 0.8, ease: 'power1.out' }, 0);"}
window.__timelines = window.__timelines || {};
window.__timelines.main = tl;
</script></body></html>\n`;
}
