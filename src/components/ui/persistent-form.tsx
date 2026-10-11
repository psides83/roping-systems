"use client";

import { useTransition, type ComponentPropsWithRef } from "react";

type Props = Omit<ComponentPropsWithRef<"form">, "action"> & {
  action: (data: FormData) => void | Promise<void>;
};

// Dispatch explicitly so React does not reset uncontrolled fields after a rejected save.
export function PersistentForm({ action, onSubmit, children, ...props }: Props) {
  const [pending, startTransition] = useTransition();
  return <form {...props} onSubmit={event => {
    onSubmit?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(async () => { await action(data); });
  }}>{children}</form>;
}
