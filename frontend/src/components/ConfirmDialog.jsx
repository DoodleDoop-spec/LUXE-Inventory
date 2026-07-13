import { createContext, useContext, useState, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ConfirmCtx = createContext({ confirm: async () => false });

export function ConfirmProvider({ children }) {
  const [state, setState] = useState({
    open: false,
    title: "Are you sure?",
    description: "",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    danger: false,
    resolver: null,
  });

  const confirm = useCallback(
    (options = {}) =>
      new Promise((resolve) => {
        setState({
          open: true,
          title: options.title || "Are you sure?",
          description: options.description || "",
          confirmLabel: options.confirmLabel || "Confirm",
          cancelLabel: options.cancelLabel || "Cancel",
          danger: !!options.danger,
          resolver: resolve,
        });
      }),
    []
  );

  const handleAnswer = (ok) => {
    if (state.resolver) state.resolver(ok);
    setState((s) => ({ ...s, open: false, resolver: null }));
  };

  return (
    <ConfirmCtx.Provider value={{ confirm }}>
      {children}
      <AlertDialog open={state.open} onOpenChange={(open) => !open && handleAnswer(false)}>
        <AlertDialogContent
          data-testid="confirm-dialog"
          className="rounded-none border-[#09090B]"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display" data-testid="confirm-dialog-title">
              {state.title}
            </AlertDialogTitle>
            {state.description && (
              <AlertDialogDescription className="text-[#52525B]" data-testid="confirm-dialog-description">
                {state.description}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="confirm-dialog-cancel"
              onClick={() => handleAnswer(false)}
              className="rounded-none"
            >
              {state.cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-dialog-confirm"
              onClick={() => handleAnswer(true)}
              className={`rounded-none ${state.danger ? "bg-[#EF4444] hover:bg-[#DC2626] text-white" : "bg-[#09090B] hover:bg-[#27272A] text-white"}`}
            >
              {state.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmCtx).confirm;
}
