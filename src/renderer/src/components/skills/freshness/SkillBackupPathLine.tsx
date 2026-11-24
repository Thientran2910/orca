import { toast } from 'sonner'
import { Copy, FolderOpen } from 'lucide-react'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../../shared/execution-host/execution-host'
import { revealInFileManager } from '@/lib/files/os-open/reveal-in-file-manager'
import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/class-names'
import type { SkillBackupHost } from './skill-backup-location'
import { SkillPathText } from './SkillPathText'

/** The exact backup a run created; this computer can show it, a remote host's path can be copied. */
export function SkillBackupPathLine({
  path,
  host,
  homeDirectory,
  className
}: {
  path: string
  host: SkillBackupHost
  homeDirectory?: string
  className?: string
}): React.JSX.Element {
  const t = useTranslate()
  const copyPath = async (): Promise<void> => {
    await window.api.ui.writeClipboardText(path)
    toast.success(t('auto.components.skills.SkillRow.pathCopied', 'Path copied'))
  }
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5 text-xs text-muted-foreground', className)}>
      <span>
        {host.kind === 'remote'
          ? t(
              'auto.components.skills.SkillBackupPathLine.movedToOnHost',
              'Old copy moved to {{host}}:',
              { host: host.name }
            )
          : t('auto.components.skills.SkillBackupPathLine.movedTo', 'Old copy moved to:')}
      </span>
      <div className="flex min-w-0 items-start gap-1.5">
        <SkillPathText path={path} homeDirectory={homeDirectory} className="flex-1" />
        {host.kind === 'local' ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="shrink-0"
            onClick={() => void revealInFileManager(path, LOCAL_EXECUTION_HOST_ID)}
          >
            <FolderOpen className="size-3" />
            {t('auto.components.skills.SkillBackupPathLine.showFolder', 'Show folder')}
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="shrink-0"
            onClick={() => void copyPath()}
          >
            <Copy className="size-3" />
            {t('auto.components.skills.SkillRow.copyPath', 'Copy path')}
          </Button>
        )}
      </div>
    </div>
  )
}
