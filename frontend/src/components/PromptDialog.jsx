import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const PromptCtx = createContext(null);

/**
 * Provides an in-app single-input prompt dialog. Replaces window.prompt() so we
 * don't get browser-chrome pop-ups that break the UX.
 *
 * Usage:
 *   const prompt = usePrompt();
 *   const value = await prompt({ title, description, label, placeholder, defaultValue });
 *   // resolves to the trimmed string or `null` if the user cancels.
 */
export function PromptProvider({ children }) {
  const [state, setState] = useState({
    open: false,
    title: "",
    description: "",
    label: "",
    placeholder: "",
    defaultValue: "",
    confirmLabel: "Add",
    cancelLabel: "Cancel",
  });
  const [value, setValue] = useState("");
  const resolverRef = useRef(null);

  const openPrompt = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setValue(opts.defaultValue || "");
      setState({
        open: true,
        title: opts.title || "Enter a value",
        description: opts.description || "",
        label: opts.label || "",
        placeholder: opts.placeholder || "",
        defaultValue: opts.defaultValue || "",
        confirmLabel: opts.confirmLabel || "Add",
        cancelLabel: opts.cancelLabel || "Cancel",
      });
    });
  }, []);

  const close = (result) => {
    setState((s) => ({ ...s, open: false }));
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  };

  const submit = (e) => {
    e?.preventDefault?.();
    const v = value.trim();
    close(v || null);
  };

  return (
    <PromptCtx.Provider value={openPrompt}>
      {children}
      <Dialog open={state.open} onOpenChange={(o) => { if (!o) close(null); }}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] rounded-none border-[#09090B]" data-testid="prompt-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl tracking-tight">{state.title}</DialogTitle>
            {state.description && <DialogDescription>{state.description}</DialogDescription>}
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3 mt-2">
            {state.label && <Label className="eyebrow">{state.label.toUpperCase()}</Label>}
            <Input
              autoFocus
              data-testid="prompt-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={state.placeholder}
              className="rounded-none border-[#E4E4E7] h-11"
            />
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => close(null)} data-testid="prompt-cancel" className="rounded-none h-11">
                {state.cancelLabel}
              </Button>
              <Button type="submit" data-testid="prompt-confirm" className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-11 px-6">
                {state.confirmLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PromptCtx.Provider>
  );
}

export function usePrompt() {
  const ctx = useContext(PromptCtx);
  if (!ctx) throw new Error("usePrompt must be used inside <PromptProvider>");
  return ctx;
}
