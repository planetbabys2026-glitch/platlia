import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground font-bold shadow-sm hover:bg-primary/90",
        outline:
          "border-[var(--linea-30)] bg-transparent text-[var(--papel)] hover:bg-[var(--panel-2)] hover:text-[var(--papel)]",
        secondary:
          "bg-[var(--panel-2)] text-[var(--papel)] border border-[var(--linea-16)] hover:bg-[var(--panel-3)]",
        ghost:
          "hover:bg-[var(--panel-2)] hover:text-[var(--papel)] text-muted-foreground",
        destructive:
          "bg-destructive/15 text-destructive-soft border border-destructive/30 hover:bg-destructive/25 focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
        link: "text-primary underline-offset-4 hover:underline",
      },
      /**
       * Las alturas se leen al revés de lo habitual: el valor base es el TÁCTIL
       * (44px, el mínimo de iOS y Android, y el que el propio manual fija) y recién
       * en `tableta:` —de 1020px para arriba, o sea con mouse— se permite apretar.
       * Estaba al revés: `h-9 sm:h-10` daba 36px justamente en el teléfono y la
       * tablet, que son los aparatos con los que se trabaja apurado y de pie.
       */
      size: {
        default: "h-11 tableta:h-10 gap-2 px-3.5 py-2 text-sm",
        xs: "h-7 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-11 tableta:h-8 gap-1.5 rounded-md px-2.5 text-xs font-medium [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-5 text-base font-bold",
        icon: "size-11 tableta:size-10",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9 tableta:size-8 rounded-md",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
