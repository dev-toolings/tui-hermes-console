"use client";

import { forwardRef, type ComponentPropsWithRef, type ReactNode } from "react";
import { Slot } from "radix-ui";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TooltipIconButtonProps = ComponentPropsWithRef<typeof Button> & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
  children?: ReactNode;
};

export const TooltipIconButton = forwardRef<HTMLButtonElement, TooltipIconButtonProps>(
  ({ children, tooltip, side = "bottom", className, ...rest }, ref) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            {...rest}
            className={cn("aui-button-icon size-7 p-1 active:scale-[0.98]", className)}
            ref={ref}
          >
            <Slot.Slottable>{children}</Slot.Slottable>
            <span className="sr-only">{tooltip}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side={side}>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
);

TooltipIconButton.displayName = "TooltipIconButton";
