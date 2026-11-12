// Terminal-style intro animation for the home screen (typing + spinner).
// Purely decorative: respects prefers-reduced-motion and can be cancelled when the view changes.

const SPINNER = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("aborted", "AbortError")); }, { once: true });
});

/**
 * @param {HTMLElement} el   container (.term-body)
 * @param {{cmd: string, steps: {busy: string, done: string}[], prompt: string}} script
 *        each step shows a spinner with `busy`, then is replaced by `done` (HTML allowed, trusted input only)
 * @param {AbortSignal} [signal]
 */
export async function playTerminal(el, script, signal) {
  const final = () => {
    el.innerHTML = `<span class="p">$</span> ${script.cmd}\n` +
      script.steps.map((s) => s.done).join("\n") + `\n<span class="p">›</span> ${script.prompt}<span class="cursor"></span>`;
  };
  if (reduced()) return final();
  try {
    el.innerHTML = `<span class="p">$</span> <span class="typed"></span><span class="cursor"></span>`;
    const typed = el.querySelector(".typed");
    for (const ch of script.cmd) { typed.textContent += ch; await sleep(28 + Math.random() * 40, signal); }
    await sleep(220, signal);
    let html = `<span class="p">$</span> ${script.cmd}\n`;
    for (const step of script.steps) {
      const start = performance.now();
      let i = 0;
      while (performance.now() - start < 420 + Math.random() * 260) {
        el.innerHTML = html + `<span class="spin">${SPINNER[i++ % SPINNER.length]}</span> <span class="dim">${step.busy}</span>`;
        await sleep(80, signal);
      }
      html += step.done + "\n";
      el.innerHTML = html;
    }
    el.innerHTML = html + `<span class="p">›</span> ${script.prompt}<span class="cursor"></span>`;
  } catch (e) {
    if (e.name === "AbortError") return;
    final();
  }
}

/** Small inline spinner element for short waits (e.g. building an exam). */
export function spinnerHtml(text) {
  return `<span class="spin" data-spin>✻</span> <span class="dim">${text}</span>`;
}
export function animateSpinners(root = document) {
  if (reduced()) return () => {};
  let i = 0;
  const t = setInterval(() => {
    i++;
    root.querySelectorAll("[data-spin]").forEach((s) => { s.textContent = SPINNER[i % SPINNER.length]; });
  }, 80);
  return () => clearInterval(t);
}
