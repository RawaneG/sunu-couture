// Phase 8A §25/§53 — `VoiceRecorder` ne doit jamais prétendre qu'un
// enregistrement est `audio/webm` si le navigateur a produit un autre
// format réellement négocié (`recorder.mimeType`). `MediaRecorder` et
// `getUserMedia` n'existent pas dans jsdom — simulés ici avec un format
// DÉLIBÉRÉMENT différent d'`audio/webm` pour prouver que le MIME n'est
// jamais forcé.
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VoiceRecorder from "./VoiceRecorder";
import type { VoiceNote } from "../../lib/types";

class FakeMediaRecorder {
  static supportedType = "audio/mp4";
  static isTypeSupported(type: string): boolean {
    return type === FakeMediaRecorder.supportedType;
  }
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly mimeType: string;
  constructor(_stream: unknown, options?: { mimeType?: string }) {
    // Reflète EXACTEMENT ce que le navigateur négocierait réellement —
    // jamais une valeur inventée par le test.
    this.mimeType = options?.mimeType ?? FakeMediaRecorder.supportedType;
  }
  start(): void {}
  stop(): void {
    this.ondataavailable?.({ data: new Blob(["chunk-bytes"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

function stubMediaRecorderEnvironment() {
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("navigator", {
    ...globalThis.navigator,
    mediaDevices: {
      getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VoiceRecorder — MIME réel (corr. R §25)", () => {
  it("le VoiceNote produit porte le MIME RÉELLEMENT négocié par MediaRecorder, jamais un audio/webm forcé", async () => {
    stubMediaRecorderEnvironment();
    const user = userEvent.setup();
    let captured: VoiceNote | null = null;
    const onChange = vi.fn((v: VoiceNote | null) => {
      captured = v;
    });

    render(<VoiceRecorder value={null} onChange={onChange} persist />);

    await user.click(screen.getByRole("button", { name: /enregistrer/i }));
    await user.click(screen.getByRole("button")); // stop

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(captured).not.toBeNull();
    // `persist` => data URL — son préfixe doit refléter le MIME réel
    // (audio/mp4 dans ce test), jamais "data:audio/webm" codé en dur.
    expect(captured!.url.startsWith("data:audio/mp4")).toBe(true);
    expect(captured!.url.startsWith("data:audio/webm")).toBe(false);
  });
});
