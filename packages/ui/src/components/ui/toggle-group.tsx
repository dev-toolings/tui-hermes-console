"use client"

import * as React from "react"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"

import { cn } from "../../lib/utils"

const ToggleGroupContext = React.createContext<{ size: "sm" | "md" }>({
  size: "md",
})

function ToggleGroup({
  className,
  size = "md",
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & {
  size?: "sm" | "md"
}) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-size={size}
      className={cn(
        "group/toggle-group flex w-fit items-center rounded-lg border border-input bg-card shadow-xs",
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  const context = React.useContext(ToggleGroupContext)

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-size={context.size}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-[color,background-color]",
        "min-w-0 shrink-0 rounded-none first:rounded-l-md last:rounded-r-md",
        "border-l border-input first:border-l-0",
        context.size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-2.5 text-sm",
        "text-muted-foreground hover:bg-muted hover:text-foreground",
        "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-[state=on]:bg-muted data-[state=on]:text-foreground",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
