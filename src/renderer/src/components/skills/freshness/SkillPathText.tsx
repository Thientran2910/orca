import { Fragment } from 'react'
import { collapseHomePath } from '../../../../../shared/skills/bundled/bundled-skill-locations'
import { cn } from '@/lib/class-names'

/**
 * A host path in a skill result: shown from `~/` when it is under the host's home, wrapping only
 * after a separator or a hyphen (never inside a name), with the full path in the tooltip and on copy.
 */
export function SkillPathText({
  path,
  homeDirectory,
  className
}: {
  path: string
  homeDirectory?: string
  className?: string
}): React.JSX.Element {
  const shown = homeDirectory ? collapseHomePath(path, homeDirectory) : path
  const parts = shown.split(/(?<=[\\/-])/u)
  return (
    <span
      className={cn(
        'min-w-0 select-text font-mono text-2xs leading-5 text-muted-foreground [overflow-wrap:anywhere]',
        className
      )}
      title={path}
      onCopy={(event) => {
        // Copying the whole shown path gives the real one, not the `~` form.
        if (window.getSelection()?.toString() === shown && shown !== path) {
          event.clipboardData.setData('text/plain', path)
          event.preventDefault()
        }
      }}
    >
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part}
          {index < parts.length - 1 ? <wbr /> : null}
        </Fragment>
      ))}
    </span>
  )
}
