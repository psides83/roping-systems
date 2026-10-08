"use client";

import { useRef, useState, type ComponentProps } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function NumberStepper({ label, className, onChange, disabled, readOnly, ...props }: Omit<ComponentProps<"input">, "ref" | "type"> & { label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState(String(props.value ?? props.defaultValue ?? ""));
  const current = String(props.value ?? typed);
  const value = Number(current);
  const step = Number(props.step ?? 1);
  const unavailable = disabled || readOnly;
  function adjust(direction: number) {
    const input = ref.current;
    if (!input || unavailable || input.matches(":disabled")) return;
    const previous = input.value;
    input.stepUp(direction);
    const next = input.value;
    if (previous !== next) {
      // Restore React's tracked value before dispatching a normal input change.
      input.value = previous;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      setTyped(next);
    }
    input.focus();
  }
  const button = "grid h-full w-11 place-items-center bg-[#f4f6f5] text-[#526059] transition-colors hover:bg-[#e5ebe7] hover:text-[#17201c] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[var(--brand-accent)] disabled:cursor-not-allowed disabled:opacity-35";
  return <span className={cn("number-stepper rounded-md border border-[#ccd4d0] bg-white focus-within:border-[var(--brand-accent)]", className)}>
    <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} title={`Decrease ${label.toLowerCase()}`} disabled={Boolean(unavailable || (current !== "" && props.min !== undefined && value - step < Number(props.min)))} onClick={() => adjust(-1)} className={cn(button, "rounded-l-[inherit] border-r border-[#dfe4e1]")}><Minus size={17} /></button>
    <input {...props} ref={ref} type="number" inputMode={props.inputMode ?? "numeric"} disabled={disabled} readOnly={readOnly} onChange={(event) => { setTyped(event.target.value); onChange?.(event); }} />
    <button type="button" aria-label={`Increase ${label.toLowerCase()}`} title={`Increase ${label.toLowerCase()}`} disabled={Boolean(unavailable || (current !== "" && props.max !== undefined && value + step > Number(props.max)))} onClick={() => adjust(1)} className={cn(button, "rounded-r-[inherit] border-l border-[#dfe4e1]")}><Plus size={17} /></button>
  </span>;
}
