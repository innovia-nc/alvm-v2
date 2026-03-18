"use client"

/**
 * SelectSearchable - Composant de sélection avec recherche intégrée
 *
 * Ce composant offre une expérience de sélection améliorée avec recherche
 * en temps réel pour les listes longues (parents, camps, enfants, etc.)
 *
 * Features:
 * - Recherche case-insensitive en temps réel
 * - Filtrage automatique des options
 * - Navigation au clavier (flèches + Enter)
 * - Style cohérent avec shadcn/ui
 * - Support du mode disabled
 * - Accessibilité ARIA complète
 * - Gestion des listes vides
 *
 * @example
 * ```tsx
 * <SelectSearchable
 *   options={[
 *     { value: "1", label: "Option 1" },
 *     { value: "2", label: "Option 2" }
 *   ]}
 *   value={selectedValue}
 *   onValueChange={setSelectedValue}
 *   placeholder="Sélectionner..."
 *   searchPlaceholder="Rechercher..."
 * />
 * ```
 */

import * as React from "react"
import { Check, ChevronDown, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface SelectSearchableOption {
  /** Valeur unique de l'option */
  value: string
  /** Label affiché à l'utilisateur */
  label: string
  /** Option désactivée (optionnel) */
  disabled?: boolean
}

export interface SelectSearchableProps {
  /** Liste des options à afficher */
  options: SelectSearchableOption[]
  /** Valeur sélectionnée actuelle */
  value?: string
  /** Callback appelé lors du changement de valeur */
  onValueChange?: (value: string) => void
  /** Texte affiché quand aucune sélection */
  placeholder?: string
  /** Texte du champ de recherche */
  searchPlaceholder?: string
  /** Désactiver le composant */
  disabled?: boolean
  /** Classes CSS additionnelles */
  className?: string
  /** Message quand aucun résultat */
  emptyMessage?: string
}

/**
 * SelectSearchable component avec recherche intégrée
 */
export function SelectSearchable({
  options,
  value,
  onValueChange,
  placeholder = "Sélectionner...",
  searchPlaceholder = "Rechercher...",
  disabled = false,
  className,
  emptyMessage = "Aucun résultat trouvé"
}: SelectSearchableProps) {
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedIndex, setSelectedIndex] = React.useState(-1)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Filtrer les options selon la recherche
  const filteredOptions = React.useMemo(() => {
    if (!searchQuery.trim()) return options

    const query = searchQuery.toLowerCase()
    return options.filter(option =>
      option.label.toLowerCase().includes(query)
    )
  }, [options, searchQuery])

  // Trouver l'option sélectionnée
  const selectedOption = options.find(option => option.value === value)

  // Réinitialiser la recherche à la fermeture
  React.useEffect(() => {
    if (!open) {
      setSearchQuery("")
      setSelectedIndex(-1)
    } else {
      // Focus automatique sur l'input quand on ouvre
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  // Navigation au clavier
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0)
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && filteredOptions[selectedIndex]) {
          const option = filteredOptions[selectedIndex]
          if (!option.disabled) {
            onValueChange?.(option.value)
            setOpen(false)
          }
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
    }
  }

  const handleSelect = (optionValue: string) => {
    onValueChange?.(optionValue)
    setOpen(false)
  }

  return (
    <>
      {/* Trigger Button */}
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        aria-label={placeholder}
        className={cn(
          "w-full justify-between",
          !value && "text-muted-foreground",
          className
        )}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {/* Dialog avec liste searchable */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="sr-only">{placeholder}</DialogTitle>
          </DialogHeader>

          {/* Barre de recherche */}
          <div className="flex items-center border-b px-3 pb-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              ref={inputRef}
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setSelectedIndex(0)
              }}
              onKeyDown={handleKeyDown}
              className="h-11 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => {
                  setSearchQuery("")
                  inputRef.current?.focus()
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Liste des options filtrées */}
          <div className="max-h-[300px] overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              <div className="p-1">
                {filteredOptions.map((option, index) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    disabled={option.disabled}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      "relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      "disabled:pointer-events-none disabled:opacity-50",
                      value === option.value && "bg-accent font-medium",
                      selectedIndex === index && "bg-accent/50"
                    )}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="truncate">{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer avec compteur */}
          {filteredOptions.length > 0 && (
            <div className="border-t pt-2 px-3 text-xs text-muted-foreground">
              {filteredOptions.length} résultat{filteredOptions.length > 1 ? 's' : ''}
              {searchQuery && ` pour "${searchQuery}"`}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
