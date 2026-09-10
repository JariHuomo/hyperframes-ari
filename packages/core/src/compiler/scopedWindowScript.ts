/** Emitted inside the composition wrapper, sharing its instance-local bindings. */
export function scopedWindowScript(): string {
  return `  var __hfTimelineRegistryProxy = null;
  var __hfGetTimelineRegistry = function() {
    window.__timelines = window.__timelines || {};
    if (!__hfCompId || __hfCompId === __hfTimelineCompId || typeof Proxy !== "function") {
      return window.__timelines;
    }
    if (!__hfTimelineRegistryProxy) {
      __hfTimelineRegistryProxy = new Proxy(window.__timelines, {
        get: function(target, prop, receiver) {
          if (prop !== __hfCompId) {
            return Reflect.get(target, prop, target);
          }
          var runtimeValue = Reflect.get(target, __hfTimelineCompId, target);
          return runtimeValue === undefined
            ? Reflect.get(target, prop, target)
            : runtimeValue;
        },
        set: function(target, prop, value, receiver) {
          if (prop !== __hfCompId) {
            return Reflect.set(target, prop, value, target);
          }
          // The authored node remains in the compiled DOM when its local id
          // differs from the runtime mount id, so readiness legitimately sees
          // both compositions. Publish the same timeline under both identities
          // instead of replacing one with the other.
          var previousRuntime = Reflect.get(target, __hfTimelineCompId, target);
          var authoredValue = Reflect.get(target, __hfCompId, target);
          // An authored alias may already belong to a different mounted instance.
          // Never replace that instance when publishing this copy's timeline.
          var authoredSet = authoredValue === undefined || authoredValue === previousRuntime
            ? Reflect.set(target, __hfCompId, value, target)
            : true;
          var runtimeSet = Reflect.set(target, __hfTimelineCompId, value, target);
          return authoredSet && runtimeSet;
        },
      });
    }
    return __hfTimelineRegistryProxy;
  };
  var __hfScopedWindow = typeof Proxy === "function"
    ? new Proxy(window, {
        get: function(target, prop, receiver) {
          if (prop === "__timelines") return __hfGetTimelineRegistry();
          // Inside a sub-composition, __hyperframes is passed as a bare script
          // param bound to the SCOPED variant (per-comp getVariables). But
          // authors routinely write the documented window.__hyperframes.
          // getVariables() form, which would otherwise fall through to the host
          // page's base __hyperframes and return the WRONG (or empty) variables
          // for this instance. Route it to the scoped variant too so both
          // spellings resolve to this composition's own variables.
          // (__hfScopedHyperframes is a hoisted var assigned below, before any
          // sub-comp script -- the only code that reads this -- runs.)
          if (prop === "__hyperframes") return __hfScopedHyperframes;
          // Native window methods must stay bound to the real window. Handed
          // back unbound, "this" at call time is this Proxy and Chrome rejects
          // it with "Illegal invocation", which broke window.addEventListener,
          // setTimeout, matchMedia and getComputedStyle inside every
          // sub-composition -- including the window.addEventListener("hf-seek",
          // ...) form the Three.js and TypeGPU adapters document. The sibling
          // document and gsap proxies here already bind.
          //
          // Only bind non-constructors. Function.prototype.bind drops static
          // members, so binding a class exposed on window (window.Texts and
          // friends) would silently strip its statics. Built-in methods have
          // no .prototype; classes and constructor functions do.
          var value = Reflect.get(target, prop, target);
          return typeof value === "function" && value.prototype === undefined
            ? value.bind(target)
            : value;
        },
        set: function(target, prop, value, receiver) {
          if (prop === "__timelines") {
            // Common authoring boilerplate assigns the registry back to
            // itself (window.__timelines = window.__timelines || {}). The
            // getter above returns our proxy; do not replace the canonical
            // registry with that proxy or later wrappers will stack proxies.
            if (value === __hfTimelineRegistryProxy) return true;
            target.__timelines = value || {};
            __hfTimelineRegistryProxy = null;
            return true;
          }
          return Reflect.set(target, prop, value, target);
        },
      })
    : window;
`;
}
