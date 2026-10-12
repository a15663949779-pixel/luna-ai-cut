import { useState } from 'react'
import type { DirectorLanPlanSummary } from '../shared/types'
import { useDirectorMaterialSync } from './useDirectorMaterialSync'

export function useDirectorMaterialSyncControl(active: boolean, endpoint: string | null,
  refresh: (plans: DirectorLanPlanSummary[]) => void,
  ensureRemotePlans: (planIds: string[]) => Promise<Set<string>>) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem('luna.director-lab.sync-materials') !== 'false')
  const progress = useDirectorMaterialSync(active, enabled, endpoint, refresh, ensureRemotePlans)
  function onEnabledChange(checked: boolean) {
    localStorage.setItem('luna.director-lab.sync-materials', String(checked))
    setEnabled(checked)
  }
  return { enabled, onEnabledChange, progress }
}
