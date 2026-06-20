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
        <input ref={el=>inputRef.current=el} type="file" accept={accept} className="hidden" onChange={(e)=>onFile?.(e.target.files?.[0]||null)} />
      </label>
      <button className="btn-primary" onClick={async ()=>{
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
