import {
  parseGsapScriptAcornForWrite,
  type ParsedGsapAcornForWrite,
} from "@hyperframes/core/gsap-parser-acorn";
type Located = ParsedGsapAcornForWrite["located"][number];
type Edit = { start: number; end: number; text: string };
const selector = (node: Element) => `[data-hf-id="${node.getAttribute("data-hf-id")}"]`;
const refuse = () =>
  new Error(
    "Liikkeen dynaamista kohdistusta, porrastusta tai suoritusrakennetta ei voida kopioida tai poistaa turvallisesti.",
  );

function matchesTarget(document: Document, original: Element, { call, animation }: Located) {
  if (animation.hasUnresolvedSelector) throw refuse();
  let matches: Element[];
  try {
    matches = Array.from(document.querySelectorAll(animation.targetSelector));
  } catch {
    throw refuse();
  }
  if (!matches.includes(original)) return null;
  if (animation.extras?.stagger !== undefined) throw refuse();
  if (unsafeScope(call.ancestors)) throw refuse();
  return matches;
}
function unsafeScope(ancestors: Located["call"]["ancestors"]) {
  return ancestors.some((node, index) => {
    if (/^(For|While|DoWhile|If|Switch)/.test(node.type)) return true;
    if (!/^(Function|ArrowFunction)/.test(node.type)) return false;
    const parent = ancestors[index - 1];
    // Immediate wrappers execute the inserted statement in the same lexical scope.
    return parent?.type !== "CallExpression" || parent.callee !== node;
  });
}
function targetEdit(matches: Element[], original: Element, copying: boolean, { call }: Located) {
  const remaining = copying ? matches : matches.filter((node) => node !== original);
  if (remaining.some((node) => !node.hasAttribute("data-hf-id"))) throw refuse();
  if (!remaining.length)
    return {
      removed: true,
      edit: { start: call.node.callee.object.end, end: call.node.end, text: "" },
    };
  const arg = call.node.arguments[0];
  return {
    removed: false,
    edit: {
      start: arg.start,
      end: arg.end,
      text: JSON.stringify(remaining.map(selector).join(",")),
    },
  };
}
function copiedCall(source: string, timeline: string, copy: Element, { call, animation }: Located) {
  const statement = [...call.ancestors]
    .reverse()
    .find((node) => node.type === "ExpressionStatement");
  if (!statement) throw refuse();
  const args = [JSON.stringify(selector(copy))];
  if (call.fromArg) args.push(source.slice(call.fromArg.start, call.fromArg.end));
  args.push(source.slice(call.varsArg.start, call.varsArg.end));
  if (!call.global) {
    if (!Number.isFinite(animation.resolvedStart)) throw refuse();
    args.push(String(animation.resolvedStart));
  }
  return {
    offset: statement.end,
    text: `\n${call.global ? "gsap" : timeline}.${call.method}(${args.join(", ")});`,
  };
}
function pinnedPositions(located: Located[], removed: Set<number>): Edit[] {
  const edits: Edit[] = [];
  for (const { call, animation } of located) {
    if (call.global || removed.has(call.node.end)) continue;
    if (!Number.isFinite(animation.resolvedStart)) throw refuse();
    const position = call.positionArg;
    edits.push(
      position
        ? { start: position.start, end: position.end, text: String(animation.resolvedStart) }
        : {
            start: call.node.end - 1,
            end: call.node.end - 1,
            text: `, ${animation.resolvedStart}`,
          },
    );
  }
  return edits;
}
function rewriteScript(
  source: string,
  document: Document,
  original: Element,
  copy: Element | null,
) {
  const parsed = parseGsapScriptAcornForWrite(source);
  if (!parsed) throw refuse();
  const removed = new Set<number>(),
    edits: Edit[] = [],
    additions = new Map<number, string[]>();
  for (const located of parsed.located) {
    const matches = matchesTarget(document, original, located);
    if (!matches) continue;
    const result = targetEdit(matches, original, copy !== null, located);
    edits.push(result.edit);
    if (result.removed) removed.add(located.call.node.end);
    if (copy) {
      const addition = copiedCall(source, parsed.timelineVar, copy, located);
      const calls = additions.get(addition.offset) ?? [];
      calls.push(addition.text);
      additions.set(addition.offset, calls);
    }
  }
  if (!edits.length) return source;
  edits.push(...pinnedPositions(parsed.located, removed));
  return applyEdits(source, edits, additions);
}
function applyEdits(source: string, edits: Edit[], additions: Map<number, string[]>) {
  for (const [offset, calls] of additions)
    edits.push({ start: offset, end: offset, text: calls.join("") });
  let result = source;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  return result;
}
/** Preserve raw vars/keyframes and off-timeline sets. Static shared selectors become
 * exact original targets; copies get distinct calls. Pin positions before deleting calls
 * so later sequential tweens do not move. Every edit is still a detached candidate.
 */
export function rewriteElementMotion(document: Document, original: Element, copy: Element | null) {
  for (const script of document.querySelectorAll("script:not([src])")) {
    if (
      script.getAttribute("type") &&
      !["text/javascript", "application/javascript"].includes(script.getAttribute("type")!)
    )
      continue;
    script.textContent = rewriteScript(script.textContent ?? "", document, original, copy);
  }
}
