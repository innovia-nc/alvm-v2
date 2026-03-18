/**
 * LoadingButton - Bouton avec état de chargement intégré
 *
 * Étend le composant Button standard avec un indicateur de chargement.
 * Désactive automatiquement le bouton pendant le chargement.
 *
 * @example
 * ```tsx
 * <LoadingButton
 *   loading={isPending}
 *   onClick={handleSubmit}
 * >
 *   Enregistrer
 * </LoadingButton>
 * ```
 */

import * as React from "react"
import { Loader2 } from "lucide-react"
import { Button, ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface LoadingButtonProps extends ButtonProps {
  /** État de chargement */
  loading?: boolean
  /** Texte affiché pendant le chargement (optionnel) */
  loadingText?: string
}

export const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ loading = false, loadingText, children, disabled, className, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        disabled={loading || disabled}
        className={cn(className)}
        {...props}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {loading && loadingText ? loadingText : children}
      </Button>
    )
  }
)

LoadingButton.displayName = "LoadingButton"
