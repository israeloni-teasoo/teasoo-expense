"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/cn";

const ModalContext = createContext<{ close: () => void } | null>(null);
export const useModal = () => useContext(ModalContext);

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-0 mt-auto w-full max-w-none rounded-t-2xl bg-white p-0 shadow-xl backdrop:bg-gray-900/50 sm:m-auto sm:rounded-2xl",
        size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-3xl" : "sm:max-w-lg",
      )}
    >
      {open && (
        <ModalContext.Provider value={{ close: onClose }}>
          <div className="flex max-h-[90dvh] flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{title}</h2>
                {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
              </div>
              <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
          </div>
        </ModalContext.Provider>
      )}
    </dialog>
  );
}

export function ModalButton({
  label,
  title,
  description,
  children,
  variant = "secondary",
  size = "md",
  icon,
  className,
  modalSize,
}: {
  label: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  className?: string;
  modalSize?: "sm" | "md" | "lg";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)} className={className}>
        {icon}
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} description={description} size={modalSize}>
        {children}
      </Modal>
    </>
  );
}
