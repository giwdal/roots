import { titled } from "@/lib/title"

export const generateMetadata = titled("files.title")

// Dateien: an area of the nav (src/modules/nav.ts) with the files and the letter templates as its pages.
export default function FilesLayout({ children }: { children: React.ReactNode }) {
  return children
}
