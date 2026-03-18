/**
 * ButtonGroup - Composant de regroupement de boutons avec alignement
 *
 * Permet de grouper plusieurs boutons avec un espacement et un alignement cohérents.
 * Utilisé pour les actions de formulaire, les barres d'outils, etc.
 *
 * @example
 * ```tsx
 * <ButtonGroup align="right">
 *   <Button variant="outline">Annuler</Button>
 *   <Button>Enregistrer</Button>
 * </ButtonGroup>
 * ```
 */

import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonGroupProps {
  /** Boutons à regrouper */
  children: React.ReactNode
  /** Alignement des boutons */
  align?: 'left' | 'right' | 'center'
  /** Classes CSS additionnelles */
  className?: string
  /** Direction responsive */
  responsive?: boolean
}

export function ButtonGroup({
  children,
  align = 'left',
  className,
  responsive = true
}: ButtonGroupProps) {
  return (
    <div className={cn(
      "flex gap-2",
      responsive ? "flex-col sm:flex-row" : "flex-row",
      align === 'right' && "justify-end",
      align === 'center' && "justify-center",
      align === 'left' && "justify-start",
      className
    )}>
      {children}
    </div>
  )
}
