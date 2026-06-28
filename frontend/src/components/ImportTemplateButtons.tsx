import React from 'react'
import toast from 'react-hot-toast'

type Props = {
  accept?: string
  onFile?: (file: File|null)=>void
  onUpload?: ()=>Promise<void>
  templateFilename?: string
  templateContent?: string
}

export default function ImportTemplateButtons({ accept='.csv', onFile, onUpload, templateFilename='template.csv', templateContent='id,name\n' }: Props){
  const inputRef = React.useRef<HTMLInputElement|null>(null)
  const [selected, setSelected] = React.useState<File | null>(null)

  // Single button behavior: click opens picker if no file selected,
  // otherwise uploads the selected file. Shift+click downloads template.
  return (
    <div className="flex items-center gap-2">
      <button
        className="btn-primary flex items-center gap-2"
        onClick={async (e) => {
          const isShift = (e as React.MouseEvent).shiftKey
          if (isShift) {
            // download template
            const blob = new Blob([templateContent], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = templateFilename
            a.click()
            URL.revokeObjectURL(url)
            return
          }

          if (!selected) {
            // open file picker
            inputRef.current?.click()
            return
          }

          // upload selected
          if (onUpload) {
            try {
              await onUpload()
              setSelected(null)
            } catch (err) {
              toast.error('Import failed')
            }
          } else {
            toast.error('No upload handler')
          }
        }}
      >
        {selected ? 'Upload CSV' : 'Import CSV (Shift+Click to download template)'}
      </button>
      <input
        ref={el => inputRef.current = el}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null
          if (!file) { setSelected(null); onFile?.(null); return }
          if (!file.name.toLowerCase().endsWith('.csv')) {
            toast.error('Please select a CSV file')
            setSelected(null)
            onFile?.(null)
            return
          }
          // basic header validation
          const reader = new FileReader()
          reader.onload = () => {
            const text = String(reader.result || '')
            const firstLine = text.split(/\r?\n/)[0] || ''
            const templateHeader = (templateContent || '').split(/\r?\n/)[0] || ''
            const normalize = (s: string) => s.split(',').map(x => x.trim().toLowerCase()).join(',')
            if (templateHeader && normalize(firstLine) !== normalize(templateHeader)) {
              toast.error(`CSV columns do not match template: expected ${templateHeader}`)
              setSelected(null)
              onFile?.(null)
              return
            }
            setSelected(file)
            onFile?.(file)
          }
          reader.onerror = () => { toast.error('Failed to read file'); setSelected(null); onFile?.(null) }
          reader.readAsText(file)
        }}
      />
    </div>
  )
}
