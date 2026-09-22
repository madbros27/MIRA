'use client'

import { Check, ChevronDown, Search } from 'lucide-react'
import * as React from 'react'

import { BottomSheet } from './bottom-sheet'
import { Button } from './button'
import { Input } from './input'
import { Popover, PopoverContent, PopoverTrigger } from './menu'
import { cn } from '@/lib/utils'

export type ComboboxOption = {
  value: string
  label: string
  group?: string
  disabled?: boolean
}

type ComboboxProps = {
  options: ComboboxOption[]
  value: string | string[]
  onChange: (value: string | string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  multiple?: boolean
  title?: string
  disabled?: boolean
  className?: string
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search…',
  multiple = false,
  title = 'Select an option',
  disabled,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [mobile, setMobile] = React.useState(false)
  const activeValues = Array.isArray(value) ? value : [value]
  const filtered = options.filter((option) =>
    option.label.toLowerCase().includes(search.trim().toLowerCase())
  )

  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  function select(option: ComboboxOption) {
    if (option.disabled) return
    if (multiple) {
      const next = activeValues.includes(option.value)
        ? activeValues.filter((item) => item !== option.value)
        : [...activeValues, option.value]
      onChange(next)
      return
    }
    onChange(option.value)
    setOpen(false)
    setSearch('')
  }

  const selectedLabels = activeValues
    .map((selected) => options.find((option) => option.value === selected)?.label)
    .filter(Boolean) as string[]
  const label = selectedLabels.length
    ? multiple && selectedLabels.length > 1
      ? `${selectedLabels[0]} +${selectedLabels.length - 1} more`
      : selectedLabels[0]
    : placeholder

  const content = (
    <div className="flex min-h-0 flex-col">
      <div className="sticky top-0 z-10 shrink-0 border-b border-border bg-popover p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            autoFocus={open}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 pl-8 text-xs"
            aria-label={searchPlaceholder}
          />
        </div>
      </div>
      <div role="listbox" className="min-h-0 max-h-[min(320px,var(--radix-popper-available-height,320px))] overflow-y-auto overscroll-contain p-1">
        {filtered.length ? filtered.map((option) => {
          const selected = activeValues.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={option.disabled}
              onClick={() => select(option)}
              className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm outline-none hover:bg-accent focus:bg-accent disabled:pointer-events-none disabled:opacity-50"
            >
              <Check className={cn('size-4 shrink-0 text-primary', selected ? 'opacity-100' : 'opacity-0')} aria-hidden />
              <span className="truncate">{option.label}</span>
            </button>
          )
        }) : <p className="px-3 py-8 text-center text-xs text-muted-foreground">No results</p>}
      </div>
    </div>
  )

  return (
    <>
      <Popover open={open && !mobile} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            className={cn('hidden w-full justify-between text-left font-normal md:flex', className)}
            aria-haspopup="listbox"
          >
            <span className="truncate">{label}</span>
            <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">{content}</PopoverContent>
      </Popover>
      {mobile ? (
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            className={cn('flex w-full justify-between text-left font-normal md:hidden', className)}
            onClick={() => setOpen(true)}
            aria-haspopup="listbox"
          >
            <span className="truncate">{label}</span>
            <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
          </Button>
          <BottomSheet open={open} onOpenChange={setOpen} title={title}>
            {content}
          </BottomSheet>
        </>
      ) : null}
    </>
  )
}
