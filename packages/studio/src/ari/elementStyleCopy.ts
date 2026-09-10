const regexLiteral = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Only selector tokens change: never color literals, URLs or declaration values. */
export function copyElementStyles(document: Document, original: Element, target: string) {
  const hfId = original.getAttribute("data-hf-id")!;
  const hfToken = new RegExp(`^\\[data-hf-id\\s*=\\s*(["'])${regexLiteral(hfId)}\\1\\]$`);
  const rewriteSelector = (value: string) =>
    value.replace(
      /\[[^\]]*\]|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|#(?:\\.|[\p{L}\p{N}_-])+/gu,
      (token) => {
        if (hfToken.test(token)) return `:is([data-hf-id="${hfId}"],[data-hf-id="${target}"])`;
        if (original.id && token === `#${CSS.escape(original.id)}`)
          return `:is(${token},#${target})`;
        return token;
      },
    );
  const isGroup = (rule: CSSRule): rule is CSSRule & { cssRules: CSSRuleList } =>
    "cssRules" in rule;
  const rewriteRules = (rules: CSSRuleList): string =>
    Array.from(rules)
      .map((rule) => {
        if (rule instanceof CSSStyleRule) {
          const selector = rewriteSelector(rule.selectorText);
          return `${selector} { ${rule.style.cssText} }`;
        }
        if (isGroup(rule))
          return `${rule.cssText.slice(0, rule.cssText.indexOf("{"))}{${rewriteRules(rule.cssRules)}}`;
        return rule.cssText;
      })
      .join("\n");
  for (const style of document.querySelectorAll("style")) {
    const source = style.textContent ?? "";
    if (/@import\b/i.test(source))
      throw new Error(
        "Tuontityylien elementtikohtaista kopiointia ei vielä tueta. Alkuperäinen säilyy.",
      );
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(source);
    style.textContent = rewriteRules(sheet.cssRules);
  }
}
