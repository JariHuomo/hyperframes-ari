import { persistTrackedGsapEdit } from "../utils/trackedGsapEdit";
import { motionPresetProperties, type StudioMotionOptions } from "../utils/studioMotionPreset";
import { useCallback } from "react";
import type { Composition } from "@hyperframes/sdk";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { masterToLocal, resolveSceneInstances, type SceneTimeManifestClip } from "../ari/sceneTime";
import { roundTo3 } from "../utils/rounding";
import {
  sdkGsapTweenPersist,
  sdkGsapDeleteAllForSelectorPersist,
  sdkAddWithKeyframesPersist,
  sdkReplaceWithKeyframesPersist,
  cutoverCommittedOrThrow,
  type CutoverDeps,
} from "../utils/sdkCutover";
import { ensureElementAddressable } from "./gsapScriptCommitHelpers";
import { persistAtomicGsapAdd } from "../utils/atomicGsapAdd";
import type { CommitMutation, SafeGsapCommitMutation } from "./gsapScriptCommitTypes";

interface SdkAnimationDeps {
  sdkSession?: Composition | null;
  sdkDeps?: CutoverDeps | null;
}

interface GsapAnimationOpsParams extends SdkAnimationDeps {
  projectIdRef: React.MutableRefObject<string | null>;
  activeCompPath: string | null;
  /** The player's clip manifest, which is what resolves a scene's placements. */
  getClipManifest?: () => readonly SceneTimeManifestClip[] | null;
  commitMutation: CommitMutation;
  commitMutationSafely: SafeGsapCommitMutation;
  showToast: (message: string, tone?: "error" | "info") => void;
}

export function useGsapAnimationOps({
  activeCompPath,
  getClipManifest,
  commitMutation,
  commitMutationSafely,
  sdkSession,
  sdkDeps,
}: GsapAnimationOpsParams) {
  const updateGsapMeta = useCallback(
    async (
      selection: DomEditSelection,
      animationId: string,
      updates: { duration?: number; ease?: string; easeEach?: string; position?: number },
    ) => {
      if (
        await persistTrackedGsapEdit(
          selection.sourceFile || activeCompPath || "index.html",
          animationId,
          updates,
          sdkDeps,
        )
      )
        return;
      if (sdkSession && sdkDeps) {
        const targetPath = selection.sourceFile || activeCompPath || "index.html";
        const handled = await sdkGsapTweenPersist(
          targetPath,
          { kind: "set", animationId, properties: updates },
          sdkSession,
          sdkDeps,
          { label: "Edit GSAP animation" },
        );
        if (cutoverCommittedOrThrow(handled)) return;
      }
      return commitMutationSafely(
        selection,
        { type: "update-meta", animationId, updates },
        { label: "Edit GSAP animation", softReload: true },
      );
    },
    [commitMutationSafely, activeCompPath, sdkSession, sdkDeps],
  );

  const deleteGsapAnimation = useCallback(
    async (selection: DomEditSelection, animationId: string) => {
      if (
        await persistTrackedGsapEdit(
          selection.sourceFile || activeCompPath || "index.html",
          animationId,
          null,
          sdkDeps,
        )
      )
        return;
      if (sdkSession && sdkDeps) {
        const targetPath = selection.sourceFile || activeCompPath || "index.html";
        const handled = await sdkGsapTweenPersist(
          targetPath,
          { kind: "remove", animationId },
          sdkSession,
          sdkDeps,
          { label: "Delete GSAP animation" },
        );
        if (cutoverCommittedOrThrow(handled)) return;
      }
      return commitMutationSafely(
        selection,
        { type: "delete", animationId, stripStudioEdits: true },
        { label: "Delete GSAP animation", softReload: true },
      );
    },
    [commitMutationSafely, activeCompPath, sdkSession, sdkDeps],
  );

  const deleteAllForSelector = useCallback(
    async (selection: DomEditSelection, targetSelector: string) => {
      if (sdkSession && sdkDeps) {
        const targetPath = selection.sourceFile || activeCompPath || "index.html";
        const handled = await sdkGsapDeleteAllForSelectorPersist(
          targetPath,
          targetSelector,
          sdkSession,
          sdkDeps,
          { label: "Delete all animations for element" },
        );
        if (cutoverCommittedOrThrow(handled)) return;
      }
      void commitMutation(
        selection,
        { type: "delete-all-for-selector", targetSelector },
        { label: "Delete all animations for element", softReload: true },
      );
    },
    [commitMutation, activeCompPath, sdkSession, sdkDeps],
  );

  // fallow-ignore-next-line complexity
  const addGsapAnimation = useCallback(
    // fallow-ignore-next-line complexity
    async (
      selection: DomEditSelection,
      method: "to" | "from" | "set" | "fromTo",
      currentTime?: number,
      options?: StudioMotionOptions,
      instance?: string | null,
    ) => {
      // Ari: a master playhead is not a sub-composition's local clock. The
      // refusal survives (sprint S4) for exactly the ambiguous case: no
      // resolvable placement, or several with none chosen. When the instance IS
      // unambiguous the master time is converted here with the same formula the
      // runtime seeks with, instead of being written as if it were local.
      let localTime = currentTime;
      if (
        currentTime !== undefined &&
        selection.sourceFile &&
        selection.sourceFile !== (activeCompPath || "index.html")
      ) {
        const { instances } = resolveSceneInstances(
          { clips: getClipManifest?.() ?? [] },
          selection.sourceFile,
        );
        const chosen = instance
          ? instances.find((candidate) => candidate.hostId === instance)
          : instances.length === 1
            ? instances[0]
            : undefined;
        if (chosen) {
          localTime = masterToLocal(chosen, currentTime);
        } else if (options?.position === undefined) {
          // Nothing resolves the placement AND nothing carries an already-local
          // start: writing the master playhead here would put the tween at the
          // wrong second in the scene's own clock.
          throw new Error("Avaa kohtaus omalle aikajanalleen ennen liikkeen lisäämistä.");
        }
      }
      if (localTime !== undefined && (!Number.isFinite(localTime) || localTime < 0)) {
        throw new Error("Liikkeen aloitusaika ei kelpaa.");
      }
      const { selector, autoId } = ensureElementAddressable(selection);

      const elStart = Number.parseFloat(selection.dataAttributes?.start ?? "0") || 0;
      const elDuration = Number.parseFloat(selection.dataAttributes?.duration ?? "1") || 1;
      const position = roundTo3(options?.position ?? localTime ?? elStart);
      const duration = roundTo3(
        options?.duration ?? (localTime === undefined ? elDuration : Math.min(1, elDuration)),
      );
      const toDefaults: Record<string, Record<string, number>> = {
        from: motionPresetProperties(options?.preset),
        to: { x: 0, y: 0, opacity: 1 },
        set: { opacity: 1 },
        fromTo: { x: 0, y: 0, opacity: 1 },
      };

      // Both Ari's controls and agent tools use this one candidate/write/history
      // boundary, including nested source files and newly minted DOM ids.
      if (sdkDeps && selection.hfId) {
        await persistAtomicGsapAdd(
          selection,
          autoId,
          {
            method,
            position,
            ...(method !== "set" ? { duration, ease: options?.ease ?? "power2.out" } : {}),
            properties: toDefaults[method] ?? { opacity: 1 },
            ...(method === "fromTo" ? { fromProperties: { opacity: 0 } } : {}),
          },
          selection.sourceFile || activeCompPath || "index.html",
          sdkDeps,
        );
        return;
      }
      if (autoId)
        throw new Error("Kohdetta ei voi tallentaa turvallisesti. Valitse kohde uudelleen.");

      await commitMutation(
        selection,
        {
          type: "add",
          targetSelector: selector,
          method,
          position,
          duration: method === "set" ? undefined : duration,
          ease: method === "set" ? undefined : (options?.ease ?? "power2.out"),
          properties: toDefaults[method] ?? { opacity: 1 },
          fromProperties: method === "fromTo" ? { opacity: 0 } : undefined,
        },
        { label: `Add GSAP ${method} animation`, softReload: true },
      );
    },
    [activeCompPath, commitMutation, getClipManifest, sdkDeps],
  );

  type KeyframeEntry = {
    percentage: number;
    properties: Record<string, number | string>;
    ease?: string;
    auto?: boolean;
  };

  const addWithKeyframes = useCallback(
    async (
      selection: DomEditSelection,
      targetSelector: string,
      position: number,
      duration: number,
      keyframes: KeyframeEntry[],
      ease?: string,
      label = "Add animation with keyframes",
    ) => {
      if (sdkSession && sdkDeps) {
        const targetPath = selection.sourceFile || activeCompPath || "index.html";
        const handled = await sdkAddWithKeyframesPersist(
          targetPath,
          targetSelector,
          position,
          duration,
          keyframes,
          ease,
          sdkSession,
          sdkDeps,
          { label },
        );
        if (cutoverCommittedOrThrow(handled)) return;
      }
      void commitMutation(
        selection,
        {
          type: "add-with-keyframes",
          targetSelector,
          position,
          duration,
          keyframes,
          ...(ease ? { ease } : {}),
        },
        { label, softReload: true },
      );
    },
    [commitMutation, activeCompPath, sdkSession, sdkDeps],
  );

  const replaceWithKeyframes = useCallback(
    async (
      selection: DomEditSelection,
      animationId: string,
      targetSelector: string,
      position: number,
      duration: number,
      keyframes: KeyframeEntry[],
      ease?: string,
      label = "Replace animation with keyframes",
    ) => {
      if (sdkSession && sdkDeps) {
        const targetPath = selection.sourceFile || activeCompPath || "index.html";
        const handled = await sdkReplaceWithKeyframesPersist(
          targetPath,
          animationId,
          targetSelector,
          position,
          duration,
          keyframes,
          ease,
          sdkSession,
          sdkDeps,
          { label },
        );
        if (cutoverCommittedOrThrow(handled)) return;
      }
      void commitMutation(
        selection,
        {
          type: "replace-with-keyframes",
          animationId,
          targetSelector,
          position,
          duration,
          keyframes,
          ...(ease ? { ease } : {}),
        },
        { label, softReload: true },
      );
    },
    [commitMutation, activeCompPath, sdkSession, sdkDeps],
  );

  return {
    updateGsapMeta,
    deleteGsapAnimation,
    deleteAllForSelector,
    addGsapAnimation,
    addWithKeyframes,
    replaceWithKeyframes,
  };
}
