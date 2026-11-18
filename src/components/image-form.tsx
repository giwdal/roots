import { Picture } from "@/components/picture"
import { PicturePicker, PictureRemove } from "@/components/picture-picker"
import { getT } from "@/i18n/server"

// One picture (profile picture, org logo, event image): the picture itself is the button — tap, pick a file, it uploads
// at once (spinner on the picture); "Entfernen" asks first. `hidden` fields go along with both. `labelHidden` when the
// surrounding section already says what it is ("Bild" once, not twice).
export async function ImageForm(props: {
  action: (formData: FormData) => Promise<void>
  id: string
  label: string
  hint: string
  name: string
  path?: string | null
  square?: boolean
  hidden?: Record<string, string>
  labelHidden?: boolean
}) {
  const t = await getT()
  return (
    <div className="grid gap-2">
      <span className={props.labelHidden ? "sr-only" : "text-sm font-medium"} id={`${props.id}-label`}>
        {props.label}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <PicturePicker id={props.id} square={props.square} action={props.action} hidden={props.hidden} label={props.path ? t("common.changeImage") : t("common.upload")}>
          <Picture path={props.path} name={props.name} size="lg" square={props.square} />
        </PicturePicker>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">{props.hint}</span>
          {props.path && <PictureRemove action={props.action} hidden={props.hidden} label={t("common.removeImage")} />}
        </div>
      </div>
    </div>
  )
}
