import React from 'react'

type Option = { value: string; label: string }
type Props = {
  value: string
  options: Option[]
  onChange: (v: string) => void
  className?: string
}

export default function Dropdown({ value, options, onChange, className }: Props) {
  return (
    <select className={className || 'input'} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}
