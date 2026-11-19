"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { CalendarIcon, ListChecksIcon } from "lucide-react"
import { toast } from "sonner"
import { KanbanBoard, KanbanCard, KanbanCards, KanbanHeader, KanbanProvider } from "@/components/kibo-ui/kanban"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import { DOT } from "@/projects/fields"
import { createProjectAction, moveProjectAction, moveTaskAction } from "./actions"
import { QuickAdd } from "./quick-add"

export type BoardStatus = { id: string; name: string; color: string }
export type BoardTask = { id: string; title: string; snippet: string; status_id: string; tags: string[]; due_on: string | null; done: boolean; progress: string | null; people: { id: string; initials: string; name: string }[]; href: string; color?: string; label?: string }
type Item = { id: string; name: string; column: string; task: BoardTask }

// Kanban of tasks or projects: one column per status, drag & drop between and within columns (saved at once), quick
// add per column (tasks stay on the board, a project opens its page; `projectId` = new tasks go into that project,
// `mine` = assigned to me), a click opens the task panel / project page. Readers see the board without dragging.
// Phones: one column fills the width, columns snap sideways, chips above jump to a column and show where you are.
export function Board({
  statuses,
  tasks,
  canManage,
  back,
  today,
  kind = "task",
  projectId,
  mine,
}: {
  statuses: BoardStatus[]
  tasks: BoardTask[]
  canManage: boolean
  back: string
  today: string
  kind?: "task" | "project"
  projectId?: string
  mine?: boolean
}) {
  const t = useT()
  const toItems = (list: BoardTask[]) => list.map((task) => ({ id: task.id, name: task.title, column: task.status_id, task }))
  const [items, setItems] = useState<Item[]>(() => toItems(tasks))
  // New tasks from the server (quick add, panel edits, refresh): take them over (React's "adjust state on prop change").
  const [seen, setSeen] = useState(tasks)
  if (seen !== tasks) {
    setSeen(tasks)
    setItems(toItems(tasks))
  }
  const latest = useRef(items)
  useEffect(() => {
    latest.current = items
  }, [items])
  const from = useRef<{ id: string; column: string } | null>(null)
  const [, start] = useTransition()
  const columns = statuses.map((s) => ({ id: s.id, name: s.name, color: s.color }))

  const change = (next: Item[]) => {
    latest.current = next
    setItems(next)
  }
  const persist = () => {
    const moved = from.current
    from.current = null
    if (!moved) return
    // After the board's own reordering (it runs right after onDragEnd): the column's order as it is now.
    queueMicrotask(() => {
      const item = latest.current.find((i) => i.id === moved.id)
      if (!item) return
      const order = latest.current.filter((i) => i.column === item.column).map((i) => i.id)
      start(async () => {
        const r = await (kind === "project" ? moveProjectAction : moveTaskAction)({ id: item.id, statusId: item.column, order })
        if (r.error) toast.error(r.error)
      })
    })
  }

  // Phones: which column is in view (from the scroll position), and a chip tap scrolls to a column.
  const scroller = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)
  const columnAt = (i: number) => scroller.current?.firstElementChild?.children[i] as HTMLElement | undefined
  const onScroll = () => {
    const el = scroller.current
    const first = columnAt(0)
    if (!el || !first) return
    setCurrent(Math.round(el.scrollLeft / (first.offsetWidth + 16)))
  }
  const count = (id: string) => items.filter((i) => i.column === id).length

  return (
    <div className="grid min-w-0 gap-3">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:hidden" role="tablist" aria-label={t("projects.columnsNav")}>
        {columns.map((c, i) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={current === i}
            onClick={() => columnAt(i)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" })}
            className="inline-flex h-(--control-sm) shrink-0 touch-manipulation items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap text-muted-foreground aria-selected:border-foreground aria-selected:text-foreground active:bg-muted"
          >
            <span className="size-2 rounded-full" style={{ background: DOT[String(c.color)] ?? DOT.gray }} aria-hidden />
            {c.name}
            <span className="text-xs tabular-nums">{count(c.id)}</span>
          </button>
        ))}
      </div>
      <div ref={scroller} onScroll={onScroll} className="-mx-4 overflow-x-auto overscroll-x-contain px-4 pb-2 max-md:snap-x max-md:snap-mandatory max-md:scroll-px-4 md:-mx-1 md:px-1">
        <KanbanProvider
          columns={columns}
          data={items}
          onDataChange={canManage ? change : undefined}
          onDragStart={(e) => {
            if (!canManage) return
            const i = latest.current.find((x) => x.id === e.active.id)
            from.current = i ? { id: i.id, column: i.column } : null
          }}
          onDragEnd={() => canManage && persist()}
          className="w-max auto-cols-[calc(100vw-2rem)] md:auto-cols-[19rem]"
        >
          {(column) => (
            <KanbanBoard id={column.id} key={column.id} className="min-h-[60vh] snap-start bg-muted/40">
              <KanbanHeader className="flex items-center gap-2 p-2.5 text-sm font-medium">
                <span className="size-2.5 rounded-full" style={{ background: DOT[String(column.color)] ?? DOT.gray }} aria-hidden />
                {column.name}
                <span className="text-xs font-normal text-muted-foreground">{count(column.id)}</span>
              </KanbanHeader>
              <KanbanCards id={column.id}>
                {(item: Item) => (
                  <KanbanCard key={item.id} id={item.id} name={item.name} column={item.column}>
                    <TaskCard task={item.task} today={today} />
                  </KanbanCard>
                )}
              </KanbanCards>
              {canManage &&
                (kind === "project" ? (
                  <form action={createProjectAction} className="flex gap-1.5 p-2">
                    <input type="hidden" name="status_id" value={column.id} />
                    <input type="hidden" name="back" value={back} />
                    <Input name="name" placeholder={t("projects.quickAddProject")} aria-label={t("projects.quickAddProject")} maxLength={200} required />
                    <SubmitButton variant="ghost" aria-label={t("projects.add")}>
                      +
                    </SubmitButton>
                  </form>
                ) : (
                  <QuickAdd statusId={column.id} projectId={projectId} mine={mine} className="p-2" />
                ))}
            </KanbanBoard>
          )}
        </KanbanProvider>
      </div>
    </div>
  )
}

// Title with tags top right (max 2 + "+n", so cards stay small), description preview, then due date, subtasks, people.
function TaskCard({ task, today }: { task: BoardTask; today: string }) {
  const t = useT()
  const overdue = task.due_on && !task.done && task.due_on < today
  return (
    <Link href={task.href} scroll={false} className="grid min-w-0 gap-1.5 text-sm">
      <span className="flex items-start gap-2">
        {task.color && <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: DOT[task.color] ?? DOT.gray }} aria-hidden />}
        <span className={cn("min-w-0 flex-1 font-medium break-words", task.done && "text-muted-foreground line-through")}>{task.title}</span>
        {task.tags.length > 0 && (
          <span className="flex shrink-0 gap-1">
            {task.tags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="outline" className="max-w-20 truncate px-1.5 text-[10px]">
                {tag}
              </Badge>
            ))}
            {task.tags.length > 2 && (
              <Badge variant="outline" className="px-1.5 text-[10px]" title={task.tags.slice(2).join(", ")}>
                +{task.tags.length - 2}
              </Badge>
            )}
          </span>
        )}
      </span>
      {task.label && <span className="truncate text-xs text-muted-foreground">{task.label}</span>}
      {task.snippet && <span className="line-clamp-2 text-xs break-words text-muted-foreground">{task.snippet}</span>}
      {(task.due_on || task.progress || task.people.length > 0) && (
        <span className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {task.due_on && (
            <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-destructive")}>
              <CalendarIcon className="size-3.5" /> {t.date(`${task.due_on}T12:00:00`, { weekday: "short", day: "numeric", month: "short" })}
            </span>
          )}
          {task.progress && (
            <span className="inline-flex items-center gap-1">
              <ListChecksIcon className="size-3.5" /> {task.progress}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            {task.people.length === 1 && <span className="max-w-24 truncate">{task.people[0].name}</span>}
            <span className="flex -space-x-1.5">
              {task.people.map((p) => (
                <span key={p.id} title={p.name} className="grid size-6 place-items-center rounded-full border-2 border-card bg-muted text-[10px] font-medium text-foreground">
                  {p.initials}
                </span>
              ))}
            </span>
          </span>
        </span>
      )}
    </Link>
  )
}
