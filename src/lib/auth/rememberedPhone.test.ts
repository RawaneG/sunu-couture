import { describe, expect, it, beforeEach } from "vitest";
import { getRememberedPhone, setRememberedPhone, clearRememberedPhone } from "./rememberedPhone";

beforeEach(() => {
  localStorage.clear();
});

describe("rememberedPhone — mémoire locale du dernier numéro (corr. Gate Auth §6/§47)", () => {
  it("renvoie null quand rien n'est mémorisé", () => {
    expect(getRememberedPhone()).toBeNull();
  });

  it("mémorise puis relit le même numéro normalisé", () => {
    setRememberedPhone("+221770000001");
    expect(getRememberedPhone()).toBe("+221770000001");
  });

  it("clearRememberedPhone efface la mémoire ('Ce n'est pas mon numéro')", () => {
    setRememberedPhone("+221770000001");
    clearRememberedPhone();
    expect(getRememberedPhone()).toBeNull();
  });

  it("un second setRememberedPhone remplace le précédent (un seul numéro mémorisé à la fois)", () => {
    setRememberedPhone("+221770000001");
    setRememberedPhone("+221770000002");
    expect(getRememberedPhone()).toBe("+221770000002");
  });
});
