// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { openComposition } from "@hyperframes/sdk";
import { parseGsapScriptAcornForWrite } from "@hyperframes/core/gsap-parser-acorn";
import { adTemplate } from "../../../studio-server/src/ari/projectTemplates";
import { buildElementEdit, readElements } from "./elementOperations";

function document(source: string) {
  return new DOMParser().parseFromString(source, "text/html");
}
function animations(source: string) {
  return Array.from(document(source).querySelectorAll("script:not([src])")).flatMap(
    (script) =>
      parseGsapScriptAcornForWrite(script.textContent ?? "")?.located.map((row) => row.animation) ??
      [],
  );
}
const template = adTemplate("Synteettinen tuote", "product");
async function byName(source: string, name: string) {
  return (await readElements(source)).find((row) => row.name === name)!;
}

describe("unmarked local template source", () => {
  it("discovers all four existing template elements without changing source", async () => {
    const rows = await readElements(template);
    expect(rows.map((row) => [row.name, row.kind])).toEqual([
      ["Tausta", "background"],
      ["Pääviesti", "text"],
      ["Tuotekuva", "image"],
      ["Toimintakehote", "text"],
    ]);
    expect(template).not.toContain("data-ari-element");
  });
  it.each(["Tausta", "Pääviesti", "Tuotekuva", "Toimintakehote"])(
    "renames/copies/deletes %s, retaining styling and timing",
    async (name) => {
      const row = await byName(template, name);
      const renamed = await buildElementEdit(template, {
        action: "rename",
        target: row.target,
        name: "Nimi",
      });
      const original = document(renamed.after).querySelector(`[data-hf-id="${row.target}"]`)!;
      const duplicate = await buildElementEdit(renamed.after, {
        action: "duplicate",
        target: row.target,
      });
      const doc = document(duplicate.after);
      const copy = doc.querySelector(`[data-hf-id="${duplicate.target}"]`)!;
      for (const attr of [
        "class",
        "style",
        "data-start",
        "data-duration",
        "data-track-index",
        "src",
        "alt",
      ])
        expect(copy.getAttribute(attr)).toBe(original.getAttribute(attr));
      expect(copy.textContent).toBe(original.textContent);
      expect(doc.querySelectorAll(`#${original.id}`)).toHaveLength(1);
      expect(doc.querySelectorAll(`#${copy.id}`)).toHaveLength(1);
      expect(doc.querySelector("style")!.textContent).toContain(`:is(#${original.id},#${copy.id})`);
      const changed = await buildElementEdit(duplicate.after, {
        action: "rename",
        target: duplicate.target,
        name: "Vain kopio",
      });
      expect((await readElements(changed.after)).find((r) => r.target === row.target)!.name).toBe(
        "Nimi",
      );
      const removed = await buildElementEdit(changed.after, {
        action: "delete",
        target: duplicate.target,
      });
      expect((await readElements(removed.after)).map((r) => r.target)).not.toContain(
        duplicate.target,
      );
      expect((await readElements(removed.after)).map((r) => r.target)).toContain(row.target);
    },
  );
  it("retains fromTo values, ease and time, and lets SDK edit only the copied motion", async () => {
    const original = await byName(template, "Pääviesti");
    const copy = await buildElementEdit(template, { action: "duplicate", target: original.target });
    const motion = animations(copy.after).filter((a) => a.method === "fromTo");
    expect(motion).toHaveLength(2);
    const { id: _a, targetSelector: _b, ...before } = motion[0];
    const { id: _c, targetSelector: _d, ...after } = motion[1];
    expect(after).toEqual(before);
    const sdk = await openComposition(copy.after, { history: false });
    sdk.setGsapTween(sdk.getElement(copy.target)!.animationIds[0]!, {
      properties: { y: 99, opacity: 1 },
    });
    const changed = animations(sdk.serialize()).filter((a) => a.method === "fromTo");
    expect(changed[0].properties.y).toBe(0);
    expect(changed[1].properties.y).toBe(99);
    sdk.dispose();
  });
  it("copies SDK identity selectors without changing declaration values or ID prefixes", async () => {
    const source = `<html><head><style>[data-hf-id="hf-existing"] {color:#fff;} #oneä {color:red;} #one {background:url('#one');}</style></head><body><div data-composition-id="main" data-duration="7"><p data-hf-id="hf-existing" id="one">Text</p></div></body></html>`;
    const result = await buildElementEdit(source, { action: "duplicate", target: "hf-existing" });
    const css = document(result.after).querySelector("style")!.textContent!;
    expect(css).toContain(`:is([data-hf-id="hf-existing"],[data-hf-id="${result.target}"])`);
    expect(css).toContain("#oneä {");
    expect(css).toContain("#fff");
    expect(css).toContain('url("#one")');
  });
  it("includes legacy peers in overlap ordering without changing their timing", async () => {
    const row = await byName(template, "Pääviesti");
    const changed = await buildElementEdit(template, { action: "forward", target: row.target });
    const rows = await readElements(changed.after);
    expect(rows.find((r) => r.name === "Pääviesti")!.zIndex).toBeGreaterThan(
      rows.find((r) => r.name === "Tuotekuva")!.zIndex,
    );
    expect(animations(changed.after)).toEqual(animations(template));
  });
});

function motionSource(script: string) {
  return `<html><body><div data-composition-id="main" data-duration="7"><p id="one" class="target">One</p><p id="two" class="target">Two</p></div><script>const tl=gsap.timeline({paused:true});${script}window.__timelines={main:tl};</script></body></html>`;
}

describe("motion references", () => {
  it.each([
    `tl.fromTo('.target',{x:20},{x:0,duration:1,ease:'power2.out'},0).to('#two',{opacity:0,duration:1},'>');`,
    `tl.to(['#one','#two'],{keyframes:{'0%':{x:0},'100%':{x:50},easeEach:'power1.out'},duration:2},1);tl.to('#two',{y:20,duration:1});`,
    `gsap.set('.target',{opacity:0});tl.from('#one',{opacity:1,duration:1},0);`,
    `(()=>{tl.to('#one',{opacity:0.5,duration:1},0);})();`,
  ])("copies and removes static selectors without altering other motions: %s", async (script) => {
    const source = motionSource(script);
    const row = (await readElements(source))[0];
    const duplicate = await buildElementEdit(source, { action: "duplicate", target: row.target });
    const before = await openComposition(duplicate.after, { history: false });
    const originalIds = before.getElement(row.target)!.animationIds;
    const copyIds = before.getElement(duplicate.target)!.animationIds;
    expect(copyIds.length).toBeGreaterThan(0);
    expect(copyIds.some((id) => originalIds.includes(id))).toBe(false);
    before.dispose();
    const removed = await buildElementEdit(duplicate.after, {
      action: "delete",
      target: row.target,
    });
    const doc = document(removed.after);
    for (const a of animations(removed.after))
      expect(doc.querySelectorAll(a.targetSelector).length).toBeGreaterThan(0);
    expect(
      animations(removed.after).filter((a) => a.targetSelector.includes(duplicate.target)),
    ).toHaveLength(copyIds.length);
  });
  it("retains later implicit start when an earlier chained tween is removed", async () => {
    const source = motionSource(`tl.to('#one',{x:10,duration:2}).to('#two',{x:50,duration:1});`);
    const row = (await readElements(source))[0];
    const removed = await buildElementEdit(source, { action: "delete", target: row.target });
    const remaining = animations(removed.after);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].resolvedStart).toBe(2);
  });
  it.each([
    `tl.to('.target',{x:1,duration:1,stagger:0.2},0);`,
    `tl.to(getTargets(),{x:1,duration:1},0);`,
    `for(const i of [0,1]){tl.to('#one',{x:i,duration:1},i);}`,
  ])("refuses unsupported dynamic or index-dependent motion before persistence", async (script) => {
    const source = motionSource(script),
      row = (await readElements(source))[0];
    expect(document(source).querySelector("script"), source).not.toBeNull();
    await expect(
      buildElementEdit(source, { action: "duplicate", target: row.target }),
    ).rejects.toThrow("turvallisesti");
  });
});
