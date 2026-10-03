"use client";

import { useState } from "react";

function formatPhoneInput(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("1")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function PhoneInput({
  name = "phone",
  defaultValue = "",
  className,
  disabled,
  required,
}: {
  name?: string;
  defaultValue?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const [value, setValue] = useState(() => formatPhoneInput(defaultValue));
  return (
    <input
      name={name}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={value}
      onChange={(event) => setValue(formatPhoneInput(event.target.value))}
      placeholder="(123) 456-7890"
      maxLength={14}
      pattern={"\\(\\d{3}\\) \\d{3}-\\d{4}"}
      title="Enter a 10-digit phone number"
      disabled={disabled}
      required={required}
      className={className}
    />
  );
}
