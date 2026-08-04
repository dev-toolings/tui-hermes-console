"use client";

import * as React from "react";
import { OTPInput as OTPInputPrimitive, OTPInputContext } from "input-otp";
import { cn } from "@/lib/cn";

const InputOTP = React.forwardRef<
  React.ElementRef<typeof OTPInputPrimitive>,
  React.ComponentPropsWithoutRef<typeof OTPInputPrimitive>
>(({ className, containerClassName, ...props }, ref) => (
  <OTPInputPrimitive
    ref={ref}
    containerClassName={cn("flex w-fit max-w-full items-center gap-2", containerClassName)}
    className={cn("disabled:cursor-not-allowed", className)}
    {...props}
  />
));
InputOTP.displayName = "InputOTP";

const InputOTPGroup = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex max-w-full items-center", className)} {...props} />
  ),
);
InputOTPGroup.displayName = "InputOTPGroup";

const InputOTPSlot = React.forwardRef<HTMLDivElement, React.ComponentProps<"div"> & { index: number }>(
  ({ index, className, ...props }, ref) => {
    const { slots } = React.useContext(OTPInputContext);
    const slot = slots[index];

    if (!slot) return null;

    return (
      <div
        ref={ref}
        data-active={slot.isActive}
        className={cn(
          "relative flex size-10 items-center justify-center border-y border-r border-input bg-card text-sm font-medium text-foreground shadow-board-xs outline-none transition-[border-color,box-shadow] first:rounded-l-[10px] first:border-l last:rounded-r-[10px]",
          "data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-2 data-[active=true]:ring-ring/20",
          className,
        )}
        {...props}
      >
        {slot.char ?? slot.placeholderChar}
        {slot.hasFakeCaret ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-2 left-1/2 w-px -translate-x-1/2 animate-pulse bg-foreground motion-reduce:animate-none"
          />
        ) : null}
      </div>
    );
  },
);
InputOTPSlot.displayName = "InputOTPSlot";

export { InputOTP, InputOTPGroup, InputOTPSlot };
