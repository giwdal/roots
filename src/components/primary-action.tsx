"use client"

import Link from "next/link"
import { ChevronDownIcon, PlusIcon, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

type Choice = { href: string; label: string }

/**
 * A page's main action with alternatives (Neue Rechnung · Neues Angebot). Phones: the round glass "+" by the tab bar
 * opens a small menu above it with all choices. From md: the main button plus an arrow for the others.
 */
export function PrimaryAction({ href, label, more, icon: Icon = PlusIcon }: { href: string; label: string; more: Choice[]; icon?: LucideIcon }) {
  const all = [{ href, label }, ...more]
  const items = (list: Choice[]) =>
    list.map((c) => (
      <DropdownMenuItem key={c.href} render={<Link href={c.href} />} className="max-md:py-2.5 max-md:text-base">
        <PlusIcon /> {c.label}
      </DropdownMenuItem>
    ))
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button size="sm" aria-label={label} data-slot="page-primary" className="bar-hide glass fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-30 size-[3.625rem] rounded-full p-0 text-foreground md:hidden" />}
        >
          <Icon className="size-6" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" sideOffset={10} className="glass min-w-56 rounded-2xl p-1.5">
          {items(all)}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex max-md:hidden">
        <Button render={<Link href={href} />} nativeButton={false} size="sm" data-shortcut="new" className="rounded-r-none">
          <Icon /> {label}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" aria-label={more.map((m) => m.label).join(", ")} className="rounded-l-none border-l border-primary-foreground/20 px-2" />}>
            <ChevronDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            {items(more)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )
}
