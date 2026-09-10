/**
 * Native setter + input/change event: exactly what a real keystroke produces.
 * React ignores a plain `node.value = …`, so every Ari panel test drives its
 * fields through this one helper.
 */
export function setNativeValue(node: HTMLElement, value: string) {
  const prototype =
    node instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : node instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(node, value);
  node.dispatchEvent(
    new Event(node instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
  );
}
export function fillField(host: HTMLElement, selector: string, value: string) {
  setNativeValue(host.querySelector<HTMLElement>(selector)!, value);
}
