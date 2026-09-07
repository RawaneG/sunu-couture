import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import PinPad from "./PinPad";

function ControlledPinPad(props: Partial<React.ComponentProps<typeof PinPad>> = {}) {
  const [value, setValue] = useState(props.value ?? "");
  return <PinPad length={4} label="Code test" {...props} value={value} onChange={setValue} />;
}

describe("PinPad — saisie tactile + clavier physique (corr. Gate Auth §14/§15)", () => {
  it("chaque appui sur une touche du pavé ajoute un chiffre à la valeur", () => {
    render(<ControlledPinPad />);
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(screen.getByLabelText("Code test")).toHaveValue("12");
  });

  it("le clavier physique (saisie directe sur le champ réel) fonctionne aussi", () => {
    render(<ControlledPinPad />);
    fireEvent.change(screen.getByLabelText("Code test"), { target: { value: "5678" } });
    expect(screen.getByLabelText("Code test")).toHaveValue("5678");
  });

  it("filtre tout caractère non numérique saisi au clavier physique", () => {
    render(<ControlledPinPad />);
    fireEvent.change(screen.getByLabelText("Code test"), { target: { value: "1a2b" } });
    expect(screen.getByLabelText("Code test")).toHaveValue("12");
  });

  it("ne dépasse jamais `length` chiffres", () => {
    render(<ControlledPinPad />);
    fireEvent.change(screen.getByLabelText("Code test"), { target: { value: "123456" } });
    expect(screen.getByLabelText("Code test")).toHaveValue("1234");
  });

  it("le backspace retire le dernier chiffre", () => {
    render(<ControlledPinPad value="123" />);
    fireEvent.click(screen.getByRole("button", { name: /effacer/i }));
    expect(screen.getByLabelText("Code test")).toHaveValue("12");
  });

  it("onComplete est appelé exactement une fois quand la longueur cible est atteinte", () => {
    const onComplete = vi.fn();
    function Wrapper() {
      const [value, setValue] = useState("");
      return <PinPad value={value} onChange={setValue} onComplete={onComplete} length={4} label="Code test" />;
    }
    render(<Wrapper />);
    fireEvent.change(screen.getByLabelText("Code test"), { target: { value: "1234" } });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("1234");
  });

  it("jamais le chiffre affiché en clair — seuls des points (décoratifs) représentent la saisie", () => {
    render(<ControlledPinPad value="1234" />);
    expect(screen.queryByText("1234")).not.toBeInTheDocument();
    expect(screen.getByText("4 sur 4 chiffres saisis")).toBeInTheDocument();
  });

  it("désactivé -> aucune touche ni le champ réel n'acceptent de saisie", () => {
    render(<ControlledPinPad disabled />);
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    expect(screen.getByLabelText("Code test")).toHaveValue("");
    expect(screen.getByLabelText("Code test")).toBeDisabled();
  });
});
