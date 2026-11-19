"use client"

import "@xyflow/react/dist/style.css"
import "./flow.css"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { DateInput } from "@/components/date-input"
import {
  addEdge,
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import { BellIcon, FilePlus2Icon, SearchIcon, SigmaIcon, CheckIcon, ChevronsUpDownIcon, CircleAlertIcon, ClockIcon, SendIcon, DownloadIcon, PlusIcon, FlaskConicalIcon, XIcon, GitForkIcon, LayoutListIcon, MailIcon, PencilIcon, SaveIcon, RepeatIcon, TagIcon, TagsIcon, Trash2Icon, WebhookIcon, ZapIcon, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { RichTextEditor } from "@/components/rich-text-editor"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { ContentSheet, ContentSheetTitle } from "@/components/content-sheet"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { useT } from "@/i18n/client"
import { usePhone } from "@/lib/use-phone"
import { cn } from "@/lib/utils"
import { ACTIONS, DATA_STEPS, stepKey, triggerKey, validate, WAIT_UNITS, type Graph, type NodeType, type TraceStep } from "@/automations/graph"
import { creatableFor, deletableFor, def, OBJECTS, searchFields, objectsFor, OPS_FOR, parseRecordTrigger, SCHEDULE_OBJECTS, splitPath, writableFor, type Field, type Kind, type ObjectKey, type RefList } from "@/automations/objects"
import { saveWorkflow, setActiveAction, testPickers, testRun, testSamples, type TestPicker } from "../actions"
import { useLeaveGuard } from "@/components/save-bar"
import { Switch } from "@/components/ui/switch"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type Data = Record<string, unknown>
type FlowNode = Node<Data, NodeType>
type Option = { value: string; label: string }
type Branch = "yes" | "no" | null // an output: a condition's yes/no, null = the one output of every other step
export type EditorOptions = {
  triggers: { group: string; items: { key: string; label: string }[] }[] // by module: its events + "record created/changed/deleted"
  customFields: Record<string, { key: string; label: string; type: string; options: string[] }[]> // per object (contact, event)
  tags: string[]
  refs: Partial<Record<RefList, Option[]>> // pickable records (events, membership types, forms, courses, guest lists)
  modules: string[] // the org's active modules: objects/actions of others aren't offered
  telegram: { connected: boolean; chats: { id: string; title: string }[] }
  answers: (Field & { label: string })[] // fields the org's forms ask for (submission.answers.<key>)
  steps?: { key: string; object: string; label: string }[] // results of data steps in this flow (set by the editor)
}

const isObject = (o: string): o is ObjectKey => o in OBJECTS
const objectLabel = (o: string, options: EditorOptions, label: (k: string) => string) => options.steps?.find((x) => x.key === o)?.label ?? label(`automations.objects.${o}`)
// Fields of an object as the pickers show them (catalog + the org's custom fields of contacts/events); `write` = only settable ones.
function fieldsOf(o: string, options: EditorOptions, label: (k: string) => string, write = false, search = false): (Field & { label: string })[] {
  const step = options.steps?.find((x) => x.key === o)
  if (step)
    return step.object === "aggregate"
      ? write
        ? []
        : [
            { key: "value", kind: "number", label: label("automations.aggResult") },
            { key: "count", kind: "number", label: label("automations.aggCount") },
          ]
      : fieldsOf(step.object, options, label, write, search)
  if (!o || !isObject(o)) return []
  if (search && !write)
    return searchFields(o).map((f) => ({ ...f, label: f.kind === "link" ? label(`automations.objects.${f.target}`) : label(`automations.fields.${o}.${f.key}`) }))
  const base = def(o).fields.filter((f) => !write || f.write).map((f) => ({ ...f, label: label(`automations.fields.${o}.${f.key}`) }))
  const custom = (options.customFields[o] ?? []).map((f) => ({
    key: `custom.${f.key}`,
    label: f.label,
    kind: (f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "boolean" ? "bool" : f.type === "select" ? "enum" : "text") as Kind,
    options: f.options,
    write: true as const,
  }))
  // Form answers of a submission (what was entered), incl. the org's custom fields.
  const answerFields = o === "submission" ? options.answers.map((f) => ({ ...f, key: `answers.${f.key}`, label: `${label("automations.answer")}: ${f.label}` })) : []
  return [...base, ...custom, ...answerFields]
}

const ICONS: Record<NodeType, LucideIcon> = {
  trigger: ZapIcon,
  condition: GitForkIcon,
  wait: ClockIcon,
  send_email: MailIcon,
  add_tag: TagIcon,
  remove_tag: TagsIcon,
  set_field: PencilIcon,
  webhook: WebhookIcon,
  notify_team: BellIcon,
  create_record: FilePlus2Icon,
  delete_record: Trash2Icon,
  find_record: SearchIcon,
  aggregate: SigmaIcon,
  for_each: RepeatIcon,
  telegram: SendIcon,
}
const DEFAULTS: Record<NodeType, Data> = {
  trigger: { event: "" },
  condition: { match: "all", rules: [{ field: "", op: "eq", value: "" }] },
  wait: { mode: "for", amount: 1, unit: "days", until: "" },
  send_email: { to: "{contact.email}", subject: "", body: "" },
  add_tag: { tag: "" },
  remove_tag: { tag: "" },
  set_field: { field: "", value: "" },
  webhook: { url: "" },
  notify_team: { text: "" },
  create_record: { object: "", values: {} },
  delete_record: { object: "" },
  find_record: { object: "", rules: [], sort: "", dir: "desc", label: "" },
  aggregate: { object: "", rules: [], op: "count", field: "", label: "" },
  for_each: { object: "", rules: [], sort: "", dir: "asc", limit: 50, label: "" },
  telegram: { chat_id: "", text: "" },
}
// The step picker's groups; each group has one colour (icon tiles on the cards and in the picker).
const PALETTE: { section: string; types: NodeType[] }[] = [
  { section: "logic", types: ["condition", "wait"] },
  { section: "query", types: ["find_record", "aggregate", "for_each"] },
  { section: "send", types: ["send_email", "notify_team", "telegram"] },
  { section: "data", types: ["add_tag", "remove_tag", "set_field", "create_record", "delete_record"] },
  { section: "connect", types: ["webhook"] },
]
const SECTION_COLOR: Record<string, string> = { trigger: "var(--warning)", logic: "var(--chart-3)", query: "var(--chart-5)", send: "var(--chart-2)", data: "var(--chart-1)", connect: "var(--chart-4)" }
const colorOf = (type: NodeType) => SECTION_COLOR[type === "trigger" ? "trigger" : (PALETTE.find((s) => s.types.includes(type))?.section ?? "connect")]
// Canvas grid of the vertical flow: one row per step, branches side by side.
const CARD_W = 320
const ROW = 150
const COL = 360

function StepTile({ type, small }: { type: NodeType; small?: boolean }) {
  const Icon = ICONS[type]
  const c = colorOf(type)
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-lg", small ? "size-6 rounded-md" : "size-9")} style={{ background: `color-mix(in oklch, ${c} 16%, transparent)`, color: c }}>
      <Icon className={small ? "size-3.5" : "size-4"} />
    </span>
  )
}

// What the cards and connectors need from the editor (they are rendered by React Flow, not by the editor itself).
type FlowApi = { canEdit: boolean; testing: boolean; telegram: boolean; insertOnEdge: (edge: string, type: NodeType) => void; appendAfter: (node: string, branch: Branch, type: NodeType) => void }
const FlowCtx = createContext<FlowApi | null>(null)
type Meta = { n?: number; problem?: string; free: Branch[] } // step number (from the trigger), first problem, outputs without a next step

// The searchable step picker: a popover next to its "+" (a bottom sheet on phones), grouped like the old palette.
function AddStepMenu({ onPick, telegram, children }: { onPick: (type: NodeType) => void; telegram: boolean; children: React.ReactElement }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={children} />
      <PopoverContent sheet title={t("automations.addStep")} className="w-72 p-0" align="center">
        <Command>
          <CommandInput placeholder={t("automations.searchStep")} />
          <CommandList className="max-h-80 md:max-h-96">
            <CommandEmpty>{t("automations.noTrigger")}</CommandEmpty>
            {PALETTE.map((sec) => (
              <CommandGroup key={sec.section} heading={t.dynamic(`automations.sections.${sec.section}`)}>
                {sec.types.map((type) => {
                  const off = type === "telegram" && !telegram
                  return (
                    <CommandItem key={type} value={`${t.dynamic(`automations.nodes.${type}`)} ${t.dynamic(`automations.sections.${sec.section}`)}`} disabled={off} onSelect={() => (onPick(type), setOpen(false))}>
                      <StepTile type={type} small />
                      <span className="grid">
                        <span>{t.dynamic(`automations.nodes.${type}`)}</span>
                        {off && <span className="text-xs text-muted-foreground">{t("automations.telegramOff")}</span>}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// The small round "+" on connectors and below open outputs.
function PlusButton({ label, ...props }: { label: string } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className="nodrag nopan grid size-6 place-items-center rounded-full border bg-card text-muted-foreground shadow-xs transition-colors hover:border-ring hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-md:size-8"
    >
      <PlusIcon className="size-3.5" />
    </button>
  )
}

// One step on the canvas: coloured icon tile, "2. E-Mail senden", then its own name or what it is set to.
function StepNode({ id, type, data, selected }: NodeProps<FlowNode>) {
  const t = useT()
  const flow = useContext(FlowCtx)!
  const meta = (data.__meta as Meta | undefined) ?? { free: [] }
  const summary = (() => {
    const d = data as Record<string, string | number | { field: string }[]>
    if (type === "trigger") return (d.event as string) ? triggerLabel(d.event === "schedule" && d.date ? "date_reached" : String(d.event), t) : ""
    if (type === "wait") return d.mode === "until" ? (d.until ? t("automations.until", { when: String(d.until) }) : "") : t.dynamic(`automations.duration.${d.unit}`, { count: Number(d.amount) || 0 })
    if (type === "condition") return ((d.rules as { field: string }[]) ?? []).map((r) => r.field).filter(Boolean).join(", ")
    if (type === "find_record" || type === "aggregate" || type === "for_each" || type === "create_record" || type === "delete_record")
      return d.object ? t.dynamic(`automations.objects.${d.object}`) + (type === "for_each" ? ` · max. ${d.limit ?? 50}` : "") : ""
    return String(d.subject || d.tag || d.field || d.url || d.text || "")
  })()
  const own = String(data.label ?? "")
  const trace = data.__trace as TraceStep | null | undefined // undefined = no test run, null = not reached
  const kind = t.dynamic(`automations.nodes.${type}`)
  const add = (branch: Branch) => (
    <AddStepMenu telegram={flow.telegram} onPick={(nt) => flow.appendAfter(id, branch, nt)}>
      <PlusButton label={t("automations.addStep")} onClick={(e) => e.stopPropagation()} />
    </AddStepMenu>
  )
  const handle = "!size-2 !border-0 !bg-muted-foreground/50"
  return (
    <div
      style={{ width: CARD_W }}
      className={cn(
        "relative rounded-xl border bg-card text-sm shadow-xs transition-[border-color,box-shadow]",
        selected ? "border-ring ring-2 ring-ring/25" : "hover:border-input",
        meta.problem && !selected && "border-destructive/50",
        trace === null && "opacity-50",
      )}
    >
      {type !== "trigger" && <Handle type="target" position={Position.Top} className={handle} />}
      <div className="flex items-center gap-3 p-3">
        <StepTile type={type} />
        <div className="grid min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">{meta.n ? `${meta.n}. ${kind}` : kind}</p>
          <p className={cn("truncate font-medium", !own && !summary && "font-normal text-muted-foreground italic")}>{own || summary || t("automations.needsSetup")}</p>
        </div>
        {meta.problem && (
          <span title={t.dynamic(`automations.issues.${meta.problem}`)} className="shrink-0 text-destructive">
            <CircleAlertIcon className="size-4" aria-label={t.dynamic(`automations.issues.${meta.problem}`)} />
          </span>
        )}
      </div>
      {trace && (
        <p className="flex items-center gap-1 border-t px-3 py-1.5 text-xs font-medium" style={{ color: "var(--success)" }}>
          <CheckIcon className="size-3 shrink-0" />
          <span className="truncate">
            {trace.branch
              ? t(trace.branch === "yes" ? "automations.yes" : "automations.no")
              : trace.wait
                ? t("automations.wouldWait", { time: duration(trace.wait, t) })
                : type === "trigger"
                  ? t("automations.testResult")
                  : previewLine(trace.preview) || t("automations.wouldDo")}
          </span>
        </p>
      )}
      {type === "condition" ? (
        <>
          <Handle type="source" id="yes" position={Position.Bottom} style={{ left: "25%" }} className={handle} />
          <Handle type="source" id="no" position={Position.Bottom} style={{ left: "75%" }} className={handle} />
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className={handle} />
      )}
      {/* Open outputs: a short line down to a "+" (conditions: one per free branch, labelled ja / nein). */}
      {flow.canEdit && !flow.testing &&
        meta.free.map((b) => (
          <div key={b ?? "next"} className="absolute top-full flex -translate-x-1/2 flex-col items-center" style={{ left: b === "yes" ? "25%" : b === "no" ? "75%" : "50%" }}>
            <span className="h-4 w-px bg-border" />
            {b && <span className="mb-1 text-[11px] text-muted-foreground">{t(b === "yes" ? "automations.yes" : "automations.no")}</span>}
            {add(b)}
          </div>
        ))}
    </div>
  )
}
const duration = (ms: number, t: ReturnType<typeof useT>) =>
  ms % 86_400_000 === 0 ? t("automations.duration.days", { count: ms / 86_400_000 }) : ms % 3_600_000 === 0 ? t("automations.duration.hours", { count: ms / 3_600_000 }) : t("automations.duration.minutes", { count: ms / 60_000 })

// The one line a card shows in a test run: the filled text / subject / tag / "field = value".
const previewLine = (p?: Record<string, string>) =>
  !p ? "" : p.field ? `${p.field} = ${p.value || "–"}` : (p.subject ?? p.text ?? p.tag ?? p.to ?? p.url ?? Object.values(p).find(Boolean) ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

// A connector: rounded right angles, its ja / nein label and a "+" in the middle to insert a step there.
function StepEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, style, markerEnd }: EdgeProps) {
  const t = useT()
  const flow = useContext(FlowCtx)!
  const [path, x, y] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 12 })
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div className="nodrag nopan pointer-events-auto absolute flex items-center gap-1" style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}>
          {label && <span className="rounded-full border bg-background px-1.5 text-[11px] leading-4 text-muted-foreground">{label}</span>}
          {flow.canEdit && !flow.testing && (
            <AddStepMenu telegram={flow.telegram} onPick={(type) => flow.insertOnEdge(id, type)}>
              <PlusButton label={t("automations.insertStep")} onClick={(e) => e.stopPropagation()} />
            </AddStepMenu>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

const nodeTypes = Object.fromEntries(["trigger", "condition", "wait", ...DATA_STEPS, ...ACTIONS].map((k) => [k, StepNode]))
const edgeTypes = { default: StepEdge }

export function WorkflowEditor(props: { id: string; name: string; description: string; graph: Graph; options: EditorOptions; canEdit: boolean; active: boolean }) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  )
}

function Editor({ id, name: initialName, description: initialDescription, graph, options, canEdit, active: initialActive }: { id: string; name: string; description: string; graph: Graph; options: EditorOptions; canEdit: boolean; active: boolean }) {
  const t = useT()
  const router = useRouter()
  const flowApi = useReactFlow()
  const [active, setActive] = useState(initialActive)
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const branchLabel = useCallback((h: string | null | undefined) => (h ? t(h === "yes" ? "automations.yes" : "automations.no") : undefined), [t])
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(graph.nodes.map((n) => ({ ...n, data: n.data as Data })) as FlowNode[])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(graph.edges.map((e) => ({ ...e, sourceHandle: e.sourceHandle ?? null, label: branchLabel(e.sourceHandle) })))
  const [selected, setSelected] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()
  // One save model: the canvas is one form; leaving with unsaved changes asks, switching on saves them first.
  useLeaveGuard(canEdit && dirty)
  // Test run: pick a real event of the trigger type, play the (unsaved) flow through, show the path.
  // "f:" = own test data: records picked per object (works before anything has happened).
  type Test = { samples: { id: string; at: string; label: string }[]; pickers: TestPicker[]; picks: Record<string, string>; eventId: string; trace: TraceStep[] | null; data: Record<string, unknown> | null }
  const [test, setTest] = useState<Test | null>(null)
  const [testing, startTest] = useTransition()
  const triggerEvent = triggerKey(nodes.find((n) => n.type === "trigger")?.data)
  const openTest = () =>
    startTest(async () => {
      const [samples, pickers] = await Promise.all([testSamples(triggerEvent), testPickers(triggerEvent)])
      const picks = Object.fromEntries(pickers.filter((p) => p.options.length).map((p) => [p.object, p.options[0].id]))
      setTest({ samples, pickers, picks, eventId: samples[0]?.id ?? (pickers.length ? "f:" : ""), trace: null, data: null })
    })
  const runTest = () =>
    startTest(async () => {
      if (!test?.eventId) return
      const r = await testRun({ eventId: test.eventId, graph: current(), picks: test.picks })
      if (r.error) toast.error(r.error)
      else setTest({ ...test, trace: r.trace ?? [], data: r.data ?? null })
    })

  const current = (): Graph => ({
    nodes: nodes.map((n) => ({ id: n.id, type: n.type as NodeType, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: Object.fromEntries(Object.entries(n.data).filter(([k]) => !k.startsWith("__"))) })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, ...(e.sourceHandle ? { sourceHandle: e.sourceHandle as "yes" | "no" } : {}) })),
  })
  const problems = useMemo(() => validate(current()), [nodes, edges]) // eslint-disable-line react-hooks/exhaustive-deps
  // Steps in the order they run (breadth first from the trigger): numbers on the cards, the tidy layout.
  const order = useMemo(() => {
    const trigger = nodes.find((n) => n.type === "trigger")
    const seen: string[] = trigger ? [trigger.id] : []
    for (let i = 0; i < seen.length; i++)
      for (const e of edges.filter((x) => x.source === seen[i]).sort((a, b) => Number(a.sourceHandle === "no") - Number(b.sourceHandle === "no"))) if (!seen.includes(e.target)) seen.push(e.target)
    return seen
  }, [nodes, edges])
  const freeOf = (n: FlowNode): Branch[] => {
    const outs = edges.filter((e) => e.source === n.id)
    return n.type === "condition" ? (["yes", "no"] as const).filter((h) => !outs.some((e) => e.sourceHandle === h)) : outs.length ? [] : [null]
  }
  const traced = new Map((test?.trace ?? []).map((st) => [st.node, st]))
  const shown = nodes.map((n) => {
    const meta: Meta = { n: order.indexOf(n.id) + 1 || undefined, problem: problems.find((p) => p.node === n.id)?.key, free: freeOf(n) }
    return { ...n, data: { ...n.data, __meta: meta, __trace: test?.trace ? (traced.get(n.id) ?? null) : undefined } }
  })
  const shownEdges = test?.trace
    ? edges.map((e) => {
        const from = traced.get(e.source)
        const taken = !!from && traced.has(e.target) && (!from.branch || from.branch === e.sourceHandle)
        return taken ? { ...e, animated: true, style: { stroke: "var(--success)", strokeWidth: 2 } } : e
      })
    : edges

  const edgeTo = (source: string, branch: Branch | undefined, target: string): Edge => ({ id: `${source}-${branch ?? ""}-${target}`, source, target, sourceHandle: branch ?? null, label: branchLabel(branch) })
  const onConnect = useCallback(
    (c: Connection) => {
      setEdges((es) => addEdge({ ...c, id: `${c.source}-${c.sourceHandle ?? ""}-${c.target}`, label: branchLabel(c.sourceHandle) }, es))
      setDirty(true)
    },
    [setEdges, branchLabel],
  )
  const newNode = (type: NodeType, position: { x: number; y: number }): FlowNode => ({ id: `${type}-${crypto.randomUUID().slice(0, 8)}`, type, position, data: structuredClone(DEFAULTS[type]), selected: true })
  const placeNew = (n: FlowNode, move: Set<string> = new Set(), dx = 0) => {
    setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false, position: move.has(x.id) ? { x: x.position.x + dx, y: x.position.y + ROW } : x.position })), n])
    setSelected(n.id)
    setDirty(true)
  }
  // "+" on a connector: the new step goes in between, everything below moves one row down (a new condition's
  // "ja" branch to the left, so its open "nein" has room).
  const insertOnEdge = (eid: string, type: NodeType) => {
    const e = edges.find((x) => x.id === eid)
    const target = e && nodes.find((n) => n.id === e.target)
    if (!e || !target) return
    const below = new Set([e.target])
    for (const nid of below) for (const x of edges) if (x.source === nid) below.add(x.target)
    const n = newNode(type, target.position)
    placeNew(n, below, type === "condition" ? -COL / 2 : 0)
    setEdges((es) => [...es.filter((x) => x.id !== eid), edgeTo(e.source, e.sourceHandle as Branch, n.id), edgeTo(n.id, type === "condition" ? "yes" : null, e.target)])
  }
  // "+" below an open output: the new step one row down (a condition's branches to the left / right).
  const appendAfter = (sid: string, branch: Branch, type: NodeType) => {
    const s = nodes.find((n) => n.id === sid)
    if (!s) return
    const n = newNode(type, { x: s.position.x + (branch === "yes" ? -COL / 2 : branch === "no" ? COL / 2 : 0), y: s.position.y + ROW })
    placeNew(n)
    setEdges((es) => [...es, edgeTo(sid, branch, n.id)])
  }
  // Toolbar "Schritt hinzufügen": after the selected step if it has an open output, else after the last open one.
  const addStep = (type: NodeType) => {
    const sel = nodes.find((n) => n.id === selected)
    const after = sel && freeOf(sel).length ? sel : [...order].reverse().map((nid) => nodes.find((n) => n.id === nid)!).find((n) => freeOf(n).length)
    if (after) return appendAfter(after.id, freeOf(after)[0], type)
    const low = Math.max(0, ...nodes.map((n) => n.position.y))
    placeNew(newNode(type, { x: 0, y: low + ROW }))
  }
  const update = (nid: string, patch: Data) => {
    setNodes((ns) => ns.map((n) => (n.id === nid ? { ...n, data: { ...n.data, ...patch } } : n)))
    setDirty(true)
  }
  // Removing a step that sits in a line closes the gap: what came before now leads to what came after.
  const bridge = (gone: string[]) => {
    const add: Edge[] = []
    for (const nid of gone) {
      if (nodes.find((n) => n.id === nid)?.type === "condition") continue
      const ins = edges.filter((e) => e.target === nid)
      const outs = edges.filter((e) => e.source === nid)
      if (ins.length === 1 && outs.length === 1 && !gone.includes(ins[0].source) && !gone.includes(outs[0].target)) add.push(edgeTo(ins[0].source, ins[0].sourceHandle as Branch, outs[0].target))
    }
    if (add.length) setEdges((es) => [...es.filter((e) => !gone.includes(e.source) && !gone.includes(e.target)), ...add.filter((a) => !es.some((e) => e.id === a.id))])
  }
  const remove = (nid: string) => {
    bridge([nid])
    setNodes((ns) => ns.filter((n) => n.id !== nid))
    setEdges((es) => es.filter((e) => e.source !== nid && e.target !== nid))
    setSelected(null)
    setDirty(true)
  }
  // Tidy up: a top-down tree from the trigger, each step centred over what follows it, branches side by side
  // (ja left, nein right); steps nothing leads to go in a row below.
  const layout = () => {
    const parent = new Map<string, string>()
    for (const nid of order) for (const e of edges) if (e.source === nid && !parent.has(e.target) && order.indexOf(e.target) > order.indexOf(nid)) parent.set(e.target, nid)
    // A condition keeps a column for each branch, also an open one (its "+" stays beside the other branch).
    const slots = (nid: string): (string | null)[] =>
      nodes.find((n) => n.id === nid)?.type === "condition"
        ? (["yes", "no"] as const).flatMap((h) => {
            const e = edges.find((x) => x.source === nid && x.sourceHandle === h)
            return !e ? [null] : parent.get(e.target) === nid ? [e.target] : []
          })
        : order.filter((k) => parent.get(k) === nid)
    const width = (nid: string): number => Math.max(1, slots(nid).reduce((s, k) => s + (k ? width(k) : 1), 0))
    const pos = new Map<string, { x: number; y: number }>()
    const place = (nid: string, left: number, depth: number) => {
      pos.set(nid, { x: (left + width(nid) / 2 - 0.5) * COL, y: depth * ROW })
      let l = left
      for (const k of slots(nid)) {
        if (k) place(k, l, depth + 1)
        l += k ? width(k) : 1
      }
    }
    if (order[0]) place(order[0], 0, 0)
    const shift = pos.get(order[0])?.x ?? 0
    const bottom = Math.max(0, ...[...pos.values()].map((p) => p.y)) + ROW
    const loose = nodes.filter((n) => !pos.has(n.id))
    setNodes((ns) => ns.map((n) => ({ ...n, position: pos.has(n.id) ? { x: pos.get(n.id)!.x - shift, y: pos.get(n.id)!.y } : { x: (loose.indexOf(n) - (loose.length - 1) / 2) * COL, y: bottom } })))
    setDirty(true)
    requestAnimationFrame(() => flowApi.fitView({ maxZoom: 1, padding: 0.2, duration: 200 }))
  }
  const save = () =>
    start(async () => {
      const r = await saveWorkflow({ id, name, description, graph: current() })
      if (r.error) toast.error(r.error)
      else {
        setDirty(false)
        toast.success(r.problems?.length ? t("automations.savedDraft") : t("automations.saved"))
      }
    })
  // The "Aktiv" switch: switching on first saves what is on screen (an active flow must be valid), then activates.
  const toggleActive = (on: boolean) =>
    start(async () => {
      if (on && dirty) {
        const r = await saveWorkflow({ id, name, description, graph: current() })
        if (r.error) return void toast.error(r.error)
        setDirty(false)
      }
      const r = await setActiveAction(id, on)
      if (r.error) return void toast.error(r.error)
      setActive(on)
      toast.success(t(on ? "automations.activated" : "automations.deactivated"))
      router.refresh()
    })
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ roots: "workflow", version: 1, name, description, graph: current() }, null, 2)], { type: "application/json" })
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${name.replace(/[^\w-]+/g, "-").toLowerCase() || "workflow"}.json` })
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const sel = nodes.find((n) => n.id === selected)
  const phone = usePhone()
  const select = (nid: string | null) => (setSelected(nid), setNodes((ns) => ns.map((n) => (n.selected !== (n.id === nid) ? { ...n, selected: n.id === nid } : n))))
  const panelOpen = !!sel || !!test
  const closePanel = () => (sel ? select(null) : setTest(null))
  // Esc closes the side panel (unless a menu / picker inside it is open and takes the key itself).
  useEffect(() => {
    if (!panelOpen || phone) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector("[data-slot=popover-content], [role=menu], [role=listbox]")) return
      if (sel) select(null)
      else setTest(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })
  // Desktop: a step opened behind the side panel slides into view.
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!sel || phone || !box.current) return
    const { x, y, zoom } = flowApi.getViewport()
    const right = (sel.position.x + CARD_W) * zoom + x
    const room = box.current.clientWidth - 420
    if (right > room) flowApi.setViewport({ x: x - (right - room), y, zoom }, { duration: 200 })
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps
  // Results of data steps, usable by every step as objects ("Ergebnis: Mitgliedschaft").
  const flowOptions: EditorOptions = {
    ...options,
    steps: (() => {
      // Named after what they look up; numbered when the same thing is looked up twice.
      const data = nodes.filter((n) => n.type === "find_record" || n.type === "aggregate" || n.type === "for_each")
      const base = (n: (typeof data)[number]) =>
        `${t(n.type === "aggregate" ? "automations.aggResultOf" : n.type === "for_each" ? "automations.eachOf" : "automations.result")}: ${n.data.object ? t.dynamic(`automations.objects.${n.data.object}`) : t.dynamic(`automations.nodes.${n.type}`)}`
      return data.map((n) => {
        const same = data.filter((x) => base(x) === base(n))
        const own = String(n.data.label ?? "")
        return { key: stepKey(n.id), object: n.type === "aggregate" ? "aggregate" : String(n.data.object ?? ""), label: own || (same.length > 1 ? `${base(n)} ${same.indexOf(n) + 1}` : base(n)) }
      })
    })(),
  }
  const api: FlowApi = { canEdit, testing: !!test?.trace, telegram: options.telegram.connected, insertOnEdge, appendAfter }

  const testSection = test && (
    <section className="grid gap-3" aria-label={t("automations.testRun")}>
      <p className="text-xs text-muted-foreground">{t("automations.testHint")}</p>
      {test.samples.length || test.pickers.length ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor="test-sample">{t("automations.testSample")}</Label>
            <NativeSelect id="test-sample" value={test.eventId} onChange={(e) => setTest({ ...test, eventId: e.target.value, trace: null, data: null })} className="w-full">
              {test.samples.map((x) => (
                <NativeSelectOption key={x.id} value={x.id}>
                  {new Date(x.at).toLocaleString()}
                  {x.label && ` · ${x.label}`}
                </NativeSelectOption>
              ))}
              {test.pickers.length > 0 && <NativeSelectOption value="f:">{t("automations.testOwn")}</NativeSelectOption>}
            </NativeSelect>
            {!test.samples.length && <p className="text-xs text-muted-foreground">{t("automations.noSamplesOwn")}</p>}
          </div>
          {test.eventId === "f:" &&
            test.pickers.map((p) => (
              <div key={p.object} className="grid gap-2">
                <Label htmlFor={`pick-${p.object}`}>{t.dynamic(`automations.objects.${p.object}`)}</Label>
                <NativeSelect id={`pick-${p.object}`} value={test.picks[p.object] ?? ""} onChange={(e) => setTest({ ...test, picks: { ...test.picks, [p.object]: e.target.value }, trace: null, data: null })} className="w-full">
                  <NativeSelectOption value="">{t("automations.testNone")}</NativeSelectOption>
                  {p.options.map((o) => (
                    <NativeSelectOption key={o.id} value={o.id}>
                      {o.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            ))}
          <Button type="button" size="sm" onClick={runTest} disabled={testing} className="justify-self-start">
            <FlaskConicalIcon /> {testing ? t("automations.testing") : t("automations.runTest")}
          </Button>
        </>
      ) : (
        <p className="text-sm">{t("automations.noSamples")}</p>
      )}
      {test.data && (
        <details className="text-xs">
          <summary className="cursor-pointer">{t("automations.testData")}</summary>
          <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-muted p-2">{JSON.stringify(test.data, null, 2)}</pre>
        </details>
      )}
    </section>
  )
  const panelBody = (
    <>
      {testSection}
      {sel && test && <hr className="border-border" />}
      {sel && <Inspector key={sel.id} node={sel} options={flowOptions} trigger={triggerEvent} trace={test?.trace ? (traced.get(sel.id) ?? null) : undefined} canEdit={canEdit} onChange={(p) => update(sel.id, p)} />}
    </>
  )
  // Panel / sheet title: the step's colour tile, "2. E-Mail senden", its own name (click to rename) and removing it.
  const panelTitle = sel ? (
    <span className="flex min-w-0 items-center gap-3">
      <StepTile type={sel.type as NodeType} />
      <span className="grid min-w-0 flex-1 text-sm">
        <span className="truncate text-xs font-normal text-muted-foreground">{(order.indexOf(sel.id) + 1 ? `${order.indexOf(sel.id) + 1}. ` : "") + t.dynamic(`automations.nodes.${sel.type}`)}</span>
        <StepTitle value={String(sel.data.label ?? "")} fallback={t.dynamic(`automations.nodes.${sel.type}`)} canEdit={canEdit} onChange={(label) => update(sel.id, { label })} />
      </span>
      {canEdit && sel.type !== "trigger" && (
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(sel.id)} aria-label={t("automations.removeStep")} title={t("automations.removeStep")}>
          <Trash2Icon />
        </Button>
      )}
    </span>
  ) : (
    t("automations.testRun")
  )
  const issues = [...new Map(problems.map((p) => [p.key, p])).values()]

  return (
    <FlowCtx.Provider value={api}>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="grid min-w-0 flex-1 basis-72">
            <input
              value={name}
              disabled={!canEdit}
              maxLength={200}
              aria-label={t("automations.name")}
              onChange={(e) => (setName(e.target.value), setDirty(true))}
              className="-mx-1.5 min-w-0 truncate rounded-md bg-transparent px-1.5 text-lg font-semibold tracking-tight outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-100"
            />
            <input
              value={description}
              disabled={!canEdit}
              maxLength={2000}
              aria-label={t("automations.description")}
              placeholder={canEdit ? t("automations.descriptionPlaceholder") : ""}
              onChange={(e) => (setDescription(e.target.value), setDirty(true))}
              className="-mx-1.5 min-w-0 truncate rounded-md bg-transparent px-1.5 text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/70 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-100"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {issues.length > 0 && (
              <Popover>
                <PopoverTrigger render={<Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" />}>
                  <CircleAlertIcon /> {t("automations.issuesCount", { count: issues.length })}
                </PopoverTrigger>
                <PopoverContent sheet title={t("automations.issuesTitle")} align="end" className="w-80 p-1">
                  <ul className="grid">
                    {issues.map((p) => (
                      <li key={p.key}>
                        <button type="button" disabled={!p.node} onClick={() => p.node && select(p.node)} className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm enabled:hover:bg-muted max-md:py-3">
                          <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                          {t.dynamic(`automations.issues.${p.key}`)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </PopoverContent>
              </Popover>
            )}
            {canEdit && (
              <Tooltip>
                <TooltipTrigger render={<label className="flex h-(--control-sm) items-center gap-2 px-1 text-sm" />}>
                  <Switch checked={active} disabled={pending} aria-label={t("automations.activeSwitch")} data-confirm={active ? undefined : "automations.confirmActivate"} onCheckedChange={toggleActive} />
                  <span className="max-md:sr-only">{t(active ? "automations.on" : "automations.off")}</span>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">{t(active ? "automations.activeHint" : "automations.offHint")}</TooltipContent>
              </Tooltip>
            )}
            <Button type="button" variant={test ? "secondary" : "outline"} size="sm" onClick={() => (test ? setTest(null) : openTest())} disabled={(testing && !test) || !triggerEvent}>
              <FlaskConicalIcon /> {testing && !test ? t("automations.testLoading") : test ? t("automations.testStop") : t("automations.testRun")}
            </Button>
            {canEdit && (
              <Button type="button" variant="outline" size="sm" onClick={layout} className="max-md:hidden">
                <LayoutListIcon /> {t("automations.tidy")}
              </Button>
            )}
            {canEdit && (
              <Button type="button" size="sm" onClick={save} disabled={pending || !dirty}>
                <SaveIcon /> {pending ? t("automations.saving") : dirty ? t("common.save") : t("automations.savedShort")}
              </Button>
            )}
            <ActionsMenu>
              {canEdit && (
                <DropdownMenuItem onClick={layout} className="md:hidden">
                  <LayoutListIcon /> {t("automations.tidy")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={exportJson}>
                <DownloadIcon /> {t("automations.export")}
              </DropdownMenuItem>
              {canEdit && <DropdownMenuSeparator />}
              {canEdit && (
                <MenuSubmit form="trash-workflow" icon={<Trash2Icon />} destructive>
                  {t("automations.toTrash")}
                </MenuSubmit>
              )}
            </ActionsMenu>
          </div>
        </div>
        <div ref={box} className="relative h-[calc(100dvh-14rem)] min-h-[420px] overflow-hidden rounded-xl border bg-background md:h-[calc(100dvh-10.5rem)]">
          <ReactFlow
            nodes={shown}
            edges={shownEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={(c) => (onNodesChange(c.filter((x) => x.type !== "remove" || nodes.find((n) => n.id === x.id)?.type !== "trigger")), c.some((x) => x.type !== "select" && x.type !== "dimensions") && setDirty(true))}
            onNodesDelete={(gone) => bridge(gone.filter((n) => n.type !== "trigger").map((n) => n.id))}
            onEdgesChange={(c) => (onEdgesChange(c), c.some((x) => x.type === "remove") && setDirty(true))}
            onConnect={onConnect}
            onSelectionChange={({ nodes: s }) => setSelected(s[0]?.id ?? null)}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable
            deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
            fitView
            fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
            minZoom={0.25}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1.2} color="var(--border)" />
            <Controls showInteractive={false} position="bottom-left" orientation="horizontal" className="max-md:!hidden" />
            {canEdit && (
              <Panel position="top-left">
                <AddStepMenu telegram={options.telegram.connected} onPick={addStep}>
                  <Button type="button" variant="outline" size="sm" className="bg-card shadow-xs">
                    <PlusIcon /> {t("automations.addStep")}
                  </Button>
                </AddStepMenu>
              </Panel>
            )}
          </ReactFlow>
          {panelOpen && !phone && (
            // Desktop: the open step (and the test run) in a panel over the canvas' right side; X / Esc close it.
            <aside className="absolute inset-y-2 right-2 z-10 flex w-[min(400px,calc(100%-1rem))] flex-col overflow-hidden rounded-xl border bg-popover shadow-lg" aria-label={t("automations.settings")}>
              <div className="flex min-h-14 shrink-0 items-center justify-between gap-1 border-b py-2 pr-2 pl-3 text-sm font-medium">
                <div className="min-w-0 flex-1">{panelTitle}</div>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t("common.close")} onClick={closePanel}>
                  <XIcon />
                </Button>
              </div>
              <div className="grid content-start gap-4 overflow-y-auto overscroll-contain p-4">{panelBody}</div>
            </aside>
          )}
        </div>
        {panelOpen && phone && (
          // Phones: the open step / test run as a sheet over the canvas; closing it deselects the step.
          <ContentSheet key={sel?.id ?? "test"} label={t("automations.settings")} onClose={() => {}} onClosed={closePanel} header={<ContentSheetTitle render={<div />} className="text-base font-semibold">{panelTitle}</ContentSheetTitle>}>
            <div className="grid gap-4 px-4 pb-6">{panelBody}</div>
          </ContentSheet>
        )}
      </div>
    </FlowCtx.Provider>
  )
}


// Settings of the selected step.
function Inspector({
  node,
  options,
  trigger,
  trace,
  canEdit,
  onChange,
}: {
  node: FlowNode
  options: EditorOptions
  trigger: string
  trace?: TraceStep | null
  canEdit: boolean
  onChange: (p: Data) => void
}) {
  const t = useT()
  const d = node.data as Record<string, unknown>
  const type = node.type as NodeType
  const field = (k: string, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1">
      <Label htmlFor={`in-${k}`}>{label}</Label>
      <Input id={`in-${k}`} value={String(d[k] ?? "")} disabled={!canEdit} onChange={(e) => onChange({ [k]: e.target.value })} {...props} />
    </div>
  )
  const mods = new Set(options.modules)
  const stepKeys = (options.steps ?? []).filter((x) => x.key !== stepKey(node.id)).map((x) => x.key)
  // Placeholders from the same catalog as the conditions: what the trigger brings.
  const placeholders = [
    "first_name",
    "name",
    "org",
    ...objectsFor(trigger, mods).flatMap((o) => def(o).fields.filter((f) => f.kind !== "ref" && f.kind !== "tags" && f.kind !== "bool").map((f) => `${o}.${f.key}`)),
    ...objectsFor(trigger, mods).flatMap((o) => (options.customFields[o] ?? []).map((f) => `${o}.custom.${f.key}`)),
    ...stepKeys.flatMap((k) => fieldsOf(k, options, (x) => t.dynamic(x)).filter((f) => f.kind !== "link" && f.kind !== "ref" && f.kind !== "tags").map((f) => `${k}.${f.key}`)),
    ...(objectsFor(trigger, mods).includes("submission") ? options.answers.filter((f) => f.kind !== "ref" && f.kind !== "tags" && f.kind !== "bool").map((f) => `submission.answers.${f.key}`) : []),
  ]
  const insert = (k: string, token: string) => onChange({ [k]: `${String(d[k] ?? "")}{${token}}` })
  const chips = (k: string) =>
    canEdit && (
      <div className="flex flex-wrap gap-1" aria-label={t("automations.insertPlaceholder")}>
        {placeholders.map((p) => (
          <button key={p} type="button" onClick={() => insert(k, p)} className="rounded border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted">
            {`{${p}}`}
          </button>
        ))}
      </div>
    )
  return (
    <div className="grid gap-4">
      <p className="text-xs text-muted-foreground">{t.dynamic(`automations.help.${type}`)}</p>
      {trace !== undefined && <TraceView trace={trace} />}
      {type === "trigger" && <TriggerForm d={d} options={options} canEdit={canEdit} onChange={onChange} />}
      {type === "wait" && (
        <div className="grid gap-2">
          <NativeSelect value={String(d.mode ?? "for")} disabled={!canEdit} aria-label={t("automations.waitMode")} className="w-full" onChange={(e) => onChange({ mode: e.target.value })}>
            <NativeSelectOption value="for">{t("automations.waitFor")}</NativeSelectOption>
            <NativeSelectOption value="until">{t("automations.waitUntil")}</NativeSelectOption>
          </NativeSelect>
          {d.mode === "until" ? (
            <DateValue value={String(d.until ?? "")} time dates={dateBases(objectsFor(trigger, mods), (k) => t.dynamic(k))} disabled={!canEdit} onChange={(until) => onChange({ until })} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {field("amount", t("automations.amount"), { type: "number", min: 1, onChange: (e) => onChange({ amount: Math.max(1, Math.floor(Number(e.target.value) || 1)) }) })}
              <div className="grid gap-1">
                <Label htmlFor="in-unit">{t("automations.unit")}</Label>
                <NativeSelect id="in-unit" value={String(d.unit ?? "days")} disabled={!canEdit} onChange={(e) => onChange({ unit: e.target.value })} className="w-full">
                  {WAIT_UNITS.map((u) => (
                    <NativeSelectOption key={u} value={u}>
                      {t.dynamic(`automations.units.${u}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>
          )}
        </div>
      )}
      {type === "condition" && <ConditionForm d={d} options={options} trigger={trigger} extra={stepKeys} canEdit={canEdit} onChange={onChange} />}
      {(type === "find_record" || type === "aggregate" || type === "for_each") && <DataStepForm type={type} d={d} options={options} trigger={trigger} extra={stepKeys} canEdit={canEdit} onChange={onChange} />}
      {type === "send_email" && (
        <>
          {field("to", t("automations.to"), { maxLength: 320, placeholder: "{contact.email}" })}
          {canEdit && (
            <div className="flex flex-wrap gap-1">
              {placeholders
                .filter((p) => p.endsWith("email"))
                .map((p) => (
                  <button key={p} type="button" onClick={() => onChange({ to: `{${p}}` })} className="rounded border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted">
                    {`{${p}}`}
                  </button>
                ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t("automations.toHint")}</p>
          {field("subject", t("automations.subject"), { maxLength: 200 })}
          {chips("subject")}
          <div className="grid gap-1">
            <Label>{t("automations.body")}</Label>
            <RichTextEditor name="body" defaultValue={String(d.body ?? "")} placeholders={placeholders} disabled={!canEdit} onChange={(html) => onChange({ body: html })} />
          </div>
        </>
      )}
      {(type === "add_tag" || type === "remove_tag") && <TagPick value={String(d.tag ?? "")} tags={options.tags} creatable={type === "add_tag"} disabled={!canEdit} onChange={(tag) => onChange({ tag })} />}
      {type === "set_field" && <SetField d={d} options={options} trigger={trigger} extra={stepKeys} canEdit={canEdit} onChange={onChange} />}
      {(type === "set_field" || type === "create_record") && <p className="text-xs text-muted-foreground">{t("automations.valuesHint")}</p>}
      {type === "delete_record" && (
        <div className="grid gap-2">
          <NativeSelect value={String(d.object ?? "")} disabled={!canEdit} aria-label={t("automations.object")} className="w-full" onChange={(e) => onChange({ object: e.target.value })}>
            <NativeSelectOption value="">{t("automations.pickObject")}</NativeSelectOption>
            {[...deletableFor(trigger, mods), ...stepKeys.filter((k) => { const st = options.steps?.find((x) => x.key === k); return st && st.object in OBJECTS && def(st.object as ObjectKey).remove })].map((o) => (
              <NativeSelectOption key={o} value={o}>
                {objectLabel(o, options, (k) => t.dynamic(k))}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">{t("automations.deleteHint")}</p>
        </div>
      )}
      {type === "create_record" && <CreateRecord d={d} options={options} trigger={trigger} canEdit={canEdit} onChange={onChange} />}
      {type === "telegram" && (
        <>
          {!options.telegram.connected && <p className="text-xs text-destructive">{t("automations.telegramOff")}</p>}
          <div className="grid gap-1">
            <Label htmlFor="in-chat">{t("automations.chat")}</Label>
            <NativeSelect id="in-chat" value={String(d.chat_id ?? "")} disabled={!canEdit} onChange={(e) => onChange({ chat_id: e.target.value })} className="w-full">
              <NativeSelectOption value="">{t("automations.pickChat")}</NativeSelectOption>
              {options.telegram.chats.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {field("text", t("automations.text"), { maxLength: 4000 })}
          {chips("text")}
        </>
      )}
      {type === "webhook" && field("url", "URL", { type: "url", placeholder: "https://…" })}
      {type === "notify_team" && (
        <>
          {field("text", t("automations.text"), { maxLength: 500 })}
          {chips("text")}
        </>
      )}
      {(type === "send_email" || type === "notify_team" || type === "telegram") && <p className="text-xs text-muted-foreground">{t("automations.placeholdersHint")}</p>}
    </div>
  )
}

/** "Ticket sold" or, for record triggers, "Ticket · created". */
export function triggerLabel(key: string, t: ReturnType<typeof useT>) {
  if (key === "date_reached") return t("automations.dateReached")
  if (key === "schedule") return t("automations.schedule")
  const rec = parseRecordTrigger(key)
  return rec ? `${t.dynamic(`automations.objects.${rec.object}`)} · ${t.dynamic(`automations.recordActions.${rec.action}`)}` : t.dynamic(`events.types.${key}`)
}

/** One sentence on what exactly starts the run (shown in the picker and below it). */
function triggerHint(key: string, t: ReturnType<typeof useT>) {
  if (key === "date_reached") return t("automations.dateReachedHint")
  if (key === "schedule") return t("automations.scheduleHint")
  const rec = parseRecordTrigger(key)
  if (rec) return t("automations.recordHint", { object: t.dynamic(`automations.objects.${rec.object}`), action: t.dynamic(`automations.recordActions.${rec.action}`) })
  return t.has(`events.hints.${key}`) ? t.dynamic(`events.hints.${key}`) : ""
}

// Trigger: search over all triggers of the active modules, grouped by module; "record changed" can watch fields.
function TriggerForm({ d, options, canEdit, onChange }: { d: Record<string, unknown>; options: EditorOptions; canEdit: boolean; onChange: (p: Data) => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  // "Datum erreicht" is stored as a daily schedule over an object's records with a date filter (data.date = true).
  const value = d.event === "schedule" && d.date ? "date_reached" : String(d.event ?? "")
  const rec = parseRecordTrigger(value)
  const watch = (d.fields as string[] | undefined) ?? []
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <Label>{t("automations.event")}</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger render={<Button type="button" variant="outline" className="w-full justify-between font-normal" disabled={!canEdit} />}>
            <span className="truncate">{value ? triggerLabel(value, t) : t("automations.pickEvent")}</span>
            <ChevronsUpDownIcon className="opacity-50" />
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Command>
              <CommandInput placeholder={t("automations.searchTrigger")} />
              <CommandList className="max-h-80">
                <CommandEmpty>{t("automations.noTrigger")}</CommandEmpty>
                {options.triggers.map((g) => (
                  <CommandGroup key={g.group} heading={g.group}>
                    {g.items.map((it) => (
                      <CommandItem
                        key={it.key}
                        value={`${g.group} ${it.label} ${triggerHint(it.key, t)}`}
                        data-checked={it.key === value}
                        onSelect={() =>
                          (onChange(
                            it.key === "date_reached"
                              ? { event: "schedule", date: true, every: "day", time: "08:00", object: "", date_field: "", offset: -7, yearly: false, rules: [], fields: [] }
                              : it.key === "schedule"
                                ? { event: "schedule", date: false, every: "day", time: "09:00", fields: [] }
                                : { event: it.key, date: false, fields: [] },
                          ),
                          setOpen(false))
                        }
                      >
                        <span className="grid gap-0.5">
                          <span>{it.label}</span>
                          {triggerHint(it.key, t) && <span className="line-clamp-2 text-xs text-muted-foreground">{triggerHint(it.key, t)}</span>}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {value && triggerHint(value, t) && <p className="text-xs text-muted-foreground">{triggerHint(value, t)}</p>}
      </div>
      {value === "schedule" && <ScheduleForm d={d} options={options} canEdit={canEdit} onChange={onChange} />}
      {value === "date_reached" && <DateReachedForm d={d} options={options} canEdit={canEdit} onChange={onChange} />}
      {value && (
        <div className="grid gap-1">
          <Label htmlFor="tr-once">{t("automations.onceLabel")}</Label>
          <NativeSelect id="tr-once" value={String(d.once ?? "")} disabled={!canEdit} className="w-full" onChange={(e) => onChange({ once: e.target.value })}>
            <NativeSelectOption value="">{t("automations.onceNo")}</NativeSelectOption>
            <NativeSelectOption value="contact">{t("automations.oncePerPerson")}</NativeSelectOption>
            <NativeSelectOption value="record">{t("automations.oncePerRecord")}</NativeSelectOption>
          </NativeSelect>
          {d.once ? (
            <label className="flex items-center gap-2 text-sm">
              {t("automations.againAfter")}
              <Input type="number" min={0} className="w-20" value={Number(d.again_after_days ?? 0)} disabled={!canEdit} aria-label={t("automations.days")} onChange={(e) => onChange({ again_after_days: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
              {t("automations.days")}
            </label>
          ) : null}
        </div>
      )}
      {rec?.action === "update" && (
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-medium">{t("automations.watchFields")}</legend>
          <p className="text-xs text-muted-foreground">{t("automations.watchHint")}</p>
          {def(rec.object).fields
            .filter((f) => f.key !== "id")
            .map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  disabled={!canEdit}
                  checked={watch.includes(f.key)}
                  onChange={(e) => onChange({ fields: e.target.checked ? [...watch, f.key] : watch.filter((x) => x !== f.key) })}
                />
                {t.dynamic(`automations.fields.${rec.object}.${f.key}`)}
              </label>
            ))}
        </fieldset>
      )}
    </div>
  )
}

// "Datum erreicht": every day at a time, once per record whose date field is N days before / on / after today
// (e.g. 28 days before a contract's notice deadline, on a birthday every year). Optional conditions narrow it down.
function DateReachedForm({ d, options, canEdit, onChange }: { d: Record<string, unknown>; options: EditorOptions; canEdit: boolean; onChange: (p: Data) => void }) {
  const t = useT()
  const mods = new Set(options.modules)
  const object = String(d.object ?? "") as ObjectKey | ""
  const offset = Number(d.offset ?? 0)
  const objects = SCHEDULE_OBJECTS.filter((o) => (def(o).module === "org" || mods.has(def(o).module)) && def(o).fields.some((f) => f.kind === "date"))
  const dateFields = object ? def(object).fields.filter((f) => f.kind === "date") : []
  return (
    <div className="grid gap-3 rounded-md border p-2">
      <div className="grid gap-1">
        <Label htmlFor="dr-object">{t("automations.dateRecord")}</Label>
        <NativeSelect id="dr-object" value={object} required disabled={!canEdit} className="w-full" onChange={(e) => onChange({ object: e.target.value, rules: [], date_field: "" })}>
          <NativeSelectOption value="">–</NativeSelectOption>
          {objects.map((o) => (
            <NativeSelectOption key={o} value={o}>
              {t.dynamic(`automations.objects.${o}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {object && (
        <div className="grid gap-1">
          <Label htmlFor="dr-field">{t("automations.dateWhich")}</Label>
          <NativeSelect id="dr-field" value={String(d.date_field ?? "")} required disabled={!canEdit} className="w-full" onChange={(e) => onChange({ date_field: e.target.value })}>
            <NativeSelectOption value="">–</NativeSelectOption>
            {dateFields.map((f) => (
              <NativeSelectOption key={f.key} value={f.key}>
                {t.dynamic(`automations.fields.${object}.${f.key}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-1">
        <Input type="number" min={0} value={Math.abs(offset)} disabled={!canEdit || offset === 0} aria-label={t("automations.days")} onChange={(e) => onChange({ offset: (offset < 0 ? -1 : 1) * Math.max(1, Math.abs(Math.floor(Number(e.target.value) || 1))) })} />
        <NativeSelect value={offset < 0 ? "before" : offset > 0 ? "after" : "on"} disabled={!canEdit} aria-label={t("automations.when")} className="w-full" onChange={(e) => onChange({ offset: e.target.value === "on" ? 0 : (e.target.value === "before" ? -1 : 1) * Math.max(1, Math.abs(offset)) })}>
          <NativeSelectOption value="before">{t("automations.daysBefore")}</NativeSelectOption>
          <NativeSelectOption value="on">{t("automations.onTheDay")}</NativeSelectOption>
          <NativeSelectOption value="after">{t("automations.daysAfter")}</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="grid grid-cols-2 items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor="dr-time">{t("automations.at")}</Label>
          <Input id="dr-time" type="time" value={String(d.time ?? "08:00")} disabled={!canEdit} onChange={(e) => onChange({ time: e.target.value, every: "day" })} />
        </div>
        <label className="flex h-8 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={!!d.yearly} disabled={!canEdit} onChange={(e) => onChange({ yearly: e.target.checked })} />
          {t("automations.yearly")}
        </label>
      </div>
      {object && (
        <>
          <p className="text-xs font-medium">{t("automations.onlyThese")}</p>
          <RulesEditor rules={(d.rules as { field: string; op: string; value: string }[]) ?? []} objects={[object]} options={options} canEdit={canEdit} onChange={(rules) => onChange({ rules })} />
        </>
      )}
    </div>
  )
}

// Schedule: when (daily/weekly/monthly at a time) and for what: once, or each record of an object that passes
// the filters (conditions on its fields, and/or "N days before/after a date", yearly for birthdays).
function ScheduleForm({ d, options, canEdit, onChange }: { d: Record<string, unknown>; options: EditorOptions; canEdit: boolean; onChange: (p: Data) => void }) {
  const t = useT()
  const mods = new Set(options.modules)
  const object = String(d.object ?? "") as ObjectKey | ""
  const every = String(d.every ?? "day")
  const offset = Number(d.offset ?? 0)
  const dateFields = object ? def(object).fields.filter((f) => f.kind === "date") : []
  return (
    <div className="grid gap-3 rounded-md border p-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label htmlFor="sc-every">{t("automations.every")}</Label>
          <NativeSelect id="sc-every" value={every} disabled={!canEdit} className="w-full" onChange={(e) => onChange({ every: e.target.value, time: d.time ?? "09:00" })}>
            {["day", "week", "month"].map((x) => (
              <NativeSelectOption key={x} value={x}>
                {t.dynamic(`automations.everyOptions.${x}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="sc-time">{t("automations.at")}</Label>
          <Input id="sc-time" type="time" value={String(d.time ?? "09:00")} disabled={!canEdit} onChange={(e) => onChange({ time: e.target.value, every })} />
        </div>
      </div>
      {every === "week" && (
        <NativeSelect value={String(d.weekday ?? 1)} disabled={!canEdit} aria-label={t("automations.fields.now.weekday")} className="w-full" onChange={(e) => onChange({ weekday: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5, 6, 7].map((w) => (
            <NativeSelectOption key={w} value={String(w)}>
              {t.dynamic(`automations.values.${w}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      {every === "month" && (
        <div className="grid gap-1">
          <Label htmlFor="sc-md">{t("automations.monthday")}</Label>
          <Input id="sc-md" type="number" min={1} max={28} value={Number(d.monthday ?? 1)} disabled={!canEdit} onChange={(e) => onChange({ monthday: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} />
        </div>
      )}
      <div className="grid gap-1">
        <Label htmlFor="sc-object">{t("automations.forEach")}</Label>
        <NativeSelect id="sc-object" value={object} disabled={!canEdit} className="w-full" onChange={(e) => onChange({ object: e.target.value, rules: [], date_field: "", offset: 0, yearly: false })}>
          <NativeSelectOption value="">{t("automations.once")}</NativeSelectOption>
          {SCHEDULE_OBJECTS.filter((o) => def(o).module === "org" || mods.has(def(o).module)).map((o) => (
            <NativeSelectOption key={o} value={o}>
              {t.dynamic(`automations.objects.${o}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {object && (
        <>
          <p className="text-xs font-medium">{t("automations.onlyThese")}</p>
          <RulesEditor rules={(d.rules as { field: string; op: string; value: string }[]) ?? []} objects={[object]} options={options} canEdit={canEdit} onChange={(rules) => onChange({ rules })} />
          {dateFields.length > 0 && (
            <div className="grid gap-1">
              <Label htmlFor="sc-date">{t("automations.dateFilter")}</Label>
              <NativeSelect id="sc-date" value={String(d.date_field ?? "")} disabled={!canEdit} className="w-full" onChange={(e) => onChange({ date_field: e.target.value })}>
                <NativeSelectOption value="">{t("automations.noDateFilter")}</NativeSelectOption>
                {dateFields.map((f) => (
                  <NativeSelectOption key={f.key} value={f.key}>
                    {t.dynamic(`automations.fields.${object}.${f.key}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {d.date_field ? (
                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-1">
                  <Input type="number" min={0} value={Math.abs(offset)} disabled={!canEdit} aria-label={t("automations.days")} onChange={(e) => onChange({ offset: (offset < 0 ? -1 : 1) * Math.abs(Math.floor(Number(e.target.value) || 0)) })} />
                  <NativeSelect value={offset < 0 ? "before" : offset > 0 ? "after" : "on"} disabled={!canEdit} aria-label={t("automations.when")} className="w-full" onChange={(e) => onChange({ offset: e.target.value === "on" ? 0 : (e.target.value === "before" ? -1 : 1) * Math.max(1, Math.abs(offset)) })}>
                    <NativeSelectOption value="before">{t("automations.daysBefore")}</NativeSelectOption>
                    <NativeSelectOption value="on">{t("automations.onTheDay")}</NativeSelectOption>
                    <NativeSelectOption value="after">{t("automations.daysAfter")}</NativeSelectOption>
                  </NativeSelect>
                  <label className="col-span-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" checked={!!d.yearly} disabled={!canEdit} onChange={(e) => onChange({ yearly: e.target.checked })} />
                    {t("automations.yearly")}
                  </label>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// What this step did in the test run: condition rules (value seen vs expected), filled texts, wait.
function TraceView({ trace }: { trace: TraceStep | null }) {
  const t = useT()
  if (!trace) return <p className="rounded-md bg-muted px-2 py-1 text-xs">{t("automations.notReached")}</p>
  const show = (v: unknown) => (v == null || v === "" ? "–" : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v))
  return (
    <div className="grid gap-1 rounded-md border border-primary/40 bg-primary/5 p-2 text-xs">
      <p className="font-medium">{t("automations.testResult")}</p>
      {trace.rules?.map((r, i) => (
        <p key={i} className={r.ok ? "" : "text-destructive"}>
          {r.ok ? "✓" : "✗"} {r.field}: {t("automations.actual")} „{show(r.actual)}“ · {t("automations.expected")} {t.dynamic(`automations.ops.${r.op}`)} „{r.expected}“
        </p>
      ))}
      {trace.branch && <p>→ {t(trace.branch === "yes" ? "automations.yes" : "automations.no")}</p>}
      {trace.wait != null && <p>{t("automations.wouldWait", { time: duration(trace.wait, t) })}</p>}
      {trace.preview &&
        Object.entries(trace.preview).map(([k, v]) => (
          <p key={k} className="break-words">
            <span className="text-muted-foreground">{k}: </span>
            {k === "body" ? v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : v}
          </p>
        ))}
    </div>
  )
}

// The step's name: click to rename (shown on the card and, for data steps, wherever their result is picked).
function StepTitle({ value, fallback, canEdit, onChange }: { value: string; fallback: string; canEdit: boolean; onChange: (v: string) => void }) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  if (editing)
    return (
      <Input
        autoFocus
        value={value}
        placeholder={fallback}
        maxLength={60}
        aria-label={t("automations.rename")}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && setEditing(false)}
        className="h-8"
      />
    )
  return canEdit ? (
    <button type="button" className="truncate rounded px-1 -mx-1 text-left hover:bg-muted" title={t("automations.rename")} onClick={() => setEditing(true)}>
      {value || fallback}
    </button>
  ) : (
    <span className="truncate">{value || fallback}</span>
  )
}

// Set field: object (writable ones the trigger brings) → writable field → value control that fits the field.
function SetField({ d, options, trigger, extra = [], canEdit, onChange }: { d: Record<string, unknown>; options: EditorOptions; trigger: string; extra?: string[]; canEdit: boolean; onChange: (p: Data) => void }) {
  const t = useT()
  const path = String(d.field ?? "")
  const { object, field } = path.includes(".") ? splitPath(path) : { object: path ? "contact" : "", field: path ? `custom.${path}` : "" }
  const objectOk = object as string
  const objects: string[] = [
    ...writableFor(trigger, new Set(options.modules)),
    ...extra.filter((k) => fieldsOf(k, options, (x) => x, true).length), // found records with writable fields
  ]
  const fields = fieldsOf(objectOk, options, (k) => t.dynamic(k), true)
  const f = fields.find((x) => x.key === field)
  return (
    <div className="grid gap-2">
      <NativeSelect value={objectOk} disabled={!canEdit} aria-label={t("automations.object")} className="w-full" onChange={(e) => onChange({ field: e.target.value ? `${e.target.value}.` : "", value: "" })}>
        <NativeSelectOption value="">{t("automations.pickObject")}</NativeSelectOption>
        {objects.map((o) => (
          <NativeSelectOption key={o} value={o}>
            {objectLabel(o, options, (k) => t.dynamic(k))}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {!objects.length && <p className="text-xs text-muted-foreground">{t("automations.nothingToSet")}</p>}
      {object && (
        <NativeSelect value={field} disabled={!canEdit} aria-label={t("automations.field")} className="w-full" onChange={(e) => onChange({ field: `${object}.${e.target.value}`, value: "" })}>
          <NativeSelectOption value="">{t("automations.pickField")}</NativeSelectOption>
          {fields.map((x) => (
            <NativeSelectOption key={x.key} value={x.key}>
              {x.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      {f && <ValueInput f={f} value={String(d.value ?? "")} options={options} dates={dateBases(objectsFor(trigger, new Set(options.modules)), (k) => t.dynamic(k))} disabled={!canEdit} onChange={(value) => onChange({ value })} />}
    </div>
  )
}

// Date fields of the run's objects, as bases for calculated dates ("membership end + 6 months").
function dateBases(objects: ObjectKey[], label: (k: string) => string): Option[] {
  return objects.flatMap((o) => def(o).fields.filter((f) => f.kind === "date").map((f) => ({ value: `{${o}.${f.key}}`, label: `${label(`automations.objects.${o}`)} · ${label(`automations.fields.${o}.${f.key}`)}` })))
}

// Condition rows: object → field → comparison that fits → value. Used by conditions and schedule filters.
function RulesEditor({
  rules,
  objects,
  options,
  canEdit,
  onChange,
  search,
  run = [],
}: {
  rules: { field: string; op: string; value: string }[]
  objects: string[] // what the rules look at
  options: EditorOptions
  canEdit: boolean
  onChange: (rules: { field: string; op: string; value: string }[]) => void
  search?: boolean // searching records: relations ("belongs to person") become pickable, values from the run (`run`)
  run?: string[] // objects of the run, for "= the person of this run" and dates of the run
}) {
  const t = useT()
  const set = (i: number, patch: Partial<(typeof rules)[number]>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const fieldsFor = (o: string) => fieldsOf(o, options, (k) => t.dynamic(k), false, search)
  const bases = dateBases([...objects, ...run].filter(isObject) as ObjectKey[], (k) => t.dynamic(k))
  // Link values: the run's object of that type, or a found record of that type.
  const linkOptions = (target?: string): Option[] => [
    ...run.filter((o) => o === target).map((o) => ({ value: `{${o}.id}`, label: t("automations.thisRuns", { what: objectLabel(o, options, (k) => t.dynamic(k)) }) })),
    ...(options.steps ?? []).filter((x) => x.object === target && run.includes(x.key)).map((x) => ({ value: `{${x.key}.id}`, label: x.label })),
  ]
  return (
    <div className="grid gap-3">
      {rules.map((r, i) => {
        const { object, field } = splitPath(r.field)
        const fields = fieldsFor(object)
        const f = fields.find((x) => x.key === field)
        const ops = f ? OPS_FOR[f.kind] : []
        return (
          <div key={i} className="grid gap-1 rounded-md border p-2">
            {objects.length > 1 && (
              <NativeSelect value={object} disabled={!canEdit} aria-label={t("automations.object")} className="w-full" onChange={(e) => set(i, { field: `${e.target.value}.`, op: "eq", value: "" })}>
                <NativeSelectOption value="">{t("automations.pickObject")}</NativeSelectOption>
                {objects.map((o) => (
                  <NativeSelectOption key={o} value={o}>
                    {objectLabel(o, options, (k) => t.dynamic(k))}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
            {(object || objects.length === 1) && (
              <NativeSelect
                value={field}
                disabled={!canEdit}
                aria-label={t("automations.field")}
                className="w-full"
                onChange={(e) => {
                  const o = object || objects[0]
                  const nf = fieldsFor(o).find((x) => x.key === e.target.value)
                  set(i, { field: `${o}.${e.target.value}`, op: nf ? OPS_FOR[nf.kind][0] : "eq", value: nf?.kind === "bool" ? "true" : "" })
                }}
              >
                <NativeSelectOption value="">{t("automations.pickField")}</NativeSelectOption>
                {fieldsFor(object || objects[0]).map((x) => (
                  <NativeSelectOption key={x.key} value={x.key}>
                    {x.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
            {f && ops.length > 1 && (
              <NativeSelect value={r.op} disabled={!canEdit} onChange={(e) => set(i, { op: e.target.value })} aria-label={t("automations.op")} className="w-full">
                {ops.map((o) => (
                  <NativeSelectOption key={o} value={o}>
                    {t.dynamic(`automations.ops.${f.kind === "date" && (o === "gt" || o === "lt" || o === "gte" || o === "lte") ? `date_${o}` : o}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
            {f && r.op !== "empty" && r.op !== "not_empty" && (
              <ValueInput f={f} value={r.value} options={options} dates={bases} links={linkOptions(f.target)} disabled={!canEdit} onChange={(value) => set(i, { value })} />
            )}
            {canEdit && (
              <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => onChange(rules.filter((_, j) => j !== i))}>
                {t("automations.removeRule")}
              </Button>
            )}
          </div>
        )
      })}
      {canEdit && rules.length < 20 && (
        <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => onChange([...rules, { field: objects.length === 1 ? `${objects[0]}.` : "", op: "eq", value: "" }])}>
          {t("automations.addRule")}
        </Button>
      )}
    </div>
  )
}

function ConditionForm({ d, options, trigger, extra = [], canEdit, onChange }: { d: Record<string, unknown>; options: EditorOptions; trigger: string; extra?: string[]; canEdit: boolean; onChange: (p: Data) => void }) {
  const t = useT()
  return (
    <div className="grid gap-3">
      <NativeSelect value={String(d.match ?? "all")} disabled={!canEdit} onChange={(e) => onChange({ match: e.target.value })} aria-label={t("automations.match")} className="w-full">
        <NativeSelectOption value="all">{t("automations.matchAll")}</NativeSelectOption>
        <NativeSelectOption value="any">{t("automations.matchAny")}</NativeSelectOption>
      </NativeSelect>
      {!trigger && <p className="text-xs text-muted-foreground">{t("automations.pickTriggerFirst")}</p>}
      <RulesEditor rules={(d.rules as { field: string; op: string; value: string }[]) ?? []} objects={[...objectsFor(trigger, new Set(options.modules)), ...extra]} options={options} canEdit={canEdit} onChange={(rules) => onChange({ rules })} />
    </div>
  )
}

// Find record / count & calculate: object → conditions (relations to the run, dates of the run …) → first by sort,
// or count/sum/average/min/max of a number field. The result is usable by all later steps.
function DataStepForm({ type, d, options, trigger, extra = [], canEdit, onChange }: { type: "find_record" | "aggregate" | "for_each"; d: Record<string, unknown>; options: EditorOptions; trigger: string; extra?: string[]; canEdit: boolean; onChange: (p: Data) => void }) {
  const t = useT()
  const mods = new Set(options.modules)
  const object = String(d.object ?? "") as ObjectKey | ""
  const objects = SCHEDULE_OBJECTS.filter((o) => def(o).module === "org" || mods.has(def(o).module))
  const numbers = object ? def(object).fields.filter((f) => f.kind === "number") : []
  const sortable = object ? def(object).fields.filter((f) => f.kind === "date" || f.kind === "number" || f.kind === "text") : []
  return (
    <div className="grid gap-3">
      <NativeSelect value={object} disabled={!canEdit} aria-label={t("automations.object")} className="w-full" onChange={(e) => onChange({ object: e.target.value, rules: [], sort: "", field: "" })}>
        <NativeSelectOption value="">{t("automations.pickObject")}</NativeSelectOption>
        {objects.map((o) => (
          <NativeSelectOption key={o} value={o}>
            {t.dynamic(`automations.objects.${o}`)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {object && (
        <>
          <p className="text-xs font-medium">{t("automations.where")}</p>
          <RulesEditor
            rules={(d.rules as { field: string; op: string; value: string }[]) ?? []}
            objects={[object]}
            options={options}
            canEdit={canEdit}
            search
            run={[...objectsFor(trigger, mods), ...extra]}
            onChange={(rules) => onChange({ rules })}
          />
          {type === "aggregate" ? (
            <div className="grid grid-cols-2 gap-2">
              <NativeSelect value={String(d.op ?? "count")} disabled={!canEdit} aria-label={t("automations.aggOp")} className="w-full" onChange={(e) => onChange({ op: e.target.value })}>
                {["count", "sum", "avg", "min", "max"].map((o) => (
                  <NativeSelectOption key={o} value={o}>
                    {t.dynamic(`automations.aggOps.${o}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {d.op !== "count" && (
                <NativeSelect value={String(d.field ?? "")} disabled={!canEdit} aria-label={t("automations.field")} className="w-full" onChange={(e) => onChange({ field: e.target.value })}>
                  <NativeSelectOption value="">{t("automations.pickField")}</NativeSelectOption>
                  {numbers.map((f) => (
                    <NativeSelectOption key={f.key} value={f.key}>
                      {t.dynamic(`automations.fields.${object}.${f.key}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
              <NativeSelect value={String(d.sort ?? "")} disabled={!canEdit} aria-label={t("automations.sortBy")} className="w-full" onChange={(e) => onChange({ sort: e.target.value })}>
                <NativeSelectOption value="">{t("automations.anyOrder")}</NativeSelectOption>
                {sortable.map((f) => (
                  <NativeSelectOption key={f.key} value={f.key}>
                    {t.dynamic(`automations.fields.${object}.${f.key}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect value={String(d.dir ?? "desc")} disabled={!canEdit} aria-label={t("automations.sortDir")} onChange={(e) => onChange({ dir: e.target.value })}>
                <NativeSelectOption value="desc">{t("automations.newestFirst")}</NativeSelectOption>
                <NativeSelectOption value="asc">{t("automations.oldestFirst")}</NativeSelectOption>
              </NativeSelect>
            </div>
          )}
          {type === "for_each" && (
            <label className="flex items-center gap-2 text-sm">
              {t("automations.eachLimit")}
              <Input type="number" min={1} max={200} value={Number(d.limit ?? 50)} disabled={!canEdit} onChange={(e) => onChange({ limit: Math.max(1, Math.min(200, Number(e.target.value) || 1)) })} className="w-24" />
            </label>
          )}
          <p className="text-xs text-muted-foreground">{t(type === "aggregate" ? "automations.aggHint" : type === "for_each" ? "automations.eachHint" : "automations.findHint")}</p>
        </>
      )}
    </div>
  )
}

// Create record: object (creatable with what the run has) → its fields; links (e.g. the person) are set automatically.
function CreateRecord({ d, options, trigger, canEdit, onChange }: { d: Record<string, unknown>; options: EditorOptions; trigger: string; canEdit: boolean; onChange: (p: Data) => void }) {
  const t = useT()
  const mods = new Set(options.modules)
  const objects = creatableFor(trigger, mods)
  const object = String(d.object ?? "") as ObjectKey | ""
  const values = (d.values as Record<string, string>) ?? {}
  const spec = object ? def(object).create : undefined
  const bases = dateBases(objectsFor(trigger, mods), (k) => t.dynamic(k))
  return (
    <div className="grid gap-2">
      <NativeSelect value={object} disabled={!canEdit} aria-label={t("automations.object")} className="w-full" onChange={(e) => onChange({ object: e.target.value, values: {} })}>
        <NativeSelectOption value="">{t("automations.pickObject")}</NativeSelectOption>
        {objects.map((o) => (
          <NativeSelectOption key={o} value={o}>
            {t.dynamic(`automations.objects.${o}`)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {spec?.parents && Object.values(spec.parents).length > 0 && (
        <p className="text-xs text-muted-foreground">{t("automations.linkedTo", { what: Object.values(spec.parents).map((p) => t.dynamic(`automations.objects.${p}`)).join(", ") })}</p>
      )}
      {object &&
        spec?.fields.map((key) => {
          const f = def(object).fields.find((x) => x.key === key)!
          return (
            <div key={key} className="grid gap-1">
              <Label>{t.dynamic(`automations.fields.${object}.${key}`)}</Label>
              <ValueInput f={f} value={values[key] ?? ""} options={options} dates={bases} disabled={!canEdit} onChange={(v) => onChange({ values: { ...values, [key]: v } })} />
              {object === "guest" && key === "list_id" && <p className="text-xs text-muted-foreground">{t("automations.defaultGuestList")}</p>}
            </div>
          )
        })}
    </div>
  )
}

// A date: fixed (date picker) or calculated: base (today or a date of the run) ± N days/weeks/months/years.
// Stored as text: "2026-12-31", "today+10", "{membership.ends_on}+6m".
function DateValue({ value: full, dates, time, disabled, onChange: emit }: { value: string; dates: Option[]; time?: boolean; disabled: boolean; onChange: (v: string) => void }) {
  const t = useT()
  // Timestamps carry " HH:MM" after the date part.
  const tm = /^(.*?)\s+(\d{2}:\d{2})$/.exec(full)
  const value = tm ? tm[1] : full
  const clock = tm ? tm[2] : ""
  const onChange = (v: string, c = clock) => emit(time && c && v ? `${v} ${c}` : v)
  const m = /^(today|\{[a-z_.]+\})(?:([+-])(\d+)([dwmy]))?$/.exec(value)
  const calc = !!m || value === "today"
  const [base, sign, n, unit] = m ? [m[1], m[2] ?? "+", m[3] ?? "0", m[4] ?? "d"] : ["today", "+", "0", "d"]
  const build = (b: string, sg: string, num: string, u: string) => onChange(Number(num) ? `${b}${sg}${Math.abs(Math.floor(Number(num)))}${u}` : b)
  return (
    <div className="grid gap-1">
      <NativeSelect value={calc ? "calc" : "fixed"} disabled={disabled} aria-label={t("automations.dateMode")} className="w-full" onChange={(e) => (e.target.value === "calc" ? onChange("today") : onChange(""))}>
        <NativeSelectOption value="fixed">{t("automations.dateFixed")}</NativeSelectOption>
        <NativeSelectOption value="calc">{t("automations.dateCalc")}</NativeSelectOption>
      </NativeSelect>
      {!calc ? (
        <DateInput defaultValue={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""} disabled={disabled} aria-label={t("automations.value")} onValueChange={onChange} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_4rem_minmax(0,1fr)] gap-1">
          <NativeSelect value={base} disabled={disabled} aria-label={t("automations.dateBase")} className="w-full" onChange={(e) => build(e.target.value, sign, n, unit)}>
            <NativeSelectOption value="today">{t("automations.today")}</NativeSelectOption>
            {dates.map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect value={sign} disabled={disabled} aria-label="±" onChange={(e) => build(base, e.target.value, n, unit)}>
            <NativeSelectOption value="+">+</NativeSelectOption>
            <NativeSelectOption value="-">−</NativeSelectOption>
          </NativeSelect>
          <Input type="number" min={0} value={n} disabled={disabled} aria-label={t("automations.amount")} onChange={(e) => build(base, sign, e.target.value, unit)} />
          <NativeSelect value={unit} disabled={disabled} aria-label={t("automations.unit")} onChange={(e) => build(base, sign, n, e.target.value)}>
            {["d", "w", "m", "y"].map((u) => (
              <NativeSelectOption key={u} value={u}>
                {t.dynamic(`automations.dateUnits.${u}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}
      {time && <Input type="time" value={clock} disabled={disabled} aria-label={t("automations.at")} onChange={(e) => onChange(value, e.target.value)} />}
    </div>
  )
}

// The value control that fits the field: records/tags/options to pick, yes/no, date, number or text.
function ValueInput({ f, value, options, dates = [], links = [], disabled, onChange }: { f: Field; value: string; options: EditorOptions; dates?: Option[]; links?: Option[]; disabled: boolean; onChange: (v: string) => void }) {
  const t = useT()
  const pick = (items: Option[]) => (
    <NativeSelect value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={t("automations.value")} className="w-full">
      <NativeSelectOption value="">{t("automations.pickValue")}</NativeSelectOption>
      {items.map((o) => (
        <NativeSelectOption key={o.value} value={o.value}>
          {o.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
  if (f.kind === "bool") return pick([{ value: "true", label: t("automations.yes") }, { value: "false", label: t("automations.no") }])
  if (f.kind === "tags") return <TagPick value={value} tags={f.options ?? options.tags} disabled={disabled} onChange={onChange} />
  if (f.kind === "link") return pick(links)
  if (f.kind === "ref" && f.ref) return pick(options.refs[f.ref] ?? [])
  if (f.kind === "date") return <DateValue value={value} dates={dates} time={f.time} disabled={disabled} onChange={onChange} />
  if (f.kind === "enum")
    return pick((f.options ?? []).map((o) => ({ value: o, label: t.has(`automations.values.${o}` as never) ? t.dynamic(`automations.values.${o}`) : o })))
  return (
    <Input
      type={f.kind === "number" ? "number" : "text"}
      value={value}
      disabled={disabled}
      aria-label={t("automations.value")}
      placeholder={t("automations.value")}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

// One tag: type to filter the org's tags, click one, or (when creatable) keep the typed text as a new tag.
function TagPick({ value, tags, creatable, disabled, onChange }: { value: string; tags: string[]; creatable?: boolean; disabled: boolean; onChange: (v: string) => void }) {
  const t = useT()
  const q = value.trim().toLowerCase()
  const matches = tags.filter((x) => !q || x.toLowerCase().includes(q)).slice(0, 30)
  const known = tags.some((x) => x.toLowerCase() === q)
  return (
    <div className="grid gap-1">
      <Label htmlFor="in-tag">{t("automations.tag")}</Label>
      <Input id="in-tag" value={value} maxLength={40} disabled={disabled} placeholder={t("automations.tagPlaceholder")} onChange={(e) => onChange(e.target.value)} />
      {!disabled && (
        <div className="flex flex-wrap gap-1">
          {matches.map((x) => (
            <button key={x} type="button" onClick={() => onChange(x)} className={cn("rounded-full border px-2 py-0.5 text-xs hover:bg-muted", x.toLowerCase() === q && "border-primary bg-muted")}>
              {x}
            </button>
          ))}
          {q && !known && <span className="text-xs text-muted-foreground">{creatable ? t("automations.newTag", { tag: value.trim() }) : t("automations.unknownTag")}</span>}
        </div>
      )}
    </div>
  )
}
