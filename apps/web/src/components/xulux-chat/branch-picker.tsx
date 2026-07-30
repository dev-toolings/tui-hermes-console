"use client";

import { BranchPickerPrimitive } from "@assistant-ui/react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { XuluxTooltipIconButton } from "./tooltip-icon-button";
import { cn } from "@/lib/utils";

export function XuluxBranchPicker({
  className,
  ...rest
}: BranchPickerPrimitive.Root.Props) {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root text-muted-foreground -ml-2 mr-2 inline-flex items-center text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <XuluxTooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </XuluxTooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <XuluxTooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </XuluxTooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}
