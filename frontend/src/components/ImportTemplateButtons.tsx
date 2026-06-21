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
  return (
    <div className="flex items-center gap-2">
      <label className="btn-primary flex items-center gap-2 cursor-pointer">
        Import CSV
        <input
          ref={el=>inputRef.current=el}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e)=>{
            const file = e.target.files?.[0]
            if(!file){ onFile?.(null); return }
            // basic type check
            if(!file.name.toLowerCase().endsWith('.csv')){
              toast.error('Please select a CSV file')
              onFile?.(null)
              return
            }
            // validate columns against templateContent header line
            const reader = new FileReader()
            reader.onload = () => {
              const text = String(reader.result || '')
              const firstLine = text.split(/\r?\n/)[0] || ''
              const templateHeader = (templateContent || '').split(/\r?\n/)[0] || ''
              const normalize = (s:string) => s.split(',').map(x=>x.trim().toLowerCase()).join(',')
              if(normalize(firstLine) !== normalize(templateHeader)){
                toast.error(`CSV columns do not match template: expected ${templateHeader}`)
                onFile?.(null)
                return
              }
              onFile?.(file)
            }
            reader.onerror = () => { toast.error('Failed to read file'); onFile?.(null) }
            reader.readAsText(file)
          }}
        />
      </label>
      <button className="btn-primary" onClick={async ()=>{
        // if no file selected, open file picker first
        if(!inputRef.current?.files || inputRef.current.files.length === 0){
          inputRef.current?.click()
          return
        }
        if(onUpload){
          try{ await onUpload() }catch(e){ toast.error('Import failed') }
        } else {
          toast.error('No upload handler')
        }
      }}>Upload</button>
      <button className="btn-primary ghost" onClick={()=>{
        const blob = new Blob([templateContent], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = templateFilename
        a.click()
        URL.revokeObjectURL(url)
      }}>Download Template</button>
    </div>
  )
}
