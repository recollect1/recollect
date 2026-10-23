// beat(n): every element with data-b="n" gets .on after its data-d seconds; data-dim="n" dims it.
window.beat = (n) => {
  document.querySelectorAll(`[data-b="${n}"]`).forEach((el) => {
    setTimeout(() => el.classList.add("on"), (parseFloat(el.dataset.d || "0")) * 1000);
  });
  document.querySelectorAll(`[data-dim="${n}"]`).forEach((el) => el.classList.add("dim"));
  (window.onBeat || (() => {}))(n);
};
document.querySelectorAll(".draw").forEach((el) => { if (el.getTotalLength) el.style.setProperty("--len", Math.ceil(el.getTotalLength())); });
// A small glowing pulse that travels along a straight segment.
window.pulse = (svg, x1, y1, x2, y2, ms, color = "#4ea1ff") => new Promise((done) => {
  const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  c.setAttribute("r", 7); c.setAttribute("fill", color); c.style.filter = `drop-shadow(0 0 6px ${color})`;
  svg.appendChild(c); const t0 = performance.now();
  const step = (t) => { const k = Math.min((t - t0) / ms, 1), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    c.setAttribute("cx", x1 + (x2 - x1) * e); c.setAttribute("cy", y1 + (y2 - y1) * e);
    if (k < 1) requestAnimationFrame(step); else { c.remove(); done(); } };
  requestAnimationFrame(step);
});
window.wait = (ms) => new Promise((r) => setTimeout(r, ms));
